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
    DefaultLayoutStyle,
    DefaultTextStyle,
    FontCatalog,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    LayoutStyle,
    TextCanvas,
    TextStyle,
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
        font: "",
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
    let textStyle: TextStyle;
    let layoutStyle: LayoutStyle;
    let assetsLoaded = false;

    const characterCount = 1024;
    let textSample = "Type to start...";
    const textPosition = new THREE.Vector3(0.0, 500, 0.0);

    function addGUIControls() {
        guiOptions.color.r = textStyle.color!.r * 255.0;
        guiOptions.color.g = textStyle.color!.g * 255.0;
        guiOptions.color.b = textStyle.color!.b * 255.0;
        guiOptions.backgroundColor.r = textStyle.backgroundColor!.r * 255.0;
        guiOptions.backgroundColor.g = textStyle.backgroundColor!.g * 255.0;
        guiOptions.backgroundColor.b = textStyle.backgroundColor!.b * 255.0;

        gui.add(textStyle.fontSize!, "unit", {
            Em: FontUnit.Em,
            Pixel: FontUnit.Pixel,
            Point: FontUnit.Point,
            Percent: FontUnit.Percent
        }).onChange((value: string) => {
            textStyle.fontSize!.unit = Number(value);
        });
        gui.add(textStyle.fontSize!, "size", 0.1, 100, 0.1);
        gui.add(textStyle.fontSize!, "backgroundSize", 0.0, 100, 0.1);
        gui.add(textStyle, "tracking", -3.0, 3.0, 0.1);
        gui.addColor(guiOptions, "color").onChange(() => {
            textStyle.color!.r = guiOptions.color.r / 255.0;
            textStyle.color!.g = guiOptions.color.g / 255.0;
            textStyle.color!.b = guiOptions.color.b / 255.0;
        });
        gui.add(textStyle, "opacity", 0.0, 1.0, 0.01);
        gui.addColor(guiOptions, "backgroundColor").onChange(() => {
            textStyle.backgroundColor!.r = guiOptions.backgroundColor.r / 255.0;
            textStyle.backgroundColor!.g = guiOptions.backgroundColor.g / 255.0;
            textStyle.backgroundColor!.b = guiOptions.backgroundColor.b / 255.0;
        });
        gui.add(textStyle, "backgroundOpacity", 0.0, 1.0, 0.1);
        gui.add(guiOptions, "font").onFinishChange((value: string) => {
            textStyle.font = value;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(textStyle, "fontStyle", {
            Regular: FontStyle.Regular,
            Bold: FontStyle.Bold,
            Italic: FontStyle.Italic,
            BoldItalic: FontStyle.BoldItalic
        }).onChange((value: string) => {
            textStyle.fontStyle = Number(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(textStyle, "fontVariant", {
            Regular: FontVariant.Regular,
            AllCaps: FontVariant.AllCaps,
            SmallCaps: FontVariant.SmallCaps
        }).onChange((value: string) => {
            textStyle.fontVariant = Number(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textStyle).then(() => {
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
            textCanvas.fontCatalog.loadCharset(char, textStyle).then(() => {
                assetsLoaded = true;
            });
        }
    }

    function animate() {
        requestAnimationFrame(animate);

        if (assetsLoaded) {
            textCanvas.clear();
            textCanvas.style = textStyle;
            textCanvas.layoutStyle = layoutStyle;
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
        textStyle = DefaultTextStyle.initializeTextStyle({
            fontSize: { unit: FontUnit.Pixel, size: 64.0, backgroundSize: 8.0 },
            color: new THREE.Color(0xff0000),
            backgroundColor: new THREE.Color(0x000000),
            backgroundOpacity: 1.0
        });
        layoutStyle = DefaultLayoutStyle.initializeLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center,
            verticalAlignment: VerticalAlignment.Below,
            lineWidth: 1024.0,
            wrappingMode: WrappingMode.Character
        });
        FontCatalog.load("resources/harp-text-canvas/fonts/Default_FontCatalog.json", 2048)
            .then((loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: characterCount
                });
                loadedFontCatalog.loadCharset(textSample, textStyle).then(() => {
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
