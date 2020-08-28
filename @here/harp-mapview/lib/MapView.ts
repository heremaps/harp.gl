/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    Env,
    Expr,
    getFeatureId,
    getPropertyValue,
    GradientSky,
    ImageTexture,
    IndexedTechnique,
    Light,
    MapEnv,
    PostEffects,
    Sky,
    Theme,
    Value
} from "@here/harp-datasource-protocol";
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import {
    EarthConstants,
    GeoBox,
    GeoBoxExtentLike,
    GeoCoordinates,
    GeoPolygon,
    isGeoBoxExtentLike,
    isGeoCoordinatesLike,
    isVector3Like,
    mercatorProjection,
    OrientedBox3,
    Projection,
    ProjectionType,
    TilingScheme,
    Vector3Like
} from "@here/harp-geoutils";
import { GeoCoordLike } from "@here/harp-geoutils/lib/coordinates/GeoCoordLike";
import { SolidLineMaterial } from "@here/harp-materials";
import {
    assert,
    getOptionValue,
    LoggerManager,
    LogLevel,
    PerformanceTimer,
    TaskQueue,
    UriResolver
} from "@here/harp-utils";
import * as THREE from "three";

import { AnimatedExtrusionHandler } from "./AnimatedExtrusionHandler";
import { BackgroundDataSource } from "./BackgroundDataSource";
import { CameraMovementDetector } from "./CameraMovementDetector";
import { ClipPlanesEvaluator, createDefaultClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { IMapAntialiasSettings, IMapRenderingManager, MapRenderingManager } from "./composing";
import { ConcurrentDecoderFacade } from "./ConcurrentDecoderFacade";
import { ConcurrentTilerFacade } from "./ConcurrentTilerFacade";
import { CopyrightInfo } from "./copyrights/CopyrightInfo";
import { DataSource } from "./DataSource";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { EventDispatcher } from "./EventDispatcher";
import { FrustumIntersection } from "./FrustumIntersection";
import { overlayOnElevation } from "./geometry/overlayOnElevation";
import { TileGeometryManager } from "./geometry/TileGeometryManager";
import { MapViewImageCache } from "./image/MapViewImageCache";
import { IntersectParams } from "./IntersectParams";
import { MapAnchors } from "./MapAnchors";
import { MapObjectAdapter } from "./MapObjectAdapter";
import { MapViewFog } from "./MapViewFog";
import { MapViewTaskScheduler } from "./MapViewTaskScheduler";
import { PickHandler, PickResult } from "./PickHandler";
import { PickingRaycaster } from "./PickingRaycaster";
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
import { Tile, TileFeatureData, TileObject } from "./Tile";
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
export enum TileTaskGroups {
    FETCH_AND_DECODE = "fetch",
    //DECODE = "decode",
    CREATE = "create"
    //UPLOAD = "upload"
}

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
    /**
     * Called when the rendered frame was complete, i.e. all the necessary tiles and resources
     * are loaded and rendered.
     */
    FrameComplete = "frame-complete",
    /** Called when the theme has been loaded with the internal {@link ThemeLoader}. */
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
    CameraPositionChanged = "camera-changed",
    /** Called when dispose has been called, before any cleanup is done. */
    Dispose = "dispose"
}

const logger = LoggerManager.instance.create("MapView");
const DEFAULT_CLEAR_COLOR = 0xefe9e1;
const DEFAULT_FOV_CALCULATION: FovCalculation = { type: "dynamic", fov: 40 };
const DEFAULT_CAM_NEAR_PLANE = 0.1;
const DEFAULT_CAM_FAR_PLANE = 4000000;
const MAX_FIELD_OF_VIEW = 140;
const MIN_FIELD_OF_VIEW = 10;

/**
 * All objects in fallback tiles are reduced by this amount.
 *
 * @internal
 */
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
 * Style set used by {@link PolarTileDataSource} by default.
 */
const DEFAULT_POLAR_STYLE_SET_NAME = "polar";

const DEFAULT_STENCIL_VALUE = 1;

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
const DISPOSE_EVENT: RenderEvent = { type: MapViewEventNames.Dispose } as any;

const cache = {
    vector2: [new THREE.Vector2()],
    vector3: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    rayCaster: new THREE.Raycaster(),
    groundPlane: new THREE.Plane(),
    groundSphere: new THREE.Sphere(undefined, EarthConstants.EQUATORIAL_RADIUS),
    frustumPoints: [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ],
    matrix4: [new THREE.Matrix4(), new THREE.Matrix4()],
    transform: [
        {
            position: new THREE.Vector3(),
            xAxis: new THREE.Vector3(),
            yAxis: new THREE.Vector3(),
            zAxis: new THREE.Vector3()
        }
    ]
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
 * User configuration for the {@link MapView}.
 */
export interface MapViewOptions extends TextElementsRendererOptions, Partial<LookAtParams> {
    /**
     * The canvas element used to render the scene.
     */
    canvas: HTMLCanvasElement;

    /**
     * Optional WebGL Rendering Context.
     * (https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext)
     */
    context?: WebGLRenderingContext;

    /**
     * `true` if the canvas contains an alpha (transparency) buffer or not. Default is `false`.
     */
    alpha?: boolean;

    /**
     * If `true`adds a Background Mesh for each tile
     *
     * @default `true`
     */
    addBackgroundDatasource?: boolean;

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
     * The {@link @here/harp-datasource-protocol#Theme} used by Mapview.
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
     * @see {@link ThemeLoader.load} for details how theme is loaded
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
     * @see {@link @here/harp-utils#UriResolver}
     * @See {@link @here/harp-utils#PrefixMapUriResolver}
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
     * If not defined, {@link TiltViewClipPlanesEvaluator} will be used by {@link MapView}.
     *
     * @default {@link TiltViewClipPlanesEvaluator}
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
     * Limits the number of reduced zoom levels (lower detail)
     * to be searched for fallback tiles.
     *
     * When zooming in, newly elected tiles may have not
     * yet loaded. {@link MapView} searches through
     * the tile cache for tiles ready to be displayed in
     * lower zoom levels. The tiles may be
     * located shallower in the quadtree.
     *
     * To disable a cache search, set the value to `0`.
     *
     * @default [[MapViewDefaults.quadTreeSearchDistanceUp]]
     */
    quadTreeSearchDistanceUp?: number;

    /**
     * Limits the number of higher zoom levels (more detailed)
     * to be searched for fallback tiles.
     *
     * When zooming out, newly elected tiles may have not
     * yet loaded. {@link MapView} searches through
     * the tile cache for tiles ready to be displayed in
     * higher zoom levels. These tiles may be
     * located deeper in the quadtree.
     *
     * To disable a cache search, set the value to `0`.
     *
     * @default [[MapViewDefaults.quadTreeSearchDistanceDown]]
     */
    quadTreeSearchDistanceDown?: number;

    /**
     * Set to `true` to measure performance statistics.
     */
    enableStatistics?: boolean;

    /**
     * Preserve the buffers until they are cleared manually or overwritten.
     *
     * Set to `true` in order to copy {@link MapView} canvas contents
     * to an image or another canvas.
     *
     * @default `false`.
     * @see https://threejs.org/docs/#api/renderers/WebGLRenderer.preserveDrawingBuffer
     */
    preserveDrawingBuffer?: boolean;

    /**
     * @deprecated Not needed anymore, roads can be picked by default.
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
     * Sets the data sources to use specific country point of view (political view).
     *
     * This option may result in rendering different country borders then commonly accepted for
     * some regions and it mainly regards to so called __disputed borders__. Although not all
     * data sources or themes may support it.
     *
     * @note Country code should be coded in lower-case ISO 3166-1 alpha-2 standard, if this option
     * is `undefined` the majority point of view will be used.
     */
    politicalView?: string;

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
     * Should be the {@link PolarTileDataSource} used on spherical projection.
     * Default is `true`.
     */
    enablePolarDataSource?: boolean;

    /**
     * The name of the [[StyleSet]] used by {@link PolarTileDataSource}
     * to evaluate for the decoding.
     * Default is `"polar"`.
     */
    polarStyleSetName?: string;

    /**
     * Storage level offset of regular tiles from reference datasource to align
     * {@link PolarTileDataSource} tiles to.
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
     * Event `MapViewEventNames.Update` fired when {@link MapView} requests for an redraw.
     * E.g.: When tiles loaded asynchronously and ready for rendering.
     *
     * @note Internal `maxFps` will be overridden and may not work properly as `renderSync`
     * intended to be called from external render loop.
     *
     * @default false.
     */
    synchronousRendering?: boolean;

    /**
     * Set true to enable rendering mixed levels of detail (increases rendering performance).
     * If not set will enable mixed levels of detail for spherical projection
     * and disable for other projections.
     *
     * @default undefined
     */
    enableMixedLod?: boolean;

    /**
     * Enable shadows in the map. Shadows will only be casted on features that use the "standard"
     * or "extruded-polygon" technique in the map theme.
     * @default false
     */
    enableShadows?: boolean;

    /**
     * Enable throttling for the TaskScheduler
     * @default false
     * @beta
     */
    throttlingEnabled?: boolean;

    /**
     * If set, the view will constrained within the given bounds in geo coordinates.
     */
    maxBounds?: GeoBox;
}

/**
 * Default settings used by {@link MapView} collected in one place.
 * @internal
 */
const MapViewDefaults = {
    projection: mercatorProjection,
    addBackgroundDatasource: true,

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
    target: new GeoCoordinates(25, 0),
    zoomLevel: 5,
    tilt: 0,
    heading: 0,
    theme: {},
    maxTilesPerFrame: 0
};

/**
 * Parameters for {@link (MapView.lookAt:WITH_PARAMS)}.
 */
export interface LookAtParams {
    /**
     * Target/look at point of the MapView.
     *
     * @note If the given point is not on the ground (altitude != 0) {@link MapView} will do a
     * raycasting internally to find a target on the ground.
     *
     * As a consequence {@link MapView.target} and {@link MapView.zoomLevel}
     * will not match the values
     * that were passed into the {@link (MapView.lookAt:WITH_PARAMS)} method.
     * @default `new GeoCoordinates(25, 0)` in {@link MapView.constructor} context.
     * @default {@link MapView.target} in {@link (MapView.lookAt:WITH_PARAMS)} context.
     */
    target: GeoCoordLike;

    /**
     * Fit MapView to these boundaries.
     *
     * If specified, `zoomLevel` and `distance` parameters are ignored and `lookAt` calculates best
     * `zoomLevel` to fit given bounds.
     *
     * * if `bounds` is {@link @here/harp-geoutils#GeoBox}, then `lookAt`
     *   use {@link LookAtParams.target} or `bounds.target` and
     *   ensure whole box is visible
     *
     * * if `bounds` is {@link @here/harp-geoutils#GeoPolygon}, then `lookAt`
     *   use `bounds.getCentroid()` and ensure whole polygon is visible
     *
     * * if `bounds` is {@link @here/harp-geoutils#GeoBoxExtentLike},
     *   then `lookAt` will use {@link LookAtParams.target} or
     *   current {@link MapView.target} and ensure whole extents are visible
     *
     * * if `bounds` is [[GeoCoordLike]][], then `lookAt` will use {@link LookAtParams.target} or
     *   calculated `target` as center of world box covering given points and ensure all points are
     *   visible
     *
     * Note in sphere projection some points are not visible if you specify bounds that span more
     * than 180 degreess in any direction.
     *
     * @see {@link (MapView.lookAt:WITH_PARAMS)} for defails how `bounds`
     *      interact with `target` parameter
     */
    bounds: GeoBox | GeoBoxExtentLike | GeoCoordLike[] | GeoPolygon;

    /**
     * Camera distance to the target point in world units.
     * @default zoomLevel defaults will be used if not set.
     */
    distance: number;

    /**
     * Zoomlevel of the MapView.
     * @note Takes precedence over distance.
     * @default 5 in {@link MapView.constructor} context.
     * @default {@link MapView.zoomLevel} in {@link (MapView.lookAt:WITH_PARAMS)} context.
     */
    zoomLevel: number;

    /**
     * Tilt angle in degrees. 0 is top down view.
     * @default 0 in {@link MapView.constructor} context.
     * @default {@link MapView.tilt} in {@link (MapView.lookAt:WITH_PARAMS)} context.
     * @note Maximum supported tilt is 89°
     */
    tilt: number;

    /**
     * Heading angle in degrees and clockwise. 0 is north-up.
     * @default 0 in {@link MapView.constructor} context.
     * @default {@link MapView.heading} in {@link (MapView.lookAt:WITH_PARAMS)} context.
     */
    heading: number;
}

/**
 * The core class of the library to call in order to create a map visualization. It needs to be
 * linked to datasources.
 */
export class MapView extends EventDispatcher {
    /**
     * The instance of {@link MapRenderingManager} managing the rendering of the map. It is a public
     * property to allow access and modification of some parameters of the rendering process at
     * runtime.
     */
    readonly mapRenderingManager: IMapRenderingManager;

    private m_renderLabels: boolean = true;

    private m_movementFinishedUpdateTimerId?: any;
    private m_postEffects?: PostEffects;

    private m_skyBackground?: SkyBackground;
    private m_createdLights?: THREE.Light[];
    private m_overlayCreatedLights?: THREE.Light[];

    private readonly m_screenProjector: ScreenProjector;
    private readonly m_screenCollisions:
        | ScreenCollisions
        | ScreenCollisionsDebug = new ScreenCollisions();

    private m_visibleTiles: VisibleTileSet;

    private m_elevationSource?: DataSource;
    private m_elevationRangeSource?: ElevationRangeSource;
    private m_elevationProvider?: ElevationProvider;
    private m_visibleTileSetLock: boolean = false;
    private readonly m_tileGeometryManager: TileGeometryManager;

    private m_tileWrappingEnabled: boolean = true;

    private m_zoomLevel: number = DEFAULT_MIN_ZOOM_LEVEL;
    private m_minZoomLevel: number = DEFAULT_MIN_ZOOM_LEVEL;
    private m_maxZoomLevel: number = DEFAULT_MAX_ZOOM_LEVEL;
    private readonly m_minCameraHeight: number = DEFAULT_MIN_CAMERA_HEIGHT;
    private m_geoMaxBounds?: GeoBox;
    private m_worldMaxBounds?: THREE.Box3 | OrientedBox3;

    private readonly m_screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1);

    private readonly m_camera: THREE.PerspectiveCamera;

    /**
     * Relative to eye camera.
     *
     * This camera is internal camera used to improve precision
     * when rendering geometries.
     */
    private readonly m_rteCamera = new THREE.PerspectiveCamera();

    private m_yaw = 0;
    private m_pitch = 0;
    private m_roll = 0;
    private m_focalLength = 0;
    private m_targetDistance = 0;
    private m_targetGeoPos = GeoCoordinates.fromObject(MapViewDefaults.target!);
    // Focus point world coords may be calculated after setting projection, use dummy value here.
    private readonly m_targetWorldPos = new THREE.Vector3();
    private readonly m_viewRanges: ViewRanges = {
        near: DEFAULT_CAM_NEAR_PLANE,
        far: DEFAULT_CAM_FAR_PLANE,
        minimum: DEFAULT_CAM_NEAR_PLANE,
        maximum: DEFAULT_CAM_FAR_PLANE
    };

    private m_pointOfView?: THREE.PerspectiveCamera;

    private m_pixelToWorld?: number;
    private m_pixelRatio?: number;

    /** Default scene for map objects and map anchors */
    private readonly m_scene: THREE.Scene = new THREE.Scene();
    /** Separate scene for overlay map anchors */
    private readonly m_overlayScene: THREE.Scene = new THREE.Scene();
    private readonly m_fog: MapViewFog = new MapViewFog(this.m_scene);
    /** Root node of [[m_scene]] that get's cleared every frame. */
    private readonly m_sceneRoot = new THREE.Object3D();
    /** Root node of [[m_overlayScene]] that get's cleared every frame. */
    private readonly m_overlaySceneRoot = new THREE.Object3D();

    private readonly m_mapAnchors: MapAnchors = new MapAnchors();

    private m_animationCount: number = 0;
    private m_animationFrameHandle: number | undefined;
    private m_drawing: boolean = false;
    private m_updatePending: boolean = false;
    private readonly m_renderer: THREE.WebGLRenderer;
    private m_frameNumber = 0;

    private m_textElementsRenderer: TextElementsRenderer;

    private m_forceCameraAspect: number | undefined = undefined;

    // type any as it returns different types depending on the environment
    private m_taskSchedulerTimeout: any = undefined;

    //
    // sources
    //
    private readonly m_tileDataSources: DataSource[] = [];
    private readonly m_connectedDataSources = new Set<string>();
    private readonly m_failedDataSources = new Set<string>();
    private readonly m_backgroundDataSource?: BackgroundDataSource;
    private readonly m_polarDataSource?: PolarTileDataSource;
    private readonly m_enablePolarDataSource: boolean = true;

    // gestures
    private readonly m_raycaster: PickingRaycaster;
    private readonly m_plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
    private readonly m_sphere = new THREE.Sphere(undefined, EarthConstants.EQUATORIAL_RADIUS);

    private readonly m_options: MapViewOptions;
    private readonly m_visibleTileSetOptions: VisibleTileSetOptions;

    private m_theme: Theme = {};
    private readonly m_uriResolver?: UriResolver;
    private m_themeIsLoading: boolean = false;

    private m_previousFrameTimeStamp?: number;
    private m_firstFrameRendered = false;
    private m_firstFrameComplete = false;
    private m_initialTextPlacementDone = false;

    private readonly handleRequestAnimationFrame: (frameStartTime: number) => void;

    private readonly m_pickHandler: PickHandler;

    private readonly m_imageCache: MapViewImageCache = new MapViewImageCache(this);
    private readonly m_userImageCache: MapViewImageCache = new MapViewImageCache(this);

    private readonly m_poiManager: PoiManager = new PoiManager(this);

    private readonly m_poiTableManager: PoiTableManager = new PoiTableManager(this);

    private readonly m_collisionDebugCanvas: HTMLCanvasElement | undefined;

    // Detection of camera movement and scene change:
    private readonly m_movementDetector: CameraMovementDetector;

    private m_thisFrameTilesChanged: boolean | undefined;
    private m_lastTileIds: string = "";
    private m_languages: string[] | undefined;
    private m_politicalView: string | undefined;
    private m_copyrightInfo: CopyrightInfo[] = [];
    private readonly m_animatedExtrusionHandler: AnimatedExtrusionHandler;

    private readonly m_env: MapEnv = new MapEnv({});

    private m_enableMixedLod: boolean | undefined;

    private readonly m_renderOrderStencilValues = new Map<number, number>();
    // Valid values start at 1, because the screen is cleared to zero
    private m_stencilValue: number = DEFAULT_STENCIL_VALUE;
    private m_taskScheduler: MapViewTaskScheduler;

    // `true` if dispose() has been called on `MapView`.
    private m_disposed = false;

    /**
     * Constructs a new `MapView` with the given options or canvas element.
     *
     * @param options - The `MapView` options or the HTML canvas element used to display the map.
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

        if (this.m_options.maxBounds !== undefined) {
            this.m_geoMaxBounds = this.m_options.maxBounds;
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
        this.m_options.maxFps = this.m_options.maxFps ?? 0;

        this.m_options.enableStatistics = this.m_options.enableStatistics === true;

        this.m_languages = this.m_options.languages;
        this.m_politicalView = this.m_options.politicalView;

        if (
            this.m_options.collisionDebugCanvas !== undefined &&
            this.m_options.collisionDebugCanvas !== null
        ) {
            this.m_collisionDebugCanvas = this.m_options.collisionDebugCanvas;
            this.m_screenCollisions = new ScreenCollisionsDebug(this.m_collisionDebugCanvas);
        }

        this.handleRequestAnimationFrame = this.renderLoop.bind(this);
        this.m_pickHandler = new PickHandler(
            this,
            this.m_rteCamera,
            this.m_options.enablePickTechnique === true
        );

        if (this.m_options.tileWrappingEnabled !== undefined) {
            this.m_tileWrappingEnabled = this.m_options.tileWrappingEnabled;
        }

        // Initialization of the stats
        this.setupStats(this.m_options.enableStatistics);

        this.canvas.addEventListener("webglcontextlost", this.onWebGLContextLost);
        this.canvas.addEventListener("webglcontextrestored", this.onWebGLContextRestored);

        // Initialization of the renderer, enable backward compatibility with three.js <= 0.117
        this.m_renderer = new ((THREE as any).WebGL1Renderer ?? THREE.WebGLRenderer)({
            canvas: this.canvas,
            context: this.m_options.context,
            antialias: this.nativeWebglAntialiasEnabled,
            alpha: this.m_options.alpha,
            preserveDrawingBuffer: this.m_options.preserveDrawingBuffer === true,
            powerPreference:
                this.m_options.powerPreference === undefined
                    ? MapViewPowerPreference.Default
                    : this.m_options.powerPreference
        });
        this.m_renderer.autoClear = false;
        this.m_renderer.debug.checkShaderErrors = !isProduction;

        // This is detailed at https://threejs.org/docs/#api/renderers/WebGLRenderer.info
        // When using several WebGLRenderer#render calls per frame, it is the only way to get
        // correct rendering data from ThreeJS.
        this.m_renderer.info.autoReset = false;

        this.setupRenderer();

        this.m_options.fovCalculation =
            this.m_options.fovCalculation === undefined
                ? DEFAULT_FOV_CALCULATION
                : this.m_options.fovCalculation;
        this.m_options.fovCalculation.fov = THREE.MathUtils.clamp(
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
        this.m_scene.add(this.m_camera); // ensure the camera is added to the scene.
        this.m_screenProjector = new ScreenProjector(this.m_camera);

        // Must be initialized before setupCamera, because the VisibleTileSet is created as part
        // of the setupCamera method and it needs the TaskQueue instance.
        this.m_taskScheduler = new MapViewTaskScheduler(this.maxFps);

        // setup camera with initial position
        this.setupCamera();

        this.m_raycaster = new PickingRaycaster(width, height, this.m_env);

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

        this.m_tileGeometryManager = new TileGeometryManager(this);

        if (options.enableMixedLod !== undefined) {
            this.m_enableMixedLod = options.enableMixedLod;
        }
        this.m_visibleTiles = this.createVisibleTileSet();

        this.m_animatedExtrusionHandler = new AnimatedExtrusionHandler(this);

        if (this.m_options.addBackgroundDatasource !== false) {
            this.m_backgroundDataSource = new BackgroundDataSource();
            this.addDataSource(this.m_backgroundDataSource);
        }

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

        if (
            this.m_options.backgroundTilingScheme !== undefined &&
            this.m_backgroundDataSource !== undefined
        ) {
            this.m_backgroundDataSource.setTilingScheme(this.m_options.backgroundTilingScheme);
        }

        this.m_taskScheduler.addEventListener(MapViewEventNames.Update, () => {
            this.update();
        });

        if (options.throttlingEnabled !== undefined) {
            this.m_taskScheduler.throttlingEnabled = options.throttlingEnabled;
        }

        this.initTheme();

        this.m_textElementsRenderer = this.createTextRenderer();

        this.update();
    }

    /**
     * @returns The lights configured by the theme, this is just a convenience method, because the
     * lights can still be accessed by traversing the children of the [[scene]].
     */
    get lights(): THREE.Light[] {
        return this.m_createdLights ?? [];
    }

    get taskQueue(): TaskQueue {
        return this.m_taskScheduler.taskQueue;
    }

    /**
     * @returns Whether label rendering is enabled.
     */
    get renderLabels() {
        return this.m_renderLabels;
    }

    /**
     * Enables or disables rendering of labels.
     * @param value - `true` to enable labels `false` to disable them.
     */
    set renderLabels(value: boolean) {
        this.m_renderLabels = value;
    }

    /**
     * @returns Whether adding of new labels during interaction is enabled.
     */
    get delayLabelsUntilMovementFinished() {
        return this.textElementsRenderer.delayLabelsUntilMovementFinished;
    }

    /**
     * Enables or disables adding of  new labels during interaction. Has no influence on already
     * placed labels
     * @param value - `true` to enable adding `false` to disable them.
     */
    set delayLabelsUntilMovementFinished(value: boolean) {
        this.textElementsRenderer.delayLabelsUntilMovementFinished = value;
    }

    /**
     * @hidden
     * The {@link TextElementsRenderer} select the visible {@link TextElement}s and renders them.
     */
    get textElementsRenderer(): TextElementsRenderer {
        return this.m_textElementsRenderer;
    }

    /**
     * @hidden
     * The {@link CameraMovementDetector} detects camera movements. Made available for performance
     * measurements.
     */
    get cameraMovementDetector(): CameraMovementDetector {
        return this.m_movementDetector;
    }

    /**
     * The {@link AnimatedExtrusionHandler} controls animated extrusion effect
     * of the extruded objects in the {@link Tile}
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

    get tileWrappingEnabled(): boolean {
        return this.m_tileWrappingEnabled;
    }

    set tileWrappingEnabled(enabled: boolean) {
        if (this.projection.type === ProjectionType.Spherical) {
            logger.warn("Setting this with spherical projection has no affect. Was this intended?");
            return;
        }
        if (enabled !== this.m_tileWrappingEnabled) {
            this.m_tileWrappingEnabled = enabled;
            this.m_visibleTiles = this.createVisibleTileSet();
        }
        this.update();
    }

    /**
     * Disposes this `MapView`.
     * @override
     *
     * @param freeContext - `true` to force ThreeJS to loose the context. Supply `false` to keep
     * the context for further use.
     *
     * @remarks
     * This function cleans the resources that are managed manually including those that exist in
     * shared caches.
     *
     * Note: This function does not try to clean objects that can be disposed off easily by
     * TypeScript's garbage collecting mechanism. Consequently, if you need to perform a full
     * cleanup, you must ensure that all references to this `MapView` are removed.
     */
    dispose(freeContext = true) {
        // Enforce listeners that we are about to dispose.
        DISPOSE_EVENT.time = Date.now();
        this.dispatchEvent(DISPOSE_EVENT);

        this.m_disposed = true;

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

        if (freeContext) {
            // See for a discussion of using this call to force freeing the context:
            //   https://github.com/mrdoob/three.js/pull/17588
            // The patch to call forceContextLoss() upon WebGLRenderer.dispose() had been merged,
            // but has been reverted later:
            //   https://github.com/mrdoob/three.js/pull/19022
            this.m_renderer.forceContextLoss();
        }

        this.m_imageCache.clear();
        this.m_tileGeometryManager.clear();

        this.m_movementDetector.dispose();

        // Destroy the facade if the there are no workers active anymore.
        ConcurrentDecoderFacade.destroyIfTerminated();
        ConcurrentTilerFacade.destroyIfTerminated();

        // Remove all event handlers.
        super.dispose();
    }

    /**
     * Is `true` if dispose() as been called on `MapView`.
     */
    get disposed(): boolean {
        return this.m_disposed;
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
     * @param size - The cache size in tiles.
     * @param numVisibleTiles - The number of tiles visible, which is size/2 by default.
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
     * @param postEffectsFile - File URL describing the post effects.
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
     * The abstraction of the {@link MapRenderingManager} API for post effects.
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
        this.m_theme.clearAlpha = theme.clearAlpha;
        this.renderer.setClearColor(new THREE.Color(theme.clearColor), theme.clearAlpha);
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

        if (Array.isArray(theme.priorities)) {
            this.m_theme.priorities = theme.priorities;
        }

        if (Array.isArray(theme.labelPriorities)) {
            this.m_theme.labelPriorities = theme.labelPriorities;
        }

        if (this.m_theme.styles === undefined) {
            this.m_theme.styles = {};
        }
        if (this.m_backgroundDataSource) {
            this.m_backgroundDataSource.setTheme(this.m_theme);
        }
        this.m_theme.styles = theme.styles ?? {};
        this.m_theme.definitions = theme.definitions;

        for (const dataSource of this.m_tileDataSources) {
            dataSource.setTheme(this.m_theme);
        }
        THEME_LOADED_EVENT.time = Date.now();
        this.dispatchEvent(THEME_LOADED_EVENT);
        this.update();
    }

    /**
     * {@link @here/harp-utils#UriResolver} used to resolve application/deployment
     * specific `URI`s into actual `URLs` that can be loaded with `fetch`.
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

    /**
     * Get currently presented political point of view - the country code.
     *
     * @note Country code is stored in lower-case ISO 3166-1 alpha-2 standard.
     * @return Country code or undefined if default
     * (majorly accepted) point of view is used.
     */
    get politicalView(): string | undefined {
        return this.m_politicalView;
    }

    /**
     * Set the political view (country code) to be used when rendering disputed features (borders).
     *
     * @note Country code should be encoded in lower-case ISO 3166-1 alpha-2 standard.
     * @param pov - The code of the country which point of view should be presented,
     * if `undefined` or empty string is set then "defacto" or most widely accepted point of view
     * will be presented.
     */
    set politicalView(pov: string | undefined) {
        if (this.m_politicalView === pov) {
            return;
        }
        this.m_politicalView = pov;
        this.m_tileDataSources.forEach((dataSource: DataSource) => {
            dataSource.setPoliticalView(pov);
        });
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
     * @param type - One of the [[MapViewEventNames]] strings.
     * @param listener - The callback invoked when the `MapView` needs to render a new frame.
     */
    addEventListener(type: MapViewEventNames, listener: (event: RenderEvent) => void): void;

    // overrides with THREE.js base classes are not recognized by tslint.
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
     * @param type - One of the [[MapViewEventNames]] strings.
     * @param listener - The callback invoked when the `MapView` needs to render a new frame.
     */
    removeEventListener(type: MapViewEventNames, listener?: (event: RenderEvent) => void): void;

    // overrides with THREE.js base classes are not recognized by tslint.
    removeEventListener(type: string, listener?: any): void {
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
     *
     * @remarks
     * When modifying the camera all derived properties like:
     * - {@link MapView.target}
     * - {@link MapView.zoomLevel}
     * - {@link MapView.tilt}
     * - {@link MapView.heading}
     * could change.
     * These properties are cached internaly and will only be updated in the next animation frame.
     * FIXME: Unfortunatley THREE.js is not dispatching any events when camera properties change
     * so we should have an API for enforcing update of cached values.
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
     * The alpha used to clear the view.
     */
    get clearAlpha() {
        const rendererClearAlpha = this.m_renderer.getClearAlpha();
        return rendererClearAlpha !== undefined ? rendererClearAlpha : 0;
    }

    /**
     * The alpha used to clear the view.
     */
    set clearAlpha(alpha: number) {
        this.m_renderer.setClearAlpha(alpha);
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
     * @param projection - The {@link @here/harp-geoutils#Projection} instance to use.
     */
    set projection(projection: Projection) {
        // Remember tilt and heading before setting the projection.
        const tilt = this.tilt;
        const heading = this.heading;

        this.m_visibleTileSetOptions.projection = projection;
        this.updatePolarDataSource();
        this.clearTileCache();
        this.textElementsRenderer.clearRenderStates();
        this.m_visibleTiles = this.createVisibleTileSet();
        // Set geo max bounds to compute world bounds with new projection.
        this.geoMaxBounds = this.geoMaxBounds;

        this.lookAtImpl({ tilt, heading });
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

    /**
     * Get geo coordinates of camera focus (target) point.
     *
     * @remarks
     * This point is not necessarily on the ground, i.e.:
     *  - if the tilt is high and projection is {@link @here/harp-geoutils#sphereProjection}`
     *  - if the camera was modified directly and is not pointing to the ground.
     * In any case the projection of the target point will be in the center of the screen.
     *
     * @returns geo coordinates of the camera focus point.
     */
    get target(): GeoCoordinates {
        return this.m_targetGeoPos;
    }

    /** @internal
     * Get world coordinates of camera focus point.
     *
     * @remarks
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
     *
     * @remarks
     * Near and far plane distance are self explanatory while minimum and maximum visibility range
     * describes the extreme near/far planes distances that may be achieved with current camera
     * settings, meaning at current zoom level (ground distance) and any possible orientation.
     * @note Visibility is directly related to camera [[ClipPlaneEvaluator]] used and determines
     * the maximum possible distance of camera far clipping plane regardless of tilt, but may change
     * whenever zoom level changes. Distance is measured in world units which may be approximately
     * equal to meters, but this depends on the distortion related to projection type used.
     * @internal
     */
    get viewRanges(): ViewRanges {
        return this.m_viewRanges;
    }

    /**
     * The position in geo coordinates of the center of the scene.
     * @internal
     */
    get geoCenter(): GeoCoordinates {
        return this.projection.unprojectPoint(this.m_camera.position).normalized();
    }

    /**
     * The position in geo coordinates of the center of the scene.
     *
     * @remarks
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
     * The node in this MapView's scene containing the user {@link MapAnchor}s.
     *
     * @remarks
     * All (first level) children of this node will be positioned in world space according to the
     * [[MapAnchor.geoPosition]].
     * Deeper level children can be used to position custom objects relative to the anchor node.
     */
    get mapAnchors(): MapAnchors {
        return this.m_mapAnchors;
    }

    /**
     * The position in world coordinates of the center of the scene.
     */
    get worldCenter(): THREE.Vector3 {
        return this.m_camera.position;
    }

    /**
     * Get the [[PickHandler]] for this `mapView`.
     */
    get pickHandler(): PickHandler {
        return this.m_pickHandler;
    }

    /**
     * Get the {@link ImageCache} that belongs to this `MapView`.
     *
     * Images stored in this cache are primarily used for POIs (icons) and they are used with the
     * current theme. Although images can be explicitly added and removed from the cache, it is
     * adviced not to remove images from this cache. If an image that is part of client code
     * should be removed at any point other than changing the theme, the {@link useImageCache}
     * should be used instead.
     */
    get imageCache(): MapViewImageCache {
        return this.m_imageCache;
    }

    /**
     * Get the {@link ImageCache} for user images that belongs to this `MapView`.
     *
     * Images added to this cache can be removed if no longer required. If images with identical
     * names are stored in imageCache and userImageCache, the userImageCache will take precedence.
     */
    get userImageCache(): MapViewImageCache {
        return this.m_userImageCache;
    }

    /**
     * @hidden
     * Get the {@link PoiManager} that belongs to this `MapView`.
     */
    get poiManager(): PoiManager {
        return this.m_poiManager;
    }

    /**
     * @hidden
     * Get the array of {@link PoiTableManager} that belongs to this `MapView`.
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
     * The view's maximum bounds in geo coordinates if any.
     */
    get geoMaxBounds(): GeoBox | undefined {
        return this.m_geoMaxBounds;
    }

    /**
     * Sets or clears the view's maximum bounds in geo coordinates.
     *
     * @remarks
     * If set, the view will be
     * constrained to the given geo bounds.
     */
    set geoMaxBounds(bounds: GeoBox | undefined) {
        this.m_geoMaxBounds = bounds;
        this.m_worldMaxBounds = this.m_geoMaxBounds
            ? this.projection.projectBox(
                  this.m_geoMaxBounds,
                  this.projection.type === ProjectionType.Planar
                      ? new THREE.Box3()
                      : new OrientedBox3()
              )
            : undefined;
    }

    /**
     * @hidden
     * @internal
     * The view's maximum bounds in world coordinates if any.
     */
    get worldMaxBounds(): THREE.Box3 | OrientedBox3 | undefined {
        return this.m_worldMaxBounds;
    }

    /**
     * Returns the zoom level for the given camera setup.
     */
    get zoomLevel(): number {
        return this.m_zoomLevel;
    }

    set zoomLevel(zoomLevel: number) {
        this.lookAtImpl({ zoomLevel });
    }

    /**
     * Returns tilt angle in degrees.
     */
    get tilt(): number {
        return THREE.MathUtils.radToDeg(this.m_pitch);
    }

    /**
     * Set the tilt angle of the map.
     * @param tilt -: New tilt angle in degrees.
     */
    set tilt(tilt: number) {
        this.lookAtImpl({ tilt });
    }

    /**
     * Returns heading angle in degrees.
     */
    get heading(): number {
        return -THREE.MathUtils.radToDeg(this.m_yaw);
    }

    /**
     * Set the heading angle of the map.
     * @param heading -: New heading angle in degrees.
     */
    set heading(heading: number) {
        this.lookAtImpl({ heading });
    }

    /**
     * Environment used to evaluate dynamic scene expressions.
     */
    get env(): Env {
        return this.m_env;
    }

    /**
     * Returns the storage level for the given camera setup.
     * @remarks
     * Actual storage level of the rendered data also depends
     * on {@link DataSource.storageLevelOffset}.
     */
    get storageLevel(): number {
        return THREE.MathUtils.clamp(
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
     * Returns {@link DataSource}s displayed by this `MapView`.
     */
    get dataSources(): DataSource[] {
        return this.m_tileDataSources;
    }

    /**
     * Set's the way in which the fov is calculated on the map view.
     *
     * @remarks
     * Note, for this to take visual effect, the map should be rendered
     * after calling this function.
     * @param fovCalculation - How the FOV is calculated.
     */
    setFovCalculation(fovCalculation: FovCalculation) {
        this.m_options.fovCalculation = fovCalculation;
        this.calculateFocalLength(this.m_renderer.getSize(cache.vector2[0]).height);
        this.updateCameras();
    }

    /**
     * Returns the unique {@link DataSource} matching the given name.
     */
    getDataSourceByName(dataSourceName: string): DataSource | undefined {
        return this.m_tileDataSources.find(ds => ds.name === dataSourceName);
    }

    /**
     * Returns the array of {@link DataSource}s referring to the same [[StyleSet]].
     */
    getDataSourcesByStyleSetName(styleSetName: string): DataSource[] {
        return this.m_tileDataSources.filter(ds => ds.styleSetName === styleSetName);
    }

    /**
     * Returns true if the specified {@link DataSource} is enabled.
     */
    isDataSourceEnabled(dataSource: DataSource): boolean {
        return (
            dataSource.enabled &&
            dataSource.ready() &&
            this.m_connectedDataSources.has(dataSource.name) &&
            dataSource.isVisible(this.zoomLevel)
        );
    }

    /**
     * Adds a new {@link DataSource} to this `MapView`.
     *
     * @remarks
     * `MapView` needs at least one {@link DataSource} to display something.
     * @param dataSource - The data source.
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
                const alreadyRemoved = !this.m_tileDataSources.includes(dataSource);
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
     * Removes {@link DataSource} from this `MapView`.
     *
     * @param dataSource - The data source to be removed
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
     * @param textElements - Array of {@link TextElement} to be added.
     */
    addOverlayText(textElements: TextElement[]): void {
        this.m_textElementsRenderer.addOverlayText(textElements);
        this.update();
    }

    /**
     * Adds new overlay text elements to this `MapView`.
     *
     * @param textElements - Array of {@link TextElement} to be added.
     */
    clearOverlayText(): void {
        this.m_textElementsRenderer.clearOverlayText();
    }

    /**
     * Adjusts the camera to look at a given geo coordinate with tilt and heading angles.
     *
     * @remarks
     * #### Note on `target` and `bounds`
     *
     * If `bounds` are specified, `zoomLevel` and `distance` parameters are ignored and `lookAt`
     * calculates best zoomLevel (and possibly target) to fit given bounds.
     *
     * Following table shows how relation between `bounds` and target.
     *
     * | `bounds`             | `target`    | actual `target`
     * | ------               | ------      | --------
     * | {@link @here/harp-geoutils#GeoBox}           | _defined_   | `params.target` is used
     * | {@link @here/harp-geoutils#GeoBox}           | `undefined` | `bounds.center` is used as new `target`
     * | {@link @here/harp-geoutils#GeoBoxExtentLike} | `undefined` | current `MapView.target` is used
     * | {@link @here/harp-geoutils#GeoBoxExtentLike} | _defined_   | `params.target` is used
     * | [[GeoCoordLike]][]   | `undefined` | new `target` is calculated as center of world box covering given points
     * | [[GeoCoordLike]][]   | _defined_   | `params.target` is used and zoomLevel is adjusted to view all given geo points
     *
     * In each case, `lookAt` finds minimum `zoomLevel` that covers given extents or geo points.
     *
     * With flat projection, if `bounds` represents points on both sides of antimeridian, and
     * {@link MapViewOptions.tileWrappingEnabled} is used, `lookAt` will use this knowledge and find
     * minimal view that may cover "next" or "previous" world.
     *
     * With sphere projection if `bounds` represents points on both sides of globe, best effort
     * method is used to find best `target``.
     *
     * #### Examples
     *
     * ```typescript
     * mapView.lookAt({heading: 90})
     *     // look east retaining current `target`, `zoomLevel` and `tilt`
     *
     * mapView.lookAt({lat: 40.707, lng: -74.01})
     *    // look at Manhattan, New York retaining other view params
     *
     * mapView.lookAt(bounds: { latitudeSpan: 10, longitudeSpan: 10})
     *    // look at current `target`, but extending zoomLevel so we see 10 degrees of lat/long span
     * ```
     *
     * @see More examples in [[LookAtExample]].
     *
     * @param params - {@link LookAtParams}
     *
     * {@labels WITH_PARAMS}
     */
    lookAt(params: Partial<LookAtParams>): void;

    /**
     * The method that sets the camera to the desired angle (`tiltDeg`) and `distance` (in meters)
     * to the `target` location, from a certain heading (`headingAngle`).
     *
     * @remarks
     * @param target - The location to look at.
     * @param distance - The distance of the camera to the target in meters.
     * @param tiltDeg - The camera tilt angle in degrees (0 is vertical), curbed below 89deg
     *                @default 0
     * @param headingDeg - The camera heading angle in degrees and clockwise (as opposed to yaw)
     *                   @default 0
     * starting north.
     * @deprecated Use lookAt version with {@link LookAtParams} object parameter.
     */
    lookAt(target: GeoCoordLike, distance: number, tiltDeg?: number, headingDeg?: number): void;

    lookAt(
        targetOrParams: GeoCoordLike | Partial<LookAtParams>,
        distance?: number,
        tiltDeg?: number,
        headingDeg?: number
    ): void {
        if (isGeoCoordinatesLike(targetOrParams)) {
            const zoomLevel =
                distance !== undefined
                    ? MapViewUtils.calculateZoomLevelFromDistance(this, distance)
                    : undefined;

            const params: Partial<LookAtParams> = {
                target: targetOrParams,
                zoomLevel,
                tilt: tiltDeg,
                heading: headingDeg
            };
            this.lookAtImpl(params);
        } else if (typeof targetOrParams === "object") {
            this.lookAtImpl(targetOrParams as Partial<LookAtParams>);
        }
    }

    /**
     * Moves the camera to the specified {@link @here/harp-geoutils#GeoCoordinates},
     * sets the desired `zoomLevel` and
     * adjusts the yaw and pitch.
     *
     * @remarks
     * The pitch of the camera is
     * always curbed so that the camera cannot
     * look above the horizon. This paradigm is necessary
     * in {@link @here/harp-map-controls#MapControls}, where the center of
     * the screen is used for the orbiting interaction (3 fingers / right mouse button).
     *
     * @param geoPos - Geolocation to move the camera to.
     * @param zoomLevel - Desired zoom level.
     * @param yawDeg - Camera yaw in degrees, counter-clockwise (as opposed to heading), starting
     * north.
     * @param pitchDeg - Camera pitch in degrees.
     * @deprecated Use {@link (MapView.lookAt:WITH_PARAMS)} instead.
     */
    setCameraGeolocationAndZoom(
        geoPos: GeoCoordinates,
        zoomLevel: number,
        yawDeg: number = 0,
        pitchDeg: number = 0
    ): void {
        this.geoCenter = geoPos;
        let limitedPitch = Math.min(MapViewUtils.MAX_TILT_DEG, pitchDeg);
        if (this.projection.type === ProjectionType.Spherical) {
            const maxPitchRadWithCurvature = Math.asin(
                EarthConstants.EQUATORIAL_RADIUS /
                    (MapViewUtils.calculateDistanceToGroundFromZoomLevel(this, zoomLevel) +
                        EarthConstants.EQUATORIAL_RADIUS)
            );
            const maxPitchDegWithCurvature = THREE.MathUtils.radToDeg(maxPitchRadWithCurvature);
            limitedPitch = Math.min(limitedPitch, maxPitchDegWithCurvature);
        }
        MapViewUtils.zoomOnTargetPosition(this, 0, 0, zoomLevel);
        MapViewUtils.setRotation(this, yawDeg, limitedPitch);
        this.update();
    }

    /**
     * Updates the value of a dynamic property.
     *
     * @remarks
     * Property names starting with a `$`-sign are reserved and any attempt to change their value
     * will result in an error.
     *
     * Themes can access dynamic properties using the `Expr` operator `["dynamic-properties"]`,
     * for example:
     *
     *   `["get", "property name", ["dynamic-properties"]]`
     *
     * @param name - The name of the property.
     * @param value - The value of the property.
     */
    setDynamicProperty(name: string, value: Value) {
        if (name.startsWith("$")) {
            throw new Error(`failed to update the value of the dynamic property '${name}'`);
        }
        this.m_env.entries[name] = value;
        this.update();
    }

    /**
     * Removes the given dynamic property from this {@link MapView}.
     *
     * @remarks
     * Property names starting with a `$`-sign are reserved and any attempt to change their value
     * will result in an error.
     *
     * @param name - The name of the property to remove.
     */
    removeDynamicProperty(name: string) {
        if (name.startsWith("$")) {
            throw new Error(`failed to remove the dynamic property '${name}'`);
        }
        delete this.m_env.entries[name];
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
            this.update();
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
     * @remarks
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
     * Maximum FPS (Frames Per Second).
     *
     * @remarks
     * If VSync in enabled, the specified number may not be
     * reached, but instead the next smaller number than `maxFps` that is equal to the refresh rate
     * divided by an integer number.
     *
     * E.g.: If the monitors refresh rate is set to 60hz, and if `maxFps` is set to a value of `40`
     * (60hz/1.5), the actual used FPS may be 30 (60hz/2). For displays that have a refresh rate of
     * 60hz, good values for `maxFps` are 30, 20, 15, 12, 10, 6, 3 and 1. A value of `0` is ignored.
     */
    set maxFps(value: number) {
        this.m_options.maxFps = value;
        this.m_taskScheduler.maxFps = value;
    }

    get maxFps(): number {
        //this cannot be undefined, as it is defaulting to 0 in the constructor
        return this.m_options.maxFps as number;
    }

    /**
     * PixelRatio ratio for rendering when the camera is moving or an animation is running.
     *
     * @remarks
     * Useful when rendering on high resolution displays with low performance GPUs
     * that may be fill-rate-limited.
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
     * Returns the screen position of the given geo or world position.
     *
     * @param pos - The position as a {@link @here/harp-geoutils#GeoCoordLike} or
     * {@link https://threejs.org/docs/#api/en/math/Vector3 | THREE.Vector3} world position.
     * @returns The screen position in CSS/client coordinates (no pixel ratio applied) or
     * `undefined`.
     */
    getScreenPosition(pos: GeoCoordLike | THREE.Vector3): THREE.Vector2 | undefined {
        if (isVector3Like(pos)) {
            cache.vector3[0].copy(pos);
        } else {
            this.projection.projectPoint(GeoCoordinates.fromObject(pos), cache.vector3[0]);
        }
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
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
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

    getWorldPositionAt(x: number, y: number, fallback: true): THREE.Vector3;
    getWorldPositionAt(x: number, y: number, fallback?: boolean): THREE.Vector3 | null;

    /**
     * Returns the world space position from the given screen position.
     *
     * @remarks
     * If `fallback !== true` the return value can be `null`, in case the camera has a high tilt
     * and the given `(x, y)` value is not intersecting the ground plane.
     * If `fallback === true` the return value will always exist but it might not be on the earth
     * surface.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     * @param fallback - Whether to compute a fallback position if the earth surface is not hit.
     */
    getWorldPositionAt(x: number, y: number, fallback?: boolean): THREE.Vector3 | null {
        this.m_raycaster.setFromCamera(this.getNormalizedScreenCoordinates(x, y), this.m_camera);
        const worldPos =
            this.projection.type === ProjectionType.Spherical
                ? this.m_raycaster.ray.intersectSphere(this.m_sphere, cache.vector3[0])
                : this.m_raycaster.ray.intersectPlane(this.m_plane, cache.vector3[0]);

        if (worldPos === null && fallback === true) {
            // Fall back to the far plane
            const cosAlpha = this.m_camera
                .getWorldDirection(cache.vector3[0])
                .dot(this.m_raycaster.ray.direction);

            return cache.vector3[0]
                .copy(this.m_raycaster.ray.direction)
                .multiplyScalar(this.m_camera.far / cosAlpha)
                .add(this.m_camera.position);
        }
        return worldPos;
    }

    /**
     * Same as {@link MapView.getGeoCoordinatesAt} but always returning a geo coordinate.
     */
    getGeoCoordinatesAt(x: number, y: number, fallback: true): GeoCoordinates;

    /**
     * Returns the {@link @here/harp-geoutils#GeoCoordinates} from the
     * given screen position.
     *
     * @remarks
     * If `fallback !== true` the return value can be `null`, in case the camera has a high tilt
     * and the given `(x, y)` value is not intersecting the ground plane.
     * If `fallback === true` the return value will always exist but it might not be on the earth
     * surface.
     * If {@link MapView.tileWrappingEnabled} is `true` the returned geo coordinates will have a
     * longitude clamped to [-180,180] degrees.
     * The returned geo coordinates are not normalized so that a map object placed at that position
     * will be below the (x,y) screen coordinates, regardless which world repetition was on screen.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     * @param fallback - Whether to compute a fallback position if the earth surface is not hit.
     * @returns Unnormalized geo coordinates
     */
    getGeoCoordinatesAt(x: number, y: number, fallback?: boolean): GeoCoordinates | null;

    getGeoCoordinatesAt(x: number, y: number, fallback?: boolean): GeoCoordinates | null {
        const worldPosition = this.getWorldPositionAt(x, y, fallback);
        if (!worldPosition) {
            return null;
        }

        const geoPos = this.projection.unprojectPoint(worldPosition);
        if (!this.tileWrappingEnabled && this.projection.type === ProjectionType.Planar) {
            // When the map is not wrapped we clamp the longitude
            geoPos.longitude = THREE.MathUtils.clamp(geoPos.longitude, -180, 180);
        }
        return geoPos;
    }

    /**
     * Returns the normalized screen coordinates from the given pixel position.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     */
    getNormalizedScreenCoordinates(x: number, y: number): THREE.Vector3 {
        // use clientWidth and clientHeight as it does not apply the pixelRatio and
        // therefore supports also HiDPI devices
        const { width, height } = this.getCanvasClientSize();
        return new THREE.Vector3((x / width) * 2 - 1, -((y / height) * 2) + 1, 0);
    }

    /**
     * Do a raycast on all objects in the scene. Useful for picking.
     *
     * @remarks
     * Limited to objects that THREE.js can raycast, the solid lines
     * that get their geometry in the shader cannot be tested
     * for intersection.
     *
     * Note, if a {@link DataSource} adds an [[Object3D]]
     * to a {@link Tile}, it will be only pickable once
     * {@link MapView.render} has been called, this is because
     * {@link MapView.render} method creates the
     * internal three.js root [[Object3D]] which is used in the [[PickHandler]] internally.
     * This method will not test for intersection custom objects added to the scene by for
     * example calling directly the [[scene.add]] method from THREE.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     * @param parameters - The intersection test behaviour may be adjusted by providing an instance
     * of {@link IntersectParams}.
     * @returns The list of intersection results.
     */
    intersectMapObjects(x: number, y: number, parameters?: IntersectParams): PickResult[] {
        return this.m_pickHandler.intersectMapObjects(x, y, parameters);
    }

    /**
     * Resize the HTML canvas element and the THREE.js `WebGLRenderer`.
     *
     * @param width - The new width.
     * @param height - The new height.
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
     * @remarks
     * @note Before using this method, set `synchronousRendering` to `true`
     * in the {@link MapViewOptions}
     *
     * @param frameStartTime - Optional timestamp for start of frame.
     * Default: [[PerformanceTimer.now()]]
     */
    renderSync(frameStartTime?: number) {
        if (frameStartTime === undefined) {
            frameStartTime = PerformanceTimer.now();
        }
        this.render(frameStartTime);
    }

    /**
     * Requests a redraw of the scene.
     */
    update() {
        if (this.disposed) {
            logger.warn("update(): MapView has been disposed of.");
            return;
        }

        this.dispatchEvent(UPDATE);

        // Skip if update is already in progress
        if (this.m_updatePending) {
            return;
        }

        // Set update flag
        this.m_updatePending = true;

        this.startRenderLoop();
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
     * @remarks
     * Remove the {@link Tile} objects created by cacheable
     * {@link DataSource}s. If a {@link DataSource} name is
     * provided, this method restricts the eviction the {@link DataSource} with the given name.
     *
     * @param dataSourceName - The name of the {@link DataSource}.
     * @param filter Optional tile filter
     */
    clearTileCache(dataSourceName?: string, filter?: (tile: Tile) => boolean) {
        if (this.m_visibleTiles === undefined) {
            // This method is called in the shadowsEnabled function, which is initialized in the
            // setupRenderer function,
            return;
        }
        if (dataSourceName !== undefined) {
            const dataSource = this.getDataSourceByName(dataSourceName);
            if (dataSource) {
                this.m_visibleTiles.clearTileCache(dataSource, filter);
                dataSource.clearCache();
            }
        } else {
            this.m_visibleTiles.clearTileCache(undefined, filter);
            this.m_tileDataSources.forEach(dataSource => dataSource.clearCache());
        }

        if (this.m_elevationProvider !== undefined) {
            this.m_elevationProvider.clearCache();
        }
    }

    /**
     * Apply visitor to all visible tiles.
     *
     * @param fun - Visitor function
     */
    forEachVisibleTile(fun: (tile: Tile) => void) {
        this.m_visibleTiles.forEachVisibleTile(fun);
    }

    /**
     * Apply a visitor function to all tiles in the cache.
     *
     * @param visitor - Visitor function
     */
    forEachCachedTile(visitor: (tile: Tile) => void) {
        this.m_visibleTiles.forEachCachedTile(visitor);
    }

    /**
     * Visit each tile in visible, rendered, and cached sets.
     *
     * @remarks
     *  * Visible and temporarily rendered tiles will be marked for update and retained.
     *  * Cached but not rendered/visible will be evicted.
     *
     * @param dataSource - If passed, only the tiles from this {@link DataSource} instance
     * are processed. If `undefined`, tiles from all {@link DataSource}s are processed.
     */
    markTilesDirty(dataSource?: DataSource) {
        this.m_visibleTiles.markTilesDirty(dataSource);
    }

    /**
     * Sets the DataSource which contains the elevations, the elevation range source, and the
     * elevation provider.
     *
     * @remarks
     * Only a single elevation source is possible per {@link MapView}.
     * If the terrain-datasource is merged with this repository, we could internally construct
     * the {@link ElevationRangeSource} and the {@link ElevationProvider}
     * and access would be granted to
     * the application when it asks for it, to simplify the API.
     *
     * @param elevationSource - The datasource containing the terrain tiles.
     * @param elevationRangeSource - Allows access to the elevation min / max per tile.
     * @param elevationProvider - Allows access to the elevation at a given location or a ray
     *      from the camera.
     */
    async setElevationSource(
        elevationSource: DataSource,
        elevationRangeSource: ElevationRangeSource,
        elevationProvider: ElevationProvider
    ) {
        // Remove previous elevation source if present
        if (this.m_elevationSource && this.m_elevationSource !== elevationSource) {
            this.removeDataSource(this.m_elevationSource);
        }

        // Add as datasource if it was not added before
        const isPresent = this.m_tileDataSources.includes(elevationSource);
        if (!isPresent) {
            await this.addDataSource(elevationSource);
        }
        this.m_elevationSource = elevationSource;
        this.m_elevationRangeSource = elevationRangeSource;
        if (!this.m_elevationRangeSource.ready()) {
            await this.m_elevationRangeSource.connect();
        }
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
     * @param elevationSource - The datasource to be cleared.
     */
    clearElevationSource(elevationSource: DataSource) {
        this.removeDataSource(elevationSource);
        this.m_elevationSource = undefined;
        this.m_elevationRangeSource = undefined;
        this.m_elevationProvider = undefined;
        this.dataSources.forEach(dataSource => {
            dataSource.setEnableElevationOverlay(false);
        });
        this.m_tileGeometryManager.setTileUpdateCallback(undefined);
        this.clearTileCache();
    }

    /**
     * Public access to {@link MapViewFog} allowing to toggle it by setting its `enabled` property.
     */
    get fog(): MapViewFog {
        return this.m_fog;
    }

    private getStencilValue(renderOrder: number) {
        if (!this.m_drawing) {
            throw new Error("failed to get the stencil value");
        }

        return (
            this.m_renderOrderStencilValues.get(renderOrder) ??
            this.allocateStencilValue(renderOrder)
        );
    }

    private allocateStencilValue(renderOrder: number) {
        if (!this.m_drawing) {
            throw new Error("failed to allocate stencil value");
        }

        const stencilValue = this.m_stencilValue++;
        this.m_renderOrderStencilValues.set(renderOrder, stencilValue);
        return stencilValue;
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
     * @beta
     */
    get throttlingEnabled(): boolean {
        return this.m_taskScheduler.throttlingEnabled === true;
    }

    /**
     * @beta
     */
    set throttlingEnabled(enabled: boolean) {
        this.m_taskScheduler.throttlingEnabled = enabled;
    }

    get shadowsEnabled(): boolean {
        return this.m_options.enableShadows === true;
    }

    set shadowsEnabled(enabled: boolean) {
        // shadowMap is undefined if we are testing (three.js always set it to be defined).
        if (
            this.m_renderer.shadowMap === undefined ||
            enabled === this.m_renderer.shadowMap.enabled
        ) {
            return;
        }
        this.m_options.enableShadows = enabled;
        // There is a bug in three.js where this doesn't currently work once enabled.
        this.m_renderer.shadowMap.enabled = enabled;
        // TODO: Make this configurable. Note, there is currently issues when using the
        // VSMShadowMap type, this should be investigated if this type is requested.
        this.m_renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.clearTileCache();
    }

    private extractAttitude() {
        const camera = this.m_camera;
        const projection = this.projection;

        const cameraPos = cache.vector3[1];
        const transform = cache.transform[0];
        const tangentSpaceMatrix = cache.matrix4[1];
        // 1. Build the matrix of the tangent space of the camera.
        cameraPos.setFromMatrixPosition(camera.matrixWorld); // Ensure using world position.
        projection.localTangentSpace(this.m_targetGeoPos, transform);
        tangentSpaceMatrix.makeBasis(transform.xAxis, transform.yAxis, transform.zAxis);

        // 2. Change the basis of matrixWorld to the tangent space to get the new base axes.
        cache.matrix4[0].getInverse(tangentSpaceMatrix).multiply(camera.matrixWorld);
        transform.xAxis.setFromMatrixColumn(cache.matrix4[0], 0);
        transform.yAxis.setFromMatrixColumn(cache.matrix4[0], 1);
        transform.zAxis.setFromMatrixColumn(cache.matrix4[0], 2);

        // 3. Deduce orientation from the base axes.
        let yaw = 0;
        let pitch = 0;
        let roll = 0;

        // Decompose rotation matrix into Z0 X Z1 Euler angles.
        const epsilon = 1e-10;
        const d = transform.zAxis.dot(cameraPos.set(0, 0, 1));
        if (d < 1.0 - epsilon) {
            if (d > -1.0 + epsilon) {
                yaw = Math.atan2(transform.zAxis.x, -transform.zAxis.y);
                pitch = Math.acos(transform.zAxis.z);
                roll = Math.atan2(transform.xAxis.x, transform.yAxis.z);
            } else {
                // Looking bottom-up with space.z.z == -1.0
                yaw = -Math.atan2(-transform.yAxis.x, transform.xAxis.x);
                pitch = 180;
                roll = 0;
            }
        } else {
            // Looking top-down with space.z.z == 1.0
            yaw = Math.atan2(-transform.yAxis.x, transform.xAxis.x);
            pitch = 0.0;
            roll = 0.0;
        }

        return {
            yaw,
            pitch,
            roll
        };
    }

    private lookAtImpl(params: Partial<LookAtParams>): void {
        const tilt = Math.min(getOptionValue(params.tilt, this.tilt), MapViewUtils.MAX_TILT_DEG);
        const heading = getOptionValue(params.heading, this.heading);
        const distance =
            params.zoomLevel !== undefined
                ? MapViewUtils.calculateDistanceFromZoomLevel(
                      this,
                      THREE.MathUtils.clamp(
                          params.zoomLevel,
                          this.m_minZoomLevel,
                          this.m_maxZoomLevel
                      )
                  )
                : params.distance !== undefined
                ? params.distance
                : this.m_targetDistance;

        let target: GeoCoordinates | undefined;
        if (params.bounds !== undefined) {
            let geoPoints: GeoCoordLike[];

            if (params.bounds instanceof GeoBox) {
                target = params.target
                    ? GeoCoordinates.fromObject(params.target)
                    : params.bounds.center;
                geoPoints = MapViewUtils.geoBoxToGeoPoints(params.bounds);
            } else if (params.bounds instanceof GeoPolygon) {
                target = params.bounds.getCentroid();
                geoPoints = params.bounds.coordinates;
            } else if (isGeoBoxExtentLike(params.bounds)) {
                target = params.target ? GeoCoordinates.fromObject(params.target) : this.target;
                const box = GeoBox.fromCenterAndExtents(target, params.bounds);
                geoPoints = MapViewUtils.geoBoxToGeoPoints(box);
            } else if (Array.isArray(params.bounds)) {
                geoPoints = params.bounds;
                if (params.target !== undefined) {
                    target = GeoCoordinates.fromObject(params.target);
                }
            } else {
                throw Error("#lookAt: Invalid 'bounds' value");
            }
            if (
                // if the points are created from the corners of the geoBox dont cluster them
                !(params.bounds instanceof GeoBox || params.bounds instanceof GeoPolygon) &&
                this.m_tileWrappingEnabled &&
                this.projection.type === ProjectionType.Planar
            ) {
                // In flat projection, with wrap around enabled, we should detect clusters of
                // points around  antimeridian and possible move some points to sibling worlds.
                //
                // Here, we fit points into minimal geo box taking world wrapping into account.
                geoPoints = MapViewUtils.wrapGeoPointsToScreen(geoPoints, target!);
            }
            const worldPoints = geoPoints.map(point =>
                this.projection.projectPoint(GeoCoordinates.fromObject(point), new THREE.Vector3())
            );
            const worldTarget = new THREE.Vector3();
            if (target! === undefined) {
                const box = new THREE.Box3().setFromPoints(worldPoints);
                box.getCenter(worldTarget);
                this.projection.scalePointToSurface(worldTarget);
                target = this.projection.unprojectPoint(worldTarget);
            } else {
                this.projection.projectPoint(target, worldTarget);
            }

            if (params.zoomLevel !== undefined || params.distance !== undefined) {
                return this.lookAtImpl({
                    tilt,
                    heading,
                    distance,
                    target
                });
            }

            return this.lookAtImpl(
                MapViewUtils.getFitBoundsLookAtParams(target, worldTarget, worldPoints, {
                    tilt,
                    heading,
                    minDistance: MapViewUtils.calculateDistanceFromZoomLevel(
                        this,
                        this.maxZoomLevel
                    ),
                    projection: this.projection,
                    camera: this.camera
                })
            );
        }
        target =
            params.target !== undefined ? GeoCoordinates.fromObject(params.target) : this.target;

        // MapViewUtils#setRotation uses pitch, not tilt, which is different in sphere projection.
        // But in sphere, in the tangent space of the target of the camera, pitch = tilt. So, put
        // the camera on the target, so the tilt can be passed to getRotation as a pitch.
        MapViewUtils.getCameraRotationAtTarget(
            this.projection,
            target,
            -heading,
            tilt,
            this.camera.quaternion
        );
        MapViewUtils.getCameraPositionFromTargetCoordinates(
            target,
            distance,
            -heading,
            tilt,
            this.projection,
            this.camera.position
        );
        this.camera.updateMatrixWorld(true);

        // Make sure to update all properties that are accessable via API (e.g. zoomlevel) b/c
        // otherwise they would be updated as recently as in the next animation frame.
        this.updateLookAtSettings();
        this.update();
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
     *
     * @remarks
     * @param viewRanges - optional parameter that supplies new view ranges, most importantly
     * near/far clipping planes distance. If parameter is not provided view ranges will be
     * calculated from [[ClipPlaneEvaluator]] used in {@link VisibleTileSet}.
     */
    private updateCameras(viewRanges?: ViewRanges) {
        // Update look at settings first, so that other components (e.g. ClipPlanesEvaluator) get
        // the up to date tilt, targetDistance, ...
        this.m_camera.updateMatrixWorld(false);
        this.updateLookAtSettings();

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
        this.m_fog.update(this, this.m_viewRanges.maximum);
    }

    /**
     * Derive the look at settings (i.e. target, zoom, ...) from the current camera.
     */
    private updateLookAtSettings() {
        let { target, distance } = MapViewUtils.getTargetAndDistance(
            this.projection,
            this.camera,
            this.elevationProvider
        );
        if (this.geoMaxBounds) {
            ({ target, distance } = MapViewUtils.constrainTargetAndDistanceToViewBounds(
                target,
                distance,
                this
            ));
        }

        this.m_targetWorldPos.copy(target);
        this.m_targetGeoPos = this.projection.unprojectPoint(this.m_targetWorldPos);
        this.m_targetDistance = distance;
        this.m_zoomLevel = MapViewUtils.calculateZoomLevelFromDistance(this, this.m_targetDistance);

        const { yaw, pitch, roll } = this.extractAttitude();
        this.m_yaw = yaw;
        this.m_pitch = pitch;
        this.m_roll = roll;
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
     * Transfer the NDC point to view space.
     * @param vector - Vector to transform.
     * @param result - Result to place calculation.
     */
    private ndcToView(vector: Vector3Like, result: THREE.Vector3): THREE.Vector3 {
        result
            .set(vector.x, vector.y, vector.z)
            .applyMatrix4(this.camera.projectionMatrixInverse)
            // Make sure to apply rotation, hence use the rte camera
            .applyMatrix4(this.m_rteCamera.matrixWorld);
        return result;
    }

    /**
     * Transfer from view space to camera space.
     * @param viewPos - position in view space, result is stored here.
     */
    private viewToLightSpace(viewPos: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
        return viewPos.applyMatrix4(camera.matrixWorldInverse);
    }

    /**
     * Update the directional light camera. Note, this requires the cameras to first be updated.
     */
    private updateLights() {
        // TODO: HARP-9479 Globe doesn't support shadows.
        if (
            !this.shadowsEnabled ||
            this.projection.type === ProjectionType.Spherical ||
            this.m_createdLights === undefined ||
            this.m_createdLights.length === 0
        ) {
            return;
        }

        const points: Vector3Like[] = [
            // near plane points
            { x: -1, y: -1, z: -1 },
            { x: 1, y: -1, z: -1 },
            { x: -1, y: 1, z: -1 },
            { x: 1, y: 1, z: -1 },

            // far planes points
            { x: -1, y: -1, z: 1 },
            { x: 1, y: -1, z: 1 },
            { x: -1, y: 1, z: 1 },
            { x: 1, y: 1, z: 1 }
        ];
        const transformedPoints = points.map((p, i) => this.ndcToView(p, cache.frustumPoints[i]));

        this.m_createdLights.forEach(element => {
            const directionalLight = element as THREE.DirectionalLight;
            if (directionalLight.isDirectionalLight === true) {
                const lightDirection = cache.vector3[0];
                lightDirection.copy(directionalLight.target.position);
                lightDirection.sub(directionalLight.position);
                lightDirection.normalize();

                const normal = cache.vector3[1];
                if (this.projection.type === ProjectionType.Planar) {
                    // -Z points to the camera, we can't use Projection.surfaceNormal, because
                    // webmercator and mercator give different results.
                    normal.set(0, 0, -1);
                } else {
                    // Enable shadows for globe...
                    //this.projection.surfaceNormal(target, normal);
                }

                // The camera of the shadow has the same height as the map camera, and the target is
                // also the same. The position is then calculated based on the light direction and
                // the height
                // using basic trigonometry.
                const tilt = this.m_pitch;
                const cameraHeight = this.targetDistance * Math.cos(tilt);
                const lightPosHyp = cameraHeight / normal.dot(lightDirection);

                directionalLight.target.position.copy(this.worldTarget).sub(this.camera.position);
                directionalLight.position.copy(this.worldTarget);
                directionalLight.position.addScaledVector(lightDirection, -lightPosHyp);
                directionalLight.position.sub(this.camera.position);
                directionalLight.updateMatrixWorld();
                directionalLight.shadow.updateMatrices(directionalLight);

                const camera = directionalLight.shadow.camera;
                const pointsInLightSpace = transformedPoints.map(p =>
                    this.viewToLightSpace(p.clone(), camera)
                );

                const box = new THREE.Box3();
                pointsInLightSpace.forEach(point => {
                    box.expandByPoint(point);
                });
                camera.left = box.min.x;
                camera.right = box.max.x;
                camera.top = box.max.y;
                camera.bottom = box.min.y;
                // Moving back to the light the near plane in order to catch high buildings, that
                // are not visible by the camera, but existing on the scene.
                camera.near = -box.max.z * 0.95;
                camera.far = -box.min.z;
                camera.updateProjectionMatrix();
            }
        });
    }

    /**
     * Render loop callback that should only be called by [[requestAnimationFrame]].
     * Will trigger [[requestAnimationFrame]] again if updates are pending or  animation is running.
     * @param frameStartTime - The start time of the current frame
     */
    private renderLoop(frameStartTime: number) {
        // Render loop shouldn't run when synchronous rendering is enabled or if `MapView` has been
        // disposed of.
        if (this.m_options.synchronousRendering === true || this.disposed) {
            return;
        }

        if (this.maxFps === 0) {
            // Render with max fps
            this.render(frameStartTime);
        } else {
            // Limit fps by skipping frames

            // Magic ingredient to compensate time flux.
            const fudgeTimeInMs = 3;
            const frameInterval = 1000 / this.maxFps;
            const previousFrameTime =
                this.m_previousFrameTimeStamp === undefined ? 0 : this.m_previousFrameTimeStamp;
            const targetTime = previousFrameTime + frameInterval - fudgeTimeInMs;

            if (frameStartTime >= targetTime) {
                this.render(frameStartTime);
            }
        }

        // Continue rendering if update is pending or animation is running
        if (this.m_updatePending || this.animating) {
            this.m_animationFrameHandle = requestAnimationFrame(this.handleRequestAnimationFrame);
        } else {
            // Stop rendering if no update is pending
            this.m_animationFrameHandle = undefined;
        }
    }

    /**
     * Start render loop if not already running.
     */
    private startRenderLoop() {
        if (this.m_animationFrameHandle !== undefined || this.m_options.synchronousRendering) {
            return;
        }

        this.m_animationFrameHandle = requestAnimationFrame(this.handleRequestAnimationFrame);
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
    private render(frameStartTime: number): void {
        if (this.m_drawing) {
            return;
        }

        if (this.disposed) {
            logger.warn("render(): MapView has been disposed of.");
            return;
        }

        RENDER_EVENT.time = frameStartTime;
        this.dispatchEvent(RENDER_EVENT);

        this.m_stencilValue = DEFAULT_STENCIL_VALUE;
        this.m_renderOrderStencilValues.clear();

        ++this.m_frameNumber;

        let currentFrameEvent: FrameStats | undefined;
        const stats = PerformanceStatistics.instance;
        const gatherStatistics: boolean = stats.enabled;
        if (gatherStatistics) {
            currentFrameEvent = stats.currentFrame;

            if (this.m_previousFrameTimeStamp !== undefined) {
                // In contrast to fullFrameTime we also measure the application code
                // for the FPS. This means FPS != 1000 / fullFrameTime.
                const timeSincePreviousFrame = frameStartTime - this.m_previousFrameTimeStamp;
                currentFrameEvent.setValue("render.fps", 1000 / timeSincePreviousFrame);
            }

            // We store the last frame statistics at the beginning of the next frame b/c additional
            // work (i.e. geometry creation) is done outside of the animation frame but still needs
            // to be added to the `fullFrameTime` (see [[TileGeometryLoader]]).
            stats.storeAndClearFrameInfo();

            currentFrameEvent = currentFrameEvent as FrameStats;
            currentFrameEvent.setValue("renderCount.frameNumber", this.m_frameNumber);
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
        this.updateLights();

        this.m_renderer.clear();

        // clear the scenes
        this.m_sceneRoot.children.length = 0;
        this.m_overlaySceneRoot.children.length = 0;

        if (gatherStatistics) {
            setupTime = PerformanceTimer.now();
        }

        // TBD: Update renderList only any of its params (camera, etc...) has changed.
        if (!this.lockVisibleTileSet) {
            const viewRangesStatus = this.m_visibleTiles.updateRenderList(
                this.storageLevel,
                Math.floor(this.zoomLevel),
                this.getEnabledTileDataSources(),
                this.m_frameNumber,
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

        this.m_mapAnchors.update(
            this.projection,
            this.camera.position,
            this.m_sceneRoot,
            this.m_overlaySceneRoot,
            this.m_theme.priorities
        );

        this.m_animatedExtrusionHandler.update(this.zoomLevel);

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

        if (this.m_movementDetector.checkCameraMoved(this, frameStartTime)) {
            //FIXME: Shouldn't we use target here?
            const { latitude, longitude, altitude } = this.geoCenter;
            this.dispatchEvent({
                type: MapViewEventNames.CameraPositionChanged,
                latitude,
                longitude,
                altitude,
                // FIXME: Can we remove yaw, pitch and roll
                yaw: this.m_yaw,
                pitch: this.m_pitch,
                roll: this.m_roll,
                tilt: this.tilt,
                heading: this.heading,
                zoom: this.zoomLevel
            });
        }

        // The camera used to render the scene.
        const camera = this.m_pointOfView !== undefined ? this.m_pointOfView : this.m_rteCamera;

        if (this.renderLabels) {
            this.prepareRenderTextElements(frameStartTime);
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

        if (this.m_overlaySceneRoot.children.length > 0) {
            this.m_renderer.render(this.m_overlayScene, camera);
        }

        if (gatherStatistics) {
            textDrawTime = PerformanceTimer.now();
        }

        if (!this.m_firstFrameRendered) {
            this.m_firstFrameRendered = true;

            if (gatherStatistics) {
                stats.appResults.set("firstFrame", frameStartTime);
            }

            FIRST_FRAME_EVENT.time = frameStartTime;
            this.dispatchEvent(FIRST_FRAME_EVENT);
        }

        this.m_visibleTiles.disposePendingTiles();

        this.m_drawing = false;

        this.checkCopyrightUpdates();

        // do this post paint therefore use a Timeout, if it has not been executed cancel and
        // create a new one
        if (this.m_taskSchedulerTimeout !== undefined) {
            clearTimeout(this.m_taskSchedulerTimeout);
        }
        this.m_taskSchedulerTimeout = setTimeout(() => {
            this.m_taskSchedulerTimeout = undefined;
            this.m_taskScheduler.processPending(frameStartTime);
        }, 0);

        if (currentFrameEvent !== undefined) {
            endTime = PerformanceTimer.now();

            const frameRenderTime = endTime - frameStartTime;

            currentFrameEvent.setValue("render.setupTime", setupTime! - frameStartTime);
            currentFrameEvent.setValue("render.cullTime", cullTime! - setupTime!);
            currentFrameEvent.setValue("render.textPlacementTime", textPlacementTime! - cullTime!);
            currentFrameEvent.setValue("render.drawTime", drawTime! - textPlacementTime!);
            currentFrameEvent.setValue("render.textDrawTime", textDrawTime! - drawTime!);
            currentFrameEvent.setValue("render.cleanupTime", endTime - textDrawTime!);
            currentFrameEvent.setValue("render.frameRenderTime", frameRenderTime);

            // Initialize the fullFrameTime with the frameRenderTime If we also create geometry in
            // this frame, this number will be increased in the TileGeometryLoader.
            currentFrameEvent.setValue("render.fullFrameTime", frameRenderTime);
            currentFrameEvent.setValue("render.geometryCreationTime", 0);

            // Add THREE.js statistics
            stats.addWebGLInfo(this.m_renderer.info);

            // Add memory statistics
            // FIXME:
            // This will only measure the memory of the rendering and not of the geometry creation.
            // Assuming the garbage collector is not kicking in immediately we will at least see
            // the geometry creation memory consumption acounted in the next frame.
            stats.addMemoryInfo();
        }

        DID_RENDER_EVENT.time = frameStartTime;
        this.dispatchEvent(DID_RENDER_EVENT);

        // After completely rendering this frame, it is checked if this frame was the first complete
        // frame, with no more tiles, geometry and labels waiting to be added, and no animation
        // running. The initial placement of text in this render call may have changed the loading
        // state of the TextElementsRenderer, so this has to be checked again.
        // HARP-10919: Fading is currently ignored by the frame complete event.
        if (
            !this.textElementsRenderer.loading &&
            this.m_visibleTiles.allVisibleTilesLoaded &&
            this.m_initialTextPlacementDone &&
            !this.m_animatedExtrusionHandler.isAnimating
        ) {
            if (this.m_firstFrameComplete === false) {
                this.m_firstFrameComplete = true;
                if (gatherStatistics) {
                    stats.appResults.set("firstFrameComplete", frameStartTime);
                }
            }

            FRAME_COMPLETE_EVENT.time = frameStartTime;
            this.dispatchEvent(FRAME_COMPLETE_EVENT);
        }
    }

    private renderTileObjects(tile: Tile, zoomLevel: number) {
        const worldOffsetX = tile.computeWorldOffsetX();
        if (tile.willRender(zoomLevel)) {
            for (const object of tile.objects) {
                const mapObjectAdapter = MapObjectAdapter.get(object);
                if (!this.processTileObject(tile, object, mapObjectAdapter)) {
                    continue;
                }

                // TODO: acquire a new style value of if transparent
                const material: SolidLineMaterial | undefined = (object as any).material;
                if (object.renderOrder !== undefined && material instanceof SolidLineMaterial) {
                    material.stencilRef = this.getStencilValue(object.renderOrder);
                }

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

                this.adjustRenderOrderForFallback(object, mapObjectAdapter, tile);
                this.m_sceneRoot.add(object);
            }
            tile.didRender();
        }
    }

    private adjustRenderOrderForFallback(
        object: TileObject,
        mapObjectAdapter: MapObjectAdapter | undefined,
        tile: Tile
    ) {
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

        if (tile.levelOffset >= 0) {
            if (object._backupRenderOrder !== undefined) {
                // We messed up the render order when this tile was used as fallback.
                // Now we render normally, so restore the original renderOrder.
                object.renderOrder = object._backupRenderOrder;
            }
            return;
        }
        let offset = FALLBACK_RENDER_ORDER_OFFSET;
        const technique = mapObjectAdapter?.technique;
        if (technique?.name === "extruded-polygon") {
            // Don't adjust render order for extruded-polygon b/c it's not flat.
            return;
        }

        if ((technique as any)?._category?.startsWith("road") === true) {
            // Don't adjust render order for roads b/c the outline of the child tile
            // would overlap the outline of the fallback parent.
            // Road geometry would be duplicated but since it's rendered with two passes
            // it would just appear a bit wider. That artefact is not as disturbing
            // as seeing the cap outlines.
            // NOTE: Since our tests do pixel perfect image comparison we also need to add a
            // tiny offset in this case so that the order is well defined.
            offset = 1e-6;
        }

        if (object._backupRenderOrder === undefined) {
            object._backupRenderOrder = object.renderOrder;
        }
        object.renderOrder = object._backupRenderOrder + offset * tile.levelOffset;
    }

    /**
     * Process dynamic updates of [[TileObject]]'s style.
     *
     * @returns `true` if object shall be used in scene, `false` otherwise
     */
    private processTileObject(tile: Tile, object: TileObject, mapObjectAdapter?: MapObjectAdapter) {
        if (!object.visible) {
            return false;
        }
        if (!this.processTileObjectFeatures(tile, object)) {
            return false;
        }

        if (mapObjectAdapter) {
            mapObjectAdapter.ensureUpdated(this);
            if (!mapObjectAdapter.isVisible()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Process the features owned by the given [[TileObject]].
     *
     * @param tile - The {@link Tile} owning the [[TileObject]]'s features.
     * @param object - The [[TileObject]] to process.
     * @returns `false` if the given [[TileObject]] should not be added to the scene.
     */
    private processTileObjectFeatures(tile: Tile, object: TileObject): boolean {
        const technique: IndexedTechnique = object.userData.technique;

        if (!technique || technique.enabled === undefined) {
            // Nothing to do, there's no technique.
            return true;
        }

        const feature: TileFeatureData = object.userData.feature;

        if (!feature || !Expr.isExpr(technique.enabled)) {
            return Boolean(getPropertyValue(technique.enabled, this.m_env));
        }

        const { starts, objInfos } = feature;

        if (!Array.isArray(objInfos) || !Array.isArray(starts)) {
            // Nothing to do, the object is missing feature ids and their position
            // in the index buffer.
            return true;
        }

        const geometry: THREE.BufferGeometry | undefined = (object as any).geometry;

        if (!geometry || !geometry.isBufferGeometry) {
            // Nothing to do, the geometry is not a [[THREE.BufferGeometry]]
            // and we can't generate groups.
            return true;
        }

        const index = geometry.getIndex()!;
        if (index === null) {
            //something went wrong with the geometry
            logger.error(
                "Something went wrong with this geometry: ",
                geometry,
                " there is no index"
            );
            return true;
        }

        // clear the groups.
        geometry.clearGroups();

        // The offset in the index buffer of the end of the last
        // pushed group.
        let endOfLastGroup: number | undefined;

        objInfos.forEach((properties, featureIndex) => {
            // the id of the current feature.
            const featureId = getFeatureId(properties);

            let enabled = true;

            if (Expr.isExpr(technique.enabled)) {
                // the state of current feature.
                const featureState = tile.dataSource.getFeatureState(featureId);

                // create a new {@link @here/harp-datasource-protocol#Env} that can be used
                // to evaluate expressions that access the feature state.
                const $state = featureState ? new MapEnv(featureState) : null;

                const parentEnv =
                    typeof properties === "object"
                        ? new MapEnv(properties, this.m_env)
                        : this.m_env;

                const env = new MapEnv({ $state }, parentEnv);

                enabled = Boolean(getPropertyValue(technique.enabled, env));
            }

            if (!enabled) {
                // skip this feature, it was disabled.
                return;
            }

            const start = starts[featureIndex];
            const end = starts[featureIndex + 1] ?? index.count;
            const count = end - start;

            if (start === endOfLastGroup) {
                // extend the last group
                geometry.groups[geometry.groups.length - 1].count += count;
            } else {
                geometry.addGroup(start, count);
            }

            endOfLastGroup = start + count;
        });

        return geometry.groups.length > 0;
    }

    private prepareRenderTextElements(time: number) {
        // Disable rendering of text elements for debug camera. TextElements are rendered using an
        // orthographic camera that covers the entire available screen space. Unfortunately, this
        // particular camera set up is not compatible with the debug camera.
        const debugCameraActive = this.m_pointOfView !== undefined;

        if (debugCameraActive) {
            return;
        }

        this.m_textElementsRenderer.placeText(this.m_visibleTiles.dataSourceTileList, time);
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
            .then(theme => ThemeLoader.load(theme, { uriResolver: this.m_uriResolver }))
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

    private setupCamera() {
        const { width, height } = this.getCanvasClientSize();

        this.calculateFocalLength(height);
        this.m_visibleTiles = this.createVisibleTileSet();

        this.m_options.target = GeoCoordinates.fromObject(
            getOptionValue(this.m_options.target, MapViewDefaults.target)
        );
        // ensure that look at target has height of 0
        (this.m_options.target as GeoCoordinates).altitude = 0;
        this.m_options.tilt = getOptionValue(this.m_options.tilt, MapViewDefaults.tilt);

        this.m_options.heading = getOptionValue(this.m_options.heading, MapViewDefaults.heading);

        this.m_options.zoomLevel = getOptionValue(
            this.m_options.zoomLevel,
            MapViewDefaults.zoomLevel
        );

        this.lookAtImpl(this.m_options);

        // ### move & customize
        this.resize(width, height);

        this.m_screenCamera.position.z = 1;
        this.m_screenCamera.near = 0;
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
            this.m_visibleTileSetOptions,
            this.taskQueue
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

        this.m_overlayCreatedLights?.forEach(light => {
            this.m_overlayScene.remove(light);
            if (light instanceof THREE.DirectionalLight) {
                this.m_overlayScene.remove(light.target);
            }
        });

        if (theme.lights !== undefined) {
            this.m_createdLights = [];
            this.m_overlayCreatedLights = [];

            theme.lights.forEach((lightDescription: Light) => {
                const light = createLight(lightDescription);
                if (!light) {
                    logger.warn(
                        `MapView: failed to create light ${lightDescription.name} of type ${lightDescription.type}`
                    );
                    return;
                }
                this.m_scene.add(light);

                if ((light as any).isDirectionalLight) {
                    const directionalLight = light as THREE.DirectionalLight;
                    // This is needed so that the target is updated automatically, see:
                    // https://threejs.org/docs/#api/en/lights/DirectionalLight.target
                    this.m_scene.add(directionalLight.target);
                }
                this.m_createdLights!.push(light);

                const clonedLight: THREE.Light = light.clone();
                this.m_overlayScene.add(clonedLight);
                if (clonedLight instanceof THREE.DirectionalLight) {
                    this.m_overlayScene.add(clonedLight.target.clone());
                }
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
        new PerformanceStatistics(enable, 1000);
    }

    private setupRenderer() {
        this.m_renderer.setClearColor(DEFAULT_CLEAR_COLOR);

        this.m_scene.add(this.m_sceneRoot);
        this.m_overlayScene.add(this.m_overlaySceneRoot);

        this.shadowsEnabled = this.m_options.enableShadows ?? false;
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
    private readonly onWebGLContextLost = (event: Event) => {
        this.dispatchEvent(CONTEXT_LOST_EVENT);
        logger.warn("WebGL context lost", event);
    };

    /**
     * Default handler for webglcontextrestored event.
     *
     * Note: The renderer `this.m_renderer` may not be initialized when this function is called.
     */
    private readonly onWebGLContextRestored = (event: Event) => {
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
        fov = THREE.MathUtils.clamp(fov, MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW);

        let hFov = THREE.MathUtils.radToDeg(
            MapViewUtils.calculateHorizontalFovByVerticalFov(THREE.MathUtils.degToRad(fov), aspect)
        );

        if (hFov > MAX_FIELD_OF_VIEW || hFov < MIN_FIELD_OF_VIEW) {
            hFov = THREE.MathUtils.clamp(hFov, MIN_FIELD_OF_VIEW, MAX_FIELD_OF_VIEW);
            fov = THREE.MathUtils.radToDeg(
                MapViewUtils.calculateVerticalFovByHorizontalFov(
                    THREE.MathUtils.degToRad(hFov),
                    aspect
                )
            );
        }
        return fov as number;
    }

    /**
     * Sets the field of view calculation, and applies it immediately to the camera.
     *
     * @param type - How to calculate the FOV
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
     * @param height - Height of the canvas in css / client pixels.
     */
    private calculateFocalLength(height: number) {
        assert(this.m_options.fovCalculation !== undefined);
        this.m_focalLength = MapViewUtils.calculateFocalLengthByVerticalFov(
            THREE.MathUtils.degToRad(this.m_options.fovCalculation!.fov),
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
