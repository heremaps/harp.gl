/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { RenderingTestHelper } from "@here/harp-test-utils";
import * as THREE from "three";

import {
    FontCatalog,
    FontUnit,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutStyle,
    TextRenderStyle
} from "../../index";

describe("TextCanvas", function () {
    let renderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;
    let fontCatalog: FontCatalog;

    afterEach(() => {
        if (renderer !== undefined) {
            renderer.dispose();
        }
    });

    async function basicRenderTest(
        params: {
            test: Mocha.Context;
            testName: string;
        },
        testFun: () => Promise<void>
    ) {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;

        // Enable backward compatibility with three.js <= 0.117
        renderer = new ((THREE as any).WebGL1Renderer ?? THREE.WebGLRenderer)({ canvas });
        renderer.autoClear = false;
        renderer.setClearColor(0xffffff);
        renderer.setSize(canvas.width, canvas.height);

        camera = new THREE.OrthographicCamera(
            -canvas.width / 2.0,
            canvas.width / 2.0,
            canvas.height / 2.0,
            -canvas.height / 2.0
        );
        camera.position.z = 1.0;
        camera.near = 0.0;
        camera.updateProjectionMatrix();

        fontCatalog = await FontCatalog.load(
            "../dist/resources/fonts/Default_FontCatalog.json",
            16
        );

        const ibct = new RenderingTestHelper(params.test, { module: "text-canvas" });
        await testFun();
        await ibct.assertCanvasMatchesReference(canvas, params.testName);
    }

    it("renders hello world text", async function (this: Mocha.Context) {
        await basicRenderTest(
            {
                test: this,
                testName: "hello-world"
            },
            async () => {
                const textCanvas = new TextCanvas({
                    renderer,
                    fontCatalog,
                    minGlyphCount: 12,
                    maxGlyphCount: 12
                });

                const renderingStyle = new TextRenderStyle({
                    fontSize: {
                        unit: FontUnit.Pixel,
                        size: 16,
                        backgroundSize: 16
                    }
                });
                await fontCatalog.loadCharset("Hello World!", renderingStyle);
                textCanvas.textRenderStyle = renderingStyle;
                textCanvas.textLayoutStyle = new TextLayoutStyle({
                    horizontalAlignment: HorizontalAlignment.Center
                });
                textCanvas.addText("Hello World!", new THREE.Vector3(0, 0, 0));

                renderer.clear();
                textCanvas.render(camera);
            }
        );
    });
    it("renders ß", async function (this: Mocha.Context) {
        await basicRenderTest(
            {
                test: this,
                testName: "scharfes-S"
            },
            async () => {
                const textCanvas = new TextCanvas({
                    renderer,
                    fontCatalog,
                    minGlyphCount: 3,
                    maxGlyphCount: 20
                });

                const renderingStyle = new TextRenderStyle({
                    fontSize: {
                        unit: FontUnit.Pixel,
                        size: 16,
                        backgroundSize: 16
                    }
                });
                await fontCatalog.loadCharset("ß\n", renderingStyle);
                textCanvas.textRenderStyle = renderingStyle;
                textCanvas.textLayoutStyle = new TextLayoutStyle({
                    horizontalAlignment: HorizontalAlignment.Center
                });
                textCanvas.addText("ßßßß\nßßßß\nßßßß\nßßßß\nßßßß", new THREE.Vector3(0, 30, 0));

                renderer.clear();
                textCanvas.render(camera);
            }
        );
    });
    it("renders ß with dashes", async function (this: Mocha.Context) {
        await basicRenderTest(
            {
                test: this,
                testName: "scharfes-S-2"
            },
            async () => {
                const textCanvas = new TextCanvas({
                    renderer,
                    fontCatalog,
                    minGlyphCount: 3,
                    maxGlyphCount: 35
                });

                const renderingStyle = new TextRenderStyle({
                    fontSize: {
                        unit: FontUnit.Pixel,
                        size: 16,
                        backgroundSize: 16
                    }
                });
                await fontCatalog.loadCharset("ß-\n", renderingStyle);
                textCanvas.textRenderStyle = renderingStyle;
                textCanvas.textLayoutStyle = new TextLayoutStyle({
                    horizontalAlignment: HorizontalAlignment.Center
                });
                textCanvas.addText(
                    "ß-ß-ß-ß\nß-ß-ß\nß-ß-ß-ß\nß-ß-ß\nß-ß-ß-ß-ß\n",
                    new THREE.Vector3(0, 30, 0)
                );

                renderer.clear();
                textCanvas.render(camera);
            }
        );
    });

    it("renders rotated hello world text", async function (this: Mocha.Context) {
        await basicRenderTest(
            {
                test: this,
                testName: "hello-world-rotated"
            },
            async () => {
                const textCanvas = new TextCanvas({
                    renderer,
                    fontCatalog,
                    minGlyphCount: 30,
                    maxGlyphCount: 30
                });

                const renderingStyle = new TextRenderStyle({
                    fontSize: {
                        unit: FontUnit.Pixel,
                        size: 16,
                        backgroundSize: 16
                    }
                });
                await fontCatalog.loadCharset("Hello World!", renderingStyle);
                textCanvas.textRenderStyle = new TextRenderStyle({
                    ...renderingStyle,
                    rotation: THREE.MathUtils.degToRad(-20)
                });
                textCanvas.textLayoutStyle = new TextLayoutStyle({
                    horizontalAlignment: HorizontalAlignment.Left,
                    canvasRotation: THREE.MathUtils.degToRad(-20)
                });
                textCanvas.addText("Hello World!", new THREE.Vector3(-50, 20, 0));

                textCanvas.textRenderStyle = new TextRenderStyle({
                    ...renderingStyle,
                    rotation: THREE.MathUtils.degToRad(20)
                });
                textCanvas.textLayoutStyle = new TextLayoutStyle({
                    horizontalAlignment: HorizontalAlignment.Left,
                    canvasRotation: THREE.MathUtils.degToRad(20)
                });
                textCanvas.addText("Hello World!", new THREE.Vector3(-50, -30, 0));

                renderer.clear();
                textCanvas.render(camera);
            }
        );
    });

    it("renders hello world on path", async function (this: Mocha.Context) {
        await basicRenderTest(
            {
                test: this,
                testName: "hello-world-path"
            },
            async () => {
                const textCanvas = new TextCanvas({
                    renderer,
                    fontCatalog,
                    minGlyphCount: 12,
                    maxGlyphCount: 12
                });

                const textRenderStyle = new TextRenderStyle({
                    fontSize: {
                        unit: FontUnit.Pixel,
                        size: 16,
                        backgroundSize: 16
                    }
                });
                await fontCatalog.loadCharset("Hello World!", textRenderStyle);
                textCanvas.textRenderStyle = textRenderStyle;
                const textPath: THREE.CurvePath<THREE.Vector2> = new THREE.CurvePath();
                const textPathPoints = [
                    new THREE.Vector2(-40, 30.0),
                    new THREE.Vector2(0, 20),
                    new THREE.Vector2(20, -30.0)
                ];
                textPath.add(new THREE.SplineCurve(textPathPoints));
                const boundsPosition: THREE.Vector3 = new THREE.Vector3(
                    textPathPoints[0].x,
                    textPathPoints[0].y,
                    0.0
                );
                textCanvas.textLayoutStyle = new TextLayoutStyle({
                    horizontalAlignment: HorizontalAlignment.Left
                });
                textCanvas.addText("HelloWorld!", boundsPosition, {
                    path: textPath,
                    pathOverflow: true
                });

                renderer.clear();
                textCanvas.render(camera);
            }
        );
    });
});
