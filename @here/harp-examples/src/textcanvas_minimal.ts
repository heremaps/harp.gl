/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import { FontCatalog, TextCanvas } from "@here/harp-text-canvas";

/**
 * This example showcases how a minimal [[TextCanvas]] application can be implemented.
 * [[TextCanvas]] provides an API that allows to render text using the `three.js` API in a very
 * elegant, simple and efficient manner.
 *
 * The API handles Unicode code points coming from multiple fonts through the [[FontCatalog]] class,
 * which can be initialized specifying the according [[FontCatalog]] JSON and the maximum number of
 * unique Unicode code points this [[FontCatalog]] can store simultaneously.
 *
 * ```typescript
 * [[include:textcanvas_minimal_0.ts]]
 * ```
 *
 * Once the [[FontCatalog]] is loaded, we can create the [[TextCanvas]] passing a `three.js's
 * WebGLRenderer`, the loaded [[FontCatalog]] and the maximum number of characters this
 * [[TextCanvas]] can draw at the same time (extra additions to the [[TextCanvas]] will be
 * ignored).
 *
 * ```typescript
 * [[include:textcanvas_minimal_1.ts]]
 * ```
 *
 * Then, we just need to make sure the code points we desire to render are loaded by our
 * [[FontCatalog]]:
 *
 * ```typescript
 * [[include:textcanvas_minimal_2.ts]]
 * ```
 *
 * ... And add the desired text to the [[TextCanvas]] using `addText` (also specifying where on the
 * screen through the text be added).
 *
 * ```typescript
 * [[include:textcanvas_minimal_3.ts]]
 * ```
 *
 * To finally get text on the scren, we can just call `render` on our [[TextCanvas]] object inside
 * a regular `three.js` animation loop:
 *
 * ```typescript
 * [[include:textcanvas_minimal_4.ts]]
 * ```
 */
export namespace TextCanvasMinimalExample {
    const stats = new Stats();
    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let textCanvas: TextCanvas;
    let assetsLoaded: boolean = false;

    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth / 2.0;
        camera.right = window.innerWidth / 2.0;
        camera.bottom = -window.innerHeight / 2.0;
        camera.top = window.innerHeight / 2.0;
        camera.updateProjectionMatrix();
    }

    // snippet:textcanvas_minimal_4.ts
    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();
        if (assetsLoaded) {
            textCanvas.render(camera);
        }
        stats.update();
    }
    // end:textcanvas_minimal_4.ts

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
        // snippet:textcanvas_minimal_0.ts
        FontCatalog.load("resources/harp-text-canvas/fonts/Default_FontCatalog.json", 16).then(
            // end:textcanvas_minimal_0.ts
            (loadedFontCatalog: FontCatalog) => {
                // snippet:textcanvas_minimal_1.ts
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: 12
                });
                // end:textcanvas_minimal_1.ts
                // snippet:textcanvas_minimal_2.ts
                loadedFontCatalog.loadCharset("Hello World!", {}).then(() => {
                    assetsLoaded = true;
                    // end:textcanvas_minimal_2.ts
                    // snippet:textcanvas_minimal_3.ts
                    textCanvas.addText("Hello World!", new THREE.Vector3(0, 0, 0));
                    // end:textcanvas_minimal_3.ts
                });
            }
        );

        // Animation loop
        animate();
    }

    main();
}
