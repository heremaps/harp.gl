/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ContextualArabicConverter,
    FontCatalog,
    FontStyle,
    FontUnit,
    FontVariant,
    TextCanvas,
    TextRenderStyle
} from "@here/harp-text-canvas";
import { GUI } from "dat.gui";
import * as Stats from "stats.js";
import * as THREE from "three";
/**
 * This example showcases how [[TextCanvas]] can handle dynamic loading of multiple [[FontCatalog]]
 * assets, as well as dynamic real-time text styling.
 *
 */
export namespace TextCanvasDynamicExample {
    const stats = new Stats();
    const gui = new GUI({ hideable: false });
    const guiOptions = {
        input: "Type to start...",
        fontName: "",
        gridEnabled: true,
        boundsEnabled: true,
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

    let webglRenderer: THREE.WebGLRenderer;
    let camera: THREE.OrthographicCamera;

    let textCanvas: TextCanvas;
    let textRenderStyle: TextRenderStyle;
    let assetsLoaded = false;

    const characterCount = 256;
    let textSample = guiOptions.input;
    const penPosition: THREE.Vector3 = new THREE.Vector3(
        Math.floor(-window.innerWidth / 4.0),
        0,
        0
    );

    const textBounds: THREE.Box2 = new THREE.Box2(new THREE.Vector2(), new THREE.Vector2());
    const characterBounds: THREE.Box2[] = [];
    let boundsScene: THREE.Scene;
    let boundsVertexBuffer: THREE.BufferAttribute;
    let boundsGeometry: THREE.BufferGeometry;
    let boundsObject: THREE.Object3D;
    const boundsPosition: THREE.Vector3 = penPosition.clone();

    let gridScene: THREE.Scene;
    let penObject: THREE.Object3D;
    let upperCase: boolean = false;

    function addGUIControls() {
        guiOptions.color.r = textRenderStyle.color!.r * 255.0;
        guiOptions.color.g = textRenderStyle.color!.g * 255.0;
        guiOptions.color.b = textRenderStyle.color!.b * 255.0;
        guiOptions.backgroundColor.r = textRenderStyle.backgroundColor!.r * 255.0;
        guiOptions.backgroundColor.g = textRenderStyle.backgroundColor!.g * 255.0;
        guiOptions.backgroundColor.b = textRenderStyle.backgroundColor!.b * 255.0;

        gui.add(guiOptions, "input").onFinishChange((value: string) => {
            textSample = ContextualArabicConverter.instance.convert(value);
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        });
        gui.add(guiOptions, "gridEnabled");
        gui.add(guiOptions, "boundsEnabled");
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

    function initDebugGrid() {
        gridScene = new THREE.Scene();
        gridScene.add(
            new THREE.LineSegments(
                new THREE.WireframeGeometry(
                    new THREE.PlaneBufferGeometry(
                        window.innerWidth - 1,
                        window.innerHeight - 1,
                        window.innerWidth / 16,
                        window.innerHeight / 16
                    )
                ),
                new THREE.LineBasicMaterial({
                    color: 0x999999,
                    depthWrite: false,
                    depthTest: false
                })
            ),
            new THREE.LineSegments(
                new THREE.WireframeGeometry(
                    new THREE.PlaneBufferGeometry(
                        window.innerWidth - 1,
                        window.innerHeight - 1,
                        2,
                        2
                    )
                ),
                new THREE.LineBasicMaterial({
                    color: 0xff0000,
                    depthWrite: false,
                    depthTest: false
                })
            )
        );

        penObject = new THREE.Mesh(
            new THREE.SphereBufferGeometry(4, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        gridScene.add(penObject);
    }

    function initDebugBounds() {
        boundsScene = new THREE.Scene();
        boundsVertexBuffer = new THREE.BufferAttribute(
            new Float32Array(32 * 4 * characterCount),
            4
        );
        boundsVertexBuffer.setUsage(THREE.DynamicDrawUsage);
        boundsGeometry = new THREE.BufferGeometry();
        boundsGeometry.setAttribute("position", boundsVertexBuffer);
        boundsObject = new THREE.Line(
            boundsGeometry,
            new THREE.LineBasicMaterial({
                color: 0xff0000,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.2
            })
        );
        boundsScene.add(boundsObject);
    }

    function updateDebugBounds(position: THREE.Vector3) {
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

        boundsObject.position.x = position.x;
        boundsObject.position.y = position.y;
    }

    function onWindowResize() {
        webglRenderer.setSize(window.innerWidth, window.innerHeight);

        camera.left = -window.innerWidth / 2.0;
        camera.right = window.innerWidth / 2.0;
        camera.bottom = -window.innerHeight / 2.0;
        camera.top = window.innerHeight / 2.0;
        camera.updateProjectionMatrix();
    }
    function onKeyUp(event: any) {
        const key = event.keyCode || event.which;
        if (key === 16) {
            upperCase = false;
        }
    }

    function onKeyDown(event: any) {
        const key = event.keyCode || event.which;
        // Handle backspaces.
        if (key === 8) {
            textSample = textSample.slice(0, textSample.length - 1);
        } else if (key === 16) {
            upperCase = true;
        } else {
            const char = upperCase
                ? String.fromCharCode(key)
                : String.fromCharCode(key).toLowerCase();

            textSample += char;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(char, textRenderStyle).then(() => {
                assetsLoaded = true;
            });
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();

        if (guiOptions.gridEnabled) {
            penObject.position.set(penPosition.x, penPosition.y, -4.0);
            webglRenderer.render(gridScene, camera);
        }
        penPosition.set(Math.floor(-window.innerWidth / 4.0), 0, 0);
        boundsPosition.copy(penPosition);

        if (assetsLoaded) {
            textCanvas.clear();

            textCanvas.textRenderStyle = textRenderStyle;
            if (guiOptions.boundsEnabled) {
                textCanvas.measureText(textSample, textBounds, {
                    outputCharacterBounds: characterBounds
                });
            }

            textCanvas.addText(textSample, penPosition, { updatePosition: true });
            textCanvas.render(camera);
        }

        if (guiOptions.boundsEnabled) {
            updateDebugBounds(boundsPosition);
            webglRenderer.render(boundsScene, camera);
        }

        stats.update();
    }

    function main() {
        // Init Three.JS, enable backward compatibility with three.js <= 0.117
        webglRenderer = new ((THREE as any).WebGL1Renderer ?? THREE.WebGLRenderer)({
            canvas: document.getElementById("mapCanvas") as HTMLCanvasElement
        });
        webglRenderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
        webglRenderer.autoClear = false;
        webglRenderer.setClearColor(0xffffff);
        webglRenderer.setPixelRatio(window.devicePixelRatio);
        webglRenderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(webglRenderer.domElement);
        document.body.appendChild(stats.dom);
        window.addEventListener("resize", onWindowResize);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);

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
            fontSize: { unit: FontUnit.Pixel, size: 64.0, backgroundSize: 8.0 },
            color: new THREE.Color(0xff0000),
            backgroundColor: new THREE.Color(0x000000),
            backgroundOpacity: 1.0
        });
        FontCatalog.load("resources/fonts/Default_FontCatalog.json", 2048).then(
            (loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    minGlyphCount: 16,
                    maxGlyphCount: characterCount
                });
                loadedFontCatalog.loadCharset(textSample, textRenderStyle).then(() => {
                    assetsLoaded = true;
                });
            }
        );

        // Init Debug Visualization
        initDebugBounds();
        initDebugGrid();
        addGUIControls();

        // Animation loop
        animate();
    }

    main();
}
