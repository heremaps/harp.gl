/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import {
    createSdfTextMaterial,
    FontCatalog,
    FontUnit,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutStyle,
    TextRenderStyle
} from "@here/harp-text-canvas";

/**
 * This example showcases how you can supply a material on [[TextCanvas]] creation to support custom
 * SDF text rendering.
 *
 * ```typescript
 * [[include:textcanvas_material_0.ts]]
 * ```
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasMaterialExample {
    const stats = new Stats();
    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let isMaterialA = true;
    let materialA: THREE.RawShaderMaterial;
    let materialB: THREE.RawShaderMaterial;
    const initialTime = new Date().getTime();

    let textRenderStyle: TextRenderStyle;
    let textLayoutStyle: TextLayoutStyle;
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

    function onMouseClick(event: any) {
        textCanvas.material = isMaterialA ? materialB : materialA;
        isMaterialA = !isMaterialA;
    }

    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();

        if (assetsLoaded) {
            materialA.uniforms.time.value = (new Date().getTime() - initialTime) / 1000;
            materialB.uniforms.time.value = (new Date().getTime() - initialTime) / 1000;
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

        // Custom material sources.
        const materialVertexSource = `
        #include <sdf_attributes>
        #include <sdf_varying>

        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;

        varying float yPos;

        void main() {
            #include <sdf_varying_computation>
            yPos = position.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
        }`;
        const materialFragmentSourceA = `
        precision highp float;
        precision highp int;

        #include <sdf_varying>
        #include <sdf_frag_uniforms>
        #include <sdf_sampling_functions>

        uniform float time;
        varying float yPos;

        void main() {
            vec4 color = vColor;
            float a = abs(sin((yPos / 300.0 + time * 0.5) * 10.0)) - 0.5;
            float b = smoothstep(0.0, 1.0, a) + 0.5;
            color.a *= getOpacity(vec2(0.0), vWeight + b * 0.25);
            if (color.a < 0.05) {
                discard;
            }
            gl_FragColor = color;
        }`;
        const materialFragmentSourceB = `
        precision highp float;
        precision highp int;

        #include <sdf_varying>
        #include <sdf_frag_uniforms>
        #include <sdf_sampling_functions>

        uniform float time;
        varying float yPos;

        void main() {
            vec4 color = vec4(1.0, 0.0, 0.0, vColor.a);
            float a = abs(sin((yPos / 300.0 + time * 0.5) * 10.0)) - 0.5;
            float b = smoothstep(0.0, 1.0, a) + 0.5;
            color.a *= getOpacity(vec2(0.0), vWeight + b * 0.25);
            if (color.a < 0.05) {
                discard;
            }
            gl_FragColor = color;
        }`;

        // Init TextCanvas
        textRenderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Percent,
                size: 300.0,
                backgroundSize: 0.0
            }
        });
        textLayoutStyle = new TextLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center
        });
        FontCatalog.load("resources/fonts/Default_FontCatalog.json", 16).then(
            (loadedFontCatalog: FontCatalog) => {
                // snippet:textcanvas_material_0.ts
                materialA = createSdfTextMaterial({
                    fontCatalog: loadedFontCatalog,
                    vertexSource: materialVertexSource,
                    fragmentSource: materialFragmentSourceA
                });
                materialA.uniforms.time = new THREE.Uniform(0.0);
                materialB = createSdfTextMaterial({
                    fontCatalog: loadedFontCatalog,
                    vertexSource: materialVertexSource,
                    fragmentSource: materialFragmentSourceB
                });
                materialB.uniforms.time = new THREE.Uniform(0.0);
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: 12,
                    material: materialA
                });
                // end:textcanvas_material_0.ts
                loadedFontCatalog.loadCharset("TextCanvas", textRenderStyle).then(() => {
                    assetsLoaded = true;
                    textCanvas.textRenderStyle = textRenderStyle;
                    textCanvas.textLayoutStyle = textLayoutStyle;
                    textCanvas.addText("TextCanvas", new THREE.Vector3(0, 0, 0));
                });
            }
        );

        // Animation loop
        animate();
    }

    main();
}
