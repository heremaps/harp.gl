/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Theme } from "@here/harp-datasource-protocol";
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { loadTestResource } from "@here/harp-test-utils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { FontCatalog, TextLayoutParameters, TextRenderParameters } from "@here/harp-text-canvas";
import { LoggerManager, PerformanceTimer } from "@here/harp-utils";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as THREE from "three";
import { debugContext } from "../../lib/DebugContext";
import { MapView } from "../../lib/MapView";
import { ScreenCollisions, ScreenCollisionsDebug } from "../../lib/ScreenCollisions";
import { ScreenProjector } from "../../lib/ScreenProjector";
import { DEFAULT_FADE_TIME } from "../../lib/text/RenderState";
import { TextElement } from "../../lib/text/TextElement";
import { TextElementsRenderer } from "../../lib/text/TextElementsRenderer";
import { TextLayoutStyleCache, TextRenderStyleCache } from "../../lib/text/TextStyleCache";

// tslint:disable:no-var-requires

/**
 * I have commented this out because I don't want to add the canvas
 * as a dependency, and have to deal with the potential license restrictions, in order to have this
 * working, you will need to run `yarn add --dev canvas`. I recommend also to reduce the
 * NUMBER_LABELS value, or the NUMBER_FRAMES_TO_TRY, otherwise the test will take too long to run.
 */
const ENABLE_HEADLESS_2DCONTEXT = false;
const { createCanvas } = ENABLE_HEADLESS_2DCONTEXT
    ? // tslint:disable-next-line: no-implicit-dependencies
      require("canvas")
    : {
          createCanvas(x: number, y: number) {
              return undefined;
          }
      };

describe("TextElementsRenderer", function() {
    const inNodeContext = typeof window === "undefined";

    const sandbox = sinon.createSandbox();
    const CANVAS_width = 1920;
    const CANVAS_HEIGHT = 1080;
    const NUMBER_LABELS = 100000;
    // Odd number, so that when we calculate the median, we just get the middle value.
    const NUMBER_FRAMES_TO_TRY = 51;

    // This ensures that if we want to debug, that the canvas is rendered.
    debugContext.setValue("DEBUG_SCREEN_COLLISIONS", ENABLE_HEADLESS_2DCONTEXT);
    const flatCanvas = createCanvas(CANVAS_width, CANVAS_HEIGHT);
    const screenCollisions = ENABLE_HEADLESS_2DCONTEXT
        ? new ScreenCollisionsDebug(flatCanvas)
        : new ScreenCollisions();
    const screenProjector = new ScreenProjector(new THREE.PerspectiveCamera());

    const theme: Theme = {
        fontCatalogs: [
            {
                name: "default",
                url: "resources/Default_FontCatalog.json"
            }
        ]
    };
    const logger = LoggerManager.instance.create("MapViewIntegrationTest");

    function writePngOfContext2d() {
        if (flatCanvas === undefined) {
            return;
        }
        const out = fs.createWriteStream(path.join(__dirname, "2dcontext" + Date.now() + ".png"));
        const stream = flatCanvas.createPNGStream();
        stream.pipe(out);
        out.on("finish", () => logger.log("The 2d context PNG was created."));
    }

    let mapView: any;

    beforeEach(function() {
        if (inNodeContext) {
            (global as any).window = { location: { href: "http://harp.gl" } };
        }

        sandbox.stub(FontCatalog, "loadJSON").callsFake((urlString: string) => {
            const url = new URL(urlString);
            return loadTestResource("@here/harp-fontcatalog", url.pathname, "json");
        });

        const webGlStub = sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sinon, sandbox.stub()));

        sandbox
            .stub(FontCatalog, "loadTexture")
            .returns(Promise.resolve(new THREE.DataTexture(new Uint8Array(), 1024, 1024)));

        const camera = new THREE.OrthographicCamera(0, CANVAS_width, 0, CANVAS_HEIGHT, 0.1, 10);
        camera.updateProjectionMatrix();

        const viewRanges: ViewRanges = {
            near: 0,
            far: 10000,
            minimum: 0,
            maximum: 10000
        };
        mapView = {
            camera,
            viewRanges,
            theme,
            textRenderStyleCache: new TextRenderStyleCache(),
            textLayoutStyleCache: new TextLayoutStyleCache(),
            defaultFontCatalog: "Default_FontCatalog.json",
            renderer: webGlStub,
            worldCenter: camera.position.clone(),
            update: () => {},
            lookAtDistance: 0
        };

        screenProjector.update(camera, CANVAS_width, CANVAS_HEIGHT);
        screenCollisions.update(CANVAS_width, CANVAS_HEIGHT);
    });

    afterEach(function() {
        sandbox.restore();
        if (inNodeContext) {
            delete (global as any).window;
        }
    });

    it("perf test render NUMBER_LABELS labels", async function() {
        let updatePromise = new Promise((resolve, reject) => {
            mapView.update = resolve;
        });

        const textElementsRenderer = new TextElementsRenderer(
            (mapView as any) as MapView,
            screenCollisions,
            screenProjector,
            undefined,
            Number.MAX_SAFE_INTEGER,
            theme,
            NUMBER_LABELS,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        );

        // The FontCatalog is loaded asynchronously and trigger mapView.update once it's loaded.
        await updatePromise;

        const textRenderParams: TextRenderParameters = {};
        const textLayoutParams: TextLayoutParameters = {};
        const priority = 1;
        const featureId = 20337454;
        const xOffset = undefined;
        const yOffset = undefined;
        const style = undefined;
        const fadeNear = undefined;
        const fadeFar = undefined;

        // Provide some pseudo random numbers so that test excution is guaranteed to be the same,
        // just created using `console.log("["); for(let i = 0; i < 50; i++) { console.log(
        // Math.random()); if(i !== 49) {console.log(",");} } console.log("]");` in node.
        const pseudoRandomX = [
            0.24301596557233496,
            0.14021602814291212,
            0.9820844012349916,
            0.39099209652227085,
            0.014417602504663618,
            0.2651124468858914,
            0.7841842826339809,
            0.2719635676049468,
            0.5305286587279296,
            0.7125627457072048,
            0.9788919334636053,
            0.7187242993939096,
            0.8835537556266799,
            0.32257981303251615,
            0.6189329250790361,
            0.1981322854451626,
            0.5961309719607477,
            0.6364093746122095,
            0.15758992994229715,
            0.14727493085596155,
            0.11448325146557292,
            0.10905803707696093,
            0.9046871732346347,
            0.9904975807078911,
            0.46978576191902777,
            0.2776363851191528,
            0.8094511039880827,
            0.10116750618846027,
            0.020118931733823286,
            0.8640173736596131,
            0.23581413888246394,
            0.14181837639300787,
            0.5153548326714166,
            0.07640914031019808,
            0.7550665949094004,
            0.9692317475981571,
            0.23891234512602977,
            0.3341740284323016,
            0.125229721362492,
            0.714091190478608,
            0.6305303598615961,
            0.17629518877142525,
            0.4005918292525672,
            0.1663669112266699,
            0.6004885051214446,
            0.8136034739086262,
            0.2955350925642195,
            0.26349314821922687,
            0.32800204872988337,
            0.2458304369693336
        ];

        const pseudoRandomY = [
            0.11033393989333917,
            0.34645746770173647,
            0.9466208289182012,
            0.17635656175107983,
            0.6144843570618892,
            0.8254304384166669,
            0.17435466215980777,
            0.5488901379289584,
            0.8528220098799841,
            0.18948220033900354,
            0.2747234028141088,
            0.020395702233860113,
            0.3625404062812674,
            0.830609020871977,
            0.9682939616176705,
            0.02362431284587707,
            0.19471357335252515,
            0.8562931046646436,
            0.35795289930316443,
            0.78504994298641,
            0.9412222575334508,
            0.40195569381405694,
            0.9722704266921456,
            0.4901480881894882,
            0.29635515298934045,
            0.8785156984233797,
            0.7856153610982965,
            0.7217905322025004,
            0.6060176844182625,
            0.7613006675384522,
            0.7373072401439558,
            0.8151598985938857,
            0.14017010688918408,
            0.17670951390955647,
            0.6280957047854971,
            0.5363142679138007,
            0.5438730320087066,
            0.6235862566749497,
            0.8089935507945938,
            0.1597633343510858,
            0.5661468114741937,
            0.665949434465319,
            0.42759100715852294,
            0.3628537086174346,
            0.35219172813869015,
            0.6570554603059615,
            0.40727902866362964,
            0.7727738615068631,
            0.8014119177589512,
            0.8668380779811682
        ];

        const textElements: TextElement[] = [];
        let randomX = pseudoRandomX[0];
        let randomY = pseudoRandomY[0];
        for (let i = 0; i < NUMBER_LABELS; i++) {
            randomX += pseudoRandomX[i % pseudoRandomX.length];
            randomX %= 1.0;
            randomY += pseudoRandomY[i % pseudoRandomY.length];
            randomY %= 1.0;

            const newElement = new TextElement(
                `${i}`,
                new THREE.Vector3(randomX * CANVAS_width, randomY * CANVAS_HEIGHT, -1),
                textRenderParams,
                textLayoutParams,
                priority,
                xOffset,
                yOffset,
                featureId,
                style,
                fadeNear,
                fadeFar
            );
            textElements.push(newElement);
        }

        const center = new THREE.Vector3();
        textElements.forEach((textElement: TextElement) => {
            textElement.tileCenter = center;
            textElement.ignoreDistance = true;
        });

        const renderedTextElements: TextElement[] = [];
        const secondChanceTextElements: TextElement[] = [];

        // time must not be 0 b/c 0 is used as a special value in TextElementsRenderer.
        const time = 1000;
        let frameNumber = 0;
        const zoomLevel = 4;

        // TextElementRenderer.initializeTextCanvases is triggering a mapView.update
        // Wait for that update call otherwise we will not see any text.
        updatePromise = new Promise((resolve, reject) => {
            mapView.update = resolve;
        });
        const startFrameInit = PerformanceTimer.now();
        let numRenderedTextElements = textElementsRenderer.renderTextElements(
            textElements,
            time,
            frameNumber++,
            zoomLevel,
            renderedTextElements,
            secondChanceTextElements
        );
        const endFrameInit = PerformanceTimer.now();
        logger.log(`Frame time: ${endFrameInit - startFrameInit}`);

        // First call just triggers the text canvas initialization. Nothing will be rendered.
        expect(numRenderedTextElements).to.be.equal(0);
        expect(renderedTextElements.length).to.be.equal(0);

        // TextElementsRenderer.renderTextElements is loading the charset lazily
        // (FontCatalog.loadCharset) and triggers a mapView.update afterwards.
        await updatePromise;

        // Try a number of frames
        const frameTimes: number[] = [];
        for (let frameIndex = 0; frameIndex < NUMBER_FRAMES_TO_TRY; frameIndex++) {
            textElementsRenderer.getTextElementStyle().textCanvas!.clear();
            renderedTextElements.splice(0);
            secondChanceTextElements.splice(0);
            const startFrame = PerformanceTimer.now();
            numRenderedTextElements = textElementsRenderer.renderTextElements(
                textElements,
                time + DEFAULT_FADE_TIME + 100,
                frameNumber++,
                zoomLevel,
                renderedTextElements,
                secondChanceTextElements
            );
            const endFrame = PerformanceTimer.now();
            const frameTime = endFrame - startFrame;
            screenCollisions.reset();
            logger.log(`Frame time: ${frameTime}`);
            frameTimes.push(frameTime);
        }

        frameTimes.sort((a, b) => {
            return a < b ? -1 : a > b ? 1 : 0;
        });

        logger.log(`Median frame time: ${frameTimes[Math.floor(NUMBER_FRAMES_TO_TRY / 2)]}`);

        if (ENABLE_HEADLESS_2DCONTEXT) {
            writePngOfContext2d();
        }

        return Promise.resolve();
    });
});
