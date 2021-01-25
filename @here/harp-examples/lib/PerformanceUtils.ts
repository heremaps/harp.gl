/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import {
    computeArrayStats,
    DataSource,
    MapView,
    MapViewEventNames,
    MapViewPowerPreference,
    MapViewUtils,
    PerformanceStatistics,
    RenderEvent,
    SimpleFrameStatistics
} from "@here/harp-mapview";
import { debugContext } from "@here/harp-mapview/lib/DebugContext";
import { assert, LoggerManager, PerformanceTimer } from "@here/harp-utils";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey, copyrightInfo } from "../config";
import { PerformanceTestData } from "./PerformanceConfig";

const logger = LoggerManager.instance.create("PerformanceUtils");

export namespace PerformanceUtils {
    export interface MapViewApp {
        mapView: MapView;
        mapControls: MapControls;
        omvDataSourceConnected: boolean;
        mainDataSource: VectorTileDataSource | undefined;
    }

    export interface ThemeDef {
        resource: string;
    }

    interface GlInfo {
        vendor: string;
        renderer: string;
    }

    enum StatisticsMode {
        None = 0,
        LastFrame = 1,
        All = 2
    }

    export interface FrameResults {
        renderedFrames: number;
        lastFrameStats?: SimpleFrameStatistics;
    }

    const appStartTime = PerformanceTimer.now();

    const DECODER_VALUES = [
        "decode.decodingTime",
        "decode.decodedTiles",
        "geometry.geometryCreationTime",
        "geometryCount.numGeometries",
        "geometryCount.numPoiGeometries",
        "geometryCount.numTechniques",
        "geometryCount.numTextGeometries",
        "geometryCount.numTextPathGeometries"
    ];

    const DEFAULT_THEME = {
        resource: "resources/normal.day.json"
    };

    function getVendorFomContext(context: WebGLRenderingContext): GlInfo {
        const availableExtensions = context.getSupportedExtensions();
        if (
            availableExtensions !== null &&
            availableExtensions.includes("WEBGL_debug_renderer_info")
        ) {
            const infoExtension = context.getExtension("WEBGL_debug_renderer_info");
            if (infoExtension !== null) {
                return {
                    vendor: context.getParameter(infoExtension.UNMASKED_VENDOR_WEBGL),
                    renderer: context.getParameter(infoExtension.UNMASKED_RENDERER_WEBGL)
                };
            }
        }
        return { vendor: "", renderer: "" };
    }

    export function initializeMapViewApp(
        id: string,
        decoderCount?: number,
        powerPreference?: MapViewPowerPreference,
        theme: ThemeDef = DEFAULT_THEME
    ): MapViewApp {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const canvasOverlay = document.getElementById("mapOverlay") as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            decoderUrl: "./decoder.bundle.js",
            decoderCount,
            theme: theme.resource,
            enableStatistics: true,
            collisionDebugCanvas: canvasOverlay,
            powerPreference
        });

        const zoomLevel = MapViewUtils.calculateZoomLevelFromDistance(mapView, 8000);
        mapView.lookAt({
            target: new GeoCoordinates(52.518611, 13.376111),
            zoomLevel
        });

        const mapControls = MapControls.create(mapView);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            if ((mapView.canvas.parentNode! as HTMLDivElement).style.position !== "absolute") {
                mapView.resize(window.innerWidth, window.innerHeight);
            }
        });

        const glInfo = getVendorFomContext(mapView.renderer.context);
        PerformanceStatistics.instance.configs.set("gl.vendor", glInfo.vendor);
        PerformanceStatistics.instance.configs.set("gl.renderer", glInfo.renderer);

        return {
            mapView,
            mapControls,
            omvDataSourceConnected: false,
            mainDataSource: undefined
        };
    }

    export async function initializeMapView(
        id: string,
        dataSourceType: string[],
        decoderCount?: number,
        powerPreference?: MapViewPowerPreference,
        storageLevelOffsetModifier: number = 0,
        theme: ThemeDef = DEFAULT_THEME
    ): Promise<MapViewApp> {
        const mapViewApp = initializeMapViewApp(id, decoderCount, powerPreference, theme);

        // Store time MapView has been initialized
        const appInitTime = PerformanceTimer.now();

        // Set to `true` to visualize the text placement collisions
        debugContext.setValue("DEBUG_SCREEN_COLLISIONS", false);

        return await new Promise<MapViewApp>((resolve, reject) => {
            const dataSourceInitialized = connectDataSources(
                mapViewApp,
                dataSourceType,
                storageLevelOffsetModifier
            );

            dataSourceInitialized
                .then(() => {
                    PerformanceStatistics.instance.appResults.set("startTime", appStartTime);
                    PerformanceStatistics.instance.appResults.set("initTime", appInitTime);
                    resolve(mapViewApp);
                })
                .catch(err => {
                    reject(new Error("Failed to initialize WARP datasource"));
                });
        });
    }

    function connectDataSources(
        mapViewApp: MapViewApp,
        dataSourceTypes: string[],
        storageLevelOffsetModifier: number
    ): Promise<DataSource[]> {
        const createDataSource = (dataSourceType: string): VectorTileDataSource => {
            let dataSource: VectorTileDataSource | undefined;
            switch (dataSourceType) {
                case "OMV":
                    dataSource = new VectorTileDataSource({
                        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
                        apiFormat: APIFormat.XYZOMV,
                        styleSetName: "tilezen",
                        authenticationCode: apikey,
                        authenticationMethod: {
                            method: AuthenticationMethod.QueryString,
                            name: "apikey"
                        },
                        copyrightInfo
                    });
                    break;
                default:
                    throw new Error("Unknown data source");
            }
            return dataSource;
        };

        return Promise.all(
            dataSourceTypes.map(dataSourceType => {
                const dataSource = createDataSource(dataSourceType);

                if (storageLevelOffsetModifier !== undefined && storageLevelOffsetModifier !== 0) {
                    dataSource.storageLevelOffset =
                        dataSource.storageLevelOffset + storageLevelOffsetModifier;
                }

                return mapViewApp.mapView.addDataSource(dataSource).then(() => {
                    if (dataSource instanceof VectorTileDataSource) {
                        mapViewApp.omvDataSourceConnected = true;
                    }
                    return dataSource;
                });
            })
        );
    }

    export function delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function setMapCenter(
        mapViewApp: MapViewApp,
        lat: number,
        long: number,
        cameraHeight?: number,
        force?: boolean
    ): Promise<void> {
        const mapView = mapViewApp.mapView;
        let zoomLevel;
        if (cameraHeight !== undefined) {
            zoomLevel = MapViewUtils.calculateZoomLevelFromDistance(mapView, cameraHeight);
        }
        mapView.lookAt({
            target: new GeoCoordinates(lat, long),
            zoomLevel
        });

        if (force === true) {
            await delay(0);
            return await setMapCenter(mapViewApp, lat, long, cameraHeight, false);
        } else {
            return await new Promise<void>((resolve, reject) => {
                resolve();
            });
        }
    }

    /**
     * Render a frame. Can be used to gather the latest statistics of rendering just this last
     * frame.
     *
     * @param clearFrameEvents - If `true` the current frameEvents are cleared.
     */
    async function renderMapFrame(
        mapViewApp: MapViewApp,
        returnLastFrameStats = StatisticsMode.All
    ): Promise<FrameResults> {
        const mapView = mapViewApp.mapView;

        const currentFrame = mapView.frameNumber;

        return await new Promise<FrameResults>((resolve, reject) => {
            const renderCallback = (event: RenderEvent) => {
                mapView.removeEventListener(MapViewEventNames.AfterRender, renderCallback);
                const renderedFrames = mapView.frameNumber - currentFrame;
                let lastFrameStats: SimpleFrameStatistics | undefined;

                if (returnLastFrameStats !== StatisticsMode.None) {
                    lastFrameStats = PerformanceStatistics.instance.getAsSimpleFrameStatistics(
                        returnLastFrameStats === StatisticsMode.LastFrame
                    );
                }

                resolve({ renderedFrames, lastFrameStats });
            };

            mapView.addEventListener(MapViewEventNames.AfterRender, renderCallback);
            mapView.update();
        });
    }

    /**
     * Record the specified number of frames.
     *
     * @param {MapViewApp} mapViewApp
     * @param {*} clearFrameEvents
     * @param {*} numFrames
     */
    async function recordFramesInner(
        mapViewApp: MapViewApp,
        numFrames: number,
        waitForFinish?: boolean
    ): Promise<FrameResults | undefined> {
        const frameResults = await renderMapFrame(
            mapViewApp,
            waitForFinish !== true || numFrames >= 1 ? StatisticsMode.All : StatisticsMode.None
        );

        const isFinished =
            waitForFinish !== true || !MapViewUtils.mapViewIsLoading(mapViewApp.mapView);

        if (numFrames > 1 || !isFinished) {
            return await new Promise<FrameResults | undefined>((resolve, reject) => {
                recordFrames(mapViewApp, numFrames - 1, waitForFinish)
                    .then(results => {
                        resolve(results);
                    })
                    .catch(() => resolve(undefined));
            });
        } else {
            return new Promise<FrameResults>((resolve, reject) => {
                resolve(frameResults);
            });
        }
    }

    /**
     * Record the specified number of frames.
     *
     * @param {MapViewApp} mapViewApp
     * @param {*} clearFrameEvents
     * @param {*} numFrames
     */
    async function recordFrames(
        mapViewApp: MapViewApp,
        numFrames: number,
        waitForFinish?: boolean
    ): Promise<FrameResults | undefined> {
        const frameResults = await recordFramesInner(mapViewApp, numFrames, waitForFinish);

        if (frameResults !== undefined) {
            frameResults.renderedFrames = numFrames;
        }

        return await new Promise<FrameResults | undefined>((resolve, reject) => {
            resolve(frameResults);
        });
    }

    function recordRendering(mapViewApp: MapViewApp): Promise<SimpleFrameStatistics | undefined> {
        return new Promise<SimpleFrameStatistics | undefined>((resolve, reject) => {
            ensureRenderFinished(mapViewApp).then(() => {
                const decodingStatistics: any = {};

                const statistics = PerformanceStatistics.instance.getAsSimpleFrameStatistics();
                for (const decoderValue of DECODER_VALUES) {
                    const frameValue = statistics.frames.get(decoderValue);
                    if (frameValue !== undefined) {
                        // Use single result per frame containing total for decoding statistics
                        decodingStatistics[decoderValue] = (frameValue as number[]).reduce(
                            (a: number, b: number) => a + b,
                            0
                        );
                    } else {
                        logger.log("Missing decoding statistics for: ", decoderValue);
                    }
                }

                PerformanceStatistics.instance.clearFrames();

                // Run the measurement code, and hopefully trigger all JIT compilation
                recordFrames(mapViewApp, 40, true).then(() => {
                    // Clear the stats, and render the the last frame again and then gather
                    // results.
                    PerformanceStatistics.instance.clearFrames();

                    recordFrames(mapViewApp, 20).then(frameResults => {
                        if (frameResults !== undefined) {
                            const appValues = frameResults.lastFrameStats!.appResults;

                            for (const decoderValue of DECODER_VALUES) {
                                frameResults.lastFrameStats!.frames.delete(decoderValue);
                                appValues.set(decoderValue, decodingStatistics[decoderValue]);
                            }
                            const lastFrameStats = addStatistics(frameResults.lastFrameStats!);

                            resolve(lastFrameStats);
                        } else {
                            resolve(undefined);
                        }
                    });
                });
            });
        });
    }
    /**
     * Measure the time to show the map at the specified location.
     *
     * @export
     * @param {MapViewApp} mapViewApp
     * @param {string} locationName
     * @param {number} lat
     * @param {number} long
     * @param {number} height
     */
    export async function measureOpenMapAtLocation(
        mapViewApp: MapViewApp,
        lat: number,
        long: number,
        height: number,
        showLabels: boolean
    ): Promise<SimpleFrameStatistics | undefined> {
        return await new Promise<SimpleFrameStatistics | undefined>((resolve, reject) => {
            setMapCenter(mapViewApp, lat, long, height, true).then(() => {
                applyDataFilter(mapViewApp.mapView, showLabels);

                ensureRenderFinished(mapViewApp).then(() => {
                    PerformanceStatistics.instance.clear();
                    mapViewApp.mapView.clearTileCache();
                    mapViewApp.mapView.resetFrameNumber();
                    resolve(recordRendering(mapViewApp));
                });
            });
        });
    }

    /**
     * Add statistics to the result (avg, median, etc.).
     */
    function addStatistics(frameStatistics: SimpleFrameStatistics): SimpleFrameStatistics {
        frameStatistics.frameStats = new Map();

        for (const framesObj of frameStatistics.frames) {
            const values = framesObj[1];
            if (Array.isArray(values)) {
                frameStatistics.frameStats.set(framesObj[0], computeArrayStats(values));
            }
        }
        return frameStatistics;
    }

    async function setCamera(
        mapViewApp: MapViewApp,
        lat: number,
        long: number,
        zoomLevel: number,
        yaw: number,
        pitch: number,
        force?: boolean
    ) {
        const mapView = mapViewApp.mapView;
        const target = new GeoCoordinates(lat, long);
        const tilt = THREE.MathUtils.radToDeg(pitch);
        const heading = -THREE.MathUtils.radToDeg(yaw);
        mapView.lookAt({ target, zoomLevel, tilt, heading });

        if (force === true) {
            await delay(0);
            setCamera(mapViewApp, lat, long, zoomLevel, yaw, pitch, false);
        }
    }

    /**
     * Measure the performance at a specified location and zoom level.
     *
     * @param {*} browser
     * @param {*} locationName
     * @param {*} screenshotsFolder
     * @param {*} lat
     * @param {*} long
     * @param {*} zoomLevel
     * @param {*} tilt
     * @param {*} results
     */
    async function measureOpenMapAtZoomLevel(
        mapViewApp: MapViewApp,
        lat: number,
        long: number,
        zoomLevel: number,
        tilt: number,
        showLabels: boolean
    ): Promise<SimpleFrameStatistics | undefined> {
        return await new Promise<SimpleFrameStatistics | undefined>((resolve, reject) => {
            ensureRenderFinished(mapViewApp).then(() => {
                PerformanceStatistics.instance.clear();
                mapViewApp.mapView.clearTileCache();
                mapViewApp.mapView.resetFrameNumber();

                setMapCenter(mapViewApp, lat, long);

                setCamera(mapViewApp, lat, long, zoomLevel, 0, tilt);

                resolve(recordRendering(mapViewApp));
            });
        });
    }

    export async function zoomLevelTest(
        mapViewApp: MapViewApp,
        locationName: string,
        config: PerformanceTestData.ZoomLevelConfiguration,
        use2D: boolean,
        showLabels: boolean,
        isCancelled?: () => boolean
    ): Promise<SimpleFrameStatistics> {
        applyDataFilter(mapViewApp.mapView, showLabels);

        return await new Promise<SimpleFrameStatistics>(async (resolve, reject) => {
            const mapView = mapViewApp.mapView;

            const zoomLevelResults: SimpleFrameStatistics = {
                configs: new Map(),
                appResults: new Map(),
                frames: new Map(),
                messages: [],
                zoomLevelLabels: [],
                zoomLevelData: undefined
            };

            mapView.resetFrameNumber();

            for (let i = 0; i < config.zoomLevels.length; i++) {
                if (isCancelled !== undefined && isCancelled()) {
                    break;
                }

                // copy decoding and geometry values

                const frameResults = await measureOpenMapAtZoomLevel(
                    mapViewApp,
                    config.lat,
                    config.long,
                    config.zoomLevels[i],
                    use2D ? 0 : config.tilts[i],
                    showLabels
                );

                if (frameResults !== undefined) {
                    let perZoomLevelData = zoomLevelResults.zoomLevelData;
                    if (perZoomLevelData === undefined) {
                        perZoomLevelData = zoomLevelResults.zoomLevelData = new Map();
                        for (const zoomLevel of config.zoomLevels) {
                            zoomLevelResults.zoomLevelLabels!.push(zoomLevel.toString());
                        }
                        for (const series of frameResults.frames) {
                            perZoomLevelData.set(series[0], []);
                        }
                        for (const series of frameResults.appResults) {
                            perZoomLevelData.set(series[0], []);
                        }
                    }

                    const stats = addStatistics(frameResults);

                    for (const series of stats.frameStats!) {
                        const value = series[1];
                        if (perZoomLevelData.has(series[0])) {
                            (perZoomLevelData.get(series[0]) as number[]).push(
                                value !== undefined ? value.avg : Number.NaN
                            );
                        }
                    }
                    for (const series of stats.appResults!) {
                        const value = series[1];
                        if (perZoomLevelData.has(series[0])) {
                            (perZoomLevelData.get(series[0]) as number[]).push(value);
                        }
                    }
                }
            }

            resolve(zoomLevelResults);
        });
    }

    async function executeFlyover(
        mapViewApp: MapViewApp,
        locations: PerformanceTestData.FlyoverLocation[],
        waitForFrameLoaded: boolean,
        isCancelled?: () => boolean
    ): Promise<SimpleFrameStatistics | undefined> {
        const mapView = mapViewApp.mapView;
        const firstLocation = locations[0];
        setCamera(
            mapViewApp,
            firstLocation.lat,
            firstLocation.long,
            firstLocation.zoomLevel,
            0,
            firstLocation.tilt,
            true
        );

        await ensureRenderFinished(mapViewApp);

        await delay(1000);

        let currentFrameNumber = 0;
        const newStats = new PerformanceStatistics(
            true,
            waitForFrameLoaded ? locations.length : locations.length * 2
        );
        const startTime = PerformanceTimer.now();

        return await new Promise<SimpleFrameStatistics | undefined>((resolve, reject) => {
            const renderCallback = () => {
                if (isCancelled !== undefined && isCancelled()) {
                    mapView.endAnimation();
                    mapView.removeEventListener(MapViewEventNames.AfterRender, renderCallback);
                    resolve(undefined);
                }

                if (waitForFrameLoaded && MapViewUtils.mapViewIsLoading(mapViewApp.mapView)) {
                    mapViewApp.mapView.update();
                } else if (currentFrameNumber >= locations.length) {
                    mapView.removeEventListener(MapViewEventNames.AfterRender, renderCallback);

                    const totalTime = PerformanceTimer.now() - startTime;
                    newStats.appResults.set("flyoverFPS", (1000 * currentFrameNumber) / totalTime);
                    newStats.appResults.set("flyoverSeconds", totalTime / 1000);
                    newStats.appResults.set("flyoverFrames", currentFrameNumber);

                    if (currentFrameNumber > 1) {
                        const frameEntries = newStats.frameEvents.frameEntries;

                        // The first frame time is the wrong one, it contains the time stamp from
                        // the last frame of the previous benchmark run. To get proper statistics,
                        // we duplicate the value of the seconds frame.
                        const fullFrameTime = frameEntries.get("render.fullFrameTime")!;
                        fullFrameTime.buffer[0] = fullFrameTime.buffer[1];

                        // Same for the FPS of that first frame.
                        const fps = frameEntries.get("render.fps")!;
                        fps.buffer[0] = fps.buffer[1];
                    }

                    const flyoverStatistics = newStats.getAsSimpleFrameStatistics();
                    addStatistics(flyoverStatistics);

                    mapView.endAnimation();

                    logger.log("actual number of frames rendered", mapView.frameNumber);

                    resolve(flyoverStatistics);
                } else {
                    const location = locations[currentFrameNumber++];
                    setCamera(
                        mapViewApp,
                        location.lat,
                        location.long,
                        location.zoomLevel,
                        0,
                        location.tilt
                    );
                }
            };

            mapView.addEventListener(MapViewEventNames.AfterRender, renderCallback);
            PerformanceStatistics.instance.clear();
            mapView.resetFrameNumber();
            mapView.beginAnimation();
        });
    }

    async function ensureRenderFinished(mapViewApp: MapViewApp): Promise<void> {
        const mapView = mapViewApp.mapView;

        return await new Promise<void>((resolve, reject) => {
            const renderCallback = () => {
                if (
                    mapViewApp.mapView.isDynamicFrame ||
                    MapViewUtils.mapViewIsLoading(mapViewApp.mapView)
                ) {
                    mapViewApp.mapView.update();
                } else {
                    mapView.removeEventListener(MapViewEventNames.AfterRender, renderCallback);
                    resolve();
                }
            };

            mapView.addEventListener(MapViewEventNames.AfterRender, renderCallback);

            mapView.update();
        });
    }

    function applyDataFilter(mapView: MapView, showLabels: boolean) {
        for (const dataSource of mapView.dataSources) {
            if (dataSource instanceof VectorTileDataSource) {
                applyDataFilterToDataSource(mapView, dataSource, showLabels);
            }
        }
    }

    function applyDataFilterToDataSource(
        mapView: MapView,
        dataSource: VectorTileDataSource,
        showLabels: boolean
    ) {
        const tileGeometryManager = mapView.tileGeometryManager;
        if (tileGeometryManager === undefined || dataSource === undefined) {
            return;
        }

        tileGeometryManager.clear();
        mapView.clearTileCache(dataSource.name);

        tileGeometryManager.disableKind(GeometryKind.Label, !showLabels);
    }

    export async function measureFlyoverSpline(
        mapViewApp: MapViewApp,
        _locationName: string,
        spline: PerformanceTestData.FlyOverConfiguration,
        numFramesOverride: number | undefined,
        verifyLoaded: boolean,
        use2D: boolean,
        showLabels: boolean,
        laps: number = 1,
        isCancelled?: () => boolean
    ): Promise<SimpleFrameStatistics | undefined> {
        assert(
            spline.controlPoints.length / 2 === spline.zoomLevels.length,
            "Control points and zoom levels must have same number of entries"
        );
        assert(
            spline.controlPoints.length / 2 === spline.tilts.length,
            "Control points and tilts must have same number of entries"
        );

        applyDataFilter(mapViewApp.mapView, showLabels);

        return await new Promise<SimpleFrameStatistics | undefined>((resolve, reject) => {
            const numberOfDrawPoints =
                numFramesOverride !== undefined ? numFramesOverride : spline.numberOfDrawPoints;
            const segments = Math.ceil(numberOfDrawPoints / (spline.controlPoints.length / 2 - 1));

            const controlPoints: THREE.Vector2[] = [];
            for (let j = 0; j < spline.controlPoints.length / 2; j++) {
                controlPoints.push(
                    new THREE.Vector2(spline.controlPoints[j * 2], spline.controlPoints[j * 2 + 1])
                );
            }

            const splinePoints = new THREE.SplineCurve(controlPoints).getPoints(numberOfDrawPoints);

            let controlPoint = 0;
            let zoomLevel = 0.0;
            let zoomIncrement = 0.0;
            let tilt = 0.0;
            let tiltIncrement = 0.0;
            let locations = [];
            for (let i = 0; i < numberOfDrawPoints; i++) {
                const pt = splinePoints[i];
                const lat = pt.x;
                const long = pt.y;
                if (i % segments === 0) {
                    zoomLevel = spline.zoomLevels[controlPoint];
                    tilt = use2D ? 0 : spline.tilts[controlPoint];
                    if (++controlPoint < spline.zoomLevels.length) {
                        zoomIncrement = (spline.zoomLevels[controlPoint] - zoomLevel) / segments;
                        tiltIncrement = use2D ? 0 : (spline.tilts[controlPoint] - tilt) / segments;
                    } else {
                        zoomIncrement = 0;
                        tiltIncrement = 0;
                    }
                } else {
                    zoomLevel += zoomIncrement;
                    tilt += tiltIncrement;
                }
                locations.push({ lat, long, zoomLevel, tilt });
            }

            if (laps > 1) {
                const originalLocations = locations;
                for (let j = 1; j < laps; ++j) {
                    locations = locations.concat(originalLocations);
                }
            }

            executeFlyover(mapViewApp, locations, verifyLoaded, isCancelled).then(frameStats => {
                resolve(frameStats);
            });
        });
    }
}
