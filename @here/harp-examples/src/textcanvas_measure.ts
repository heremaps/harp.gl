/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import {
    ContextualArabicConverter,
    FontCatalog,
    TextCanvas,
    TextStyle
} from "@here/harp-text-canvas";

/**
 * This example showcases how we can use [[TextCanvas]] `measureText` API to retrieve the bounds for
 * a specific piece of text:
 *
 * ```typescript
 * [[include:textcanvas_measure_0.ts]]
 * ```
 *
 * As well as how an animated [[TextStyle]] can influence the output of this function:
 *
 * ```typescript
 * [[include:textcanvas_measure_1.ts]]
 * ```
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasMeasureExample {
    const stats = new Stats();
    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let currentFrameTime = new Date().getTime();
    let lastFrameTime = new Date().getTime();

    let textStyle: TextStyle;
    let textCanvas: TextCanvas;
    let assetsLoaded: boolean = false;

    const characterCount = 16;
    const textSampleA = "Hello World!";
    const textSampleB = ContextualArabicConverter.instance.convert("الأندلس");
    const textPosition: THREE.Vector3 = new THREE.Vector3();

    const textBounds: THREE.Box2 = new THREE.Box2(new THREE.Vector2(), new THREE.Vector2());
    const characterBounds: THREE.Box2[] = [];
    let boundsScene: THREE.Scene;
    let boundsVertexBuffer: THREE.BufferAttribute;
    let boundsGeometry: THREE.BufferGeometry;

    function initDebugBounds() {
        boundsScene = new THREE.Scene();
        boundsVertexBuffer = new THREE.BufferAttribute(
            new Float32Array(32 * 4 * characterCount),
            4
        );
        boundsVertexBuffer.setDynamic(true);
        boundsGeometry = new THREE.BufferGeometry();
        boundsGeometry.addAttribute("position", boundsVertexBuffer);
        boundsScene.add(
            new THREE.Line(
                boundsGeometry,
                new THREE.LineBasicMaterial({
                    color: 0xff0000,
                    depthTest: false,
                    depthWrite: false,
                    transparent: true,
                    opacity: 0.2
                })
            )
        );
    }

    function updateDebugBounds() {
        const vertexArray = boundsVertexBuffer.array as Float32Array;
        let arrayIdx = 0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.max.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.max.x;
        vertexArray[arrayIdx++] = textBounds.max.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.max.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;
        vertexArray[arrayIdx++] = textBounds.min.x;
        vertexArray[arrayIdx++] = textBounds.min.y;
        vertexArray[arrayIdx++] = 0.0;
        vertexArray[arrayIdx++] = 1.0;

        for (const bounds of characterBounds) {
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.max.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.max.x;
            vertexArray[arrayIdx++] = bounds.max.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.max.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
            vertexArray[arrayIdx++] = bounds.min.x;
            vertexArray[arrayIdx++] = bounds.min.y;
            vertexArray[arrayIdx++] = 0.0;
            vertexArray[arrayIdx++] = 1.0;
        }

        boundsVertexBuffer.needsUpdate = true;
        boundsVertexBuffer.updateRange.offset = 0;
        boundsVertexBuffer.updateRange.count = arrayIdx;
        boundsGeometry.setDrawRange(0, arrayIdx / 4);
    }

    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);

        camera.left = -window.innerWidth / 2.0;
        camera.right = window.innerWidth / 2.0;
        camera.bottom = -window.innerHeight / 2.0;
        camera.top = window.innerHeight / 2.0;
        camera.updateProjectionMatrix();
    }

    function animate() {
        currentFrameTime = new Date().getTime();

        requestAnimationFrame(animate);
        webglRenderer.clear();
        if (assetsLoaded) {
            textCanvas.clear();

            // snippet:textcanvas_measure_1.ts
            textStyle.rotation! += (currentFrameTime - lastFrameTime) / 1000;
            textStyle.glyphRotation! += (currentFrameTime - lastFrameTime) / 1000;
            textCanvas.style = textStyle;
            // end:textcanvas_measure_1.ts

            textPosition.set(0.0, 0.0, 0.0);
            // snippet:textcanvas_measure_0.ts
            textCanvas.measureText(textSampleA, textBounds, characterBounds);
            // end:textcanvas_measure_0.ts
            textCanvas.addText(textSampleA, textPosition);

            textCanvas.style.rotation! = 0.0;
            textCanvas.style.glyphRotation! = 0.0;
            textPosition.set(0.0, textBounds.max.y, 0.0);
            textCanvas.addText(textSampleB, textPosition);

            textCanvas.render(camera);
        }

        updateDebugBounds();
        webglRenderer.render(boundsScene, camera);

        stats.update();
        lastFrameTime = currentFrameTime;
    }

    function main() {
        // Init Three.JS
        webglRenderer = new THREE.WebGLRenderer({
            canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
        });
        webglRenderer.autoClear = false;
        webglRenderer.setClearColor(0xffffff);
        webglRenderer.setPixelRatio(window.devicePixelRatio);
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(webglRenderer.domElement);
        document.body.appendChild(stats.dom);
        window.addEventListener("resize", onWindowResize);

        camera = new THREE.OrthographicCamera(
            -window.innerWidth / 2.0,
            window.innerWidth / 2.0,
            window.innerHeight / 2.0,
            -window.innerHeight / 2.0
        );
        camera.position.z = 1.0;
        camera.near = 0.0;
        camera.updateProjectionMatrix();

        // Init TextCanvas
        textStyle = { rotation: 0, glyphRotation: 0 };
        FontCatalog.load("resources/harp-text-canvas/fonts/Default_FontCatalog.json", 16).then(
            (loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: 24
                });
                loadedFontCatalog.loadCharset(textSampleA + textSampleB, textStyle).then(() => {
                    assetsLoaded = true;
                });
            }
        );

        // Init bounds Visualization
        initDebugBounds();

        // Animation loop
        animate();
    }

    main();
}
