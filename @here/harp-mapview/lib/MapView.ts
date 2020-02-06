/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    GeometryKind,
    GradientSky,
    ImageTexture,
    Light,
    MapEnv,
    PostEffects,
    Sky,
    Theme
} from "@here/harp-datasource-protocol";
import {
    EarthConstants,
    GeoCoordinates,
    GeoCoordLike,
    mercatorProjection,
    Projection,
    ProjectionType,
    TilingScheme
} from "@here/harp-geoutils";
import {
    assert,
    getOptionValue,
    LoggerManager,
    LogLevel,
    PerformanceTimer,
    UriResolver
} from "@here/harp-utils";
import * as THREE from "three";

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { AnimatedExtrusionHandler } from "./AnimatedExtrusionHandler";
import { BackgroundDataSource } from "./BackgroundDataSource";
import { CameraMovementDetector } from "./CameraMovementDetector";
import { ClipPlanesEvaluator, createDefaultClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { IMapAntialiasSettings, IMapRenderingManager, MapRenderingManager } from "./composing";
import { ConcurrentDecoderFacade } from "./ConcurrentDecoderFacade";
import { CopyrightInfo } from "./copyrights/CopyrightInfo";
import { DataSource } from "./DataSource";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { FrustumIntersection } from "./FrustumIntersection";
import { overlayOnElevation } from "./geometry/overlayOnElevation";
import { PhasedTileGeometryManager } from "./geometry/PhasedTileGeometryManager";
import { SimpleTileGeometryManager, TileGeometryManager } from "./geometry/TileGeometryManager";
import { MapViewImageCache } from "./image/MapViewImageCache";
import { MapViewFog } from "./MapViewFog";
import { PickHandler, PickResult } from "./PickHandler";
import { PoiManager } from "./poi/PoiManager";
import { PoiRendererFactory } from "./poi/PoiRendererFactory";
import { PoiTableManager } from "./poi/PoiTableManager";
import { PolarTileDataSource } from "./PolarTileDataSource";
import { ScreenCollisions, ScreenCollisionsDebug } from "./ScreenCollisions";
import { ScreenProjector } from "./ScreenProjector";
import { SkyBackground } from "./SkyBackground";
import { FrameStats, PerformanceStatistics } from "./Statistics";
import { FontCatalogLoader } from "./text/FontCatalogLoader";
import { MapViewState } from "./text/MapViewState";
import { TextCanvasFactory } from "./text/TextCanvasFactory";
import { TextElement } from "./text/TextElement";
import { TextElementsRenderer, ViewUpdateCallback } from "./text/TextElementsRenderer";
import { TextElementsRendererOptions } from "./text/TextElementsRendererOptions";
import { createLight } from "./ThemeHelpers";
import { ThemeLoader } from "./ThemeLoader";
import { Tile } from "./Tile";
import { MapViewUtils } from "./Utils";
import { ResourceComputationType, VisibleTileSet, VisibleTileSetOptions } from "./VisibleTileSet";

declare const process: any;

// Cache value, because access to process.env.NODE_ENV is SLOW!
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
    // In production: silence logging below error.
    LoggerManager.instance.setLogLevelForAll(LogLevel.Error);
} else {
    // In dev: silence logging below log (silences "debug" and "trace" levels).
    LoggerManager.instance.setLogLevelForAll(LogLevel.Log);
}
/**
 * An interface describing [[THREE.Object3D]]s anchored on given [[GeoCoordinates]].
 *
 * Example:
 * ```typescript
 * const mesh: MapObject<THREE.Mesh> = new THREE.Mesh(geometry, material);
 * mesh.geoPosition = new GeoCoordinates(latitude, longitude, altitude);
 * mapView.mapAnchors.add(mesh);
 * ```
 *
 */
export type MapAnchor<T extends THREE.Object3D = THREE.Object3D> = T & {
    /**
     * The position of this [[MapObject]] in [[GeoCoordinates]].
     */
    geoPosition?: GeoCoordinates;
};

export enum MapViewEventNames {
    /** Called before this `MapView` starts to render a new frame. */
    Update = "update",
    /** Called when the WebGL canvas is resized. */
    Resize = "resize",
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
    ContextRestored = "webglcontext-restored",
    /** Called when camera position has been changed. */
    CameraPositionChanged = "camera-changed"
}

const logger = LoggerManager.instance.create("MapView");
const DEFAULT_CLEAR_COLOR = 0xefe9e1;
const DEFAULT_FOV_CALCULATION: FovCalculation = { type: "dynamic", fov: 40 };
const DEFAULT_CAM_NEAR_PLANE = 0.1;
const DEFAULT_CAM_FAR_PLANE = 4000000;
const MAX_FIELD_OF_VIEW = 140;
const MIN_FIELD_OF_VIEW = 10;
export const MAX_TILT_ANGLE = 89;
// All objects in fallback tiles are reduced by this amount.
export const FALLBACK_RENDER_ORDER_OFFSET = 20000;

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
 * Amount of framerate values to pick average from
 */
const FRAME_RATE_RING_SIZE = 12;

/**
 * Default starting value for FPS computation.
 */
const FALLBACK_FRAME_RATE = 30;

/**
 * Zoom level to request terrain tiles for getting the height of the camera above terrain.
 */
const TERRAIN_ZOOM_LEVEL = 4;

/**
 * Style set used by [[PolarTileDataSource]] by default.
 */
const DEFAULT_POLAR_STYLE_SET_NAME = "polar";

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
const UPDATE: RenderEvent = { type: MapViewEventNames.Update } as any;
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

const cache = {
    vector2: [new THREE.Vector2()],
    vector3: [new THREE.Vector3()]
};

/**
 * Specifies how the FOV (Field of View) should be calculated.
 */
export interface FovCalculation {
    /**
     * How to interpret the [[fov]], can be either `fixed` or `dynamic`.
     *
     * `fixed` means that the FOV is fixed regardless of the [[viewportHeight]], such that shrinking
     * the height causes the map to shrink to keep the content in view. The benefit is that,
     * regardless of any resizes, the field of view is constant, which means there is no change in
     * the distortion of buildings near the edges. However the trade off is that the zoom level
     * changes, which means that the map will pull in new tiles, hence causing some flickering.
     *
     * `dynamic` means that the focal length is calculated based on the supplied [[fov]] and
     * [[viewportHeight]], this means that the map doesn't scale (the image is essentially cropped
     * but not shrunk) when the [[viewportHeight]] or [[viewportWidth]] is changed. The benefit is
     * that the zoom level is (currently) stable during resize, because the focal length is used,
     * however the tradeoff is that changing from a small to a big height will cause the fov to
     * change a lot, and thus introduce distortion.
     */
    type: "fixed" | "dynamic";

    /**
     * If [[type]] is `fixed` then the supplied [[fov]] is fixed regardless of
     * [[viewportHeight]] or [[viewportWidth]].
     *
     * If [[type]] is `dynamic` then the supplied [[fov]] is applied to the
     * first frame, and the focal length calculated. Changes to the viewport
     * height no longer shrink the content because the field of view is updated
     * dynamically.
     */
    fov: number;
}

/**
 * Hint for the WebGL implementation on which power mode to prefer.
 *
 * @see https://www.khronos.org/registry/webgl/specs/latest/1.0/#5.14.12
 */
export enum MapViewPowerPreference {
    /** Default value. */
    Default = "default",
    /** Lower power mode, used to conserve energy. */
    LowPower = "low-power",
    /** Maximum performance. */
    HighPerformance = "high-performance"
}

/**
 * User configuration for the [[MapView]].
 */
export interface MapViewOptions extends TextElementsRendererOptions {
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
     * @default `true` for `pixelRatio` < `2.0`, `false` otherwise.
     */
    enableNativeWebglAntialias?: boolean;

    /**
     * Antialias settings for the map rendering. It is better to disable the native antialising if
     * the custom antialiasing is enabled.
     */
    customAntialiasSettings?: IMapAntialiasSettings;

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
     * Relative URIs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     */
    decoderUrl?: string;

    /**
     * The number of Web Workers used to decode data. The default is
     * CLAMP(`navigator.hardwareConcurrency` - 1, 1, 2).
     */
    decoderCount?: number;

    /**
     * The [[Theme]] used by Mapview.
     *
     * This Theme can be one of the following:
     *  - `string` : the URI of the theme file used to style this map
     *  - `Theme` : the `Theme` object already loaded
     *  - `Promise<Theme>` : the future `Theme` object
     *  - `undefined` : the theme is not yet set up, but can be set later. Rendering waits until
     *     the theme is set.
     *
     * **Note:** Layers that use a theme do not render any content until that theme is available.
     *
     * Relative URIs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * Custom URIs (of theme itself and of resources referenced by theme) may be resolved with help
     * of [[uriResolver]].
     *
     * @see [[ThemeLoader.load]] for details how theme is loaded
     */
    theme?: string | Theme | Promise<Theme>;

    /**
     * Resolve `URI` referenced in `MapView` assets using this resolver.
     *
     * Use, to support application/deployment specific `URI`s into actual `URLs` that can be loaded
     * with `fetch`.
     *
     * Example:
     * ```
     * uriResolver: new PrefixMapUriResolver({
     *     "local://poiMasterList": "/assets/poiMasterList.json",
     *        // will match only 'local//:poiMasterList' and
     *        // resolve to `/assets/poiMasterList.json`
     *     "local://icons/": "/assets/icons/"
     *        // will match only 'local//:icons/ANYPATH' (and similar) and
     *        // resolve to `/assets/icons/ANYPATH`
     * })
     * ```
     *
     * @see [[UriResolver]]
     * @See [[PrefixMapUriResolver]]
     */
    uriResolver?: UriResolver;

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
     * User-defined camera clipping planes distance evaluator.
     * If not defined, [[TiltViewClipPlanesEvaluator]] will be used by [[MapView]].
     *
     * @default [[TiltViewClipPlanesEvaluator]]
     */
    clipPlanesEvaluator?: ClipPlanesEvaluator;

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
     * Specify if the cache should be counted in tiles or in megabytes.
     *
     * @see [[MapViewDefaults.resourceComputationType]].
     */
    resourceComputationType?: ResourceComputationType;

    /**
     * Limits the number of reduced zoom levels (lower detail) to be searched for fallback tiles.
     *
     * When zooming in, newly elected tiles may have not yet loaded. [[MapView]] searches through
     * the tile cache for tiles ready to be displayed in lower zoom levels. The tiles may be
     * located shallower in the quadtree.
     *
     * To disable a cache search, set the value to `0`.
     *
     * @default [[MapViewDefaults.quadTreeSearchDistanceUp]]
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
     * @default [[MapViewDefaults.quadTreeSeaFIX]]
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
     * Set to `true` to allow picking of technique information associated with objects.
     */
    enablePickTechnique?: boolean;

    /**
     * An optional canvas element that renders 2D collision debug information.
     */
    collisionDebugCanvas?: HTMLCanvasElement;

    /**
     * Maximum timeout, in milliseconds, before a [[MOVEMENT_FINISHED_EVENT]] is sent after the
     * latest frame with a camera movement. The default is 300ms.
     */
    movementThrottleTimeout?: number;

    /**
     * How to calculate the Field of View, if not specified, then
     * [[DEFAULT_FOV_CALCULATION]] is used.
     */
    fovCalculation?: FovCalculation;

    /*
     * An array of ISO 639-1 language codes for data sources.
     */
    languages?: string[];

    /**
     * Set fixed pixel ratio for rendering. Useful when rendering on high resolution displays with
     * low performance GPUs that may be fill-rate limited.
     * @default `window.devicePixelRatio`
     */
    pixelRatio?: number;

    /**
     * Set fixed pixel ratio for rendering when the camera is moving or an animation is running.
     * Useful when rendering on high resolution displays with low performance GPUs that may be
     * fill-rate limited.
     *
     * If a value is specified, a low resolution render pass is used to render the scene into a
     * low resolution render target, before it is copied to the screen.
     *
     * A value of `undefined` disables the low res render pass. Values between 0.5 and
     * `window.devicePixelRatio` can be tried to give  good results. The value should not be larger
     * than `window.devicePixelRatio`.
     *
     * @note Since no anti-aliasing is applied during dynamic rendering with `dynamicPixelRatio`
     * defined, visual artifacts may occur, especially with thin lines..
     *
     * @note The resolution of icons and text labels is not affected.
     *
     * @default `undefined`
     */
    dynamicPixelRatio?: number;

    /**
     * Set maximum FPS (Frames Per Second). If VSync in enabled, the specified number may not be
     * reached, but instead the next smaller number than `maxFps` that is equal to the refresh rate
     * divided by an integer number.
     *
     * E.g.: If the monitors refresh rate is set to 60hz, and if `maxFps` is set to a value of `40`
     * (60hz/1.5), the actual used FPS may be 30 (60hz/2). For displays that have a refresh rate of
     * 60hz, good values for `maxFps` are 30, 20, 15, 12, 10, 6, 3 and 1. A value of `0` is ignored.
     */
    maxFps?: number;

    /**
     * Enable phased loading. If `false`, the geometry on a [[Tile]] is always being created in a
     * single step, instead of (potentially) over multiple frames to smoothen animations.
     *
     * @default `false`
     */
    enablePhasedLoading?: boolean;

    /**
     * Enable map repeat for planar projections.
     * If `true`, map will be repeated in longitudinal direction continuously.
     * If `false`, map will end on lon -180 & 180 deg.
     *
     * @default `true`
     */
    tileWrappingEnabled?: boolean;

    /**
     * Set tiling scheme for [[BackgroundDataSource]]
     */
    backgroundTilingScheme?: TilingScheme;

    /**
     * Should be the [[PolarTileDataSource]] used on spherical projection.
     * Default is `true`.
     */
    enablePolarDataSource?: boolean;

    /**
     * The name of the [[StyleSet]] used by [[PolarTileDataSource]] to evaluate for the decoding.
     * Default is `"polar"`.
     */
    polarStyleSetName?: string;

    /**
     * Storage level offset of regular tiles from reference datasource to align
     * [[PolarTileDataSource]] tiles to.
     * Default is `-1`.
     */
    polarGeometryLevelOffset?: number;

    /**
     * Hint for the WebGL implementation on which power mode to prefer.
     */
    powerPreference?: MapViewPowerPreference;

    /**
     * Set to `true` to allow rendering scene synchronously.
     *
     * By calling `renderSync()` scene draws immediately, opposite to default case when
     * `update` method requests redraw and waits for the next animation frame.
     *
     * You need to set up your own render loop controller.
     * Event `MapViewEventNames.Update` fired when [[MapView]] requests for an redraw.
     * E.g.: When tiles loaded asynchronously and ready for rendering.
     *
     * @note Internal `maxFps` will be overridden and may not work properly as `renderSync`
     * intended to be called from external render loop.
     *
     * @default false.
     */
    synchronousRendering?: boolean;

    /**
     * Set initial camera target in geo coordinates.
     *
     * Longitude values outside of -180 and +180 are acceptable.
     * @default new GeoCoordinates(25, 0)
     */
    target?: GeoCoordLike;

    /**
     * Set initial zoom level.
     *
     * @default 12
     */
    zoomLevel?: number;

    /**
     * Set initial camera heading in degrees.
     *
     * @default 0
     */
    heading?: number;

    /**
     * Set initial camera tilt in degrees.
     *
     * @default 0
     */
    tilt?: number;

    /**
     * Set true to enable rendering mixed levels of detail (increases rendering performance).
     * If not set will enable mixed levels of detail for spherical projection
     * and disable for other projections.
     *
     * @default undefined
     */
    enableMixedLod?: boolean;
}

/**
 * Default settings used by [[MapView]] collected in one place.
 */
export const MapViewDefaults = {
    projection: mercatorProjection,

    maxVisibleDataSourceTiles: 100,
    extendedFrustumCulling: true,

    tileCacheSize: 200,
    resourceComputationType: ResourceComputationType.EstimationInMb,
    quadTreeSearchDistanceUp: 3,
    quadTreeSearchDistanceDown: 2,

    pixelRatio:
        typeof window !== "undefined" && window.devicePixelRatio !== undefined
            ? window.devicePixelRatio
            : 1.0,
    geoCenter: new GeoCoordinates(25, 0, 30000000),
    target: new GeoCoordinates(25, 0),
    zoomLevel: 5,
    tilt: 0,
    heading: 0,
    theme: {}
};

/**
 * The core class of the library to call in order to create a map visualization. It needs to be
 * linked to datasources.
 */
export class MapView extends THREE.EventDispatcher {
    dumpNext = false;

    /**
     * The instance of [[MapRenderingManager]] managing the rendering of the map. It is a public
     * property to allow access and modification of some parameters of the rendering process at
     * runtime.
     */
    readonly mapRenderingManager: IMapRenderingManager;

    private m_renderLabels: boolean = true;

    private m_movementFinishedUpdateTimerId?: any;
    private m_postEffects?: PostEffects;

    private m_skyBackground?: SkyBackground;
    private m_createdLights?: THREE.Light[];

    private readonly m_screenProjector: ScreenProjector;
    private readonly m_screenCollisions:
        | ScreenCollisions
        | ScreenCollisionsDebug = new ScreenCollisions();

    private m_visibleTiles: VisibleTileSet;

    private m_elevationRangeSource?: ElevationRangeSource;
    private m_elevationProvider?: ElevationProvider;
    private m_visibleTileSetLock: boolean = false;
    private m_tileGeometryManager: TileGeometryManager;

    private m_tileWrappingEnabled: boolean = true;

    private m_zoomLevel: number = DEFAULT_MIN_ZOOM_LEVEL;
    private m_minZoomLevel: number = DEFAULT_MIN_ZOOM_LEVEL;
    private m_maxZoomLevel: number = DEFAULT_MAX_ZOOM_LEVEL;
    private m_minCameraHeight: number = DEFAULT_MIN_CAMERA_HEIGHT;

    private readonly m_screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1);

    private readonly m_camera: THREE.PerspectiveCamera;

    /**
     * Relative to eye camera.
     *
     * This camera is internal camera used to improve precision
     * when rendering geometries.
     */
    private readonly m_rteCamera = new THREE.PerspectiveCamera();

    private m_focalLength: number;
    private m_targetDistance: number;
    private m_targetGeoPos = MapViewDefaults.target.clone();
    // Focus point world coords may be calculated after setting projection, use dummy value here.
    private m_targetWorldPos = new THREE.Vector3();
    private readonly m_viewRanges: ViewRanges = {
        near: DEFAULT_CAM_NEAR_PLANE,
        far: DEFAULT_CAM_FAR_PLANE,
        minimum: DEFAULT_CAM_NEAR_PLANE,
        maximum: DEFAULT_CAM_FAR_PLANE
    };
    private m_pointOfView?: THREE.PerspectiveCamera;

    private m_pixelToWorld?: number;
    private m_pixelRatio?: number;

    private readonly m_scene: THREE.Scene = new THREE.Scene();
    private readonly m_fog: MapViewFog = new MapViewFog(this.m_scene);
    private readonly m_mapTilesRoot = new THREE.Object3D();
    private readonly m_mapAnchors = new THREE.Object3D();

    private m_animationCount: number = 0;
    private m_animationFrameHandle: number | undefined;
    private m_drawing: boolean = false;
    private m_updatePending: boolean = false;
    private m_renderer: THREE.WebGLRenderer;
    private m_frameNumber = 0;
    private m_maxFps = 0;
    private m_detectedFps: number = FALLBACK_FRAME_RATE;

    private m_textElementsRenderer: TextElementsRenderer;

    private m_forceCameraAspect: number | undefined = undefined;

    //
    // sources
    //
    private readonly m_tileDataSources: DataSource[] = [];
    private readonly m_connectedDataSources = new Set<string>();
    private readonly m_failedDataSources = new Set<string>();
    private m_backgroundDataSource?: BackgroundDataSource;
    private m_polarDataSource?: PolarTileDataSource;
    private m_enablePolarDataSource: boolean = true;

    // gestures
    private readonly m_raycaster = new THREE.Raycaster();
    private readonly m_plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
    private readonly m_sphere = new THREE.Sphere(undefined, EarthConstants.EQUATORIAL_RADIUS);

    private readonly m_options: MapViewOptions;
    private readonly m_visibleTileSetOptions: VisibleTileSetOptions;

    private m_theme: Theme = {};
    private m_uriResolver?: UriResolver;
    private m_themeIsLoading: boolean = false;

    private m_previousFrameTimeStamp?: number;
    private m_firstFrameRendered = false;
    private m_firstFrameComplete = false;
    private m_initialTextPlacementDone = false;
    private m_previousRequestAnimationTime?: number;
    private m_targetRequestAnimationTime?: number;
    private m_frameTimeIndex: number = 0;
    private readonly m_frameTimeRing: number[] = [];

    private handleRequestAnimationFrame: any;
    private handlePostponedAnimationFrame: any;

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
    private m_animatedExtrusionHandler: AnimatedExtrusionHandler;

    private m_env: MapEnv = new MapEnv({});

    private m_enableMixedLod: boolean | undefined;

    /**
     * Constructs a new `MapView` with the given options or canvas element.
     *
     * @param options The `MapView` options or the HTML canvas element used to display the map.
     */
    constructor(options: MapViewOptions) {
        super();

        // make a copy to avoid unwanted changes to the original options.
        this.m_options = { ...options };

        this.m_uriResolver = this.m_options.uriResolver;

        if (this.m_options.minZoomLevel !== undefined) {
            this.m_minZoomLevel = this.m_options.minZoomLevel;
        }

        if (this.m_options.maxZoomLevel !== undefined) {
            this.m_maxZoomLevel = this.m_options.maxZoomLevel;
        }

        if (this.m_options.minCameraHeight !== undefined) {
            this.m_minCameraHeight = this.m_options.minCameraHeight;
        }

        if (this.m_options.decoderUrl !== undefined) {
            ConcurrentDecoderFacade.defaultScriptUrl = this.m_uriResolver
                ? this.m_uriResolver.resolveUri(this.m_options.decoderUrl)
                : this.m_options.decoderUrl;
        }

        if (this.m_options.decoderCount !== undefined) {
            ConcurrentDecoderFacade.defaultWorkerCount = this.m_options.decoderCount;
        }

        this.m_visibleTileSetOptions = {
            ...MapViewDefaults,
            clipPlanesEvaluator:
                options.clipPlanesEvaluator !== undefined
                    ? options.clipPlanesEvaluator
                    : createDefaultClipPlanesEvaluator()
        };

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

        if (options.resourceComputationType !== undefined) {
            this.m_visibleTileSetOptions.resourceComputationType = options.resourceComputationType;
        }

        if (options.quadTreeSearchDistanceUp !== undefined) {
            this.m_visibleTileSetOptions.quadTreeSearchDistanceUp =
                options.quadTreeSearchDistanceUp;
        }

        if (options.quadTreeSearchDistanceDown !== undefined) {
            this.m_visibleTileSetOptions.quadTreeSearchDistanceDown =
                options.quadTreeSearchDistanceDown;
        }

        if (options.enablePolarDataSource !== undefined) {
            this.m_enablePolarDataSource = options.enablePolarDataSource;
        }

        this.m_pixelRatio = options.pixelRatio;

        if (options.maxFps !== undefined) {
            this.m_maxFps = Math.max(0, options.maxFps);
        }

        this.m_options.enableStatistics = this.m_options.enableStatistics === true;

        this.m_languages = this.m_options.languages;

        if (
            !isProduction &&
            this.m_options.collisionDebugCanvas !== undefined &&
            this.m_options.collisionDebugCanvas !== null
        ) {
            this.m_collisionDebugCanvas = this.m_options.collisionDebugCanvas;
            this.m_screenCollisions = new ScreenCollisionsDebug(this.m_collisionDebugCanvas);
        }

        this.handleRequestAnimationFrame = this.renderFunc.bind(this);
        this.handlePostponedAnimationFrame = this.postponedAnimationFrame.bind(this);
        this.m_pickHandler = new PickHandler(
            this,
            this.m_rteCamera,
            this.m_options.enableRoadPicking === true,
            this.m_options.enablePickTechnique === true
        );

        if (this.m_options.tileWrappingEnabled !== undefined) {
            this.m_tileWrappingEnabled = this.m_options.tileWrappingEnabled;
        }

        // Initialization of the stats
        this.setupStats(this.m_options.enableStatistics);

        this.canvas.addEventListener("webglcontextlost", this.onWebGLContextLost);
        this.canvas.addEventListener("webglcontextrestored", this.onWebGLContextRestored);

        // Initialization of the renderer
        this.m_renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: this.nativeWebglAntialiasEnabled,
            alpha: this.m_options.alpha,
            preserveDrawingBuffer: this.m_options.preserveDrawingBuffer === true,
            powerPreference:
                this.m_options.powerPreference === undefined
                    ? MapViewPowerPreference.Default
                    : this.m_options.powerPreference
        });
        this.m_renderer.autoClear = false;

        // This is detailed at https://threejs.org/docs/#api/renderers/WebGLRenderer.info
        // When using several WebGLRenderer#render calls per frame, it is the only way to get
        // correct rendering data from ThreeJS.
        this.m_renderer.info.autoReset = false;

        this.setupRenderer();

        this.m_options.fovCalculation =
            this.m_options.fovCalculation === undefined
                ? DEFAULT_FOV_CALCULATION
                : this.m_options.fovCalculation;
        this.m_options.fovCalculation.fov = THREE.Math.clamp(
            this.m_options.fovCalculation!.fov,
            MIN_FIELD_OF_VIEW,
            MAX_FIELD_OF_VIEW
        );
        // Initialization of mCamera and mVisibleTiles
        const { width, height } = this.getCanvasClientSize();
        const aspect = width / height;
        this.m_camera = new THREE.PerspectiveCamera(
            this.m_options.fovCalculation.fov,
            aspect,
            DEFAULT_CAM_NEAR_PLANE,
            DEFAULT_CAM_FAR_PLANE
        );
        this.m_camera.up.set(0, 0, 1);
        this.projection.projectPoint(this.m_targetGeoPos, this.m_targetWorldPos);
        this.m_focalLength = 0;
        this.m_scene.add(this.m_camera); // ensure the camera is added to the scene.
        this.m_screenProjector = new ScreenProjector(this.m_camera);

        // setup camera with initial position
        this.setupCamera(options);
        this.m_targetDistance = this.m_camera.position.distanceTo(this.m_targetWorldPos);

        this.m_movementDetector = new CameraMovementDetector(
            this.m_options.movementThrottleTimeout,
            () => this.movementStarted(),
            () => this.movementFinished()
        );

        const mapPassAntialiasSettings = this.m_options.customAntialiasSettings;
        this.mapRenderingManager = new MapRenderingManager(
            width,
            height,
            this.m_options.dynamicPixelRatio,
            mapPassAntialiasSettings
        );

        this.m_tileGeometryManager =
            this.m_options.enablePhasedLoading === true
                ? new PhasedTileGeometryManager(this)
                : new SimpleTileGeometryManager(this);

        if (options.enableMixedLod !== undefined) {
            this.m_enableMixedLod = options.enableMixedLod;
        }
        this.m_visibleTiles = this.createVisibleTileSet();

        this.m_animatedExtrusionHandler = new AnimatedExtrusionHandler(this);

        this.m_backgroundDataSource = new BackgroundDataSource();
        this.addDataSource(this.m_backgroundDataSource);

        if (this.m_enablePolarDataSource) {
            const styleSetName =
                options.polarStyleSetName !== undefined
                    ? options.polarStyleSetName
                    : DEFAULT_POLAR_STYLE_SET_NAME;

            this.m_polarDataSource = new PolarTileDataSource({
                styleSetName,
                geometryLevelOffset: options.polarGeometryLevelOffset
            });

            this.updatePolarDataSource();
        }

        if (options.backgroundTilingScheme !== undefined) {
            this.m_backgroundDataSource.setTilingScheme(options.backgroundTilingScheme);
        }

        this.initTheme();

        this.m_textElementsRenderer = this.createTextRenderer();

        this.drawFrame();
    }

    /**
     * @returns Whether label rendering is enabled.
     */
    get renderLabels() {
        return this.m_renderLabels;
    }

    /**
     * Enables or disables rendering of labels.
     * @param value `true` to enable labels `false` to disable them.
     */
    set renderLabels(value: boolean) {
        this.m_renderLabels = value;
    }

    /**
     * @hidden
     * The [[TextElementsRenderer]] select the visible [[TextElement]]s and renders them.
     */
    get textElementsRenderer(): TextElementsRenderer {
        return this.m_textElementsRenderer;
    }

    /**
     * @hidden
     * The [[CameraMovementDetector]] detects camera movements. Made available for performance
     * measurements.
     */
    get cameraMovementDetector(): CameraMovementDetector {
        return this.m_movementDetector;
    }

    /**
     * The [[AnimatedExtrusionHandler]] controls animated extrusion effect
     * of the extruded objects in the [[Tile]]
     */
    get animatedExtrusionHandler(): AnimatedExtrusionHandler {
        return this.m_animatedExtrusionHandler;
    }

    /**
     * The [[TileGeometryManager]] manages geometry during loading and handles hiding geometry of
     * specified [[GeometryKind]]s.
     */
    get tileGeometryManager(): TileGeometryManager | undefined {
        return this.m_tileGeometryManager;
    }

    get enableMixedLod(): boolean | undefined {
        return this.m_enableMixedLod;
    }

    set enableMixedLod(enableMixedLod: boolean | undefined) {
        // Skip unnecessary update
        if (this.m_enableMixedLod === enableMixedLod) {
            return;
        }

        this.m_enableMixedLod = enableMixedLod;
        this.m_visibleTiles = this.createVisibleTileSet();
        this.resetTextRenderer();
        this.update();
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
        if (this.m_movementFinishedUpdateTimerId) {
            clearTimeout(this.m_movementFinishedUpdateTimerId);
            this.m_movementFinishedUpdateTimerId = undefined;
        }

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
        this.m_textElementsRenderer.clearRenderStates();
        this.m_renderer.dispose();
        this.m_imageCache.clear();

        this.m_movementDetector.dispose();
    }

    /**
     * The way the cache usage is computed, either based on size in MB (mega bytes) or in number of
     * tiles.
     */
    get resourceComputationType(): ResourceComputationType {
        return this.m_visibleTiles.resourceComputationType;
    }

    set resourceComputationType(value: ResourceComputationType) {
        this.m_visibleTiles.resourceComputationType = value;
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

        this.m_textElementsRenderer.invalidateCache();

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
     * Loads a post effects definition file.
     *
     * @param postEffectsFile File URL describing the post effects.
     */
    loadPostEffects(postEffectsFile: string) {
        fetch(postEffectsFile)
            .then(response => response.json())
            .then((postEffects: PostEffects) => {
                this.m_postEffects = postEffects;
                this.setPostEffects();
            });
    }

    /**
     * The abstraction of the [[MapRenderingManager]] API for post effects.
     */
    get postEffects(): PostEffects | undefined {
        return this.m_postEffects;
    }

    set postEffects(postEffects: PostEffects | undefined) {
        this.m_postEffects = postEffects;
        this.setPostEffects();
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
        if (!ThemeLoader.isThemeLoaded(theme)) {
            this.m_themeIsLoading = true;
            // If theme is not yet loaded, let's set theme asynchronously
            ThemeLoader.load(theme, { uriResolver: this.m_uriResolver })
                .then(loadedTheme => {
                    this.m_themeIsLoading = false;
                    this.theme = loadedTheme;
                })
                .catch(error => {
                    this.m_themeIsLoading = false;
                    logger.error(`failed to set theme: ${error}`, error);
                });
            return;
        }

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

        this.resetTextRenderer();

        if (this.m_theme.styles === undefined) {
            this.m_theme.styles = {};
        }
        if (this.m_backgroundDataSource) {
            this.m_backgroundDataSource.setTheme(this.m_theme);
        }
        this.m_theme.styles = theme.styles || {};
        this.m_theme.definitions = theme.definitions;

        for (const dataSource of this.m_tileDataSources) {
            dataSource.setTheme(this.m_theme);
        }
        THEME_LOADED_EVENT.time = Date.now();
        this.dispatchEvent(THEME_LOADED_EVENT);
        this.update();
    }

    /**
     * [[UriResolver]] used to resolve application/deployment specific `URI`s into actual `URLs`
     * that can be loaded with `fetch`.
     */
    get uriResolver(): UriResolver | undefined {
        return this.m_uriResolver;
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
     * Maximum FPS. If defined (and > 0) it is the maximum FPS that is used.
     */
    set maxFps(fps: number) {
        this.m_maxFps = Math.max(0, fps);
    }

    get maxFps(): number {
        return Math.max(0, this.m_maxFps);
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
     * @hidden
     * Disable all fading animations (for debugging and performance measurement). Defaults to
     * `false`.
     */
    set disableFading(disable: boolean) {
        this.m_textElementsRenderer.disableFading = disable;
    }

    get disableFading(): boolean {
        return this.m_textElementsRenderer.disableFading;
    }

    /**
     * @hidden
     * Return current frame number.
     */
    get frameNumber(): number {
        return this.m_frameNumber;
    }

    /**
     * @hidden
     * Reset the frame number to 0.
     */
    resetFrameNumber() {
        this.m_frameNumber = 0;
        this.m_previousFrameTimeStamp = undefined;
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
        const rendererClearColor = this.m_renderer.getClearColor();
        return rendererClearColor !== undefined ? rendererClearColor.getHex() : 0;
    }

    /**
     * The color used to clear the view.
     */
    set clearColor(color: number) {
        this.m_renderer.setClearColor(color);
    }

    /**
     * The projection used to project geo coordinates to world coordinates.
     */
    get projection(): Projection {
        return this.m_visibleTileSetOptions.projection;
    }

    /**
     * Changes the projection at run time.
     *
     * @param projection The [[Projection]] instance to use.
     */
    set projection(projection: Projection) {
        // The geo center must be reset when changing the projection, because the
        // camera's position is based on the projected geo center.
        let target = MapViewUtils.getWorldTargetFromCamera(this.camera, this.projection);
        if (target === null) {
            logger.warn(
                "MapView does not support a view pointing in the void, using last focus point."
            );
            target = this.worldTarget;
        }
        const targetCoordinates = this.projection.unprojectPoint(target);
        const targetDistance = this.camera.position.distanceTo(target);
        const attitude = MapViewUtils.extractAttitude(this, this.camera);
        const pitchDeg = THREE.Math.radToDeg(attitude.pitch);
        const headingDeg = -THREE.Math.radToDeg(attitude.yaw);

        this.m_visibleTileSetOptions.projection = projection;
        this.updatePolarDataSource();
        this.clearTileCache();
        this.textElementsRenderer.clearRenderStates();
        this.m_visibleTiles = this.createVisibleTileSet();

        this.lookAt(targetCoordinates, targetDistance, pitchDeg, headingDeg);
    }

    /**
     * Get camera clipping planes evaluator used.
     */
    get clipPlanesEvaluator(): ClipPlanesEvaluator {
        return this.m_visibleTileSetOptions.clipPlanesEvaluator;
    }

    /**
     * Changes the clip planes evaluator at run time.
     */
    set clipPlanesEvaluator(clipPlanesEvaluator: ClipPlanesEvaluator) {
        this.m_visibleTileSetOptions.clipPlanesEvaluator = clipPlanesEvaluator;
    }

    /**
     * The distance (in pixels) between the screen and the camera.
     */
    get focalLength(): number {
        return this.m_focalLength;
    }

    /** @internal
     * Get geo coordinates of camera focus (target) point.
     *
     * @see worldTarget
     *
     * @returns geo coordinates of the camera focus point.
     */
    get target(): GeoCoordinates {
        return this.m_targetGeoPos;
    }

    /** @internal
     * Get world coordinates of camera focus point.
     *
     * @note The focus point coordinates are updated with each camera update so you don't need
     * to re-calculate it, although if the camera started looking to the void, the last focus
     * point is stored.
     *
     * @returns world coordinates of the camera focus point.
     */
    get worldTarget(): THREE.Vector3 {
        return this.m_targetWorldPos;
    }

    /** @internal
     * Get distance from camera to the point of focus in world units.
     *
     * @note If camera does not point to any ground anymore the last focus point distance is
     * then returned.
     *
     * @returns Last known focus point distance.
     */
    get targetDistance(): number {
        return this.m_targetDistance;
    }

    /**
     * Get object describing frustum planes distances and min/max visibility range for actual
     * camera setup.
     * Near and far plane distance are self explanatory while minimum and maximum visibility range
     * describes the extreme near/far planes distances that may be achieved with current camera
     * settings, meaning at current zoom level (ground distance) and any possible orientation.
     * @note Visibility is directly related to camera [[ClipPlaneEvaluator]] used and determines
     * the maximum possible distance of camera far clipping plane regardless of tilt, but may change
     * whenever zoom level changes. Distance is measured in world units which may be approximately
     * equal to meters, but this depends on the distortion related to projection type used.
     */
    get viewRanges(): ViewRanges {
        return this.m_viewRanges;
    }

    /**
     * The position in geo coordinates of the center of the scene.
     */
    get geoCenter(): GeoCoordinates {
        return this.projection.unprojectPoint(this.m_camera.position).normalized();
    }

    /**
     * The position in geo coordinates of the center of the scene.
     * Longitude values outside of -180 and +180 are acceptable.
     */
    set geoCenter(geoCenter: GeoCoordinates) {
        if (geoCenter.altitude !== undefined) {
            this.projection.projectPoint(geoCenter, this.m_camera.position);
        } else {
            // Preserve the current altitude
            const altitude = this.geoCenter.altitude;

            this.projection.projectPoint(
                new GeoCoordinates(geoCenter.latitude, geoCenter.longitude, altitude),
                this.m_camera.position
            );
        }

        this.update();
    }

    /**
     * The node in this MapView's scene containing the user [[MapAnchor]]s.
     * All (first level) children of this node will be positioned in world space according to the
     * [[MapAnchor.geoPosition]].
     * Deeper level children can be used to position custom objects relative to the anchor node.
     */
    get mapAnchors(): THREE.Object3D {
        return this.m_mapAnchors;
    }

    /**
     * The position in world coordinates of the center of the scene.
     */
    get worldCenter(): THREE.Vector3 {
        return this.m_camera.position;
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
     * Returns the zoom level for the given camera setup.
     */
    get zoomLevel(): number {
        return this.m_zoomLevel;
    }
    set zoomLevel(zoomLevel: number) {
        this.m_zoomLevel = THREE.Math.clamp(zoomLevel, this.m_minZoomLevel, this.m_maxZoomLevel);
        MapViewUtils.zoomOnTargetPosition(this, 0, 0, this.m_zoomLevel);
        this.update();
    }

    get mapEnv(): MapEnv {
        return this.m_env;
    }

    /**
     * Returns the storage level for the given camera setup.
     * Actual storage level of the rendered data also depends on [[DataSource.storageLevelOffset]].
     */
    get storageLevel(): number {
        return THREE.Math.clamp(
            Math.floor(this.m_zoomLevel),
            this.m_minZoomLevel,
            this.m_maxZoomLevel
        );
    }

    /**
     * Returns height of the viewport in pixels.
     */
    get viewportHeight(): number {
        return this.canvas.height;
    }

    /**
     * Returns `true` if the native WebGL antialiasing is enabled.
     *
     * @default `true` for `pixelRatio` < `2.0`, `false` otherwise.
     */
    get nativeWebglAntialiasEnabled(): boolean {
        return this.m_options.enableNativeWebglAntialias === undefined
            ? this.pixelRatio < 2.0
            : this.m_options.enableNativeWebglAntialias;
    }

    /**
     * Returns 'true' if the phased loading is currently enabled.
     *
     * @default true.
     */
    get phasedLoadingEnabled(): boolean {
        return this.m_options.enablePhasedLoading !== false;
    }

    /**
     * Returns [[DataSource]]s displayed by this `MapView`.
     */
    get dataSources(): DataSource[] {
        return this.m_tileDataSources;
    }

    /**
     * Set's the way in which the fov is calculated on the map view. Note, for
     * this to take visual effect, the map should be rendered after calling this
     * function.
     * @param fovCalculation How the FOV is calculated.
     */
    setFovCalculation(fovCalculation: FovCalculation) {
        this.m_options.fovCalculation = fovCalculation;
        this.calculateFocalLength(this.m_renderer.getSize(cache.vector2[0]).height);
        this.updateCameras();
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
     * Returns true if the specified [[DataSource]] is enabled.
     */
    isDataSourceEnabled(dataSource: DataSource): boolean {
        return (
            dataSource.enabled &&
            dataSource.ready() &&
            this.m_connectedDataSources.has(dataSource.name)
        );
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
        dataSource.setEnableElevationOverlay(this.m_elevationProvider !== undefined);
        this.m_tileDataSources.push(dataSource);

        if (this.m_backgroundDataSource) {
            this.m_backgroundDataSource.updateStorageLevelOffset();
        }

        return dataSource
            .connect()
            .then(() => {
                return new Promise(resolve => {
                    if (this.theme !== undefined && this.theme.styles !== undefined) {
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

                dataSource.setTheme(this.m_theme);

                this.m_connectedDataSources.add(dataSource.name);

                this.dispatchEvent({
                    type: MapViewEventNames.DataSourceConnect,
                    dataSourceName: dataSource.name
                });

                this.update();
            })
            .catch(error => {
                logger.error(
                    `Failed to connect to datasource ${dataSource.name}: ${error.message}`
                );

                this.m_failedDataSources.add(dataSource.name);
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

        this.m_visibleTiles.removeDataSource(dataSource);
        this.m_tileDataSources.splice(dsIndex, 1);
        this.m_connectedDataSources.delete(dataSource.name);
        this.m_failedDataSources.delete(dataSource.name);

        if (this.m_backgroundDataSource) {
            this.m_backgroundDataSource.updateStorageLevelOffset();
        }

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
        this.m_textElementsRenderer.addOverlayText(textElements);
        this.update();
    }

    /**
     * Adds new overlay text elements to this `MapView`.
     *
     * @param textElements Array of [[TextElement]] to be added.
     */
    clearOverlayText(): void {
        this.m_textElementsRenderer.clearOverlayText();
    }

    /**
     * The method that sets the camera to the desired angle (`tiltDeg`) and `distance` (in meters)
     * to the `target` location, from a certain heading (`headingAngle`).
     *
     * @param target The location to look at.
     * @param distance The distance of the camera to the target in meters.
     * @param tiltDeg The camera tilt angle in degrees (0 is vertical), curbed below 89deg.
     * @param headingDeg The camera heading angle in degrees and clockwise (as opposed to yaw),
     * starting north.
     */
    lookAt(
        target: GeoCoordinates,
        distance: number,
        tiltDeg: number = 0,
        headingDeg: number = 0
    ): void {
        const limitedTilt = Math.min(MapViewUtils.MAX_TILT_DEG, tiltDeg);
        // MapViewUtils#setRotation uses pitch, not tilt, which is different in sphere projection.
        // But in sphere, in the tangent space of the target of the camera, pitch = tilt. So, put
        // the camera on the target, so the tilt can be passed to getRotation as a pitch.
        MapViewUtils.getCameraRotationAtTarget(
            this.projection,
            target,
            -headingDeg,
            limitedTilt,
            this.camera.quaternion
        );
        MapViewUtils.getCameraPositionFromTargetCoordinates(
            target,
            distance,
            -headingDeg,
            limitedTilt,
            this.projection,
            this.camera.position
        );
        this.camera.updateMatrixWorld(true);
        // TODO: Consider forcing entire cameras update, see: [[updateCameras]]
        this.m_targetGeoPos.copy(target);
        this.m_targetWorldPos.copy(this.projection.projectPoint(target));
        this.m_targetDistance = distance;
    }

    /**
     * Moves the camera to the specified [[GeoCoordinates]], sets the desired `zoomLevel` and
     * adjusts the yaw and pitch. The pitch of the camera is always curbed so that the camera cannot
     * look above the horizon. This paradigm is necessary in [[MapControls]], where the center of \
     * the screen is used for the orbiting interaction (3 fingers / right mouse button).
     *
     * @param geoPos Geolocation to move the camera to.
     * @param zoomLevel Desired zoom level.
     * @param yawDeg Camera yaw in degrees, counter-clockwise (as opposed to heading), starting
     * north.
     * @param pitchDeg Camera pitch in degrees.
     */
    setCameraGeolocationAndZoom(
        geoPos: GeoCoordinates,
        zoomLevel: number,
        yawDeg: number = 0,
        pitchDeg: number = 0
    ): void {
        this.geoCenter = geoPos;
        let limitedPitch = Math.min(89, pitchDeg); // 90 leads to imprecision issues.
        if (this.projection.type === ProjectionType.Spherical) {
            const maxPitchRadWithCurvature = Math.asin(
                EarthConstants.EQUATORIAL_RADIUS /
                    (MapViewUtils.calculateDistanceToGroundFromZoomLevel(this, zoomLevel) +
                        EarthConstants.EQUATORIAL_RADIUS)
            );
            const maxPitchDegWithCurvature = THREE.Math.radToDeg(maxPitchRadWithCurvature);
            limitedPitch = Math.min(limitedPitch, maxPitchDegWithCurvature);
        }
        MapViewUtils.zoomOnTargetPosition(this, 0, 0, zoomLevel);
        MapViewUtils.setRotation(this, yawDeg, limitedPitch);
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
     * Returns `true` if the current frame will immediately be followed by another frame.
     */
    get isDynamicFrame(): boolean {
        return (
            this.cameraIsMoving ||
            this.animating ||
            this.m_updatePending ||
            this.m_animatedExtrusionHandler.isAnimating
        );
    }

    /**
     * Returns the ratio between a pixel and a world unit for the current camera (in the center of
     * the camera projection).
     */
    get pixelToWorld(): number {
        if (this.m_pixelToWorld === undefined) {
            // At this point fov calculation should be always defined.
            assert(this.m_options.fovCalculation !== undefined);
            // NOTE: Look at distance is the distance to camera focus (and pivot) point.
            // In screen space this point is located in the center of canvas.
            // Given that zoom level is not modified (clamped by camera pitch), the following
            // formulas are all equivalent:
            // lookAtDistance = (EQUATORIAL_CIRCUMFERENCE * focalLength) / (256 * zoomLevel^2);
            // lookAtDistance = abs(cameraPos.z) / cos(cameraPitch);
            // Here we may use precalculated target distance (once pre frame):
            const lookAtDistance = this.m_targetDistance;

            // Find world space object size that corresponds to one pixel on screen.
            this.m_pixelToWorld = MapViewUtils.calculateWorldSizeByFocalLength(
                this.m_focalLength,
                lookAtDistance,
                1
            );
        }
        return this.m_pixelToWorld;
    }

    /**
     * Returns the ratio between a world and a pixel unit for the current camera (in the center of
     * the camera projection).
     */
    get worldToPixel() {
        return 1.0 / this.pixelToWorld;
    }

    get pixelRatio(): number {
        if (this.m_pixelRatio !== undefined) {
            return this.m_pixelRatio;
        }
        return typeof window !== "undefined" && window.devicePixelRatio !== undefined
            ? window.devicePixelRatio
            : 1.0;
    }

    /**
     * PixelRatio in the WebGlRenderer. May contain values > 1.0 for high resolution screens
     * (HiDPI).
     *
     * A value of `undefined` will make the getter return `window.devicePixelRatio`, setting a value
     * of `1.0` will disable the use of HiDPI on all devices.
     *
     * @note Since the current pixelRatio may have been used in some calculations (e.g. the icons)
     * they may appear in the wrong size now. To ensure proper display of data, a call to
     * `clearTileCache()` is required if the pixelRatio is changed after tiles have been loaded.
     *
     * @memberof MapView
     */
    set pixelRatio(pixelRatio: number) {
        this.m_pixelRatio = pixelRatio;
        if (this.renderer.getPixelRatio() !== this.pixelRatio) {
            this.renderer.setPixelRatio(this.pixelRatio);
        }
    }

    /**
     * PixelRatio ratio for rendering when the camera is moving or an animation is running. Useful
     * when rendering on high resolution displays with low performance GPUs that may be
     * fill-rate-limited.
     *
     * If a value is specified, a low resolution render pass is used to render the scene into a
     * low resolution render target, before it is copied to the screen.
     *
     * A value of `undefined` disables the low res render pass. Values between 0.5 and
     * `window.devicePixelRatio` can be tried to give  good results. The value should not be larger
     * than `window.devicePixelRatio`.
     *
     * @note Since no anti-aliasing is applied during dynamic rendering with `dynamicPixelRatio`
     * defined, visual artifacts may occur, especially with thin lines..
     *
     * @note The resolution of icons and text labels is not affected.
     *
     * @default `undefined`
     */
    set dynamicPixelRatio(ratio: number | undefined) {
        this.mapRenderingManager.lowResPixelRatio = ratio;
    }

    get dynamicPixelRatio(): number | undefined {
        return this.mapRenderingManager.lowResPixelRatio;
    }

    /**
     * Returns the screen position of the given geo coordinates.
     *
     * @param geoPos The geo coordinates.
     * @returns The screen position in CSS/client coordinates (no pixel ratio applied) or
     * `undefined`.
     */
    getScreenPosition(geoPos: GeoCoordinates): THREE.Vector2 | undefined {
        this.projection.projectPoint(geoPos, cache.vector3[0]);
        const p = this.m_screenProjector.project(cache.vector3[0]);
        if (p !== undefined) {
            const { width, height } = this.getCanvasClientSize();
            p.x = p.x + width / 2;
            p.y = height - (p.y + height / 2);
        }
        return p;
    }

    /**
     * Returns a ray caster using the supplied screen positions.
     *
     * @param x The X position in css/client coordinates (without applied display ratio).
     * @param y The Y position in css/client coordinates (without applied display ratio).
     *
     * @alpha
     *
     * @return Raycaster with origin at the camera and direction based on the supplied x / y screen
     * points.
     */
    raycasterFromScreenPoint(x: number, y: number): THREE.Raycaster {
        this.m_raycaster.setFromCamera(this.getNormalizedScreenCoordinates(x, y), this.m_rteCamera);
        return this.m_raycaster;
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
        return this.projection.type === ProjectionType.Spherical
            ? this.m_raycaster.ray.intersectSphere(this.m_sphere, cache.vector3[0])
            : this.m_raycaster.ray.intersectPlane(this.m_plane, cache.vector3[0]);
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
        const { width, height } = this.getCanvasClientSize();
        return new THREE.Vector3((x / width) * 2 - 1, -((y / height) * 2) + 1, 0);
    }

    /**
     * Do a raycast on all objects in the scene. Useful for picking. Limited to objects that
     * THREE.js can raycast, the solid lines that get their geometry in the shader cannot be tested
     * for intersection.
     *
     * Note, if a [[DataSource]] adds an [[Object3D]] to a [[Tile]], it will be only pickable once
     * [[MapView.render]] has been called, this is because [[MapView.render]] method creates the
     * internal three.js root [[Object3D]] which is used in the [[PickHandler]] internally.
     * This method will not test for intersection custom objects added to the scene by for
     * example calling directly the [[scene.add]] method from THREE.
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
        if (this.m_renderer.getPixelRatio() !== this.pixelRatio) {
            this.m_renderer.setPixelRatio(this.pixelRatio);
        }

        if (this.mapRenderingManager !== undefined) {
            this.mapRenderingManager.setSize(width, height);
        }

        if (this.collisionDebugCanvas !== undefined) {
            this.collisionDebugCanvas.width = width;
            this.collisionDebugCanvas.height = height;
        }

        this.updateCameras();
        this.update();

        this.dispatchEvent({
            type: MapViewEventNames.Resize,
            size: {
                width,
                height
            }
        });
    }

    /**
     * Redraws scene immediately
     *
     * @note Before using this method, set `synchronousRendering` to `true`
     * in the [[MapViewOptions]]
     */
    renderSync() {
        this.renderFunc(PerformanceTimer.now());
    }

    /**
     * Requests a redraw of the scene.
     */
    update() {
        this.dispatchEvent(UPDATE);

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
        if (dataSourceName !== undefined) {
            const dataSource = this.getDataSourceByName(dataSourceName);
            if (dataSource) {
                this.m_visibleTiles.clearTileCache(dataSource);
                dataSource.clearCache();
            }
        } else {
            this.m_visibleTiles.clearTileCache();
            this.m_tileDataSources.forEach(dataSource => dataSource.clearCache());
        }

        if (this.m_elevationProvider !== undefined) {
            this.m_elevationProvider.clearCache();
        }
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
     * Sets the DataSource which contains the elevations, the elevation range source, and the
     * elevation provider. Only a single elevation source is possible per [[MapView]]
     *
     * If the terrain-datasource is merged with this repository, we could internally construct
     * the [[ElevationRangeSource]] and the [[ElevationProvider]] and access would be granted to
     * the application when it asks for it, to simplify the API.
     *
     * @param elevationSource The datasource containing the terrain tiles.
     * @param elevationRangeSource Allows access to the elevation min / max per tile.
     * @param elevationProvider Allows access to the elevation at a given location or a ray
     *      from the camera.
     */
    setElevationSource(
        elevationSource: DataSource,
        elevationRangeSource: ElevationRangeSource,
        elevationProvider: ElevationProvider
    ) {
        // Try to remove incase this method was already called, will do nothing if it doesn't exist.
        this.removeDataSource(elevationSource);
        this.addDataSource(elevationSource);
        this.m_elevationRangeSource = elevationRangeSource;
        this.m_elevationRangeSource.connect();
        this.m_elevationProvider = elevationProvider;
        this.dataSources.forEach(dataSource => {
            dataSource.setEnableElevationOverlay(true);
        });
        this.m_tileGeometryManager.setTileUpdateCallback((tile: Tile) => {
            overlayOnElevation(tile);
        });
        this.clearTileCache();
    }

    /**
     * Clears any elevation sources and provider previously set.
     * @param elevationSource The datasource to be cleared.
     */
    clearElevationSource(elevationSource: DataSource) {
        this.removeDataSource(elevationSource);
        this.m_elevationRangeSource = undefined;
        this.m_elevationProvider = undefined;
        this.dataSources.forEach(dataSource => {
            dataSource.setEnableElevationOverlay(false);
        });
        this.m_tileGeometryManager.setTileUpdateCallback(undefined);
        this.clearTileCache();
    }

    /**
     * Public access to [[MapViewFog]] allowing to toggle it by setting its `enabled` property.
     */
    get fog(): MapViewFog {
        return this.m_fog;
    }

    private setPostEffects() {
        // First clear all the effects, then enable them from what is specified.
        this.mapRenderingManager.bloom.enabled = false;
        this.mapRenderingManager.outline.enabled = false;
        this.mapRenderingManager.vignette.enabled = false;
        this.mapRenderingManager.sepia.enabled = false;

        if (this.m_postEffects !== undefined) {
            if (this.m_postEffects.bloom !== undefined) {
                this.mapRenderingManager.bloom = this.m_postEffects.bloom;
            }
            if (this.m_postEffects.outline !== undefined) {
                this.mapRenderingManager.outline.enabled = this.m_postEffects.outline.enabled;
                this.mapRenderingManager.updateOutline(this.m_postEffects.outline);
            }
            if (this.m_postEffects.vignette !== undefined) {
                this.mapRenderingManager.vignette = this.m_postEffects.vignette;
            }
            if (this.m_postEffects.sepia !== undefined) {
                this.mapRenderingManager.sepia = this.m_postEffects.sepia;
            }
        }
    }

    /**
     * Returns the elevation provider.
     */
    get elevationProvider(): ElevationProvider | undefined {
        return this.m_elevationProvider;
    }

    /**
     * Plug-in PolarTileDataSource for spherical projection and plug-out otherwise
     */
    private updatePolarDataSource() {
        const dataSource = this.m_polarDataSource;
        if (this.m_enablePolarDataSource === true && dataSource !== undefined) {
            const twinDataSource = this.getDataSourceByName(dataSource.name);

            if (this.projection.type === ProjectionType.Spherical) {
                if (twinDataSource === undefined) {
                    this.addDataSource(dataSource);
                }
            } else {
                if (twinDataSource !== undefined) {
                    this.removeDataSource(dataSource);
                }
            }
        }
    }

    /**
     * Updates the camera and the projections and resets the screen collisions,
     * note, setupCamera must be called before this is called.
     * @param viewRanges optional parameter that supplies new view ranges, most importantly
     * near/far clipping planes distance. If parameter is not provided view ranges will be
     * calculated from [[ClipPlaneEvaluator]] used in [[VisibleTileSet]].
     */
    private updateCameras(viewRanges?: ViewRanges) {
        const { width, height } = this.m_renderer.getSize(cache.vector2[0]);
        this.m_camera.aspect =
            this.m_forceCameraAspect !== undefined ? this.m_forceCameraAspect : width / height;
        this.setFovOnCamera(this.m_options.fovCalculation!, height);

        // When calculating clip planes account for the highest building on the earth,
        // multiplying its height by projection scaling factor. This approach assumes
        // constantHeight property of extruded polygon technique is set as default false,
        // otherwise the near plane margins will be bigger then required, but still correct.
        const projectionScale = this.projection.getScaleFactor(this.camera.position);
        const maxGeometryHeightScaled =
            projectionScale *
            this.m_tileDataSources.reduce((r, ds) => Math.max(r, ds.maxGeometryHeight), 0);

        // Copy all properties from new view ranges to our readonly object.
        // This allows to keep all view ranges references valid and keeps up-to-date
        // information within them. Works the same as copping all properties one-by-one.
        Object.assign(
            this.m_viewRanges,
            viewRanges === undefined
                ? this.m_visibleTiles.updateClipPlanes(maxGeometryHeightScaled)
                : viewRanges
        );
        this.m_camera.near = this.m_viewRanges.near;
        this.m_camera.far = this.m_viewRanges.far;

        this.m_camera.updateProjectionMatrix();
        this.m_camera.updateMatrixWorld(false);

        // Update the "relative to eye" camera. Copy the public camera parameters
        // and place the "relative to eye" at the world's origin.
        this.m_rteCamera.copy(this.m_camera);
        this.m_rteCamera.position.setScalar(0);
        this.m_rteCamera.updateMatrixWorld(true);

        this.m_screenCamera.left = width / -2;
        this.m_screenCamera.right = width / 2;
        this.m_screenCamera.bottom = height / -2;
        this.m_screenCamera.top = height / 2;
        this.m_screenCamera.updateProjectionMatrix();
        this.m_screenCamera.updateMatrixWorld(false);

        this.m_screenProjector.update(this.camera, width, height);
        this.m_screenCollisions.update(width, height);

        this.m_pixelToWorld = undefined;

        const cameraPitch = MapViewUtils.extractAttitude(this, this.m_camera).pitch;
        const cameraPosZ = this.getCameraHeightAboveTerrain(TERRAIN_ZOOM_LEVEL);
        const zoomLevelDistance = cameraPosZ / Math.cos(Math.min(cameraPitch, Math.PI / 3));
        this.m_zoomLevel = MapViewUtils.calculateZoomLevelFromDistance(this, zoomLevelDistance);
        this.m_fog.update(this, this.m_viewRanges.maximum);

        const target = MapViewUtils.getWorldTargetFromCamera(this.m_camera, this.projection);
        if (target !== null) {
            this.m_targetWorldPos.copy(target);
            this.m_targetGeoPos = this.projection.unprojectPoint(target);
            this.m_targetDistance = this.camera.position.distanceTo(target);
        }
    }

    /**
     * Update `Env` instance used for style `Expr` evaluations.
     */
    private updateEnv() {
        this.m_env.entries.$zoom = this.m_zoomLevel;

        // This one introduces unnecessary calculation of pixelToWorld, even if it's barely
        // used in our styles.
        this.m_env.entries.$pixelToMeters = this.pixelToWorld;

        this.m_env.entries.$frameNumber = this.m_frameNumber;
    }

    /**
     * Returns the height of the camera above the earths surface.
     *
     * If there is an ElevationProvider, this is used. Otherwise the projection is used to determine
     * how high the camera is above the surface.
     *
     * @param level Which level to request the surface height from.
     * @return Height in world units.
     */
    private getCameraHeightAboveTerrain(level?: number): number {
        if (this.elevationProvider !== undefined) {
            const heightAboveTerrain = this.elevationProvider.getHeight(this.geoCenter, level);
            if (heightAboveTerrain !== undefined) {
                const height =
                    this.projection.unprojectAltitude(this.m_camera.position) - heightAboveTerrain;
                return Math.max(height, 1);
            }
        }
        return Math.abs(this.projection.groundDistance(this.m_camera.position));
    }

    private detectCurrentFps(now: number) {
        // Skip the first frames, they are from not originated from requestAnimationFrame()
        if (this.m_previousRequestAnimationTime !== undefined && this.m_frameNumber > 5) {
            const currentFps = 1000 / (now - this.m_previousRequestAnimationTime);
            this.m_frameTimeRing[this.m_frameTimeIndex % FRAME_RATE_RING_SIZE] = currentFps;
            this.m_frameTimeIndex++;

            const capturedFrames = Math.min(this.m_frameTimeIndex, FRAME_RATE_RING_SIZE);

            let sum = 0;
            for (let i = 0; i < capturedFrames; i++) {
                sum += this.m_frameTimeRing[i];
            }

            this.m_detectedFps = sum / capturedFrames;
        }
        this.m_previousRequestAnimationTime = now;
    }

    /**
     * Draw a new frame.
     */
    private drawFrame() {
        if (this.m_drawing || this.m_options.synchronousRendering) {
            return;
        }
        // Cancel an active requestAnimationFrame() cycle. Failure to do this may end up in
        // rendering multiple times during a single frame.
        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
            this.m_animationFrameHandle = undefined;
        }

        if (this.m_maxFps <= 0) {
            // Render at maximum FPS.
            this.m_animationFrameHandle = requestAnimationFrame(this.handleRequestAnimationFrame);
            return;
        }

        // Magic ingredient to compensate time flux.
        const fudgeTimeInMs = 3;
        const vSyncFrameTime = 1000 / this.m_detectedFps;
        const frameInterval = 1000 / this.m_maxFps;

        const previousFrameTime =
            this.m_previousFrameTimeStamp === undefined ? 0 : this.m_previousFrameTimeStamp;

        // Compute a practical value to compare against.
        const targetTime = previousFrameTime + frameInterval - vSyncFrameTime - fudgeTimeInMs;

        this.m_targetRequestAnimationTime = targetTime;
        this.postponedAnimationFrame(previousFrameTime);
    }

    private postponedAnimationFrame(now: number) {
        if (this.m_targetRequestAnimationTime === undefined) {
            return;
        }

        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
            this.m_animationFrameHandle = undefined;
        }

        this.detectCurrentFps(now);

        this.m_animationFrameHandle = requestAnimationFrame(
            now > this.m_targetRequestAnimationTime
                ? this.handleRequestAnimationFrame
                : this.handlePostponedAnimationFrame
        );
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
            if (this.isDataSourceEnabled(dataSource)) {
                enabledDataSources.push(dataSource);
            }
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
        ++this.m_frameNumber;

        const stats = PerformanceStatistics.instance;
        const gatherStatistics: boolean = stats.enabled;

        const frameStartTime = time;

        RENDER_EVENT.time = time;
        this.dispatchEvent(RENDER_EVENT);

        let currentFrameEvent: FrameStats | undefined;

        if (gatherStatistics) {
            currentFrameEvent = stats.currentFrame;
            currentFrameEvent.setValue("renderCount.frameNumber", this.m_frameNumber);

            if (this.m_previousFrameTimeStamp !== undefined) {
                const timeSincePreviousFrame = frameStartTime - this.m_previousFrameTimeStamp;
                if (gatherStatistics) {
                    currentFrameEvent.setValue("render.fullFrameTime", timeSincePreviousFrame);
                    // For convenience and easy readability
                    currentFrameEvent.setValue("render.fps", 1000 / timeSincePreviousFrame);
                }
            }
        }

        this.m_previousFrameTimeStamp = frameStartTime;

        let setupTime: number | undefined;
        let cullTime: number | undefined;
        let textPlacementTime: number | undefined;
        let drawTime: number | undefined;
        let textDrawTime: number | undefined;
        let endTime: number | undefined;

        this.m_renderer.info.reset();

        this.m_updatePending = false;
        this.m_thisFrameTilesChanged = undefined;

        this.m_drawing = true;

        if (this.m_renderer.getPixelRatio() !== this.pixelRatio) {
            this.m_renderer.setPixelRatio(this.pixelRatio);
        }

        this.updateCameras();
        this.updateEnv();

        this.m_renderer.clear();

        // clear the scene
        while (this.m_mapTilesRoot.children.length > 0) {
            this.m_mapTilesRoot.remove(this.m_mapTilesRoot.children[0]);
        }

        if (gatherStatistics) {
            setupTime = PerformanceTimer.now();
        }

        // TBD: Update renderList only any of its params (camera, etc...) has changed.
        if (!this.lockVisibleTileSet) {
            const viewRangesStatus = this.m_visibleTiles.updateRenderList(
                this.storageLevel,
                Math.floor(this.zoomLevel),
                this.getEnabledTileDataSources(),
                this.m_elevationRangeSource
            );
            // View ranges has changed due to features (with elevation) that affects clip planes
            // positioning, update cameras with new clip planes positions.
            if (viewRangesStatus.viewRangesChanged) {
                this.updateCameras(viewRangesStatus.viewRanges);
            }
        }

        if (gatherStatistics) {
            cullTime = PerformanceTimer.now();
        }

        const renderList = this.m_visibleTiles.dataSourceTileList;

        // no need to check everything if we're not going to create text renderer.
        renderList.forEach(({ zoomLevel, renderedTiles }) => {
            renderedTiles.forEach(tile => {
                this.renderTileObjects(tile, zoomLevel);

                //We know that rendered tiles are visible (in the view frustum), so we update the
                //frame number, note we don't do this for the visibleTiles because some may still be
                //loading (and therefore aren't visible in the sense of being seen on the screen).
                //Note also, this number isn't currently used anywhere so should be considered to be
                //removed in the future (though could be good for debugging purposes).
                tile.frameNumLastVisible = this.m_frameNumber;
            });
        });

        // Check if this is the time to place the labels for the first time. Pretty much everything
        // should have been loaded, and no animation should be running.
        if (
            !this.m_initialTextPlacementDone &&
            !this.m_firstFrameComplete &&
            !this.isDynamicFrame &&
            !this.m_themeIsLoading &&
            this.m_poiTableManager.finishedLoading &&
            this.m_visibleTiles.allVisibleTilesLoaded &&
            this.m_connectedDataSources.size + this.m_failedDataSources.size ===
                this.m_tileDataSources.length &&
            !this.m_textElementsRenderer.initializing &&
            !this.m_textElementsRenderer.loading
        ) {
            this.m_initialTextPlacementDone = true;
        }

        this.m_mapAnchors.children.forEach((childObject: MapAnchor) => {
            if (childObject.geoPosition === undefined) {
                return;
            }
            this.projection.projectPoint(childObject.geoPosition, childObject.position);
            childObject.position.sub(this.camera.position);
        });

        this.m_animatedExtrusionHandler.zoom = this.m_zoomLevel;

        if (currentFrameEvent !== undefined) {
            // Make sure the counters all have a value.
            currentFrameEvent.addValue("renderCount.numTilesRendered", 0);
            currentFrameEvent.addValue("renderCount.numTilesVisible", 0);
            currentFrameEvent.addValue("renderCount.numTilesLoading", 0);

            // Increment the counters for all data sources.
            renderList.forEach(({ zoomLevel, renderedTiles, visibleTiles, numTilesLoading }) => {
                currentFrameEvent!.addValue("renderCount.numTilesRendered", renderedTiles.size);
                currentFrameEvent!.addValue("renderCount.numTilesVisible", visibleTiles.length);
                currentFrameEvent!.addValue("renderCount.numTilesLoading", numTilesLoading);
            });
        }

        if (this.m_movementDetector.checkCameraMoved(this, time)) {
            const { yaw, pitch, roll } = MapViewUtils.extractAttitude(this, this.camera);
            const { latitude, longitude, altitude } = this.geoCenter;
            this.dispatchEvent({
                type: MapViewEventNames.CameraPositionChanged,
                latitude,
                longitude,
                altitude,
                yaw,
                pitch,
                roll,
                zoom: this.zoomLevel
            });
        }

        // The camera used to render the scene.
        const camera = this.m_pointOfView !== undefined ? this.m_pointOfView : this.m_rteCamera;

        if (this.renderLabels) {
            this.prepareRenderTextElements(time);
        }

        if (gatherStatistics) {
            textPlacementTime = PerformanceTimer.now();
        }
        if (this.m_skyBackground !== undefined && this.projection.type === ProjectionType.Planar) {
            this.m_skyBackground.updateCamera(this.m_camera);
        }

        this.mapRenderingManager.render(
            this.m_renderer,
            this.m_scene,
            camera,
            !this.isDynamicFrame
        );

        if (gatherStatistics) {
            drawTime = PerformanceTimer.now();
        }

        if (this.renderLabels) {
            this.finishRenderTextElements();
        }

        if (gatherStatistics) {
            textDrawTime = PerformanceTimer.now();
        }

        if (!this.m_firstFrameRendered) {
            this.m_firstFrameRendered = true;

            if (gatherStatistics) {
                stats.appResults.set("firstFrame", time);
            }

            FIRST_FRAME_EVENT.time = time;
            this.dispatchEvent(FIRST_FRAME_EVENT);
        }

        this.m_visibleTiles.disposePendingTiles();

        this.m_drawing = false;

        if (this.animating || this.m_updatePending) {
            this.drawFrame();
        }

        this.checkCopyrightUpdates();

        if (currentFrameEvent !== undefined) {
            endTime = PerformanceTimer.now();

            currentFrameEvent.setValue("render.setupTime", setupTime! - frameStartTime);
            currentFrameEvent.setValue("render.cullTime", cullTime! - setupTime!);
            currentFrameEvent.setValue("render.textPlacementTime", textPlacementTime! - cullTime!);
            currentFrameEvent.setValue("render.drawTime", drawTime! - textPlacementTime!);
            currentFrameEvent.setValue("render.textDrawTime", textDrawTime! - drawTime!);
            currentFrameEvent.setValue("render.cleanupTime", endTime - textDrawTime!);
            currentFrameEvent.setValue("render.frameRenderTime", endTime - frameStartTime);

            PerformanceStatistics.instance.storeFrameInfo(this.m_renderer.info);
        }

        DID_RENDER_EVENT.time = time;
        this.dispatchEvent(DID_RENDER_EVENT);

        // After completely rendering this frame, it is checked if this frame was the first complete
        // frame, with no more tiles, geometry and labels waiting to be added, and no animation
        // running. The initial placement of text in this render call may have changed the loading
        // state of the TextElementsRenderer, so this has to be checked again.
        if (
            !this.m_firstFrameComplete &&
            this.m_initialTextPlacementDone &&
            !this.isDynamicFrame &&
            !this.textElementsRenderer.loading
        ) {
            this.m_firstFrameComplete = true;

            if (gatherStatistics) {
                stats.appResults.set("firstFrameComplete", time);
            }

            FRAME_COMPLETE_EVENT.time = time;
            this.dispatchEvent(FRAME_COMPLETE_EVENT);
        }
    }

    private renderTileObjects(tile: Tile, zoomLevel: number) {
        const worldOffsetX = tile.computeWorldOffsetX();
        if (tile.willRender(zoomLevel)) {
            for (const object of tile.objects) {
                object.position.copy(tile.center);
                if (object.displacement !== undefined) {
                    object.position.add(object.displacement);
                }
                object.position.x += worldOffsetX;
                object.position.sub(this.m_camera.position);
                if (tile.localTangentSpace) {
                    object.setRotationFromMatrix(tile.boundingBox.getRotationMatrix());
                }
                object.frustumCulled = false;
                if (object._backupRenderOrder === undefined) {
                    object._backupRenderOrder = object.renderOrder;
                }

                const isBuilding =
                    object.userData !== undefined &&
                    object.userData.kind !== undefined &&
                    (object.userData.kind as GeometryKind[]).includes(GeometryKind.Building);

                // When falling back to a parent tile (i.e. tile.levelOffset < 0) there will
                // be overlaps with the already loaded tiles. Therefore all (flat) objects
                // in a fallback tile must be shifted, such that their renderOrder is less
                // than the groundPlane that each neighbouring Tile has (it has a renderOrder
                // of -10000, see addGroundPlane in TileGeometryCreator), only then can we be
                // sure that nothing of the parent will be rendered on top of the children,
                // as such, we shift using the FALLBACK_RENDER_ORDER_OFFSET.
                // This does not apply to buildings b/c they are 3d and the overlaps
                // are resolved with a depth prepass. Note we set this always to ensure that if
                // the Tile is used as a fallback, and then used normally, that we have the correct
                // renderOrder.
                object.renderOrder =
                    object._backupRenderOrder +
                    (!isBuilding && tile.levelOffset < 0
                        ? FALLBACK_RENDER_ORDER_OFFSET * tile.levelOffset
                        : 0);

                this.m_mapTilesRoot.add(object);
            }
        }
        tile.didRender();
    }

    private prepareRenderTextElements(time: number) {
        // Disable rendering of text elements for debug camera. TextElements are rendered using an
        // orthographic camera that covers the entire available screen space. Unfortunately, this
        // particular camera set up is not compatible with the debug camera.
        const debugCameraActive = this.m_pointOfView !== undefined;

        if (debugCameraActive) {
            return;
        }

        this.m_textElementsRenderer.placeText(
            this.m_visibleTiles.dataSourceTileList,
            this.projection,
            time
        );
    }

    private finishRenderTextElements() {
        const canRenderTextElements = this.m_pointOfView === undefined;

        if (canRenderTextElements) {
            // copy far value from scene camera, as the distance to the POIs matter now.
            this.m_screenCamera.far = this.m_viewRanges.maximum;
            this.m_textElementsRenderer.renderText(this.m_screenCamera);
        }
    }

    private initTheme() {
        const theme = getOptionValue(this.m_options.theme, MapViewDefaults.theme);

        this.m_themeIsLoading = true;
        Promise.resolve<string | Theme>(theme)
            // tslint:disable-next-line: no-shadowed-variable
            .then(theme => ThemeLoader.load(theme, { uriResolver: this.m_uriResolver }))
            // tslint:disable-next-line: no-shadowed-variable
            .then(theme => {
                this.m_themeIsLoading = false;
                this.theme = theme;
            })
            .catch(error => {
                this.m_themeIsLoading = false;
                const themeName =
                    typeof this.m_options.theme === "string" ? ` from ${this.m_options.theme}` : "";
                logger.error(`Failed to load theme${themeName}: ${error}`, error);
            });
    }

    private setupCamera(options: MapViewOptions) {
        const { width, height } = this.getCanvasClientSize();

        const defaultGeoCenter = MapViewDefaults.geoCenter;

        this.projection.projectPoint(defaultGeoCenter, this.m_camera.position);

        if (this.projection.type === ProjectionType.Spherical) {
            this.m_camera.lookAt(this.scene.position);
        }

        this.m_targetDistance = defaultGeoCenter.altitude!;

        this.calculateFocalLength(height);
        this.m_visibleTiles = this.createVisibleTileSet();
        this.setInitialCameraPosition(options);

        // ### move & customize
        this.resize(width, height);

        this.m_screenCamera.position.z = 1;
        this.m_screenCamera.near = 0;
    }

    private setInitialCameraPosition(options: MapViewOptions) {
        const target = GeoCoordinates.fromObject(
            getOptionValue(options.target, MapViewDefaults.target)
        );
        target.altitude = 0; // ensure that look at target has height of 0
        const zoomLevel = getOptionValue(options.zoomLevel, MapViewDefaults.zoomLevel);
        const tilt = getOptionValue(options.tilt, MapViewDefaults.tilt);
        const heading = getOptionValue(options.heading, MapViewDefaults.heading);

        this.lookAt(target, 300000, tilt, heading);
        this.zoomLevel = zoomLevel;
    }

    private createVisibleTileSet(): VisibleTileSet {
        const enableMixedLod =
            this.m_enableMixedLod === undefined
                ? this.projection.type === ProjectionType.Spherical
                : this.m_enableMixedLod;

        return new VisibleTileSet(
            new FrustumIntersection(
                this.m_camera,
                this,
                this.m_visibleTileSetOptions.extendedFrustumCulling,
                this.m_tileWrappingEnabled,
                enableMixedLod
            ),
            this.m_tileGeometryManager,
            this.m_visibleTileSetOptions
        );
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

    private addNewSkyBackground(sky: Sky, clearColor: string | undefined) {
        if (sky.type === "gradient" && (sky as GradientSky).groundColor === undefined) {
            sky.groundColor = getOptionValue(clearColor, "#000000");
        }
        this.m_skyBackground = new SkyBackground(sky, this.projection.type, this.m_camera);
        this.m_scene.background = this.m_skyBackground.texture;
    }

    private removeSkyBackGround() {
        this.m_scene.background = null;
        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.dispose();
            this.m_skyBackground = undefined;
        }
    }

    private updateSkyBackgroundColors(sky: Sky, clearColor: string | undefined) {
        if (sky.type === "gradient" && (sky as GradientSky).groundColor === undefined) {
            sky.groundColor = getOptionValue(clearColor, "#000000");
        }
        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.updateTexture(sky, this.projection.type);
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
                    logger.warn(
                        // tslint:disable-next-line: max-line-length
                        `MapView: failed to create light ${lightDescription.name} of type ${lightDescription.type}`
                    );
                    return;
                }
                this.m_scene.add(light);
                this.m_createdLights!.push(light);
            });
        }
    }

    private movementStarted() {
        this.m_textElementsRenderer.movementStarted();

        MOVEMENT_STARTED_EVENT.time = Date.now();
        this.dispatchEvent(MOVEMENT_STARTED_EVENT);
    }

    private movementFinished() {
        this.m_textElementsRenderer.movementFinished();

        MOVEMENT_FINISHED_EVENT.time = Date.now();
        this.dispatchEvent(MOVEMENT_FINISHED_EVENT);

        // render at the next possible time.
        if (!this.animating) {
            if (this.m_movementFinishedUpdateTimerId !== undefined) {
                clearTimeout(this.m_movementFinishedUpdateTimerId);
            }
            this.m_movementFinishedUpdateTimerId = setTimeout(() => {
                this.m_movementFinishedUpdateTimerId = undefined;
                this.update();
            }, 0);
        }
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
            for (const tile of tileList.renderedTiles.values()) {
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
            for (const name of Object.keys(theme.images)) {
                const image = theme.images[name];
                this.m_imageCache.addImage(name, image.url, image.preload === true);
                if (typeof image.atlas === "string") {
                    this.poiManager.addTextureAtlas(name, image.atlas);
                }
            }
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
        this.poiTableManager
            .loadPoiTables(this.m_theme as Theme)
            .then(() => this.update())
            .catch(() => this.update());
    }

    private setupStats(enable: boolean) {
        // tslint:disable-next-line:no-unused-expression
        new PerformanceStatistics(enable, 1000);
    }

    private setupRenderer() {
        this.m_renderer.setClearColor(DEFAULT_CLEAR_COLOR);

        this.m_scene.add(this.m_mapTilesRoot);
        this.m_scene.add(this.m_mapAnchors);
    }

    private createTextRenderer(): TextElementsRenderer {
        const updateCallback: ViewUpdateCallback = () => {
            this.update();
        };

        return new TextElementsRenderer(
            new MapViewState(this, this.checkIfTilesChanged.bind(this)),
            this.m_camera,
            updateCallback,
            this.m_screenCollisions,
            this.m_screenProjector,
            new TextCanvasFactory(this.m_renderer),
            this.m_poiManager,
            new PoiRendererFactory(this),
            new FontCatalogLoader(this.m_theme),
            this.m_theme,
            this.m_options
        );
    }

    private resetTextRenderer(): void {
        const overlayText = this.m_textElementsRenderer.overlayText;
        this.m_textElementsRenderer = this.createTextRenderer();
        if (overlayText !== undefined) {
            this.m_textElementsRenderer.addOverlayText(overlayText);
        }
    }

    /**
     * Default handler for webglcontextlost event.
     *
     * Note: The renderer `this.m_renderer` may not be initialized when this function is called.
     */
    private onWebGLContextLost = (event: Event) => {
        this.dispatchEvent(CONTEXT_LOST_EVENT);
        logger.warn("WebGL context lost", event);
    };

    /**
     * Default handler for webglcontextrestored event.
     *
     * Note: The renderer `this.m_renderer` may not be initialized when this function is called.
     */
    private onWebGLContextRestored = (event: Event) => {
        this.dispatchEvent(CONTEXT_RESTORED_EVENT);
        if (this.m_renderer !== undefined) {
            if (this.m_theme !== undefined && this.m_theme.clearColor !== undefined) {
                this.m_renderer.setClearColor(new THREE.Color(this.m_theme.clearColor));
            } else {
                this.m_renderer.setClearColor(DEFAULT_CLEAR_COLOR);
            }
            this.update();
        }
        logger.warn("WebGL context restored", event);
    };

    private limitFov(fov: number, aspect: number): number {
        fov = THREE.Math.clamp(fov, MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW);

        let hFov = THREE.Math.radToDeg(
            MapViewUtils.calculateHorizontalFovByVerticalFov(THREE.Math.degToRad(fov), aspect)
        );

        if (hFov > MAX_FIELD_OF_VIEW || hFov < MIN_FIELD_OF_VIEW) {
            hFov = THREE.Math.clamp(hFov, MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW);
            fov = THREE.Math.radToDeg(
                MapViewUtils.calculateVerticalFovByHorizontalFov(THREE.Math.degToRad(hFov), aspect)
            );
        }
        return fov as number;
    }

    /**
     * Sets the field of view calculation, and applies it immediately to the camera.
     *
     * @param type How to calculate the FOV
     */
    private setFovOnCamera(fovCalculation: FovCalculation, height: number) {
        let fov = 0;
        if (fovCalculation.type === "fixed") {
            this.calculateFocalLength(height);
            fov = fovCalculation.fov;
        } else {
            assert(this.m_focalLength !== 0);
            fov = MapViewUtils.calculateFovByFocalLength(this.m_focalLength, height);
        }
        this.m_camera.fov = this.limitFov(fov, this.m_camera.aspect);
    }

    /**
     * Sets the focal length based on the supplied fov and the height of the canvas. This must be
     * called at least once. This is necessary to be recalled when the [[FovCalculation]]'s type is
     * fixed. In such cases, when the height changes, the focal length must be readjusted whereas
     * the FOV stays the same. The opposite is true for the dynamic case, where the focal length is
     * fixed but the FOV changes.
     * @param height Height of the canvas in css / client pixels.
     */
    private calculateFocalLength(height: number) {
        assert(this.m_options.fovCalculation !== undefined);
        this.m_focalLength = MapViewUtils.calculateFocalLengthByVerticalFov(
            THREE.Math.degToRad(this.m_options.fovCalculation!.fov),
            height
        );
    }

    /**
     * Get canvas client size in css/client pixels.
     *
     * Supports canvases not attached to DOM, which have 0 as `clientWidth` and `clientHeight` by
     * calculating it from actual canvas size and current pixel ratio.
     */
    private getCanvasClientSize(): { width: number; height: number } {
        const { clientWidth, clientHeight } = this.canvas;
        if (
            clientWidth === 0 ||
            clientHeight === 0 ||
            typeof clientWidth !== "number" ||
            typeof clientHeight !== "number"
        ) {
            const pixelRatio = this.m_renderer.getPixelRatio();
            return {
                width: Math.round(this.canvas.width / pixelRatio),
                height: Math.round(this.canvas.height / pixelRatio)
            };
        } else {
            return { width: clientWidth, height: clientHeight };
        }
    }
}
