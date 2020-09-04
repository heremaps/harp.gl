/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    CopyrightInfo,
    LookAtParams,
    MapView,
    MapViewEventNames,
    TextureLoader,
    Tile
} from "@here/harp-mapview";
import { RenderingTestHelper, waitForEvent } from "@here/harp-test-utils";
import { WebTileDataSource, WebTileDataSourceOptions } from "@here/harp-webtile-datasource";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("MapView + WebTileData rendering test", function() {
    let mapView: MapView;

    afterEach(() => {
        if (mapView !== undefined) {
            mapView.dispose();
        }
    });

    interface WebTileTestOptions {
        mochaTest: Mocha.Context;
        testImageName: string;
        getTexture: (tile: Tile) => Promise<[THREE.Texture, CopyrightInfo[]]>;
        lookAt?: Partial<LookAtParams>;
        webTileOptions?: Partial<WebTileDataSourceOptions>;
        runBeforeFinish?: () => void;
    }

    async function webTileTest(options: WebTileTestOptions) {
        const ibct = new RenderingTestHelper(options.mochaTest, { module: "mapview" });
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;

        mapView = new MapView({
            canvas,
            theme: {},
            preserveDrawingBuffer: true,
            pixelRatio: 1
        });

        const defaultLookAt: Partial<LookAtParams> = {
            target: { lat: 53.3, lng: 14.6 },
            zoomLevel: 2,
            tilt: 0,
            heading: 0
        };

        const lookAt: LookAtParams = { ...defaultLookAt, ...options.lookAt } as any;

        mapView.lookAt(lookAt);
        // Shutdown errors cause by firefox bug
        mapView.renderer.getContext().getShaderInfoLog = (x: any) => {
            return "";
        };

        const webTileDataSource = new WebTileDataSource(
            Object.assign(
                {
                    dataProvider: {
                        getTexture: options.getTexture
                    },
                    name: "webtile"
                },
                options.webTileOptions
            )
        );

        mapView.addDataSource(webTileDataSource);

        if (options.runBeforeFinish !== undefined) {
            await options.runBeforeFinish();
        }

        await waitForEvent(mapView, MapViewEventNames.FrameComplete);

        await ibct.assertCanvasMatchesReference(canvas, options.testImageName);
    }

    it("renders webtile from loaded texture png", async function() {
        this.timeout(5000);

        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-clover",
            getTexture: (tile: Tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            }
        });
    });

    it("renders webtile from loaded texture with opacity", async function() {
        this.timeout(5000);

        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-opacity",
            getTexture: (tile: Tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            },
            webTileOptions: { renderingOptions: { opacity: 0.5 } }
        });
    });

    it("renders webtile from loaded texture png with alpha", async function() {
        this.timeout(5000);

        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-questionmark",
            getTexture: (tile: Tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                    []
                ]);
            }
        });
    });

    it("renders webtile from loaded texture png with alpha, with minDataLevel", async function() {
        this.timeout(5000);

        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-min-data-level",
            getTexture: (tile: Tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                    []
                ]);
            },
            webTileOptions: { minDataLevel: 3 }
        });
    });

    it("renders webtile from loaded texture png with alpha, with minDisplayLevel", async function() {
        this.timeout(5000);

        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-min-display-level",
            getTexture: (tile: Tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                    []
                ]);
            },
            webTileOptions: { minDisplayLevel: 3 }
        });
    });

    it("renders 2 layered webTileDataSources", async function() {
        this.timeout(5000);

        const runBeforeFinish = async function() {
            const webTileDataSource = new WebTileDataSource({
                renderingOptions: { transparent: true },
                minDataLevel: 3,
                dataProvider: {
                    getTexture: (tile: Tile) => {
                        return Promise.all([
                            new TextureLoader().load("../dist/resources/replacementCharacter.png"),
                            []
                        ]);
                    }
                },
                name: "webtile-below"
            });

            await mapView.addDataSource(webTileDataSource);
        };

        await webTileTest({
            mochaTest: this,
            testImageName: "webtile-layered",
            getTexture: (tile: Tile) => {
                return Promise.all([
                    new TextureLoader().load("../dist/resources/wests_textures/clover.png"),
                    []
                ]);
            },
            runBeforeFinish
        });
    });
});
