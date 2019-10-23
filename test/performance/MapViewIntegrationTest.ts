/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { accessToken } from "@here/harp-examples/config";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView, MapViewEventNames, PerformanceStatistics } from "@here/harp-mapview";
import { debugContext } from "@here/harp-mapview/lib/DebugContext";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { OmvTileDecoder } from "@here/harp-omv-datasource/index-worker";
import { getTestResourceUrl, getWebGLRendererStub } from "@here/harp-test-utils";
import { FontCatalog } from "@here/harp-text-canvas";
import { LoggerManager, PerformanceTimer } from "@here/harp-utils";
import { AbortController } from "abort-controller";
import * as fs from "fs";
import createContext = require("gl");
import { JSDOM } from "jsdom";
import * as path from "path";
import { PNG } from "pngjs";
import * as sinon from "sinon";
import * as THREE from "three";

// tslint:disable:no-var-requires
const { createCanvas } = require("canvas");

// tslint:disable:no-empty

declare const global: any;
describe("MapView integration headless test", () => {
    const ENABLE_HEADLESS_GL = true;
    const ENABLE_HEADLESS_2DCONTEXT = true;
    const CANVAS_WIDTH = 2500;
    const CANVAS_HEIGHT = 1250;

    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let webGlStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let fontStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    const jsdom = new JSDOM();
    const context3d = ENABLE_HEADLESS_GL ? createContext(CANVAS_WIDTH, CANVAS_HEIGHT) : undefined;

    const flatCanvas = ENABLE_HEADLESS_2DCONTEXT
        ? createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT)
        : undefined;
    const context2d = flatCanvas !== undefined ? flatCanvas.getContext("2d") : undefined;

    const logger = LoggerManager.instance.create("MapViewIntegrationTest");

    const FRAMES_TO_RENDER = 50;
    let postFrameCompleteFrame = 0;
    let preFrameCompleteFrame = 0;
    let frameComplete = false;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        if (!ENABLE_HEADLESS_GL) {
            webGlStub = sandbox
                .stub(THREE, "WebGLRenderer")
                .returns(getWebGLRendererStub(sandbox, clearColorStub));
        }
        const image = jsdom.window.document.createElement("img");
        image.setAttribute("width", "1");
        image.setAttribute("height", "1");
        const emptyTexture = new THREE.Texture(image);
        fontStub = sandbox.stub(FontCatalog, "loadTexture").returns(Promise.resolve(emptyTexture));

        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = {
                window: { devicePixelRatio: 10 },
                location: { href: "" }
            };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = () => {};
            theGlobal.performance = {
                now: () => {
                    return PerformanceTimer.now();
                }
            };
            theGlobal.document = jsdom.window.document;
            // Override the AbortController that is given by the web browser.
            theGlobal.AbortController = AbortController;
        }
        addEventListenerSpy = sinon.stub();
        removeEventListenerSpy = sinon.stub();

        canvas = ({
            clientWidth: CANVAS_WIDTH,
            clientHeight: CANVAS_HEIGHT,
            addEventListener: addEventListenerSpy,
            removeEventListener: removeEventListenerSpy,
            getContext(type: string) {
                if (type === "2d" && ENABLE_HEADLESS_2DCONTEXT) {
                    return context2d;
                } else if (ENABLE_HEADLESS_GL) {
                    return context3d;
                }
                return undefined;
            }
        } as unknown) as HTMLCanvasElement;
    });
    afterEach(() => {
        sandbox.restore();
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.cancelAnimationFrame;
            delete global.navigator;
            delete global.performance;
        }
    });

    function writePngOfContext3d() {
        if (context3d === undefined) {
            return;
        }
        const png = new PNG({
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT
        });
        try {
            const pixels = Buffer.alloc(4 * CANVAS_WIDTH * CANVAS_HEIGHT);
            context3d.readPixels(
                0,
                0,
                CANVAS_WIDTH,
                CANVAS_HEIGHT,
                context3d.RGBA,
                context3d.UNSIGNED_BYTE,
                pixels
            );
            png.data = pixels;
            const out = fs.createWriteStream(path.join(__dirname, "3dcontext.png"));
            out.on("finish", () => logger.log("The 3d context PNG was created."));
            png.pack()
                .pipe(out)
                .on("close", () => {
                    out.close();
                    context3d.getExtension("STACKGL_destroy_context")!.destroy();
                });
        } catch (err) {
            logger.error(err);
        }
    }

    function writePngOfContext2d() {
        if (flatCanvas === undefined) {
            return;
        }
        const out = fs.createWriteStream(path.join(__dirname, "2dcontext.png"));
        const stream = flatCanvas.createPNGStream();
        stream.pipe(out);
        out.on("finish", () => logger.log("The 2d context PNG was created."));
    }

    function render(map: MapView, done: Mocha.Done) {
        map.renderSync();
        preFrameCompleteFrame++;
        if (!frameComplete || postFrameCompleteFrame++ < FRAMES_TO_RENDER) {
            setTimeout(render, 0, map, done);
        } else {
            PerformanceStatistics.instance.log();

            if (ENABLE_HEADLESS_GL) {
                writePngOfContext3d();
            }
            if (ENABLE_HEADLESS_2DCONTEXT) {
                writePngOfContext2d();
            }
            done();
        }
    }
    it("load map, wait for FrameComplete then render FRAMES_TO_RENDER frames", done => {
        debugContext.setValue("DEBUG_SCREEN_COLLISIONS", ENABLE_HEADLESS_2DCONTEXT);
        const map = new MapView({
            canvas,
            theme: getTestResourceUrl("@here/harp-map-theme", "resources/berlin_tilezen_base.json"),
            synchronousRendering: true,
            enableStatistics: true,
            collisionDebugCanvas: ENABLE_HEADLESS_2DCONTEXT ? canvas : undefined
        });
        map.setCacheSize(1000, 1000);
        map.addEventListener(MapViewEventNames.FrameComplete, event => {
            frameComplete = true;
            logger.log("Finished frame complete.");
            PerformanceStatistics.instance.log();
            PerformanceStatistics.instance.clear();
        });
        map.addEventListener(MapViewEventNames.AfterRender, event => {
            logger.log(
                "Finished rendering frame: " +
                    (postFrameCompleteFrame === 0
                        ? "before FrameComplete: " + preFrameCompleteFrame
                        : "after FrameComplete: " + postFrameCompleteFrame)
            );
        });

        const NY = new GeoCoordinates(52.0, 12);
        map.lookAt(NY, 1098767, 0);

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.XYZMVT,
            styleSetName: "tilezen_labels",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            decoder: new OmvTileDecoder(),
            storageLevelOffset: 1
        });
        map.addDataSource(omvDataSource);

        render(map, done);
    });
});
