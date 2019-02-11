/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import { FontCatalog, FontUnit, TextCanvas, TextRenderStyle } from "@here/harp-text-canvas";

/**
 * This example showcases how [[TextCanvas]] can handle picking the different strings of text added
 * to it.
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasPickingExample {
    const stats = new Stats();
    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let textCanvas: TextCanvas;
    let assetsLoaded: boolean = false;

    let textSample = "black";
    const textPosition = new THREE.Vector3();
    let textRenderStyle: TextRenderStyle;

    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);

        camera.left = -window.innerWidth / 2.0;
        camera.right = window.innerWidth / 2.0;
        camera.bottom = -window.innerHeight / 2.0;
        camera.top = window.innerHeight / 2.0;

        camera.updateProjectionMatrix();
    }

    function onMouseClick(event: any) {
        if (assetsLoaded) {
            textCanvas.pickText(
                new THREE.Vector2(
                    event.clientX - window.innerWidth * 0.5,
                    -event.clientY + window.innerHeight * 0.5
                ),
                (data: any) => {
                    textSample = data;
                }
            );
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();
        if (assetsLoaded) {
            textCanvas.clear();
            textCanvas.textRenderStyle = textRenderStyle;

            textRenderStyle.color!.setRGB(0, 0, 0);
            textPosition.set(-window.innerWidth * 0.25, window.innerHeight * 0.25, 0.0);
            textCanvas.addText(textSample, textPosition, { pickingData: "black" });

            textRenderStyle.color!.setRGB(1, 0, 0);
            textPosition.set(window.innerWidth * 0.25, window.innerHeight * 0.25, 0.0);
            textCanvas.addText(textSample, textPosition, { pickingData: "red" });

            textRenderStyle.color!.setRGB(0, 1, 0);
            textPosition.set(-window.innerWidth * 0.25, -window.innerHeight * 0.25, 0.0);
            textCanvas.addText(textSample, textPosition, { pickingData: "green" });

            textRenderStyle.color!.setRGB(0, 0, 1);
            textPosition.set(window.innerWidth * 0.25, -window.innerHeight * 0.25, 0.0);
            textCanvas.addText(textSample, textPosition, { pickingData: "blue" });

            textCanvas.render(camera);
        }
        stats.update();
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
        window.addEventListener("mouseup", onMouseClick);

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
        textRenderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Percent,
                size: 200.0,
                backgroundSize: 0.0
            }
        });
        FontCatalog.load("resources/fonts/Default_FontCatalog.json", 32).then(
            (loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: 64
                });
                loadedFontCatalog
                    .loadCharset("black" + "red" + "green" + "blue", textRenderStyle)
                    .then(() => {
                        assetsLoaded = true;
                    });
            }
        );

        // Animation loop
        animate();
    }

    main();
}
