/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GUI } from "dat.gui";
// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import * as THREE from "three";

import {
    FontCatalog,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutStyle,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";

/**
 * This example showcases how [[TextCanvas]] can output its results to a WebGLRenderTarget, and use
 * its internal texture as input for any three.js material.
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasRenderTargetExample {
    const stats = new Stats();
    const gui = new GUI({ hideable: false });
    const guiOptions = {
        fontName: "",
        color: {
            r: 0.0,
            g: 0.0,
            b: 0.0
        },
        backgroundColor: {
            r: 0.0,
            g: 0.0,
            b: 0.0
        }
    };

    let scene: THREE.Scene;
    let webglRenderer: THREE.WebGLRenderer;
    let textCamera: THREE.OrthographicCamera;
    let sceneCamera: THREE.PerspectiveCamera;
    let renderTarget: THREE.WebGLRenderTarget;
    let cube: THREE.Mesh;

    let textCanvas: TextCanvas;
    let textRenderStyle: TextRenderStyle;
    let textLayoutStyle: TextLayoutStyle;
    let assetsLoaded = false;

    const characterCount = 1024;
    let textSample = "Type to start...";
    const textPosition = new THREE.Vector3(0.0, 500, 0.0);

    function addGUIControls() {
        guiOptions.color.r = textRenderStyle.color!.r * 255.0;
        guiOptions.color.g = textRenderStyle.color!.g * 255.0;
        guiOptions.color.b = textRenderStyle.color!.b * 255.0;
        guiOptions.backgroundColor.r = textRenderStyle.backgroundColor!.r * 255.0;
        guiOptions.backgroundColor.g = textRenderStyle.backgroundColor!.g * 255.0;
        guiOptions.backgroundColor.b = textRenderStyle.backgroundColor!.b * 255.0;

        gui.add(textRenderStyle.fontSize!, "unit", {
            Em: FontUnit.Em,
            Pixel: FontUnit.Pixel,
            Point: FontUnit.Point,
            Percent: FontUnit.Percent
        }).onChange((value: string) => {
            textRenderStyle.fontSize!.unit = Number(value);
        });
        gui.add(textRenderStyle.fontSize!, "size", 0.1, 100, 0.1);
        gui.add(textRenderStyle.fontSize!, "backgroundSize", 0.0, 100, 0.1);
        gui.addColor(guiOptions, "color").onChange(() => {
            textRenderStyle.color!.r = guiOptions.color.r / 255.0;
            textRenderStyle.color!.g = guiOptions.color.g / 255.0;
            textRenderStyle.color!.b = guiOptions.color.b / 255.0;
        });
        gui.add(textRenderStyle, "opacity", 0.0, 1.0, 0.01);
        gui.addColor(guiOptions, "backgroundColor").onChange(() => {
            textRenderStyle.backgroundColor!.r = guiOptions.backgroundColor.r / 255.0;
            textRenderStyle.backgroundColor!.g = guiOptions.backgroundColor.g / 255.0;
            textRenderStyle.backgroundColor!.b = guiOptions.backgroundColor.b / 255.0;
        });
        gui.add(textRenderStyle, "backgroundOpacity", 0.0, 1.0, 0.1);
        gui.add(guiOptions, "fontName").onFinishChange((value: string) => {
            textRenderStyle.fontName = value;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(textRenderStyle, "fontStyle", {
            Regular: FontStyle.Regular,
            Bold: FontStyle.Bold,
            Italic: FontStyle.Italic,
            BoldItalic: FontStyle.BoldItalic
        }).onChange((value: string) => {
            textRenderStyle.fontStyle = Number(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(textRenderStyle, "fontVariant", {
            Regular: FontVariant.Regular,
            AllCaps: FontVariant.AllCaps,
            SmallCaps: FontVariant.SmallCaps
        }).onChange((value: string) => {
            textRenderStyle.fontVariant = Number(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
    }

    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);

        sceneCamera.aspect = window.innerWidth / window.innerHeight;

        sceneCamera.updateProjectionMatrix();
    }

    function onKeyDown(event: any) {
        const key = event.keyCode || event.which;
        // Handle backspaces.
        if (key === 8) {
            textSample = textSample.slice(0, textSample.length - 1);
        } else {
            const char = String.fromCharCode(key);
            textSample += char;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(char, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        }
    }

    function animate() {
        requestAnimationFrame(animate);

        if (assetsLoaded) {
            textCanvas.clear();
            textCanvas.textRenderStyle = textRenderStyle;
            textCanvas.textLayoutStyle = textLayoutStyle;
            textCanvas.addText(textSample, textPosition);
            textCanvas.render(textCamera, renderTarget, true);
        }

        cube.rotation.x += 0.005;
        cube.rotation.y += 0.01;
        webglRenderer.render(scene, sceneCamera);

        stats.update();
    }

    function main() {
        // Init Three.JS
        webglRenderer = new THREE.WebGLRenderer({
            canvas: document.getElementById("mapCanvas") as HTMLCanvasElement,
            antialias: true
        });
        webglRenderer.autoClear = false;
        webglRenderer.setClearColor(0xffffff);
        webglRenderer.setPixelRatio(window.devicePixelRatio);
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(webglRenderer.domElement);
        document.body.appendChild(stats.dom);
        window.addEventListener("resize", onWindowResize);
        window.addEventListener("keydown", onKeyDown);

        renderTarget = new THREE.WebGLRenderTarget(1024, 1024, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipMapLinearFilter,
            magFilter: THREE.LinearFilter
        });
        textCamera = new THREE.OrthographicCamera(-512.0, 512.0, 512.0, -512.0);
        textCamera.position.z = 1.0;
        textCamera.near = 0.0;
        textCamera.updateProjectionMatrix();

        sceneCamera = new THREE.PerspectiveCamera(90.0, window.innerWidth / window.innerHeight);
        sceneCamera.position.z = 400;
        scene = new THREE.Scene();
        cube = new THREE.Mesh(
            new THREE.BoxGeometry(200, 200, 200),
            new THREE.MeshBasicMaterial({ map: renderTarget.texture })
        );
        scene.add(cube);

        // Init TextCanvas
        textRenderStyle = new TextRenderStyle({
            fontSize: { unit: FontUnit.Pixel, size: 64.0, backgroundSize: 8.0 },
            color: new THREE.Color(0xff0000),
            backgroundColor: new THREE.Color(0x000000),
            backgroundOpacity: 1.0
        });
        textLayoutStyle = new TextLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center,
            verticalAlignment: VerticalAlignment.Below,
            lineWidth: 1024.0,
            wrappingMode: WrappingMode.Character
        });
        FontCatalog.load("resources/fonts/Default_FontCatalog.json", 2048)
            .then((loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: characterCount
                });
                loadedFontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                    assetsLoaded = true;
                });
            })
            .catch(error => {
                // tslint:disable-next-line:no-console
                console.error(error);
            });

        // Init Debug Visualization
        addGUIControls();

        // Animation loop
        animate();
    }

    main();
}
