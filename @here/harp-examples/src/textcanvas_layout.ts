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
    ContextualArabicConverter,
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
 * This example showcases how by using [[TextCanvas]] we can deal with complex text layouts,
 * such as line-breaking, alignment or wrapping.
 *
 * For more information regarding basic [[TextCanvas]] initialization and usage, please check:
 * [[TextCanvasMinimalExample]] documentation.
 */
export namespace TextCanvasLayoutExample {
    const stats = new Stats();
    const gui = new GUI({ hideable: false });
    const guiOptions = {
        font: "",
        gridEnabled: false,
        boundsEnabled: false,
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
    let layoutStyle: LayoutStyle;
    let textStyle: TextStyle;
    let assetsLoaded: boolean = false;

    const characterCount = 256;
    const textSample = ContextualArabicConverter.instance.convert(`
egypt

مصر

bahrain مصر kuwait

The title is مفتاح معايير الويب, in Arabic.

one two ثلاثة 1234 خمسة

one two ثلاثة ١٢٣٤ خمسة

0123456789

The title is مفتاح (معايير) الويب, in Arabic.

سد 9 أبريل 1947

he said "ٱٹ!" to her
`);
    const textPosition: THREE.Vector3 = new THREE.Vector3(0.0, window.innerHeight * 0.5, 0.0);

    const textBounds: THREE.Box2 = new THREE.Box2(new THREE.Vector2(), new THREE.Vector2());
    const characterBounds: THREE.Box2[] = [];
    let boundsScene: THREE.Scene;
    let boundsVertexBuffer: THREE.BufferAttribute;
    let boundsGeometry: THREE.BufferGeometry;
    let boundsObject: THREE.Object3D;

    let gridScene: THREE.Scene;

    function addGUIControls() {
        gui.add(guiOptions, "gridEnabled");
        gui.add(guiOptions, "boundsEnabled");

        guiOptions.color.r = textStyle.color!.r * 255.0;
        guiOptions.color.g = textStyle.color!.g * 255.0;
        guiOptions.color.b = textStyle.color!.b * 255.0;
        guiOptions.backgroundColor.r = textStyle.backgroundColor!.r * 255.0;
        guiOptions.backgroundColor.g = textStyle.backgroundColor!.g * 255.0;
        guiOptions.backgroundColor.b = textStyle.backgroundColor!.b * 255.0;

        const textStyleGui = gui.addFolder("TextStyle");
        textStyleGui
            .add(textStyle.fontSize!, "unit", {
                Em: FontUnit.Em,
                Pixel: FontUnit.Pixel,
                Point: FontUnit.Point,
                Percent: FontUnit.Percent
            })
            .onChange((value: string) => {
                textStyle.fontSize!.unit = Number(value);
            });
        textStyleGui.add(textStyle.fontSize!, "size", 0.1, 100, 0.1);
        textStyleGui.add(textStyle.fontSize!, "backgroundSize", 0.0, 100, 0.1);
        textStyleGui.add(textStyle, "tracking", -3.0, 3.0, 0.1);
        textStyleGui.addColor(guiOptions, "color").onChange(() => {
            textStyle.color!.r = guiOptions.color.r / 255.0;
            textStyle.color!.g = guiOptions.color.g / 255.0;
            textStyle.color!.b = guiOptions.color.b / 255.0;
        });
        textStyleGui.add(textStyle, "opacity", 0.0, 1.0, 0.01);
        textStyleGui.addColor(guiOptions, "backgroundColor").onChange(() => {
            textStyle.backgroundColor!.r = guiOptions.backgroundColor.r / 255.0;
            textStyle.backgroundColor!.g = guiOptions.backgroundColor.g / 255.0;
            textStyle.backgroundColor!.b = guiOptions.backgroundColor.b / 255.0;
        });
        textStyleGui.add(textStyle, "backgroundOpacity", 0.0, 1.0, 0.1);
        textStyleGui.add(guiOptions, "font").onFinishChange((value: string) => {
            textStyle.font = value;
            assetsLoaded = false;
            textCanvas.fontCatalog.loadCharset(textSample, textStyle).then(() => {
                assetsLoaded = true;
            });
        });
        textStyleGui
            .add(textStyle, "fontStyle", {
                Regular: FontStyle.Regular,
                Bold: FontStyle.Bold,
                Italic: FontStyle.Italic,
                BoldItalic: FontStyle.BoldItalic
            })
            .onChange((value: string) => {
                textStyle.fontStyle = Number(value);
                assetsLoaded = false;
                textCanvas.fontCatalog.loadCharset(textSample, textStyle).then(() => {
                    assetsLoaded = true;
                });
            });
        textStyleGui
            .add(textStyle, "fontVariant", {
                Regular: FontVariant.Regular,
                AllCaps: FontVariant.AllCaps,
                SmallCaps: FontVariant.SmallCaps
            })
            .onChange((value: string) => {
                textStyle.fontVariant = Number(value);
                assetsLoaded = false;
                textCanvas.fontCatalog.loadCharset(textSample, textStyle).then(() => {
                    assetsLoaded = true;
                });
            });

        const textLayoutGui = gui.addFolder("TextLayout");
        textLayoutGui.add(layoutStyle, "lineWidth", 1.0, window.innerWidth, 1.0);
        textLayoutGui.add(layoutStyle, "maxLines", 0.0, 128, 1.0);
        textLayoutGui.add(layoutStyle, "leading", -3.0, 3.0, 0.1);
        textLayoutGui
            .add(layoutStyle, "horizontalAlignment", {
                Left: HorizontalAlignment.Left,
                Center: HorizontalAlignment.Center,
                Right: HorizontalAlignment.Right
            })
            .onChange((value: string) => {
                layoutStyle.horizontalAlignment = Number(value);
            });
        textLayoutGui
            .add(layoutStyle, "verticalAlignment", {
                Above: VerticalAlignment.Above,
                Center: VerticalAlignment.Center,
                Below: VerticalAlignment.Below
            })
            .onChange((value: string) => {
                layoutStyle.verticalAlignment = Number(value);
            });
        textLayoutGui
            .add(layoutStyle, "wrappingMode", {
                None: WrappingMode.None,
                Character: WrappingMode.Character,
                Word: WrappingMode.Word
            })
            .onChange((value: string) => {
                layoutStyle.wrappingMode = Number(value);
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
    }

    function initDebugBounds() {
        boundsScene = new THREE.Scene();
        boundsVertexBuffer = new THREE.BufferAttribute(
            new Float32Array(32 * 4 * characterCount),
            4
        );
        boundsVertexBuffer.setDynamic(true);
        boundsGeometry = new THREE.BufferGeometry();
        boundsGeometry.addAttribute("position", boundsVertexBuffer);
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

        textPosition.setY(window.innerHeight * 0.5);
    }

    function animate() {
        requestAnimationFrame(animate);
        webglRenderer.clear();

        if (guiOptions.gridEnabled) {
            webglRenderer.render(gridScene, camera);
        }

        if (assetsLoaded) {
            textCanvas.clear();
            textCanvas.style = textStyle;
            textCanvas.layoutStyle = layoutStyle;
            textCanvas.addText(textSample, textPosition);
            textCanvas.render(camera);

            if (guiOptions.boundsEnabled) {
                textCanvas.measureText(textSample, textBounds, characterBounds);
                updateDebugBounds(textPosition);
                webglRenderer.render(boundsScene, camera);
            }
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
        layoutStyle = DefaultLayoutStyle.initializeLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center,
            verticalAlignment: VerticalAlignment.Below,
            lineWidth: window.innerWidth
        });
        textStyle = DefaultTextStyle.initializeTextStyle();
        FontCatalog.load("resources/harp-text-canvas/fonts/Default_FontCatalog.json", 128).then(
            (loadedFontCatalog: FontCatalog) => {
                textCanvas = new TextCanvas({
                    renderer: webglRenderer,
                    fontCatalog: loadedFontCatalog,
                    maxGlyphCount: characterCount
                });
                loadedFontCatalog.loadCharset(textSample, textStyle).then(() => {
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
