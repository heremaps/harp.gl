/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import { FontCatalog, TextCanvas, TextRenderStyle } from "@here/harp-text-canvas";

/**
 * This example showcases how you can add text to different layers of [[TextCanvas]], to preserve
 * proper rendering order independently from addition order.
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasLayerExample {
    const stats = new Stats();
    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let textCanvas: TextCanvas;
    let assetsLoaded: boolean = false;

    function addText() {
        const position = new THREE.Vector3(30.0, 0.0, 0.0);
        textCanvas.textRenderStyle.fontSize!.size *= 4.0;
        for (let i = 9; i >= 0; --i) {
            textCanvas.textLayoutStyle.lineRotation = i * ((2.0 * Math.PI) / 10.0);
            textCanvas.textRenderStyle.color = new THREE.Color(
                Math.random(),
                Math.random(),
                Math.random()
            );
            textCanvas.addText(String(i), position, { layer: i });
        }
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
        requestAnimationFrame(animate);
        webglRenderer.clear();
        if (assetsLoaded) {
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
        FontCatalog.load("resources/fonts/Default_FontCatalog.json", 16).then(
            (loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: 12
                });
                loadedFontCatalog.loadCharset("0123456789", new TextRenderStyle()).then(() => {
                    assetsLoaded = true;
                    addText();
                });
            }
        );

        // Animation loop
        animate();
    }

    main();
}
