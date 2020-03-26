/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import * as THREE from "three";

import { Env } from "@here/harp-datasource-protocol";
import "@here/harp-fetch";
import { getTestResourceUrl } from "@here/harp-test-utils";
import {
    FontCatalog,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutParameters,
    TextLayoutStyle,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";
import { getAppBaseUrl } from "@here/harp-utils";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import { placeIcon, PlacementResult, placePointLabel } from "../lib/text/Placement";
import { RenderState } from "../lib/text/RenderState";
import { LoadingState, TextElement } from "../lib/text/TextElement";
import { TextElementState } from "../lib/text/TextElementState";

const inNodeContext = typeof window === "undefined";

async function createTextElement(
    textCanvas: TextCanvas,
    text: string,
    points: THREE.Vector3[] | THREE.Vector3,
    renderParams: TextRenderParameters | TextRenderStyle = {},
    layoutParams: TextLayoutParameters | TextLayoutStyle = {}
): Promise<TextElement> {
    const textElement = new TextElement(text, points, renderParams, layoutParams);
    textElement.loadingState = LoadingState.Requested;
    if (textElement.renderStyle === undefined) {
        textElement.renderStyle = new TextRenderStyle({
            ...textElement.renderParams
        });
    }
    if (textElement.layoutStyle === undefined) {
        textElement.layoutStyle = new TextLayoutStyle({
            ...textElement.layoutParams
        });
    }
    textElement.glyphCaseArray = [];
    textElement.bounds = undefined;
    await textCanvas.fontCatalog.loadCharset(textElement.text, textElement.renderStyle!);
    textElement.glyphs = textCanvas.fontCatalog.getGlyphs(
        textElement.text,
        textCanvas.textRenderStyle,
        textElement.glyphCaseArray
    );
    textElement.loadingState = LoadingState.Loaded;

    return textElement;
}

async function createTextCanvas(): Promise<TextCanvas> {
    let fontDir = getTestResourceUrl("@here/harp-fontcatalog", "");
    if (inNodeContext) {
        fontDir = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));
    }
    const fontCatalog = await FontCatalog.load(
        path.join(fontDir, "resources/Default_FontCatalog.json"),
        16
    );

    return new TextCanvas({
        renderer: {},
        fontCatalog,
        minGlyphCount: 16,
        maxGlyphCount: 255
    } as any);
}

describe("Placement", function() {
    const sandbox = sinon.createSandbox();
    let textCanvas: TextCanvas;
    const screenCollisions: ScreenCollisions = new ScreenCollisions();
    screenCollisions.update(1024, 1024);
    const appBaseUrl = getAppBaseUrl();

    before(async function() {
        if (inNodeContext) {
            (global as any).window = {
                location: {
                    href: appBaseUrl
                }
            };
            (global as any).document = {};
        }
        const image = {
            width: 1024,
            height: 1024
        };
        const texture = new THREE.Texture(image as any);
        sandbox.stub(FontCatalog, "loadTexture").returns(Promise.resolve(texture));

        textCanvas = await createTextCanvas();
    });

    after(function() {
        if (inNodeContext) {
            delete (global as any).window;
            delete (global as any).document;
        }
        sandbox.restore();
    });

    afterEach(function() {
        screenCollisions.reset();
    });

    describe("placePointLabel", function() {
        context("single line text", function() {
            it("places text left below", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test 123456",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(0);
            });

            it("places text center below", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test 123456",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(0);
            });

            it("places text right below", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test 123456",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(0);
            });

            it("places text center", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test 123456",
                    new THREE.Vector3(),
                    {},
                    {
                        verticalAlignment: VerticalAlignment.Center,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(0.25);
            });

            it("places text above", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test 123456",
                    new THREE.Vector3(),
                    {},
                    {
                        verticalAlignment: VerticalAlignment.Above,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(2.5);
            });

            it("places text with offset", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test 123456",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                textElement.xOffset = 5;
                textElement.yOffset = 5;
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(5);
                expect(position.y).to.equal(-5);
            });
        });

        context("multi line text", function() {
            it("places text below", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Test Test Test Test Test Test Test Test",
                    new THREE.Vector3(),
                    {},
                    {
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.Word,
                        lineWidth: 1
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(0);
            });

            it("places text center", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Test Test Test Test Test Test Test Test",
                    new THREE.Vector3(),
                    {},
                    {
                        verticalAlignment: VerticalAlignment.Center,
                        wrappingMode: WrappingMode.Word,
                        lineWidth: 1
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(76.25);
            });

            it("places text above", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Test Test Test Test Test Test Test Test",
                    new THREE.Vector3(),
                    {},
                    {
                        verticalAlignment: VerticalAlignment.Above,
                        wrappingMode: WrappingMode.Word,
                        lineWidth: 1
                    }
                );
                const state = new TextElementState(textElement);

                const position = new THREE.Vector3();
                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                const result = placePointLabel(
                    state,
                    new THREE.Vector2(0, 0),
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(154.5);
            });
        });

        it("places text with offset", async function() {
            const textElement = await createTextElement(
                textCanvas,
                "Test 123456",
                new THREE.Vector3(),
                {},
                {
                    horizontalAlignment: HorizontalAlignment.Center,
                    verticalAlignment: VerticalAlignment.Above,
                    wrappingMode: WrappingMode.Word,
                    lineWidth: 1
                }
            );
            textElement.xOffset = 5;
            textElement.yOffset = 5;
            const state = new TextElementState(textElement);

            const position = new THREE.Vector3();
            // Set the current style for the canvas.
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;
            const result = placePointLabel(
                state,
                new THREE.Vector2(0, 0),
                1.0,
                textCanvas,
                screenCollisions,
                false,
                position
            );

            expect(result).to.equal(PlacementResult.Ok);
            expect(position.x).to.equal(5);
            expect(position.y).to.equal(26.5);
        });

        it("scales offsets", async function() {
            const textElement = await createTextElement(
                textCanvas,
                "Test 123456",
                new THREE.Vector3(),
                {},
                {
                    horizontalAlignment: HorizontalAlignment.Center,
                    verticalAlignment: VerticalAlignment.Above,
                    wrappingMode: WrappingMode.Word,
                    lineWidth: 1
                }
            );
            textElement.xOffset = 5;
            textElement.yOffset = 5;
            const state = new TextElementState(textElement);

            const position = new THREE.Vector3();
            // Set the current style for the canvas.
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;
            const result = placePointLabel(
                state,
                new THREE.Vector2(0, 0),
                0.8,
                textCanvas,
                screenCollisions,
                false,
                position
            );

            expect(result).to.equal(PlacementResult.Ok);
            expect(position.x).to.equal(4);
            expect(position.y).to.equal(21.200000000000003);
        });
    });

    describe("placeIcon", function() {
        it("places icon without offset", function() {
            const iconRenderState = new RenderState();
            iconRenderState.updateFading(800, true);

            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                poiRenderBatch: 1,
                technique: {}
            };

            const result = placeIcon(
                iconRenderState,
                poiInfo as any,
                new THREE.Vector2(),
                1.0,
                new Env(),
                screenCollisions
            );

            expect(result).to.equal(PlacementResult.Ok);
        });

        it("places icon with offset", function() {
            const iconRenderState = new RenderState();
            iconRenderState.updateFading(800, true);

            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                poiRenderBatch: 1,
                technique: {
                    iconYOffset: -16
                }
            };

            const result = placeIcon(
                iconRenderState,
                poiInfo as any,
                new THREE.Vector2(),
                1.0,
                new Env(),
                screenCollisions
            );

            expect(result).to.equal(PlacementResult.Ok);
        });
    });
});
