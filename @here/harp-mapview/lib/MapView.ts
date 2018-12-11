/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { createLight, ImageTexture, Light, Sky, Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates, MathUtils, mercatorProjection, Projection } from "@here/harp-geoutils";
import { TextMaterial } from "@here/harp-materials";
import { TextMaterialConstructor } from "@here/harp-text-renderer";
import { LoggerManager, PerformanceTimer } from "@here/harp-utils";
import * as THREE from "three";

import { CameraMovementDetector } from "./CameraMovementDetector";
import { IMapAntialiasSettings, IMapRenderingManager, MapRenderingManager } from "./composing";
import { ConcurrentDecoderFacade } from "./ConcurrentDecoderFacade";
import { CopyrightInfo } from "./CopyrightInfo";
import { DataSource } from "./DataSource";
import { resetDepthBasedPolygonOffsetIndex } from "./DepthPrePass";
import { MapViewImageCache } from "./image/MapViewImageCache";
import { MapViewFog } from "./MapViewFog";
import { PickHandler, PickResult } from "./PickHandler";
import { PoiManager } from "./poi/PoiManager";
import { PoiTableManager } from "./poi/PoiTableManager";
import { ScreenCollisions, ScreenCollisionsDebug } from "./ScreenCollisions";
import { ScreenProjector } from "./ScreenProjector";
import { SkyBackground } from "./SkyBackground";
import { MultiStageTimer, Statistics } from "./Statistics";
import { TextElement } from "./text/TextElement";
import { TextElementsRenderer } from "./text/TextElementsRenderer";
import { ThemeLoader } from "./ThemeLoader";
import { Tile } from "./Tile";
import { MapViewUtils } from "./Utils";
import { VisibleTileSet, VisibleTileSetOptions } from "./VisibleTileSet";

declare const process: any;

// cache value, because access to process.env.NODE_ENV is SLOW!
const isProduction = process.env.NODE_ENV === "production";

export enum MapViewEventNames {
    /** Called before this `MapView` starts to render a new frame. */
    Update = "update",
    /** Called when the frame is about to be rendered. */
    Render = "render",
    /** Called after a frame has been rendered. */
    AfterRender = "didrender",
    /** Called after the first frame has been rendered. */
    FirstFrame = "first-render",
    /** Called when the first view has all the necessary tiles loaded and rendered. */
    FrameComplete = "frame-complete",
    /** Called when the theme has been loaded with the internal [[ThemeLoader]]. */
    ThemeLoaded = "theme-loaded",
    /** Called when the animation mode has started. */
    AnimationStarted = "animation-started",
    /** Called when the animation mode has stopped. */
    AnimationFinished = "animation-finished",
    /** Called when a camera interaction has been detected. */
    MovementStarted = "movement-started",
    /** Called when a camera interaction has been stopped. */
    MovementFinished = "movement-finished",
    /** Called when a data source has been connected or failed to connect. */
    DataSourceConnect = "datasource-connect",
    /** Emitted when copyright info of rendered map has been changed. */
    CopyrightChanged = "copyright-changed",
    /** Called when the WebGL context is lost. */
    ContextLost = "webglcontext-lost",
    /** Called when the WebGL context is restored. */
    ContextRestored = "webglcontext-restored"
}

const logger = LoggerManager.instance.create("MapView");
const DEFAULT_FONT_CATALOG = "./resources/fonts/Default_FontCatalog.json";
const DEFAULT_CLEAR_COLOR = 0xefe9e1;
const EYE_INVERSE = new THREE.Vector3(0, 0, -1);
const DEFAULT_FIELD_OF_VIEW = 40;
const MAX_FIELD_OF_VIEW = 140;
const MIN_FIELD_OF_VIEW = 10;

const DEFAULT_MIN_ZOOM_LEVEL = 1;

/**
 * Default maximum zoom level.
 */
const DEFAULT_MAX_ZOOM_LEVEL = 20;

/**
 * Default minimum camera height.
 */
const DEFAULT_MIN_CAMERA_HEIGHT = 20;

/**
 * The type of `RenderEvent`.
 */
export interface RenderEvent extends THREE.Event {
    type:
        | MapViewEventNames.Render
        | MapViewEventNames.FirstFrame
        | MapViewEventNames.FrameComplete
        | MapViewEventNames.ThemeLoaded
        | MapViewEventNames.AnimationStarted
        | MapViewEventNames.AnimationFinished
        | MapViewEventNames.MovementStarted
        | MapViewEventNames.MovementFinished
        | MapViewEventNames.ContextLost
        | MapViewEventNames.ContextRestored
        | MapViewEventNames.CopyrightChanged;
    time?: number;
}

// Event type: cast needed to workaround wrong THREE.js typings.
const RENDER_EVENT: RenderEvent = { type: MapViewEventNames.Render } as any;
const DID_RENDER_EVENT: RenderEvent = { type: MapViewEventNames.AfterRender } as any;
const FIRST_FRAME_EVENT: RenderEvent = { type: MapViewEventNames.FirstFrame } as any;
const FRAME_COMPLETE_EVENT: RenderEvent = { type: MapViewEventNames.FrameComplete } as any;
const THEME_LOADED_EVENT: RenderEvent = { type: MapViewEventNames.ThemeLoaded } as any;
const ANIMATION_STARTED_EVENT: RenderEvent = { type: MapViewEventNames.AnimationStarted } as any;
const ANIMATION_FINISHED_EVENT: RenderEvent = { type: MapViewEventNames.AnimationFinished } as any;
const MOVEMENT_STARTED_EVENT: RenderEvent = { type: MapViewEventNames.MovementStarted } as any;
const MOVEMENT_FINISHED_EVENT: RenderEvent = { type: MapViewEventNames.MovementFinished } as any;
const CONTEXT_LOST_EVENT: RenderEvent = { type: MapViewEventNames.ContextLost } as any;
const CONTEXT_RESTORED_EVENT: RenderEvent = { type: MapViewEventNames.ContextRestored } as any;
const COPYRIGHT_CHANGED_EVENT: RenderEvent = { type: MapViewEventNames.CopyrightChanged } as any;

/**
 * Compute visibility for the text elements. Called every frame.
 *
 * @param mapView The current [[MapView]] instance.
 * @param tilt Angle in degrees between the vertical vector (eye to ground) and view vector. The
 * value of `0` is looking straight down. `90` is the "camera on the floor". `>90` is camera looking
 * up.
 */
export type LabelVisibilityEvaluator = (mapView: MapView, tilt: number) => boolean;

/**
 * Compute far plane distance. May be based on tilt. Is being called every frame.
 *
 * @param mapView The current [[MapView]] instance.
 * @param tilt Angle in degrees between the vertical vector (eye to ground) and view vector. The
 *             value of `0` is looking straight down. `90` is the "camera on the floor". `>90` is
 *             camera looking up.
 * @param defaultNearValue The value of near plane computed by the [[MapView]].
 * @param defaultFarValue The value of far plane computed by the [[MapView]].
 */
export type FarPlaneEvaluator = (
    mapView: MapView,
    tilt: number,
    defaultNearValue: number,
    defaultFarValue: number
) => { near: number; far: number };

/**
 * User configuration for the [[MapView]].
 */
export interface MapViewOptions {
    /**
     * The canvas element used to render the scene.
     */
    canvas: HTMLCanvasElement;

    /**
     * `true` if the canvas contains an alpha (transparency) buffer or not. Default is `false`.
     */
    alpha?: boolean;

    /**
     * Whether the native WebGL antialiasing should be enabled. It is better to disable it if the
     * MapView's MSAA is enabled.
     *
     * @default `true`
     */
    enableNativeWebglAntialias?: boolean;

    /**
     * Antialias settings for the map rendering. It is better to disable the native antialising if
     * the custom antialising is enabled.
     */
    customAntialiasSettings?: IMapAntialiasSettings;

    /**
     * The path to the font catalog file. Default is `./resources/fonts/Default_FontCatalog.json`.
     */
    fontCatalog?: string;

    /**
     * The text material used to render fonts. Default is 'TextMaterial'.
     */
    textMaterialConstructor?: TextMaterialConstructor;

    /**
     * `Projection` used by the `MapView`.
     *
     * The default value is [[mercatorProjection]].
     */
    projection?: Projection;

    /**
     * The URL of the script that the decoder worker runs. The default URL is
     * `./decoder.bundle.js`.
     *
     * Relative URLs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     */
    decoderUrl?: string;

    /**
     * The number of Web Workers used to decode data. The default is
     * `navigator.hardwareConcurrency`.
     */
    decoderCount?: number;

    /**
     * The [[Theme]] used by Mapview.
     *
     * This Theme can be one of the following:
     *  - `string` : the URL of the theme file used to style this map
     *  - `Theme` : the `Theme` object already loaded
     *  - `Promise<Theme>` : the future `Theme` object
     *  - `undefined` : the theme is not yet set up, but can be set later. Rendering waits until
     *     the theme is set.
     *
     * **Note:** Layers that use a theme do not render any content until that theme is available.
     *
     * Relative URLs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     */
    theme?: string | Theme | Promise<Theme>;

    /**
     * The minimum zoom level; default is `1`.
     */
    minZoomLevel?: number;

    /**
     * Determines the minimum camera height, in meters.
     */
    minCameraHeight?: number;

    /**
     * The maximum zoom level. The default is `14`.
     */
    maxZoomLevel?: number;

    /**
     * Maximum tilt where the labels are visible. Default is `65`.
     */
    maxLabelAngle?: number;

    /**
     * User-defined label distance calculator.
     */
    labelVisibilityEvaluator?: LabelVisibilityEvaluator;

    /**
     * User-defined far plane distance calculator.
     */
    farPlaneEvaluator?: FarPlaneEvaluator;

    /**
     * Set to true to extend the frustum culling. This improves the rejection of some tiles, which
     * normal frustum culling cannot detect. You can disable this property to measure performance.
     *
     * @default true
     */
    extendedFrustumCulling?: boolean;

    /**
     * The maximum number of tiles rendered from one data source at a time.
     *
     * @default See [[MapViewDefaults.maxVisibleDataSourceTiles]].
     */
    maxVisibleDataSourceTiles?: number;

    /**
     * Size of a tile cache for one data source.
     *
     * @default See [[MapViewDefaults.tileCacheSize]].
     */
    tileCacheSize?: number;

    /**
     * Size of a tile cache in bytes.
     *
     * @see [[MapViewDefaults.tileCacheMemorySize]].
     */
    tileCacheMemorySize?: number;

    /**
     * Limits the number of reduced zoom levels (lower detail) to be searched for fallback tiles.
     *
     * When zooming in, newly elected tiles may have not yet loaded. [[MapView]] searches through
     * the tile cache for tiles ready to be displayed in lower zoom levels. The tiles may be
     * located shallower in the quadtree.
     *
     * To disable a cache search, set the value to `0`.
     *
     * @default [[MapViewDefaults.tileLowLevelDetailFallback]]
     */
    quadTreeSearchDistanceUp?: number;

    /**
     * Limits the number of higher zoom levels (more detailed) to be searched for fallback tiles.
     *
     * When zooming out, newly elected tiles may have not yet loaded. [[MapView]] searches through
     * the tile cache for tiles ready to be displayed in higher zoom levels. These tiles may be
     * located deeper in the quadtree.
     *
     * To disable a cache search, set the value to `0`.
     *
     * @default [[MapViewDefaults.tileHighLevelDetailFallback]]
     */
    quadTreeSearchDistanceDown?: number;

    /**
     * Set to `true` to measure performance statistics.
     */
    enableStatistics?: boolean;

    /**
     * Preserve the buffers until they are cleared manually or overwritten.
     *
     * Set to `true` in order to copy [[MapView]] canvas contents to an image or another canvas.
     *
     * @default `false`.
     * @see https://threejs.org/docs/#api/renderers/WebGLRenderer.preserveDrawingBuffer
     */
    preserveDrawingBuffer?: boolean;

    /**
     * Set to `true` to allow picking of roads. If set to `true`, additional memory is used to
     * store road data.
     */
    enableRoadPicking?: boolean;

    /**
     * An optional canvas element that renders 2D collision debug information.
     */
    collisionDebugCanvas?: HTMLCanvasElement;

    /**
     * Limits the number of [[DataSource]] labels visible, such as road names and POIs.
     * On small devices, you can reduce this number to to increase performance.
     * @default `500`.
     */
    maxNumVisibleLabels?: number;

    /**
     * The number of [[TextElement]]s that the [[TextElementsRenderer]] tries to render even
     * if they were not visible during placement. This property only applies to [[TextElemen]]s
     * that were culled by the frustum; useful for map movements and animations.
     * @default `300`.
     */
    numSecondChanceLabels?: number;

    /**
     * The maximum distance for [[TextElement]] and icons, expressed as a fraction of the distance
     * between the near and far plane [0, 1.0].
     * @default `0.99`.
     */
    maxDistanceRatioForLabels?: number;

    /**
     * The distance at which [[TextElement]]s start to apply their `distanceScale` value, expressed
     * as a fraction of the distance between the near and far plane [0, 1.0].
     * @default `0.4`.
     */
    labelStartScaleDistance?: number;

    /**
     * Maximum timeout, in milliseconds, before a [[MOVEMENT_FINISHED_EVENT]] is sent after the
     * latest frame with a camera movement. The default is 300ms.
     */
    movementThrottleTimeout?: number;

    /*
     * The vertical field of view, in degrees.
     */
    fov?: number;

    /*
     * An array of ISO 639-1 language codes for data sources.
     */
    languages?: string[];
}

/**
 * Default settings used by [[MapView]] collected in one place.
 */
export const MapViewDefaults = {
    projection: mercatorProjection,

    maxVisibleDataSourceTiles: 20,
    extendedFrustumCulling: true,

    tileCacheSize: 40,
    tileCacheMemorySize: 400 * 1024 * 1024,
    quadTreeSearchDistanceUp: 3,
    quadTreeSearchDistanceDown: 2
};

/**
 * The core class of the library to call in order to create a map visualization. It needs to be
 * linked to datasources.
 */
export class MapView extends THREE.EventDispatcher {
    /**
     * The string of the default font catalog to use for labelling.
     */
    defaultFontCatalog: string = DEFAULT_FONT_CATALOG;

    /**
     * The constructor to use by default for text rendering.
     */
    defaultTextMaterialConstructor: TextMaterialConstructor = TextMaterial;

    /**
     * The instance of [[MapRenderingManager]] managing the rendering of the map. It is a public
     * property to allow access and modification of some parameters of the rendering process at
     * runtime.
     */
    readonly mapRenderingManager: IMapRenderingManager;

    private m_zoomLevelBias: number = 1;
    private m_createdLights?: THREE.Light[];
    private m_skyBackground?: SkyBackground;
    private readonly m_screenProjector = new ScreenProjector();
    private readonly m_screenCollisions:
        | ScreenCollisions
        | ScreenCollisionsDebug = new ScreenCollisions();

    private m_visibleTiles: VisibleTileSet;
    private m_visibleTileSetLock: boolean = false;

    private m_minZoomLevel: number = DEFAULT_MIN_ZOOM_LEVEL;
    private m_maxZoomLevel: number = DEFAULT_MAX_ZOOM_LEVEL;
    private m_minCameraHeight: number = DEFAULT_MIN_CAMERA_HEIGHT;

    private readonly m_screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1);

    private m_camera: THREE.PerspectiveCamera;
    private m_pointOfView?: THREE.PerspectiveCamera;

    private m_tempVector3: THREE.Vector3 = new THREE.Vector3();
    private m_pixelToWorld?: number;

    private readonly m_scene: THREE.Scene = new THREE.Scene();
    private readonly m_fog: MapViewFog = new MapViewFog(this.m_scene);
    private readonly m_worldCenter = new THREE.Vector3();
    private readonly m_mapTilesRoot = new THREE.Object3D();

    private m_animationCount: number = 0;
    private m_animationFrameHandle: number | undefined;
    private m_drawing: boolean = false;
    private m_updatePending: boolean = false;
    private m_renderer: THREE.WebGLRenderer;
    private m_snapshot = 0;

    private m_textElementsRenderer?: TextElementsRenderer;
    private m_defaultTextColor = new THREE.Color(0, 0, 0);
    private m_overlayTextElements?: TextElement[] = [];

    private m_forceCameraAspect: number | undefined = undefined;

    //
    // sources
    //
    private readonly m_tileDataSources: DataSource[] = [];
    private readonly m_connectedDataSources = new Set<string>();

    // gestures
    private readonly m_raycaster = new THREE.Raycaster();
    private readonly m_plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));

    private readonly m_options: MapViewOptions;
    private readonly m_visibleTileSetOptions: VisibleTileSetOptions;

    private m_theme: Theme = { styles: {} };

    private m_stats: Statistics;
    private m_stagedRenderTimer: MultiStageTimer;
    private m_logStatsFrames = 100;

    private m_previousFrameTimeStamp?: number;

    private m_firstFrameRendered = false;
    private m_firstFrameComplete = false;

    private handleRequestAnimationFrame: any;

    private m_pickHandler: PickHandler;

    private m_imageCache: MapViewImageCache = new MapViewImageCache(this);

    private m_poiManager: PoiManager = new PoiManager(this);

    private m_poiTableManager: PoiTableManager = new PoiTableManager(this);

    private m_collisionDebugCanvas: HTMLCanvasElement | undefined;

    // Detection of camera movement and scene change:
    private m_movementDetector: CameraMovementDetector;

    private m_thisFrameTilesChanged: boolean | undefined;
    private m_lastTileIds: string = "";
    private m_languages: string[] | undefined;
    private m_copyrightInfo: CopyrightInfo[] = [];

    private m_debugGlyphTextureCache = false;

    /**
     * Constructs a new `MapView` with the given options or canvas element.
     *
     * @param options The `MapView` options or the HTML canvas element used to display the map.
     */
    constructor(options: MapViewOptions) {
        super();

        // make a copy to avoid unwanted changes to the original options.
        this.m_options = { ...options };

        if (this.m_options.minZoomLevel !== undefined) {
            this.m_minZoomLevel = this.m_options.minZoomLevel;
        }

        if (this.m_options.maxZoomLevel !== undefined) {
            this.m_maxZoomLevel = this.m_options.maxZoomLevel;
        }

        if (this.m_options.minCameraHeight !== undefined) {
            this.m_minCameraHeight = this.m_options.minCameraHeight;
        }

        if (this.m_options.fontCatalog !== undefined) {
            this.defaultFontCatalog = this.m_options.fontCatalog;
        }

        if (this.m_options.textMaterialConstructor !== undefined) {
            this.defaultTextMaterialConstructor = this.m_options.textMaterialConstructor;
        }

        if (this.m_options.decoderUrl !== undefined) {
            ConcurrentDecoderFacade.defaultScriptUrl = this.m_options.decoderUrl;
        }

        if (this.m_options.decoderCount !== undefined) {
            ConcurrentDecoderFacade.defaultWorkerCount = this.m_options.decoderCount;
        }

        this.m_visibleTileSetOptions = { ...MapViewDefaults };

        if (options.projection !== undefined) {
            this.m_visibleTileSetOptions.projection = options.projection;
        }

        if (options.extendedFrustumCulling !== undefined) {
            this.m_visibleTileSetOptions.extendedFrustumCulling = options.extendedFrustumCulling;
        }

        if (options.maxVisibleDataSourceTiles !== undefined) {
            this.m_visibleTileSetOptions.maxVisibleDataSourceTiles =
                options.maxVisibleDataSourceTiles;
        }

        if (options.tileCacheSize !== undefined) {
            this.m_visibleTileSetOptions.tileCacheSize = options.tileCacheSize;
        }

        if (options.tileCacheMemorySize !== undefined) {
            this.m_visibleTileSetOptions.tileCacheMemorySize = options.tileCacheMemorySize;
        }

        if (options.quadTreeSearchDistanceUp !== undefined) {
            this.m_visibleTileSetOptions.quadTreeSearchDistanceUp =
                options.quadTreeSearchDistanceUp;
        }

        if (options.quadTreeSearchDistanceDown !== undefined) {
            this.m_visibleTileSetOptions.quadTreeSearchDistanceDown =
                options.quadTreeSearchDistanceDown;
        }

        options.fov = MathUtils.clamp(
            options.fov === undefined ? DEFAULT_FIELD_OF_VIEW : options.fov,
            MIN_FIELD_OF_VIEW,
            MAX_FIELD_OF_VIEW
        );

        this.m_options.enableStatistics = this.m_options.enableStatistics === true;

        this.m_languages = this.m_options.languages || MapViewUtils.getBrowserLanguages();

        if (
            !isProduction &&
            this.m_options.collisionDebugCanvas !== undefined &&
            this.m_options.collisionDebugCanvas !== null
        ) {
            this.m_collisionDebugCanvas = this.m_options.collisionDebugCanvas;
            this.m_screenCollisions = new ScreenCollisionsDebug(this.m_collisionDebugCanvas);
        }

        this.handleRequestAnimationFrame = this.renderFunc.bind(this);
        this.m_pickHandler = new PickHandler(this, this.m_options.enableRoadPicking === true);

        // Initialization of the stats
        this.m_stats = new Statistics("MapView", this.m_options.enableStatistics);
        this.setupStats();
        this.m_stagedRenderTimer = new MultiStageTimer(this.m_stats, "stagedRenderTimer", [
            "render.setup",
            "render.culling",
            "render.text.render",
            "render.draw",
            "render.text.post",
            "render.cleanup"
        ]);

        // Initialization of the renderer
        this.m_renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: this.m_options.enableNativeWebglAntialias !== false,
            alpha: this.m_options.alpha,
            preserveDrawingBuffer: this.m_options.preserveDrawingBuffer === true
        });
        this.m_renderer.autoClear = false;

        // This is detailed at https://threejs.org/docs/#api/renderers/WebGLRenderer.info
        // When using several WebGLRenderer#render calls per frame, it is the only way to get
        // correct rendering data from ThreeJS.
        this.m_renderer.info.autoReset = false;

        this.setupRenderer();

        // Initialization of mCamera and mVisibleTiles
        const { clientWidth, clientHeight } = this.canvas;
        const aspect = clientWidth / clientHeight;
        this.m_options.fov = this.limitFov(this.m_options.fov, aspect);

        this.m_camera = new THREE.PerspectiveCamera(this.m_options.fov, aspect, 0.1, 4000000);
        this.setupCamera();

        this.m_movementDetector = new CameraMovementDetector(
            this.m_options.movementThrottleTimeout,
            () => this.movementStarted(),
            () => this.movementFinished()
        );

        const mapPassAntialiasSettings = this.m_options.customAntialiasSettings;
        this.mapRenderingManager = new MapRenderingManager(
            clientWidth,
            clientHeight,
            mapPassAntialiasSettings
        );

        this.m_visibleTiles = new VisibleTileSet(this.m_camera, this.m_visibleTileSetOptions);

        this.initTheme();

        this.drawFrame();

        this.canvas.addEventListener("webglcontextlost", this.onWebGLContextLost);
        this.canvas.addEventListener("webglcontextrestored", this.onWebGLContextRestored);
    }

    /**
     * @hidden
     * The [[TextElementsRenderer]] select the visible [[TextElement]]s and renders them.
     */
    get textElementsRenderer(): TextElementsRenderer | undefined {
        return this.m_textElementsRenderer;
    }

    /**
     * Disposes this `MapView`.
     *
     * This function cleans the resources that are managed manually including those that exist in
     * shared caches.
     *
     * Note: This function does not try to clean objects that can be disposed off easily by
     * TypeScript's garbage collecting mechanism. Consequently, if you need to perform a full
     * cleanup, you must ensure that all references to this `MapView` are removed.
     */
    dispose() {
        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
            this.m_animationFrameHandle = undefined;
        }

        this.canvas.removeEventListener("webglcontextlost", this.onWebGLContextLost);
        this.canvas.removeEventListener("webglcontextrestored", this.onWebGLContextRestored);

        for (const dataSource of this.m_tileDataSources) {
            dataSource.dispose();
        }
        this.m_visibleTiles.clearTileCache();
        this.m_renderer.dispose();
        this.m_imageCache.clear();

        this.m_movementDetector.dispose();
    }

    /**
     * Returns the cache size.
     */
    getCacheSize(): number {
        return this.m_visibleTiles.getDataSourceCacheSize();
    }

    /**
     * Sets the cache size in number of tiles.
     *
     * @param size The cache size in tiles.
     * @param numVisibleTiles The number of tiles visible, which is size/2 by default.
     */
    setCacheSize(size: number, numVisibleTiles?: number): void {
        this.m_visibleTiles.setDataSourceCacheSize(size);
        numVisibleTiles = numVisibleTiles !== undefined ? numVisibleTiles : size / 2;
        this.m_visibleTiles.setNumberOfVisibleTiles(Math.floor(numVisibleTiles));
        this.updateImages();
        this.updateLighting();
        this.updateTextRenderer();
        this.updateSkyBackground();
        this.update();
    }

    /**
     * Specfies whether extended frustum culling is enabled or disabled.
     */
    get extendedFrustumCulling(): boolean {
        return this.m_options.extendedFrustumCulling !== undefined
            ? this.m_visibleTileSetOptions.extendedFrustumCulling
            : true;
    }

    /**
     * Enable of disable extended frustum culling.
     */
    set extendedFrustumCulling(value: boolean) {
        this.m_visibleTileSetOptions.extendedFrustumCulling = value;
    }

    /**
     * Returns the status of frustum culling after each update.
     */
    get lockVisibleTileSet(): boolean {
        return this.m_visibleTileSetLock;
    }

    /**
     * Enable of disable frustum culling after each update.
     */
    set lockVisibleTileSet(value: boolean) {
        this.m_visibleTileSetLock = value;
    }

    /**
     * Gets the optional camera used to render the scene.
     */
    get pointOfView(): THREE.PerspectiveCamera | undefined {
        return this.m_pointOfView;
    }

    /**
     * Sets the optional camera used to render the scene.
     */
    set pointOfView(pointOfView: THREE.PerspectiveCamera | undefined) {
        this.m_pointOfView = pointOfView;
        this.update();
    }

    /**
     * Gets the current `Theme` used by this `MapView` to style map elements.
     */
    get theme(): Theme {
        return this.m_theme;
    }

    /**
     * Changes the `Theme` used by this `MapView` to style map elements.
     */
    set theme(theme: Theme) {
        // Fog and sky.
        this.m_theme.fog = theme.fog;
        this.m_theme.sky = theme.sky;
        this.updateSkyBackground();
        this.m_fog.reset(this.m_theme);

        this.m_theme.lights = theme.lights;
        this.updateLighting();

        // Clear color.
        this.m_theme.clearColor = theme.clearColor;
        this.renderer.setClearColor(new THREE.Color(theme.clearColor));

        // Images.
        this.m_theme.images = theme.images;
        this.m_theme.imageTextures = theme.imageTextures;
        this.updateImages();

        // POI tables.
        this.m_theme.poiTables = theme.poiTables;
        this.loadPoiTables();

        // Text.
        this.m_theme.textStyles = theme.textStyles;
        this.m_theme.defaultTextStyle = theme.defaultTextStyle;
        this.m_theme.fontCatalogs = theme.fontCatalogs;
        this.updateTextRenderer();

        if (this.m_theme.styles === undefined) {
            this.m_theme.styles = {};
        }

        if (theme.styles !== undefined) {
            for (const styleSetName in theme.styles) {
                if (theme.styles[styleSetName] !== undefined) {
                    const styleSet = theme.styles[styleSetName];
                    this.getDataSourcesByStyleSetName(styleSetName).forEach(ds =>
                        ds.setStyleSet(styleSet)
                    );
                    this.m_theme.styles[styleSetName] = styleSet;
                }
            }
        }

        this.update();
    }

    /**
     * Gets the value of the forced custom camera aspect.
     * Every time a frame is rendered, `MapView` resets the camera aspect.
     *
     * You can disable this behavior by setting the value to `undefined`.
     */
    get forceCameraAspect(): number | undefined {
        return this.m_forceCameraAspect;
    }

    /**
     * Sets the custom forced camera aspect ratio to use while rendering.
     */
    set forceCameraAspect(aspect: number | undefined) {
        this.m_forceCameraAspect = aspect;
    }

    /**
     * Lists the ISO 639-1 language codes for DataSources to use.
     */
    get languages(): string[] | undefined {
        return this.m_languages;
    }

    /**
     * Sets the list of ISO 639-1 language codes for DataSources to use.
     */
    set languages(languages: string[] | undefined) {
        this.m_languages = languages;
        this.m_tileDataSources.forEach((dataSource: DataSource) => {
            dataSource.setLanguages(this.m_languages);
        });
        this.update();
    }

    get copyrightInfo(): CopyrightInfo[] {
        return this.m_copyrightInfo;
    }

    /**
     * Adds an event listener. There are various events that are sent before or after a new frame
     * is rendered.
     *
     * @see [[MapViewEventNames]].
     *
     * @example
     * ```TypeScript
     * let frameCount = 0;
     * mapView.addEventListener(MapViewEventNames.Render, () => {
     *     ++frameCount;
     * });
     * ```
     *
     * @param type One of the [[MapViewEventNames]] strings.
     * @param listener The callback invoked when the `MapView` needs to render a new frame.
     */
    addEventListener(type: MapViewEventNames, listener: (event: RenderEvent) => void): void;

    addEventListener(type: string, listener: any): void {
        super.addEventListener(type, listener);
    }

    /**
     * Removes an event listener. There are various events that are sent before or after a new frame
     * is rendered.
     *
     * @see [[MapViewEventNames]].
     *
     * @example
     * ```TypeScript
     * mapView.removeEventListener(MapViewEventNames.Render, listener);
     * ```
     *
     * @param type One of the [[MapViewEventNames]] strings.
     * @param listener The callback invoked when the `MapView` needs to render a new frame.
     */
    removeEventListener(type: MapViewEventNames, listener: (event: RenderEvent) => void): void;

    removeEventListener(type: string, listener: any): void {
        super.removeEventListener(type, listener);
    }

    /**
     * The HTML canvas element used by this `MapView`.
     */
    get canvas(): HTMLCanvasElement {
        return this.m_options.canvas;
    }

    /**
     * The HTML canvas element used by this `MapView`.
     */
    get collisionDebugCanvas(): HTMLCanvasElement | undefined {
        return this.m_collisionDebugCanvas;
    }

    /**
     * The THREE.js scene used by this `MapView`.
     */
    get scene(): THREE.Scene {
        return this.m_scene;
    }

    /**
     * The THREE.js camera used by this `MapView` to render the main scene.
     */
    get camera(): THREE.PerspectiveCamera {
        return this.m_camera;
    }

    /**
     * The THREE.js `WebGLRenderer` used by this scene.
     */
    get renderer(): THREE.WebGLRenderer {
        return this.m_renderer;
    }

    /**
     * The color used to clear the view.
     */
    get clearColor() {
        return this.m_renderer.getClearColor().getHex();
    }

    /**
     * The color used to clear the view.
     */
    set clearColor(color: number) {
        this.m_renderer.setClearColor(color);
    }

    /**
     * The color used to draw the text elements.
     */
    get defaultTextColor() {
        return this.m_defaultTextColor;
    }

    /**
     * The color used to draw the text elements.
     */
    set defaultTextColor(color: THREE.Color) {
        this.m_defaultTextColor.set(color);
    }

    /**
     * The projection used to project geo coordinates to world coordinates.
     */
    get projection(): Projection {
        return this.m_visibleTileSetOptions.projection;
    }

    /**
     * The position in geo coordinates of the center of the scene.
     */
    get geoCenter(): GeoCoordinates {
        return this.projection.unprojectPoint(this.m_worldCenter);
    }

    /**
     * The position in geo coordinates of the center of the scene.
     */
    set geoCenter(geoCenter: GeoCoordinates) {
        this.projection.projectPoint(geoCenter, this.m_worldCenter);
        this.update();
    }

    /**
     * The position in world coordinates of the center of the scene.
     */
    get worldCenter(): THREE.Vector3 {
        return this.m_worldCenter;
    }

    /**
     * The position in world coordinates of the center of the scene.
     */
    set worldCenter(center: THREE.Vector3) {
        this.m_worldCenter.copy(center);
        this.update();
    }

    /**
     * The root object of the scene. Contains all `rootObjects` of the [[Tile]]s.
     */
    get worldRootObject(): THREE.Object3D {
        return this.m_mapTilesRoot;
    }

    /**
     * Get the [[PickHandler]] for this `mapView`.
     */
    get pickHandler(): PickHandler {
        return this.m_pickHandler;
    }

    /**
     * Get the [[ImageCache]] that belongs to this `MapView`.
     */
    get imageCache(): MapViewImageCache {
        return this.m_imageCache;
    }

    /**
     * @hidden
     * Get the [[PoiManager]] that belongs to this `MapView`.
     */
    get poiManager(): PoiManager {
        return this.m_poiManager;
    }

    /**
     * @hidden
     * Get the array of [[PoiTableManager]] that belongs to this `MapView`.
     */
    get poiTableManager(): PoiTableManager {
        return this.m_poiTableManager;
    }

    /**
     * The minimum camera height in meters.
     */
    get minCameraHeight(): number {
        return this.m_minCameraHeight;
    }

    /**
     * The minimum zoom level.
     */
    get minZoomLevel(): number {
        return this.m_minZoomLevel;
    }

    /**
     * The minimum zoom level.
     */
    set minZoomLevel(zoomLevel: number) {
        this.m_minZoomLevel = zoomLevel;
        this.update();
    }

    /**
     * The maximum zoom level. Default is 14.
     */
    get maxZoomLevel(): number {
        return this.m_maxZoomLevel;
    }

    /**
     * The maximum zoom level.
     */
    set maxZoomLevel(zoomLevel: number) {
        this.m_maxZoomLevel = zoomLevel;
        this.update();
    }

    /**
     * Gets the bias to apply to the zoom level. Default is 1.
     */
    get zoomLevelBias(): number {
        return this.m_zoomLevelBias;
    }

    /**
     * Sets the bias to apply to the zoom level.
     */
    set zoomLevelBias(bias: number) {
        this.m_zoomLevelBias = bias;
        this.update();
    }

    /**
     * Returns the zoom level for the given camera setup.
     */
    get zoomLevel(): number {
        const distance = Math.abs(this.camera.position.z);
        const zoomLevel = MapViewUtils.calculateZoomLevelFromHeight(distance, this);
        return Math.floor(zoomLevel);
    }

    /**
     * Returns the field of view in degrees.
     */
    get fov(): number {
        return this.m_camera.fov;
    }

    /**
     * Sets the field of view in degrees.
     *
     * @param fov Field of view in degrees.
     */
    set fov(fov: number) {
        fov = this.limitFov(fov, this.m_camera.aspect);
        this.m_camera.fov = fov;
        this.m_camera.updateProjectionMatrix();
        this.m_camera.updateMatrixWorld(false);
        this.update();
    }

    /**
     * Returns height of the viewport in pixels.
     */
    get viewportHeight(): number {
        return this.canvas.height;
    }

    /**
     * Returns [[DataSource]]s displayed by this `MapView`.
     */
    get dataSources(): DataSource[] {
        return this.m_tileDataSources;
    }

    /**
     * Returns the unique [[DataSource]] matching the given name.
     */
    getDataSourceByName(dataSourceName: string): DataSource | undefined {
        return this.m_tileDataSources.find(ds => ds.name === dataSourceName);
    }

    /**
     * Returns the array of [[DataSource]]s referring to the same [[StyleSet]].
     */
    getDataSourcesByStyleSetName(styleSetName: string): DataSource[] {
        return this.m_tileDataSources.filter(ds => ds.styleSetName === styleSetName);
    }

    /**
     * Adds a new [[DataSource]] to this `MapView`. `MapView` needs at least one [[DataSource]] to
     * display something.
     *
     * @param dataSource The data source.
     */
    addDataSource(dataSource: DataSource): Promise<void> {
        const twinDataSource = this.getDataSourceByName(dataSource.name);
        if (twinDataSource !== undefined) {
            throw new Error(
                `A DataSource with the name "${dataSource.name}" already exists in this MapView.`
            );
        }
        dataSource.attach(this);
        this.m_tileDataSources.push(dataSource);

        return dataSource
            .connect()
            .then(() => {
                return new Promise(resolve => {
                    if (this.theme !== undefined) {
                        resolve();
                        return;
                    }

                    const resolveOnce = () => {
                        this.removeEventListener(MapViewEventNames.ThemeLoaded, resolveOnce);
                        resolve();
                    };

                    this.addEventListener(MapViewEventNames.ThemeLoaded, resolveOnce);
                });
            })
            .then(() => {
                const alreadyRemoved = this.m_tileDataSources.indexOf(dataSource) === -1;
                if (alreadyRemoved) {
                    return;
                }
                dataSource.addEventListener(MapViewEventNames.Update, () => {
                    this.update();
                });

                if (this.m_theme.styles !== undefined && dataSource.styleSetName !== undefined) {
                    const styleSet = this.m_theme.styles[dataSource.styleSetName];
                    dataSource.setStyleSet(styleSet, this.m_languages);
                }

                this.m_connectedDataSources.add(dataSource.name);

                this.dispatchEvent({
                    type: MapViewEventNames.DataSourceConnect,
                    dataSourceName: dataSource.name
                });

                this.update();
            })
            .catch(error => {
                this.dispatchEvent({
                    type: MapViewEventNames.DataSourceConnect,
                    dataSourceName: dataSource.name,
                    error
                });
            });
    }

    /**
     * Removes [[DataSource]] from this `MapView`.
     *
     * @param dataSource The data source to be removed
     */
    removeDataSource(dataSource: DataSource) {
        const dsIndex = this.m_tileDataSources.indexOf(dataSource);
        if (dsIndex === -1) {
            return;
        }
        dataSource.detach(this);

        this.m_visibleTiles.removeDataSource(dataSource.name);
        this.m_tileDataSources.splice(dsIndex, 1);
        this.m_connectedDataSources.delete(dataSource.name);

        this.update();
    }

    /**
     * Access the `VisibleTileSet` to get access to all current datasources and their visible tiles.
     */
    get visibleTileSet(): VisibleTileSet {
        return this.m_visibleTiles;
    }

    /**
     * Adds new overlay text elements to this `MapView`.
     *
     * @param textElements Array of [[TextElement]] to be added.
     */
    addOverlayText(textElements: TextElement[]): void {
        if (this.m_overlayTextElements !== undefined) {
            this.m_overlayTextElements = this.m_overlayTextElements.concat(textElements);
        }
        this.updateTextRenderer();
        this.update();
    }

    /**
     * Adds new overlay text elements to this `MapView`.
     *
     * @param textElements Array of [[TextElement]] to be added.
     */
    clearOverlayText(): void {
        this.m_overlayTextElements = [];
    }

    /**
     * Moves the camera to specified geocoordinates, sets desired zoom level and adjusts yaw and
     * pitch.
     *
     * @param geoPos Geolocation to move the camera to.
     * @param zoom Desired zoom level.
     * @param yaw Camera yaw.
     * @param pitch Camera pitch.
     */
    setCameraGeolocationAndZoom(
        geoPos: GeoCoordinates,
        zoom: number,
        yaw?: number,
        pitch?: number
    ): void {
        if (yaw !== undefined && pitch !== undefined) {
            MapViewUtils.setRotation(this, yaw, pitch);
        }

        this.geoCenter = geoPos;
        this.camera.position.set(0, 0, 0);
        MapViewUtils.zoomOnTargetPosition(this, 0, 0, zoom);
        this.update();
    }

    /**
     * Returns `true` if this `MapView` is constantly redrawing the scene.
     */
    get animating(): boolean {
        return this.m_animationCount > 0;
    }

    /**
     * Begin animating the scene.
     */
    beginAnimation() {
        if (this.m_animationCount++ === 0) {
            if (!this.m_updatePending) {
                this.m_updatePending = true;
                this.drawFrame();
            }
            ANIMATION_STARTED_EVENT.time = Date.now();
            this.dispatchEvent(ANIMATION_STARTED_EVENT);
        }
    }

    /**
     * Stop animating the scene.
     */
    endAnimation() {
        if (this.m_animationCount > 0) {
            --this.m_animationCount;
        }

        if (this.m_animationCount === 0) {
            ANIMATION_FINISHED_EVENT.time = Date.now();
            this.dispatchEvent(ANIMATION_FINISHED_EVENT);
        }
    }

    /**
     * Returns `true` if the camera moved in the last frame.
     */
    get cameraIsMoving() {
        return this.m_movementDetector.cameraIsMoving;
    }

    /**
     * Returns the ratio between a pixel and a world unit for the current camera (in the center of
     * the camera projection).
     */
    get pixelToWorld(): number {
        if (this.m_pixelToWorld === undefined) {
            const { clientWidth, clientHeight } = this.canvas;
            const center = this.getWorldPositionAt(clientWidth * 0.5, clientHeight);
            const unitOffset = this.getWorldPositionAt(clientWidth * 0.5 + 1.0, clientHeight);

            this.m_pixelToWorld =
                center !== null && unitOffset !== null ? unitOffset.sub(center).length() : 1.0;
        }
        return this.m_pixelToWorld;
    }

    /**
     * Returns the ratio between a world and a pixel unit for the current camera (in the center of
     * the camera projection).
     */
    get wordlToPixel() {
        return 1.0 / this.pixelToWorld;
    }

    /**
     * Returns the screen position of the given geo coordinates.
     *
     * @param geoPos The geo coordinates.
     * @returns The screen position in CSS/client coordinates (no pixel ratio applied) or
     * `undefined`.
     */
    getScreenPosition(geoPos: GeoCoordinates): THREE.Vector2 | undefined {
        const worldPos = new THREE.Vector3();
        this.projection.projectPoint(geoPos, worldPos);
        const p = this.m_screenProjector.project(worldPos);
        if (p !== undefined) {
            const { width, height } = this.canvas;
            p.x = (p.x + width / 2) / window.devicePixelRatio;
            p.y = (height - (p.y + height / 2)) / window.devicePixelRatio;
        }
        return p;
    }

    /**
     * Returns the world space position from the given screen position. The return value can be
     * `null`, in case the camera is facing the horizon and the given `(x, y)` value is not
     * intersecting the ground plane.
     *
     * @param x The X position in css/client coordinates (without applied display ratio).
     * @param y The Y position in css/client coordinates (without applied display ratio).
     */
    getWorldPositionAt(x: number, y: number): THREE.Vector3 | null {
        this.m_raycaster.setFromCamera(this.getNormalizedScreenCoordinates(x, y), this.m_camera);
        const vec3 = new THREE.Vector3();
        const worldPosition = this.m_raycaster.ray.intersectPlane(this.m_plane, vec3);

        if (!worldPosition) {
            return null;
        }
        worldPosition.add(this.m_worldCenter);

        return worldPosition;
    }

    /**
     * Returns the [[GeoCoordinates]] from the given screen position. The return value can be
     * `null`, in case the camera is facing the horizon and the given `(x, y)` value is not
     * intersecting the ground plane.
     *
     * @param x The X position in css/client coordinates (without applied display ratio).
     * @param y The Y position in css/client coordinates (without applied display ratio).
     */
    getGeoCoordinatesAt(x: number, y: number): GeoCoordinates | null {
        const worldPosition = this.getWorldPositionAt(x, y);
        if (!worldPosition) {
            return null;
        }
        return this.projection.unprojectPoint(worldPosition);
    }

    /**
     * Returns the normalized screen coordinates from the given pixel position.
     *
     * @param x The X position in css/client coordinates (without applied display ratio).
     * @param y The Y position in css/client coordinates (without applied display ratio).
     */
    getNormalizedScreenCoordinates(x: number, y: number): THREE.Vector3 {
        // use clientWidth and clientHeight as it does not apply the pixelRatio and
        // therefore supports also HiDPI devices
        const { clientWidth, clientHeight } = this.canvas;
        return new THREE.Vector3((x / clientWidth) * 2 - 1, -((y / clientHeight) * 2) + 1, 0);
    }

    /**
     * Do a raycast on all objects in the scene. Useful for picking. Limited to objects that
     * THREE.js can raycast, the solid lines that get their geometry in the shader cannot be tested
     * for intersection.
     *
     * @param x The X position in css/client coordinates (without applied display ratio).
     * @param y The Y position in css/client coordinates (without applied display ratio).
     * @returns The list of intersection results.
     */
    intersectMapObjects(x: number, y: number): PickResult[] {
        return this.m_pickHandler.intersectMapObjects(x, y);
    }

    /**
     * Resize the HTML canvas element and the THREE.js `WebGLRenderer`.
     *
     * @param width The new width.
     * @param height The new height.
     */
    resize(width: number, height: number) {
        this.m_renderer.setSize(width, height, false);
        this.m_renderer.setPixelRatio(window.devicePixelRatio);

        if (this.mapRenderingManager !== undefined) {
            this.mapRenderingManager.setSize(width, height);
        }

        if (this.collisionDebugCanvas !== undefined) {
            this.collisionDebugCanvas.width = width;
            this.collisionDebugCanvas.height = height;
        }

        this.updateCameras();
        this.update();
    }

    /**
     * Requests a redraw of the scene.
     */
    update() {
        if (this.m_updatePending) {
            return;
        } // compress the update request

        this.m_updatePending = true;

        if (this.animating) {
            return;
        } // nothing to do

        this.drawFrame();
    }

    /**
     * Returns `true` if an update has already been requested, such that after a currently rendering
     * frame, the next frame will be rendered immediately.
     */
    get updatePending(): boolean {
        return this.m_updatePending;
    }

    /**
     * Requests a redraw of the scene.
     * @deprecated Use the [[update]] method instead.
     */
    requestUpdateIfNeeded() {
        this.update();
    }

    /**
     * Clear the tile cache.
     *
     * Remove the [[Tile]] objects created by cacheable [[DataSource]]s. If a [[DataSource]] name is
     * provided, this method restricts the eviction the [[DataSource]] with the given name.
     *
     * @param dataSourceName The name of the [[DataSource]].
     */
    clearTileCache(dataSourceName?: string) {
        this.m_visibleTiles.clearTileCache(dataSourceName);
    }

    /**
     * Apply visitor to all visible tiles.
     *
     * @param fun Visitor function
     */
    forEachVisibleTile(fun: (tile: Tile) => void) {
        this.m_visibleTiles.forEachVisibleTile(fun);
    }

    /**
     * Apply a visitor function to all tiles in the cache.
     *
     * @param visitor Visitor function
     */
    forEachCachedTile(visitor: (tile: Tile) => void) {
        this.m_visibleTiles.forEachCachedTile(visitor);
    }

    /**
     * Visit each tile in visible, rendered, and cached sets.
     *
     *  * Visible and temporarily rendered tiles will be marked for update and retained.
     *  * Cached but not rendered/visible will be evicted.
     *
     * @param dataSource If passed, only the tiles from this [[DataSource]] instance are processed.
     * If `undefined`, tiles from all [[DataSource]]s are processed.
     */
    markTilesDirty(dataSource?: DataSource) {
        this.m_visibleTiles.markTilesDirty(dataSource);
    }

    /**
     * Public access to [[MapViewFog]] allowing to toggle it by setting its `enabled` property.
     */
    get fog(): MapViewFog {
        return this.m_fog;
    }

    /**
     * Sets the debug option to render the internal [[GlyphTextureCache]]s into the canvas.
     */
    set debugGlyphTextureCache(value: boolean) {
        this.m_debugGlyphTextureCache = value;
    }

    /**
     * Updates the camera and the projections and resets the screen collisions.
     */
    private updateCameras() {
        const { width, height } = this.canvas;
        this.m_camera.aspect =
            this.m_forceCameraAspect !== undefined ? this.m_forceCameraAspect : width / height;
        this.m_camera.fov = this.limitFov(this.m_camera.fov, this.m_camera.aspect);

        const kMinNear = 0.1;
        const kMultiplier = 50.0;
        const kFarOffset = 200.0;

        let nearPlane = Math.max(kMinNear, this.m_camera.position.z * 0.1);
        let farPlane = nearPlane * kMultiplier + kFarOffset;

        if (this.m_options.farPlaneEvaluator !== undefined) {
            this.camera.getWorldDirection(this.m_tempVector3);
            const angle = THREE.Math.radToDeg(this.m_tempVector3.angleTo(EYE_INVERSE));
            const nearFarPlane = this.m_options.farPlaneEvaluator(this, angle, nearPlane, farPlane);
            nearPlane = Math.max(kMinNear, nearFarPlane.near);
            farPlane = Math.max(nearPlane + kFarOffset, nearFarPlane.far);
        }

        this.m_camera.near = nearPlane;
        this.m_camera.far = farPlane;

        this.m_camera.updateProjectionMatrix();
        this.m_camera.updateMatrixWorld(false);

        this.m_screenCamera.left = width / -2;
        this.m_screenCamera.right = width / 2;
        this.m_screenCamera.bottom = height / -2;
        this.m_screenCamera.top = height / 2;
        this.m_screenCamera.updateProjectionMatrix();
        this.m_screenCamera.updateMatrixWorld(false);

        this.m_screenProjector.update(this.m_camera, this.m_worldCenter, width, height);
        this.m_screenCollisions.update(width, height);

        this.m_pixelToWorld = undefined;
    }

    /**
     * Draw a new frame.
     */
    private drawFrame() {
        if (this.m_drawing) {
            return;
        }
        // Cancel an active requestAnimationFrame() cycle. Failure to do this may end up in
        // rendering multiple times during a single frame.
        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
        }
        this.m_animationFrameHandle = requestAnimationFrame(this.handleRequestAnimationFrame);
    }

    /**
     * Draw a new frame.
     */
    private renderFunc(time: number) {
        this.render(time);
    }

    /**
     * Returns the list of the enabled data sources.
     */
    private getEnabledTileDataSources(): DataSource[] {
        // ### build this list once decoders && datasources are ready

        const enabledDataSources: DataSource[] = [];

        for (const dataSource of this.m_tileDataSources) {
            if (!dataSource.enabled) {
                continue;
            }
            if (!dataSource.ready()) {
                continue;
            }
            if (!this.m_connectedDataSources.has(dataSource.name)) {
                continue;
            }
            enabledDataSources.push(dataSource);
        }

        return enabledDataSources;
    }

    /**
     * Renders the current frame.
     */
    private render(time: number): void {
        if (this.m_drawing) {
            return;
        }

        this.m_renderer.info.reset();

        this.m_stagedRenderTimer.start();

        this.m_updatePending = false;
        this.m_thisFrameTilesChanged = undefined;

        ++this.m_snapshot;

        this.m_drawing = true;

        this.m_renderer.setPixelRatio(window.devicePixelRatio);

        RENDER_EVENT.time = time;
        this.dispatchEvent(RENDER_EVENT);

        this.updateCameras();
        this.m_fog.update(this.m_camera);
        this.m_renderer.clear();

        // Initialize depth base polygonOffset to prevent overlapping geometries from z-fighting
        resetDepthBasedPolygonOffsetIndex();

        // clear the scene
        while (this.m_mapTilesRoot.children.length > 0) {
            this.m_mapTilesRoot.remove(this.m_mapTilesRoot.children[0]);
        }

        const storageLevel = THREE.Math.clamp(
            this.zoomLevel,
            this.m_minZoomLevel,
            this.m_maxZoomLevel
        );

        this.m_stagedRenderTimer.stage = "render.culling";

        // TBD: Update renderList only any of its params (camera, etc...) has changed.
        if (!this.lockVisibleTileSet) {
            this.m_visibleTiles.updateRenderList(
                this.m_worldCenter,
                storageLevel,
                this.zoomLevel,
                this.getEnabledTileDataSources()
            );
        }
        const renderList = this.m_visibleTiles.dataSourceTileList;

        renderList.forEach(({ zoomLevel, renderedTiles }) => {
            renderedTiles.forEach(tile => {
                this.renderTileObjects(tile, zoomLevel);
            });
        });

        this.checkCameraMoved();

        // The camera used to render the scene.
        const camera = this.m_pointOfView !== undefined ? this.m_pointOfView : this.m_camera;

        this.prepareRenderTextElements(time);

        this.m_stagedRenderTimer.stage = "render.draw";

        if (this.m_stats.enabled) {
            const now = PerformanceTimer.now();
            if (this.m_previousFrameTimeStamp !== undefined) {
                const frameTime = now - this.m_previousFrameTimeStamp;
                this.m_stats.getTimer("render.frameTime").setValue(frameTime);
                // for convenience and easy readability
                this.m_stats.getTimer("render.fps").setValue(1000 / frameTime);
            }
            this.m_previousFrameTimeStamp = now;
        }

        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.update(this.m_camera);
        }

        const isStaticFrame = !(this.animating || this.m_updatePending);
        this.mapRenderingManager.render(this.m_renderer, this.m_scene, camera, isStaticFrame);

        this.finishRenderTextElements();

        this.m_stagedRenderTimer.stage = "render.cleanup";

        DID_RENDER_EVENT.time = time;
        this.dispatchEvent(DID_RENDER_EVENT);

        if (!this.m_firstFrameRendered) {
            this.m_firstFrameRendered = true;
            FIRST_FRAME_EVENT.time = time;
            this.dispatchEvent(FIRST_FRAME_EVENT);
        }

        if (
            !this.m_firstFrameComplete &&
            this.m_visibleTiles.allVisibleTilesLoaded &&
            !this.m_updatePending &&
            !this.animating &&
            this.m_textElementsRenderer !== undefined &&
            !this.m_textElementsRenderer.loading
        ) {
            this.m_firstFrameComplete = true;
            FRAME_COMPLETE_EVENT.time = time;
            this.dispatchEvent(FRAME_COMPLETE_EVENT);
        }

        this.m_visibleTiles.disposePendingTiles();

        this.m_stagedRenderTimer.stop();

        this.m_drawing = false;

        if (this.m_stats.enabled) {
            if (this.m_snapshot % this.m_logStatsFrames === 0) {
                this.m_stats.log();
            }
        }

        if (this.animating || this.m_updatePending) {
            this.drawFrame();
        }

        this.checkCopyrightUpdates();
    }

    private renderTileObjects(tile: Tile, zoomLevel: number) {
        if (tile.willRender(zoomLevel)) {
            for (const object of tile.objects) {
                object.position.copy(tile.center);
                if (object.displacement !== undefined) {
                    object.position.add(object.displacement);
                }
                object.position.sub(this.m_worldCenter);
                this.m_mapTilesRoot.add(object);
            }
        }
        tile.didRender();
    }

    private prepareRenderTextElements(time: number) {
        if (this.checkIfTextElementsChanged() || this.checkIfTilesChanged()) {
            if (this.m_textElementsRenderer !== undefined) {
                this.m_textElementsRenderer.placeAllTileLabels();
            }
        }

        this.m_stagedRenderTimer.stage = "render.text.render";

        // Disable rendering of text elements for debug camera. TextElements are rendered using an
        // orthographic camera that covers the entire available screen space. Unfortunately, this
        // particular camera set up is not compatible with the debug camera.
        const debugCameraActive = this.m_pointOfView !== undefined;

        if (this.m_textElementsRenderer === undefined || debugCameraActive) {
            return;
        }

        this.m_textElementsRenderer.debugGlyphTextureCache = this.m_debugGlyphTextureCache;

        let shouldDrawText;
        this.camera.getWorldDirection(this.m_tempVector3);
        const angle = THREE.Math.radToDeg(this.m_tempVector3.angleTo(EYE_INVERSE));

        if (this.m_options.labelVisibilityEvaluator !== undefined) {
            shouldDrawText = this.m_options.labelVisibilityEvaluator(this, angle);
        } else {
            const maxLabelAngle =
                this.m_options.maxLabelAngle === undefined ? 90 : this.m_options.maxLabelAngle;

            shouldDrawText = angle < maxLabelAngle;
        }

        this.m_textElementsRenderer.reset();
        if (shouldDrawText) {
            // User TextElements have the priority when it comes to reserving screen space, so
            // they are handled first. They will be rendered after the normal map objects and
            // TextElements
            this.m_textElementsRenderer.renderUserTextElements(time, this.m_snapshot);
            this.m_textElementsRenderer.renderAllTileText(time, this.m_snapshot);
        }
        this.m_textElementsRenderer.renderOverlay(this.m_overlayTextElements);
        this.m_textElementsRenderer.update(this.m_renderer);
    }

    private finishRenderTextElements() {
        this.m_stagedRenderTimer.stage = "render.text.post";

        const canRenderTextElements = this.m_pointOfView === undefined;

        if (canRenderTextElements && this.m_textElementsRenderer) {
            this.m_textElementsRenderer.end();

            // copy far value from scene camera, as the distance to the POIs matter now.
            this.m_screenCamera.far = this.camera.far;
            this.m_textElementsRenderer.renderText(this.m_renderer, this.m_screenCamera);
        }
    }

    private initTheme() {
        if (this.m_options.theme === undefined) {
            return;
        }

        const themePromise =
            typeof this.m_options.theme === "string"
                ? ThemeLoader.loadAsync(this.m_options.theme)
                : Promise.resolve<Theme>(this.m_options.theme);

        themePromise.then((theme: Theme) => {
            THEME_LOADED_EVENT.time = Date.now();
            this.dispatchEvent(THEME_LOADED_EVENT);
            this.theme = theme;
        });
    }

    private setupCamera() {
        const { clientWidth, clientHeight } = this.canvas;

        this.m_scene.add(this.m_camera); // ensure the camera is added to the scene.

        this.m_camera.position.set(0, 0, 3000);
        this.m_camera.lookAt(new THREE.Vector3(0, 0, 0));

        this.m_visibleTiles = new VisibleTileSet(this.m_camera, this.m_visibleTileSetOptions);
        // ### move & customize
        this.resize(clientWidth, clientHeight);

        this.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        this.m_screenCamera.position.z = 1;
        this.m_screenCamera.near = 0;
    }

    private updateSkyBackground() {
        if (this.m_theme === undefined) {
            return;
        }
        const theme = this.m_theme;
        if (this.m_skyBackground instanceof SkyBackground && theme.sky !== undefined) {
            // there is a sky in the view and there is a sky option in the theme. Update the colors
            this.updateSkyBackgroundColors(theme.sky, theme.clearColor);
        } else if (this.m_skyBackground === undefined && theme.sky !== undefined) {
            // there is no sky in the view but there is a sky option in the theme
            this.addNewSkyBackground(theme.sky, theme.clearColor);
            return;
        } else if (this.m_skyBackground instanceof SkyBackground && theme.sky === undefined) {
            // there is a sky in the view, but not in the theme
            this.removeSkyBackGround();
        }
    }

    private addNewSkyBackground(skyBackground: Sky, clearColor: string | undefined) {
        const groundColor =
            skyBackground.groundColor === undefined ? clearColor : skyBackground.groundColor;
        this.m_skyBackground = new SkyBackground(
            new THREE.Color(skyBackground.colorTop),
            new THREE.Color(skyBackground.colorBottom),
            new THREE.Color(groundColor),
            this.camera,
            skyBackground.monomialPower
        );
        this.m_scene.background = this.m_skyBackground.texture;
    }

    private removeSkyBackGround() {
        this.m_scene.background = null;
        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.texture.dispose();
            this.m_skyBackground = undefined;
        }
    }

    private updateSkyBackgroundColors(skyBackground: Sky, clearColor: string | undefined) {
        const groundColor =
            skyBackground.groundColor === undefined ? clearColor : skyBackground.groundColor;
        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.updateColors(
                new THREE.Color(skyBackground.colorTop),
                new THREE.Color(skyBackground.colorBottom),
                new THREE.Color(groundColor)
            );
        }
    }

    private updateLighting() {
        if (!this.m_theme) {
            return;
        }

        const theme = this.m_theme as Theme;
        if (theme.clearColor !== undefined) {
            this.m_renderer.setClearColor(new THREE.Color(theme.clearColor));
        }

        if (this.m_createdLights) {
            this.m_createdLights.forEach((light: THREE.Light) => {
                this.m_scene.remove(light);
            });
        }
        if (theme.lights !== undefined) {
            this.m_createdLights = [];
            theme.lights.forEach((lightDescription: Light) => {
                const light = createLight(lightDescription);
                if (!light) {
                    logger.log(
                        `MapView: failed to create light ${lightDescription.name} of type ${
                            lightDescription.type
                        }`
                    );
                    return;
                }
                this.m_scene.add(light);
                this.m_createdLights!.push(light);
            });
        }
    }

    private movementStarted() {
        if (this.m_textElementsRenderer !== undefined) {
            this.m_textElementsRenderer.movementStarted();
        }
        MOVEMENT_STARTED_EVENT.time = Date.now();
        this.dispatchEvent(MOVEMENT_STARTED_EVENT);
    }

    private movementFinished() {
        if (this.m_textElementsRenderer !== undefined) {
            this.m_textElementsRenderer.movementFinished();
        }
        MOVEMENT_FINISHED_EVENT.time = Date.now();
        this.dispatchEvent(MOVEMENT_FINISHED_EVENT);

        // render at the next possible time.
        if (!this.animating) {
            setTimeout(() => this.update(), 0);
        }
    }

    private checkCameraMoved(): boolean {
        return this.m_movementDetector.checkCameraMoved(this);
    }

    /**
     * Check if the `textElementsChanged` flag in any tile has been set to `true`. If any flag was
     * `true`, this function returns `true`, and resets the flag in all tiles to `false`.
     */
    private checkIfTextElementsChanged() {
        const renderList = this.m_visibleTiles.dataSourceTileList;

        let textElementsChanged = false;

        renderList.forEach(({ renderedTiles }) => {
            renderedTiles.forEach(tile => {
                if (tile.textElementsChanged) {
                    tile.textElementsChanged = false;
                    textElementsChanged = true;
                }
            });
        });

        return textElementsChanged;
    }

    /**
     * Check if the set of visible tiles changed since the last frame.
     *
     * May be called multiple times per frame.
     *
     * Equality is computed by creating a string containing the IDs of the tiles.
     */
    private checkIfTilesChanged() {
        if (this.m_thisFrameTilesChanged !== undefined) {
            return this.m_thisFrameTilesChanged;
        }
        const renderList = this.m_visibleTiles.dataSourceTileList;

        const tileIdList: string[] = [];

        tileIdList.length = 0;

        renderList.forEach(({ dataSource, renderedTiles }) => {
            renderedTiles.forEach(tile => {
                tileIdList.push(dataSource.name + "-" + tile.tileKey.mortonCode());
            });
        });

        tileIdList.sort();

        const newTileIds = tileIdList.join("#");

        if (newTileIds !== this.m_lastTileIds) {
            this.m_lastTileIds = newTileIds;
            this.m_thisFrameTilesChanged = true;
        } else {
            this.m_thisFrameTilesChanged = false;
        }

        return this.m_thisFrameTilesChanged;
    }

    private checkCopyrightUpdates() {
        if (!this.checkIfTilesChanged()) {
            return;
        }

        const newCopyrightInfo = this.getRenderedTilesCopyrightInfo();
        if (newCopyrightInfo === this.m_copyrightInfo) {
            return;
        }
        if (newCopyrightInfo.length === this.m_copyrightInfo.length) {
            let allEqual = true;
            for (let i = 0; i < newCopyrightInfo.length; i++) {
                const a = newCopyrightInfo[i];
                const b = this.m_copyrightInfo[i];
                if (a.label !== b.label) {
                    allEqual = false;
                    break;
                }
            }
            if (allEqual) {
                return;
            }
        }
        this.m_copyrightInfo = newCopyrightInfo;
        this.dispatchEvent(COPYRIGHT_CHANGED_EVENT);
    }

    private getRenderedTilesCopyrightInfo(): CopyrightInfo[] {
        let result: CopyrightInfo[] = [];
        for (const tileList of this.m_visibleTiles.dataSourceTileList) {
            for (const tile of tileList.renderedTiles) {
                const tileCopyrightInfo = tile.copyrightInfo;
                if (tileCopyrightInfo === undefined || tileCopyrightInfo.length === 0) {
                    continue;
                }
                result = CopyrightInfo.mergeArrays(result, tileCopyrightInfo);
            }
        }
        return result;
    }

    private updateImages() {
        if (!this.m_theme) {
            return;
        }

        const theme = this.m_theme as Theme;

        this.m_imageCache.clear();
        this.poiManager.clear();

        if (theme.images !== undefined) {
            theme.images.forEach((image: { [key: string]: any }) => {
                this.m_imageCache.addImage(image.name, image.url, image.preload === true);
                if (typeof image.atlas === "string") {
                    this.poiManager.addTextureAtlas(image.name, image.atlas);
                }
            });
        }

        if (theme.imageTextures !== undefined) {
            theme.imageTextures.forEach((imageTexture: ImageTexture) => {
                this.poiManager.addImageTexture(imageTexture);
            });
        }
    }

    private loadPoiTables() {
        if (this.m_theme === undefined) {
            return;
        }

        this.poiTableManager.clear();

        // Add the POI tables defined in the theme.
        this.poiTableManager.loadPoiTables(this.m_theme as Theme);
    }

    get statistics(): Statistics {
        if (this.m_stats === undefined) {
            throw new Error("Statistics are not initialized.");
        }

        return this.m_stats;
    }

    private setupStats() {
        this.m_stats.createTimer("render.frameTime", true);
        this.m_stats.createTimer("render.fps", true);
        this.m_stats.createTimer("render.setup", true);
        this.m_stats.createTimer("render.culling", true);
        this.m_stats.createTimer("render.text.render", true);
        this.m_stats.createTimer("render.draw", true);
        this.m_stats.createTimer("render.text.post", true);
        this.m_stats.createTimer("render.cleanup", true);

        this.m_stats.createTimer("decoding", true);
        this.m_stats.createTimer("geometryCreation", true);

        this.m_stagedRenderTimer = new MultiStageTimer(this.m_stats, "stagedRenderTimer", [
            "render.setup",
            "render.culling",
            "render.text.render",
            "render.draw",
            "render.text.post",
            "render.cleanup"
        ]);
    }

    private setupRenderer() {
        this.m_renderer.setClearColor(DEFAULT_CLEAR_COLOR);

        this.m_scene.add(this.m_mapTilesRoot);
    }

    /**
     * Gradually initialize & update TextRenderer as assets arrive.
     */
    private updateTextRenderer() {
        if (this.m_theme === undefined) {
            return;
        }
        if (this.m_textElementsRenderer === undefined) {
            this.m_textElementsRenderer = new TextElementsRenderer(
                this,
                this.m_screenCollisions,
                this.m_screenProjector,
                this.m_theme,
                this.m_options.maxNumVisibleLabels,
                this.m_options.numSecondChanceLabels,
                this.m_options.maxDistanceRatioForLabels,
                this.m_options.labelStartScaleDistance,
                this.defaultTextMaterialConstructor
            );
        }
        this.m_textElementsRenderer.placeAllTileLabels();
    }

    /**
     * Default handler for webglcontextlost event
     */
    private onWebGLContextLost = (event: Event) => {
        this.dispatchEvent(CONTEXT_LOST_EVENT);
        logger.log("WebGL context lost", event);
    };

    /**
     * Default handler for webglcontextrestored event
     */
    private onWebGLContextRestored = (event: Event) => {
        this.dispatchEvent(CONTEXT_RESTORED_EVENT);
        if (this.m_theme !== undefined && this.m_theme.clearColor !== undefined) {
            this.m_renderer.setClearColor(new THREE.Color(this.m_theme.clearColor));
        } else {
            this.m_renderer.setClearColor(DEFAULT_CLEAR_COLOR);
        }
        this.update();
        logger.log("WebGL context restored", event);
    };

    private limitFov(fov: number | undefined, aspect: number): number {
        fov = MathUtils.clamp(
            fov === undefined ? DEFAULT_FIELD_OF_VIEW : fov,
            MIN_FIELD_OF_VIEW,
            MAX_FIELD_OF_VIEW
        );

        let hFov = MathUtils.radToDeg(
            MapViewUtils.calculateHorizontalFovByVerticalFov(MathUtils.degToRad(fov), aspect)
        );

        if (hFov > MAX_FIELD_OF_VIEW || hFov < MIN_FIELD_OF_VIEW) {
            hFov = MathUtils.clamp(hFov, MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW);
            fov = MathUtils.radToDeg(
                MapViewUtils.calculateVerticalFovByHorizontalFov(MathUtils.degToRad(hFov), aspect)
            );
        }
        return fov as number;
    }
}
