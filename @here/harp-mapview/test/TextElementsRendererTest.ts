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
import { GeoCoordinates, mercatorProjection, webMercatorTilingScheme } from "@here/harp-geoutils";
import { loadTestResource } from "@here/harp-test-utils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { FontCatalog, TextLayoutParameters, TextRenderParameters } from "@here/harp-text-canvas";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { MapView } from "../lib/MapView";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import { ScreenProjector } from "../lib/ScreenProjector";
import { DEFAULT_FADE_TIME } from "../lib/text/RenderState";
import { TextElement } from "../lib/text/TextElement";
import { TextElementsRenderer } from "../lib/text/TextElementsRenderer";
import { TextLayoutStyleCache, TextRenderStyleCache } from "../lib/text/TextStyleCache";
import { MapViewUtils } from "../lib/Utils";

describe("TextElementsRenderer", function() {
    const inNodeContext = typeof window === "undefined";

    const sandbox = sinon.createSandbox();
    const screenCollisions = new ScreenCollisions();
    const screenProjector = new ScreenProjector(new THREE.PerspectiveCamera());
    const projection = mercatorProjection;
    const viewRanges: ViewRanges = {
        near: 0,
        far: 10000,
        minimum: 0,
        maximum: 10000
    };

    const theme: Theme = {
        fontCatalogs: [
            {
                name: "default",
                url: "resources/Default_FontCatalog.json"
            }
        ]
    };

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

        //Camera dump of a full hd window using
        //http://localhost:8080/?Latitude=46.691094&Longitude=7.441638&ZoomLevel=4
        const width = 1920;
        const height = 1080;
        const camera = new THREE.PerspectiveCamera(
            40,
            1920 / 1080,
            1311800.275215145,
            65590213.760757245
        );
        camera.position.set(20865907.69561712, 25929306.04963863, 13118002.752151448);
        camera.updateMatrixWorld();

        mapView = {
            camera,
            projection,
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

        const target = MapViewUtils.rayCastWorldCoordinates((mapView as any) as MapView, 0, 0);
        mapView.lookAtDistance = target!.sub(camera.position).length();

        screenProjector.update(camera, width, height);
        screenCollisions.update(width, height);
    });

    afterEach(function() {
        sandbox.restore();
        if (inNodeContext) {
            delete (global as any).window;
        }
    });

    it("Fade in single label", async function() {
        let updatePromise = new Promise((resolve, reject) => {
            mapView.update = resolve;
        });

        const textElementsRenderer = new TextElementsRenderer(
            (mapView as any) as MapView,
            screenCollisions,
            screenProjector,
            undefined,
            undefined,
            theme,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        );

        // The FontCatalog is loaded asynchronously and trigger mapView.update once it's loaded.
        await updatePromise;

        const londonGeo = new GeoCoordinates(51.508742458803326, -0.1318359375);
        const tileKey = webMercatorTilingScheme.getTileKey(londonGeo, 3);
        const tileCenterGeo = webMercatorTilingScheme.getGeoBox(tileKey!).center;
        const tileCenterWorld = projection.projectPoint(tileCenterGeo, new THREE.Vector3());

        const londonTile = projection
            .projectPoint(londonGeo, new THREE.Vector3())
            .sub(tileCenterWorld);
        const textRenderParams: TextRenderParameters = {};
        const textLayoutParams: TextLayoutParameters = {};
        const priority = 1;
        const featureId = 20337454;
        const xOffset = undefined;
        const yOffset = undefined;
        const style = undefined;
        const fadeNear = undefined;
        const fadeFar = undefined;

        const textElements: TextElement[] = [
            new TextElement(
                "London",
                londonTile,
                textRenderParams,
                textLayoutParams,
                priority,
                xOffset,
                yOffset,
                featureId,
                style,
                fadeNear,
                fadeFar
            )
        ];

        textElements.forEach((textElement: TextElement) => {
            textElement.tileCenter = tileCenterWorld;
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
        let numRenderedTextElements = textElementsRenderer.renderTextElements(
            textElements,
            time,
            frameNumber++,
            zoomLevel,
            renderedTextElements,
            secondChanceTextElements
        );

        // First call just triggers the text canvas initialization. Nothing will be rendered.
        expect(numRenderedTextElements).to.be.equal(0);
        expect(renderedTextElements.length).to.be.equal(0);

        // TextElementsRenderer.renderTextElements is loading the charset lazily
        // (FontCatalog.loadCharset) and triggers a mapView.update afterwards.
        await updatePromise;

        const startTime = time + 100;

        // First "real" frame. Label should be invisble and start fading in.
        renderedTextElements.splice(0);
        numRenderedTextElements = textElementsRenderer.renderTextElements(
            textElements,
            startTime,
            frameNumber++,
            zoomLevel,
            renderedTextElements,
            secondChanceTextElements
        );

        expect(numRenderedTextElements).to.be.equal(1);
        expect(renderedTextElements.length).to.be.equal(1);
        expect(renderedTextElements[0].renderState.textRenderState!.startTime).to.be.equal(
            startTime
        );
        expect(renderedTextElements[0].renderState.textRenderState!.opacity).to.be.equal(0);
        assert(renderedTextElements[0].renderState.textRenderState!.isFadingIn());

        // Second frame. Label should be semi-transparent and fading in.
        renderedTextElements.splice(0);
        numRenderedTextElements = textElementsRenderer.renderTextElements(
            textElements,
            startTime + 100,
            frameNumber++,
            zoomLevel,
            renderedTextElements,
            secondChanceTextElements
        );

        expect(numRenderedTextElements).to.be.equal(1);
        expect(renderedTextElements.length).to.be.equal(1);
        expect(renderedTextElements[0].renderState.textRenderState!.opacity)
            .to.be.greaterThan(0)
            .to.be.lessThan(1);
        assert(renderedTextElements[0].renderState.textRenderState!.isFadingIn());

        const lastOpacity = renderedTextElements[0].renderState.textRenderState!.opacity;

        // Third frame. Label should be semi-transparent and still fading in.
        renderedTextElements.splice(0);
        numRenderedTextElements = textElementsRenderer.renderTextElements(
            textElements,
            startTime + 700,
            frameNumber++,
            zoomLevel,
            renderedTextElements,
            secondChanceTextElements
        );
        expect(numRenderedTextElements).to.be.equal(1);
        expect(renderedTextElements.length).to.be.equal(1);
        expect(renderedTextElements[0].renderState.textRenderState!.opacity)
            .to.be.greaterThan(lastOpacity)
            .to.be.lessThan(1);
        assert(renderedTextElements[0].renderState.textRenderState!.isFadingIn());

        // Forth frame. Label should be visible and fading should be finished.
        renderedTextElements.splice(0);
        numRenderedTextElements = textElementsRenderer.renderTextElements(
            textElements,
            startTime + DEFAULT_FADE_TIME,
            frameNumber++,
            zoomLevel,
            renderedTextElements,
            secondChanceTextElements
        );

        expect(numRenderedTextElements).to.be.equal(1);
        expect(renderedTextElements.length).to.be.equal(1);
        expect(renderedTextElements[0].renderState.textRenderState!.opacity).to.be.equal(1);
        assert(renderedTextElements[0].renderState.textRenderState!.isFadedIn());

        return Promise.resolve();
    });
});
