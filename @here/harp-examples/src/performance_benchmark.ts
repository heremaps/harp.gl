/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Theme } from "@here/harp-datasource-protocol";
import {
    MapViewPowerPreference,
    SimpleFrameStatistics,
    ThemeLoader,
    WorkerBasedDecoder
} from "@here/harp-mapview";
import { getAppBaseUrl, LoggerManager } from "@here/harp-utils";
import { GUI, GUIController } from "dat.gui";

import { PerformanceTestData } from "../lib/PerformanceConfig";
import { PerformanceUtils } from "../lib/PerformanceUtils";

interface ThemeList {
    [name: string]: string;
}
// Theme list populated by webpack.config.js
declare const THEMES: ThemeList;

const logger = LoggerManager.instance.create("PerformanceUtils");

const NAME_NUM_DECODER_OPTION = "Num Decoders";
const NAME_POWER_PREFERENCE_OPTION = "Power Preference";

function getDecoderCount(str: string): number | undefined {
    const numDecodersStr = encodeURIComponent(NAME_NUM_DECODER_OPTION) + "=";

    const strIndex = str.indexOf(numDecodersStr);

    if (strIndex > 0) {
        const numberSubStr = str.substr(strIndex + numDecodersStr.length);
        const numDecodersParam = parseInt(numberSubStr, 10);
        if (isNaN(numDecodersParam)) {
            logger.warn("Illegal NAN for 'Num Decoders'", numberSubStr);
            return undefined;
        }
        if (numDecodersParam < -1 || numDecodersParam > 32) {
            logger.log(
                `Illegal value for 'Num Decoders' ${numDecodersParam}. ` +
                    "Setting default value for DecoderCount"
            );
            return undefined;
        }
        if (numDecodersParam === -1) {
            return undefined;
        }
        logger.log("Setting DecoderCount to", numDecodersParam);
        return numDecodersParam;
    }
    return undefined;
}

function getPowerPreference(str: string): string | undefined {
    const powerPreferenceOptionString = encodeURIComponent(NAME_POWER_PREFERENCE_OPTION) + "=";
    const strIndex = str.indexOf(powerPreferenceOptionString);

    if (strIndex > 0) {
        const endIndex = str.indexOf("&", strIndex + 1);
        const optionSubStr = str.substr(
            strIndex + powerPreferenceOptionString.length,
            endIndex > 0 ? endIndex - strIndex : undefined
        );

        logger.log("Power preference initialized to", optionSubStr);
        return optionSubStr;
    }
    return undefined;
}

function updateUrlOptions() {
    const numDecodersOptionValueStr =
        decoderCount !== undefined ? decoderCount.toFixed(0) : undefined;

    let searchStr = "";

    if (numDecodersOptionValueStr !== undefined) {
        searchStr +=
            encodeURIComponent(NAME_NUM_DECODER_OPTION) +
            "=" +
            encodeURIComponent(numDecodersOptionValueStr);
    }

    if (powerPreference !== undefined && powerPreference !== "Default") {
        if (searchStr.length > 0) {
            searchStr += "&";
        }
        searchStr +=
            encodeURIComponent(NAME_POWER_PREFERENCE_OPTION) +
            "=" +
            encodeURIComponent(powerPreference);
    }

    if (parent.window.location.search !== searchStr) {
        parent.window.location.search = searchStr;
    }
}

let decoderCount = getDecoderCount(parent.window.location.search);
let powerPreference: string | undefined = getPowerPreference(parent.window.location.search);

const powerPreferenceMap: Map<string, MapViewPowerPreference> = new Map();
powerPreferenceMap.set("Default", MapViewPowerPreference.Default);
powerPreferenceMap.set("LowPower", MapViewPowerPreference.LowPower);
powerPreferenceMap.set("HighPerformance", MapViewPowerPreference.HighPerformance);

// Append the HTML code for the table styles.
document.head.innerHTML += `
<style>

#canvasDiv {
    pointer-events: none;
}

.labelLine {
    height: 2px;
    text-align: left;
}

.label,
.value {
    font-family: Arial, Helvetica, sans-serif;
    line-height: 0.3;
    font-size: small;
}

.label {
    display: inline-block;
    width: 10em;
}

table {
    border-collapse: collapse;
    width: 100%;
}

table,
th,
td {
    border: 1px solid black;
    font-family: Arial, Helvetica, sans-serif;
    font-size: small;
}

th,
td {
    padding: 1px;
    text-align: left;
}

th {
    background-color: #b9dfbc;
}

.th-row {
    background-color: #809982;
}

tr:hover {
    background-color: #6fceeb;
}

th:hover {
    background-color: #447f90;
}

#tableDiv {
    padding: 10px;
    width: 100%;
    background-color: #f0fef1;
    display: none;
    overflow: scroll;
}

#copyrightNotice {
    position: absolute;
    right: 0;
    bottom: 0;
    background-color: #f0fef1;
    z-index: 100;
    padding: 2px 5px;
    font-family: sans-serif;
    font-size: 0.8em;
    font-weight: normal;
}
</style>
`;

// Add the HTML code for the table.
const canvasParent = document.getElementById("mapCanvas")!.parentNode! as HTMLElement;
canvasParent.innerHTML += `
<div id="tableDiv">
<p class="labelLine">
    <span class="label">Benchmark:</span>
    <span id="testTitle" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">Location:</span>
    <span id="testLocation" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">Canvas Size:</span>
    <span id="testCanvasSize" class="value"></span>
</p>

<p class="labelLine">
    <span class="label">Theme:</span>
    <span id="theme" class="value"></span>
</p>

<p class="labelLine">
    <span class="label" style="">PixelRatio:</span>
    <span id="pixelRatio" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">2D:</span>
    <span id="2D" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">ShowLabels:</span>
    <span id="showLabels" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">FpsLimit:</span>
    <span id="fpsLimit" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">NumDecoders:</span>
    <span id="numDecoders" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">PhasedLoading:</span>
    <span id="phasedLoading" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">Cancelled:</span>
    <span id="cancelled" class="value"></span>
</p>

<p class="labelLine">
    <span class="label">Start:</span>
    <span id="testStart" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">End:</span>
    <span id="testEnd" class="value"></span>
</p>
<p class="labelLine">
    <span class="label">Duration:</span>
    <span id="testDuration" class="value"></span>
</p>
<table id="resultTable"> </table>
</div>
`;

export namespace PerformanceBenchmark {
    let mapViewApp: PerformanceUtils.MapViewApp;

    let gui: GUI;
    let benchmarksFolder: GUI;
    let openAndZoomFolder: GUI;
    let flyOversFolder: GUI;
    let cancelButton: GUIController;
    let isCancelled: boolean = false;

    let use2D: boolean = false;
    let showLabels: boolean = true;
    let disableFading: boolean = false;
    let testStart: Date;
    let testEnd: Date;
    let title: string;
    let location: string;
    let theme: string;
    let canvasSize: string;
    let pixelRatio: number | undefined;
    let fpsLimit: number = 0;
    let flyoverNumRuns: number = 1;
    let flyoverNumFrames: number | undefined;
    let numDecoders: number | undefined;

    let latestResult: SimpleFrameStatistics | undefined;

    function startTest(testTitle: string, testLocation: string) {
        isCancelled = false;
        benchmarksFolder.close();
        title = testTitle;
        location = testLocation;
        testStart = new Date();

        (cancelButton as any).domElement.setAttribute("disabled", "");

        mapViewApp.mapView.disableFading = disableFading;

        hideTable();
    }

    function finishTest() {
        if (benchmarksFolder.closed) {
            benchmarksFolder.open();
        }

        (cancelButton as any).domElement.removeAttribute("disabled");

        testEnd = new Date();
        showTable();
    }

    function cancelRunningTest() {
        if (gui.closed) {
            gui.open();
        }
        logger.warn("Canceling running benchmark");
        isCancelled = true;
    }

    function checkIfCancelled() {
        return isCancelled;
    }

    async function openMapBerlin() {
        startTest("Show Map", "Berlin");
        latestResult = await PerformanceUtils.measureOpenMapAtLocation(
            mapViewApp,
            52.52,
            13.405,
            1600,
            showLabels
        );
        finishTest();
    }

    async function openMapParis() {
        startTest("Show Map", "Paris");
        latestResult = await PerformanceUtils.measureOpenMapAtLocation(
            mapViewApp,
            48.8566,
            2.3522,
            1600,
            showLabels
        );
        finishTest();
    }

    async function openMapBellinzona() {
        startTest("Show Map", "Bellinzona");
        latestResult = await PerformanceUtils.measureOpenMapAtLocation(
            mapViewApp,
            46.2177542,
            9.0448866,
            10000,
            showLabels
        );
        finishTest();
    }

    async function openMapIzmir() {
        startTest("Show Map", "Izmir");
        latestResult = await PerformanceUtils.measureOpenMapAtLocation(
            mapViewApp,
            38.40389671,
            27.15224164,
            5000,
            showLabels
        );
        finishTest();
    }

    async function doZoom(label: string, zoomConfig: PerformanceTestData.ZoomLevelConfiguration) {
        startTest("Load and Render All Zoom Levels", label);
        latestResult = await PerformanceUtils.zoomLevelTest(
            mapViewApp,
            label,
            zoomConfig,
            use2D,
            showLabels,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverNY() {
        startTest("FlyOver", "NewYork");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_NewYork",
            PerformanceTestData.NEW_YORK_FLYOVER,
            flyoverNumFrames,
            false,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverNYZl17() {
        startTest("FlyOver", "NewYork Zl17");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_NewYork_Zl17",
            PerformanceTestData.NEW_YORK_FLYOVER_ZL17,
            flyoverNumFrames,
            false,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverNyLoaded() {
        startTest("FlyOver (All frames loaded)", "NewYork");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_NewYork_Loaded",
            PerformanceTestData.NEW_YORK_FLYOVER,
            flyoverNumFrames,
            true,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverParis() {
        startTest("FlyOver", "Paris");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_Paris",
            PerformanceTestData.PARIS_FLYOVER,
            flyoverNumFrames,
            false,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverParisLoaded() {
        startTest("FlyOver (All frames loaded)", "Paris");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_Paris_Loaded",
            PerformanceTestData.PARIS_FLYOVER,
            flyoverNumFrames,
            true,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverParisLondon() {
        startTest("FlyOver", "Paris/London");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_Paris_London",
            PerformanceTestData.PARIS__LONDON_FLYOVER,
            flyoverNumFrames,
            false,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverParisLondonLoaded() {
        startTest("FlyOver (All frames loaded)", "Paris/London");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_Paris_London_Loaded",
            PerformanceTestData.PARIS__LONDON_FLYOVER,
            flyoverNumFrames,
            true,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverEurope() {
        startTest("FlyOver", "Europe");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_Europe",
            PerformanceTestData.EUROPE_FLYOVER,
            flyoverNumFrames,
            false,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function flyoverEuropeLoaded() {
        startTest("FlyOver (All frames loaded)", "Europe");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "Flyover_Europe_Loaded",
            PerformanceTestData.EUROPE_FLYOVER,
            flyoverNumFrames,
            true,
            use2D,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function ZoomInBerlin() {
        startTest("ZoomIn", "Berlin");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "ZoomIn_Berlin",
            PerformanceTestData.BERLIN_ZOOM_IN,
            flyoverNumFrames,
            false,
            true,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function ZoomInOutParis() {
        startTest("ZoomInOut", "Paris");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "ZoomInOut_Paris",
            PerformanceTestData.PARIS_ZOOM_IN_AND_OUT,
            flyoverNumFrames,
            false,
            true,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    async function ZoomInOutParis2() {
        startTest("ZoomInOut2", "Paris");
        latestResult = await PerformanceUtils.measureFlyoverSpline(
            mapViewApp,
            "ZoomInOut_Paris2",
            PerformanceTestData.PARIS_ZOOM_IN_AND_OUT_2,
            flyoverNumFrames,
            false,
            true,
            showLabels,
            flyoverNumRuns,
            checkIfCancelled
        );
        finishTest();
    }

    function initGui() {
        gui = new GUI({ width: 300 });
        let settingUpGui = true;

        const guiOptions = {
            Theme: THEMES,
            PixelRatio: {
                default: undefined,
                "1.5": 1.5,
                "1.0": 1.0,
                "0.5": 0.5
            },
            CanvasSize: {
                default: undefined,
                "1100×900": "1100×900",
                "640×400": "640×400",
                "1024×768": "1024×768",
                "1024×1024": "1024×1024",
                "1280×720": "1280×720",
                "1680×1024": "1680×1024",
                "1920×1080": "1920×1080",
                "2560×1440": "2560×1440",
                "2560×1600": "2560×1600"
            },
            PowerPreference: {
                Default: "Default",
                LowPower: "LowPower",
                HighPerformance: "HighPerformance"
            },
            FpsLimit: {
                "No Limit": 0,
                "1": 1,
                "2": 2,
                "5": 5,
                "10": 10,
                "15": 15,
                "20": 20,
                "30": 30,
                "60": 60
            },
            Use2D: false,
            DisableFading: false,
            ShowLabels: true,
            NumRuns: {
                "1": 1,
                "5": 5,
                "10": 10,
                "25": 25,
                "50": 50,
                "100": 100,
                "1000": 1000
            },
            NumFrames: {
                default: undefined,
                "10": 10,
                "25": 25,
                "50": 50,
                "100": 100,
                "250": 250,
                "500": 500,
                "1000": 1000,
                "2500": 2500,
                "5000": 5000,
                "10000": 10000
            },
            NumDecoders: {
                default: undefined,
                "1": 1,
                "2": 2,
                "3": 3,
                "4": 4,
                "6": 6,
                "8": 8
            },
            throttlingEnabled: mapViewApp.mapView.throttlingEnabled,
            maxTilesPerFrame: mapViewApp.mapView.visibleTileSet.maxTilesPerFrame,
            PhasedLoading: false,
            Berlin: () => {
                openMapBerlin();
            },
            Paris: () => {
                openMapParis();
            },
            Bellinzona: () => {
                openMapBellinzona();
            },
            Izmir: () => {
                openMapIzmir();
            },
            ZoomNY: () => {
                doZoom("Zoom_NewYork", PerformanceTestData.NEW_YORK_ZOOM);
            },
            ZoomParis: () => {
                doZoom("Zoom_Paris", PerformanceTestData.PARIS_ZOOM);
            },
            ZoomBellinzona: () => {
                doZoom("Zoom_Bellinzona", PerformanceTestData.BELLINZONA_ZOOM);
            },
            ZoomIzmir: () => {
                doZoom("Zoom_Izmir", PerformanceTestData.IZMIR_ZOOM);
            },
            FlyOverNY: () => {
                flyoverNY();
            },
            FlyOverNYZl17: () => {
                flyoverNYZl17();
            },
            FlyOverNYLoaded: () => {
                flyoverNyLoaded();
            },
            FlyOverParis: () => {
                flyoverParis();
            },
            FlyOverParisLoaded: () => {
                flyoverParisLoaded();
            },
            FlyOverParisLondon: () => {
                flyoverParisLondon();
            },
            FlyOverParisLondonLoaded: () => {
                flyoverParisLondonLoaded();
            },
            FlyOverEurope: () => {
                flyoverEurope();
            },
            FlyOverEuropeLoaded: () => {
                flyoverEuropeLoaded();
            },
            ZoomInBerlin: () => {
                ZoomInBerlin();
            },
            ZoomInOutParis: () => {
                ZoomInOutParis();
            },
            ZoomInOutParis2: () => {
                ZoomInOutParis2();
            },
            Cancel: () => {
                cancelRunningTest();
            },
            HideResults: () => {
                hideTable();
            },
            SaveResults: () => {
                saveTable();
            }
        };

        benchmarksFolder = gui.addFolder("Benchmarks");

        benchmarksFolder
            .add(guiOptions, "Theme", guiOptions.Theme)
            .onChange((themeUrl: string) => {
                theme = themeUrl;
                const fontUriResolver = {
                    resolveUri: (uri: string) => {
                        // FIXME: Style file should contain proper URI with schema like font://...
                        if (uri === "fonts/Default_FontCatalog.json") {
                            return getAppBaseUrl() + "resources/fonts/Default_FontCatalog.json";
                        } else {
                            return uri;
                        }
                    }
                };

                ThemeLoader.load(themeUrl, { uriResolver: fontUriResolver }).then(
                    async (newTheme: Theme) => {
                        mapViewApp.mapView.clearTileCache();
                        await mapViewApp.mapView.setTheme(newTheme);
                    }
                );
            })
            .setValue(THEMES.default);

        benchmarksFolder
            .add(guiOptions, "CanvasSize", guiOptions.CanvasSize)
            .onChange((size: string | undefined) => {
                const theCanvasElement = document.getElementById("mapCanvas")! as HTMLElement;
                const canvasDiv = theCanvasElement.parentNode! as HTMLElement;
                if (size !== undefined && size !== "undefined") {
                    const w = size.split("×")[0];
                    const h = size.split("×")[1];
                    canvasDiv.style.width = w + "px";
                    canvasDiv.style.height = h + "px";
                    canvasDiv.style.position = "absolute";
                    mapViewApp.mapView.resize(
                        theCanvasElement.clientWidth,
                        theCanvasElement.clientHeight
                    );
                } else {
                    canvasDiv.style.removeProperty("position");
                    canvasDiv.style.removeProperty("width");
                    canvasDiv.style.removeProperty("height");
                    mapViewApp.mapView.resize(
                        theCanvasElement.clientWidth,
                        theCanvasElement.clientHeight
                    );
                }
                canvasSize = `${theCanvasElement.clientWidth}×${theCanvasElement.clientHeight}`;
            })
            .setValue(undefined);

        benchmarksFolder
            .add(guiOptions, "PowerPreference", guiOptions.PowerPreference)
            .onChange((powerPreferenceValue: string) => {
                powerPreference = powerPreferenceValue;
                if (!settingUpGui) {
                    alert("New value for 'PowerPreference' active after browser reload");
                    updateUrlOptions();
                }
            })
            .setValue(powerPreference === undefined ? "Default" : powerPreference);

        benchmarksFolder
            .add(guiOptions, "NumDecoders", guiOptions.NumDecoders)
            .onChange((numDecodersString: string | undefined) => {
                decoderCount =
                    numDecodersString !== undefined && numDecodersString !== "undefined"
                        ? parseFloat(numDecodersString)
                        : undefined;
                if (!settingUpGui) {
                    alert("New value for 'NumDecoders' active after browser reload");
                }
                updateUrlOptions();
            })
            .setValue(decoderCount === undefined ? undefined : decoderCount.toFixed(0));

        benchmarksFolder
            .add(guiOptions, "throttlingEnabled")
            .onFinishChange(value => {
                mapViewApp.mapView.throttlingEnabled = value;
            })
            .listen();

        benchmarksFolder
            .add(guiOptions, "PixelRatio", guiOptions.PixelRatio)
            .onChange((ratioString: string) => {
                const ratio = ratioString === "undefined" ? undefined : parseFloat(ratioString);
                pixelRatio = ratio;
                mapViewApp.mapView.dynamicPixelRatio = ratio;
            })
            .setValue("undefined");

        benchmarksFolder
            .add(guiOptions, "FpsLimit", guiOptions.FpsLimit)
            .onChange((limit: number) => {
                fpsLimit = limit;
                mapViewApp.mapView.maxFps = limit;
            })
            .setValue(0);

        benchmarksFolder
            .add(guiOptions, "Use2D", guiOptions.Use2D)
            .onChange((d2: boolean | undefined) => {
                use2D = d2 === true;
            });

        benchmarksFolder
            .add(guiOptions, "DisableFading", guiOptions.DisableFading)
            .onChange((disable: boolean | undefined) => {
                disableFading = disable === true;
            });

        benchmarksFolder
            .add(guiOptions, "ShowLabels", guiOptions.ShowLabels)
            .onChange((labels: boolean | undefined) => {
                showLabels = labels === true;
            });

        benchmarksFolder
            .add(guiOptions, "maxTilesPerFrame", 0, 10, 1)
            .onFinishChange(value => {
                mapViewApp.mapView.visibleTileSet.maxTilesPerFrame = value;
            })
            .listen();

        openAndZoomFolder = benchmarksFolder.addFolder("OpenAndZoom");

        openAndZoomFolder.add(guiOptions, "Berlin");
        openAndZoomFolder.add(guiOptions, "Paris");
        openAndZoomFolder.add(guiOptions, "Bellinzona");
        openAndZoomFolder.add(guiOptions, "Izmir");
        openAndZoomFolder.add(guiOptions, "ZoomNY");
        openAndZoomFolder.add(guiOptions, "ZoomParis");
        openAndZoomFolder.add(guiOptions, "ZoomBellinzona");
        openAndZoomFolder.add(guiOptions, "ZoomIzmir");

        flyOversFolder = benchmarksFolder.addFolder("FlyOvers");
        flyOversFolder
            .add(guiOptions, "NumRuns", guiOptions.NumRuns)
            .onChange((numRuns: number) => {
                flyoverNumRuns = numRuns;
            })
            .setValue(1);
        flyOversFolder
            .add(guiOptions, "NumFrames", guiOptions.NumFrames)
            .onChange((numFrames: number) => {
                flyoverNumFrames = numFrames;
            })
            .setValue(undefined);

        flyOversFolder.add(guiOptions, "ZoomInBerlin");
        flyOversFolder.add(guiOptions, "ZoomInOutParis");
        flyOversFolder.add(guiOptions, "ZoomInOutParis2");
        flyOversFolder.add(guiOptions, "FlyOverNY");
        flyOversFolder.add(guiOptions, "FlyOverNYZl17");
        flyOversFolder.add(guiOptions, "FlyOverNYLoaded");
        flyOversFolder.add(guiOptions, "FlyOverParis");
        flyOversFolder.add(guiOptions, "FlyOverParisLoaded");
        flyOversFolder.add(guiOptions, "FlyOverParisLondon");
        flyOversFolder.add(guiOptions, "FlyOverParisLondonLoaded");
        flyOversFolder.add(guiOptions, "FlyOverEurope");
        flyOversFolder.add(guiOptions, "FlyOverEuropeLoaded");

        benchmarksFolder.open();
        openAndZoomFolder.open();
        flyOversFolder.open();

        cancelButton = gui.add(guiOptions, "Cancel");

        gui.add(guiOptions, "HideResults");
        gui.add(guiOptions, "SaveResults");

        (cancelButton as any).domElement.setAttribute("disabled", "");

        settingUpGui = false;
    }

    async function init() {
        mapViewApp = await PerformanceUtils.initializeMapView(
            "mapCanvas",
            ["OMV"],
            decoderCount,
            powerPreferenceMap.get(powerPreference === undefined ? "Default" : powerPreference),
            undefined,
            { resource: THEMES.default }
        );
        if (mapViewApp.mainDataSource !== undefined) {
            if (mapViewApp.mainDataSource.decoder instanceof WorkerBasedDecoder) {
                numDecoders = mapViewApp.mainDataSource.decoder.workerCount;
            }
        }

        initGui();
    }

    function showTable() {
        createTable(latestResult);

        const tableDiv = document.getElementById("tableDiv")!;
        tableDiv.style.display = "block";
    }

    function hideTable() {
        const tableDiv = document.getElementById("tableDiv")!;
        tableDiv.style.display = "none";
    }

    function saveTable() {
        const stats = latestResult;

        if (stats) {
            let resultCSV =
                "Name, Avg, Min, Max, Median, Med 75, Med 90, Med 95, Med 97, Med 99, Med 999\n";

            const frameStatsStrings = Array.from(stats.frameStats!.keys()).sort();
            for (const stat of frameStatsStrings) {
                const frameStat = stats.frameStats!.get(stat)!;

                const row = `${stat}, ${valueString(frameStat.avg)}, ${valueString(
                    frameStat.min
                )}, ${valueString(frameStat.max)}, ${valueString(frameStat.median)}, ${valueString(
                    frameStat.median75
                )}, ${valueString(frameStat.median90)}, ${valueString(
                    frameStat.median95
                )}, ${valueString(frameStat.median97)}, ${valueString(
                    frameStat.median99
                )}, ${valueString(frameStat.median999)}\n`;
                resultCSV += row;
            }
            const type = "text/csv";
            const blob = new Blob([resultCSV], { type });
            const a = document.createElement("a");
            const url = URL.createObjectURL(blob);
            a.download = `results.csv`;
            a.href = url;
            a.dispatchEvent(
                new MouseEvent(`click`, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
        }
    }

    const million = 1024 * 1024;
    const digits = 2;

    function valueString(value: number): string {
        const isHuge = value > million;
        if (isHuge) {
            value = value / million;
        }

        let str = value.toFixed(digits);
        while (str.length > 1 && str.includes(".") && (str.endsWith("0") || str.endsWith("."))) {
            str = str.substr(0, str.length - 1);
        }

        return str + (isHuge ? " M" : "");
    }

    function addHeaderCell(row: HTMLTableRowElement, text: string, cssClass?: string) {
        const cell = document.createElement("th");
        if (cssClass !== undefined) {
            cell.className = cssClass;
        }
        cell.appendChild(document.createTextNode(text));
        row.appendChild(cell);
    }

    function addCell(row: HTMLTableRowElement, text: string) {
        const cell = document.createElement("td");
        cell.appendChild(document.createTextNode(text));
        row.appendChild(cell);
    }

    function createTable(stats: SimpleFrameStatistics | undefined) {
        document.getElementById("testTitle")!.innerHTML = title;
        document.getElementById("testLocation")!.innerHTML = location;
        document.getElementById("testCanvasSize")!.innerHTML = canvasSize;
        document.getElementById("pixelRatio")!.innerHTML = String(pixelRatio);
        document.getElementById("theme")!.innerHTML = theme;
        document.getElementById("2D")!.innerHTML = String(use2D);
        document.getElementById("showLabels")!.innerHTML = String(showLabels);
        document.getElementById("fpsLimit")!.innerHTML = String(fpsLimit);
        document.getElementById("numDecoders")!.innerHTML = String(numDecoders);
        document.getElementById("cancelled")!.innerHTML = String(isCancelled);

        document.getElementById("testStart")!.innerHTML = testStart.toLocaleTimeString();
        document.getElementById("testEnd")!.innerHTML = testEnd.toLocaleTimeString();
        document.getElementById("testDuration")!.innerHTML = (
            (testEnd.valueOf() - testStart.valueOf()) /
            1000
        ).toFixed(2);

        const tableDiv = document.getElementById("tableDiv")!;
        const table = document.getElementById("resultTable")! as HTMLTableElement;
        table.innerHTML = "";

        if (stats !== undefined && stats.frameStats !== undefined) {
            const frameStatsStrings = Array.from(stats.frameStats!.keys()).sort();

            let headerRow = table.insertRow();

            if (stats.appResults.size > 0) {
                addHeaderCell(headerRow, "Name", "th-row");
                addHeaderCell(headerRow, "Value", "th-row");

                for (const appValue of stats.appResults) {
                    const tr = table.insertRow();

                    addHeaderCell(tr, appValue[0]);
                    addCell(tr, valueString(appValue[1]));
                }

                headerRow = table.insertRow();
                headerRow = table.insertRow();
            }

            addHeaderCell(headerRow, "Name", "th-row");
            addHeaderCell(headerRow, "Avg", "th-row");
            addHeaderCell(headerRow, "Min", "th-row");
            addHeaderCell(headerRow, "Max", "th-row");
            addHeaderCell(headerRow, "Median", "th-row");
            addHeaderCell(headerRow, "Med 75", "th-row");
            addHeaderCell(headerRow, "Med 90", "th-row");
            addHeaderCell(headerRow, "Med 95", "th-row");
            addHeaderCell(headerRow, "Med 97", "th-row");
            addHeaderCell(headerRow, "Med 99", "th-row");
            addHeaderCell(headerRow, "Med 999", "th-row");

            for (const stat of frameStatsStrings) {
                const frameStat = stats.frameStats!.get(stat)!;

                const tr = table.insertRow();

                addHeaderCell(tr, stat);

                addCell(tr, valueString(frameStat.avg));
                addCell(tr, valueString(frameStat.min));
                addCell(tr, valueString(frameStat.max));
                addCell(tr, valueString(frameStat.median));
                addCell(tr, valueString(frameStat.median75));
                addCell(tr, valueString(frameStat.median90));
                addCell(tr, valueString(frameStat.median95));
                addCell(tr, valueString(frameStat.median97));
                addCell(tr, valueString(frameStat.median99));
                addCell(tr, valueString(frameStat.median999));
            }
        }

        if (
            stats !== undefined &&
            stats.zoomLevelData !== undefined &&
            stats.zoomLevelData.size > 0
        ) {
            if (stats.zoomLevelLabels !== undefined) {
                table.insertRow();
                const tr = table.insertRow();
                addHeaderCell(tr, "Value", "th-row");
                for (const label of stats.zoomLevelLabels) {
                    addHeaderCell(tr, label, "th-row");
                }
            }

            const zoomLevelEntries = Array.from(stats.zoomLevelData.keys()).sort();

            const firstZoomLevelEntry = stats.zoomLevelData.get(zoomLevelEntries[0])!;

            if (Array.isArray(firstZoomLevelEntry) && firstZoomLevelEntry.length < 30) {
                table.insertRow();
                table.insertRow();

                for (const stat of zoomLevelEntries) {
                    const value = stats.zoomLevelData.get(stat)!;

                    const tr = table.insertRow();

                    addHeaderCell(tr, stat);

                    if (Array.isArray(value)) {
                        for (const v of value) {
                            addCell(tr, valueString(v));
                        }
                    } else {
                        addCell(tr, valueString(value));
                    }
                }
            }
        }

        tableDiv.style.display = "block";
    }

    init();
}
