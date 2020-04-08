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
const screenWidth: number = 1024;
const screenHeight: number = 1024;
const screenTopLeft = new THREE.Vector2(-screenWidth / 2, -screenHeight / 2);
const screenTopRight = new THREE.Vector2(screenWidth / 2, -screenHeight / 2);
const screenBottomLeft = new THREE.Vector2(-screenWidth / 2, screenHeight / 2);
const screenBottomRight = new THREE.Vector2(screenWidth / 2, screenHeight / 2);

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

async function createPointTextElements(
    textCanvas: TextCanvas,
    texts: string[],
    renderParams: TextRenderParameters | TextRenderStyle = {},
    layoutParams: TextLayoutParameters | TextLayoutStyle = {}
): Promise<TextElement[]> {
    const promises = texts.map(text => {
        return createTextElement(textCanvas, text, new THREE.Vector3(), renderParams, layoutParams);
    });
    return Promise.all(promises);
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

function createTextElementsStates(textElements: TextElement[]): TextElementState[] {
    const states = textElements.map(element => new TextElementState(element));
    states.forEach(e => e.update(1));
    return states;
}

describe("Placement", function() {
    const sandbox = sinon.createSandbox();
    let textCanvas: TextCanvas;
    const screenCollisions: ScreenCollisions = new ScreenCollisions();
    screenCollisions.update(screenWidth, screenHeight);
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
            width: screenWidth,
            height: screenHeight
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

        context("single text with alternative placement", function() {
            it("places text in top-left screen corner", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Diagonal Alternative",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);
                // At least one update required to initialize the state.
                state.update(1);

                const outPosition = new THREE.Vector3();
                const inPosition = new THREE.Vector2(-10, -10).add(screenTopLeft);

                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                // Run placement without multi-placement support
                let result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    false
                );

                // Label out of screen and layout unchanged.
                let layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Invisible);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Right);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Below);

                // Place again with multi-placement support
                result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    true
                );
                // Label placed and layout changed diagonally.
                layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Ok);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Left);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Above);
            });

            it("places text in top-right screen corner", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Diagonal Alternative",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);
                // At least one update required to initialize the state.
                state.update(1);

                const outPosition = new THREE.Vector3();
                const inPosition = new THREE.Vector2(10, -10).add(screenTopRight);

                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                // Run placement without multi-placement support
                let result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    false
                );

                // Label out of screen and layout unchanged.
                let layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Invisible);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Left);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Below);

                // Place again with multi-placement support
                result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    true
                );
                // Label placed and layout changed diagonally.
                layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Ok);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Right);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Above);
            });

            it("places text in bottom-right screen corner", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Diagonal Alternative",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Above,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);
                // At least one update required to initialize the state.
                state.update(1);

                const outPosition = new THREE.Vector3();
                const inPosition = new THREE.Vector2(10, 10).add(screenBottomRight);

                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                // Run placement without multi-placement support
                let result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    false
                );

                // Label out of screen and layout unchanged.
                let layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Invisible);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Left);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Above);

                // Place again with multi-placement support
                result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    true
                );
                // Label placed and layout changed diagonally.
                layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Ok);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Right);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Below);
            });

            it("places text in bottom-left screen corner", async function() {
                const textElement = await createTextElement(
                    textCanvas,
                    "Test Diagonal Alternative",
                    new THREE.Vector3(),
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Above,
                        wrappingMode: WrappingMode.None
                    }
                );
                const state = new TextElementState(textElement);
                // At least one update required to initialize the state.
                state.update(1);

                const outPosition = new THREE.Vector3();
                const inPosition = new THREE.Vector2(-10, 10).add(screenBottomLeft);

                // Set the current style for the canvas.
                textCanvas.textRenderStyle = textElement.renderStyle!;
                textCanvas.textLayoutStyle = textElement.layoutStyle!;
                // Run placement without multi-placement support
                let result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    false
                );

                // Label out of screen and layout unchanged.
                let layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Invisible);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Right);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Above);

                // Place again with multi-placement support
                result = placePointLabel(
                    state,
                    inPosition,
                    1.0,
                    textCanvas,
                    screenCollisions,
                    false,
                    outPosition,
                    true
                );
                // Label placed and layout changed diagonally.
                layout = state.textLayoutState!;
                expect(result).to.equal(PlacementResult.Ok);
                expect(layout.horizontalAlignment).to.be.equal(HorizontalAlignment.Left);
                expect(layout.verticalAlignment).to.be.equal(VerticalAlignment.Below);
            });
        });

        context("texts colliding with alternative placements", function() {
            it("place two text at almost the same position", async function() {
                const elements = await createPointTextElements(
                    textCanvas,
                    ["Test 1", "Test 2"],
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                expect(elements.length).to.equal(2);
                const states = createTextElementsStates(elements);
                const offset = 5; // Need to keep some offset because of internal margin
                const inPositions = [new THREE.Vector2(-offset, 0), new THREE.Vector2(offset, 0)];
                const outPositions = [new THREE.Vector3(), new THREE.Vector3()];

                // Place each text element sequentially without multi-placement support
                const results: PlacementResult[] = [0, 0];
                for (let i = 0; i < states.length; ++i) {
                    textCanvas.textRenderStyle = elements[i].renderStyle!;
                    textCanvas.textLayoutStyle = elements[i].layoutStyle!;
                    results[i] = placePointLabel(
                        states[i],
                        inPositions[i],
                        1.0,
                        textCanvas,
                        screenCollisions,
                        false,
                        outPositions[i]
                    );
                    expect(outPositions[i].x).to.equal(inPositions[i].x);
                    expect(outPositions[i].y).to.equal(inPositions[i].y);
                }
                // First element allocated, second collides, because it's a new label
                // it retrieves PlacementResult.Invisible status.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Invisible);

                // Cleanup screen for next frame
                screenCollisions.reset();

                // Try again with multi-placement support.
                for (let i = 0; i < states.length; ++i) {
                    textCanvas.textRenderStyle = elements[i].renderStyle!;
                    textCanvas.textLayoutStyle = elements[i].layoutStyle!;
                    results[i] = placePointLabel(
                        states[i],
                        inPositions[i],
                        1.0,
                        textCanvas,
                        screenCollisions,
                        false,
                        outPositions[i],
                        true
                    );
                }
                // First element has placement unchanged.
                expect(outPositions[0].x).to.equal(inPositions[0].x);
                expect(outPositions[0].y).to.equal(inPositions[0].y);
                // Second occupies alternative placement.
                expect(
                    outPositions[1].x !== inPositions[1].x || outPositions[1].y !== inPositions[1].y
                ).to.be.true;
                // As also with different anchor.
                const layout0 = states[0].textLayoutState!;
                const layout1 = states[1].textLayoutState!;
                expect(
                    layout0.horizontalAlignment !== layout1.horizontalAlignment ||
                        layout0.horizontalAlignment !== layout1.horizontalAlignment
                ).to.be.true;
                // Both elements allocated.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Ok);
            });

            it("fail to place two centered texts at almost the same position", async function() {
                const elements = await createPointTextElements(
                    textCanvas,
                    ["Test 1", "Test 2"],
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Center,
                        wrappingMode: WrappingMode.None
                    }
                );
                expect(elements.length).to.equal(2);
                const states = createTextElementsStates(elements);
                const offset = 5; // Need to keep some offset because of internal margin
                const inPositions = [new THREE.Vector2(-offset, 0), new THREE.Vector2(offset, 0)];
                const outPositions = [new THREE.Vector3(), new THREE.Vector3()];

                // Place each text element sequentially without multi-placement support
                const results: PlacementResult[] = [0, 0];
                for (let i = 0; i < states.length; ++i) {
                    textCanvas.textRenderStyle = elements[i].renderStyle!;
                    textCanvas.textLayoutStyle = elements[i].layoutStyle!;
                    results[i] = placePointLabel(
                        states[i],
                        inPositions[i],
                        1.0,
                        textCanvas,
                        screenCollisions,
                        false,
                        outPositions[i],
                        true
                    );
                    // Even with multi-placement turned on, the labels are not using
                    // alternative placement algorithm - they are excluded.
                    // TODO: HARP-6487 This may be due to change when placements will be
                    // parsed from theme.
                    expect(states[i].textLayoutState!.horizontalAlignment).to.equal(
                        HorizontalAlignment.Center
                    );
                    expect(states[i].textLayoutState!.verticalAlignment).to.equal(
                        VerticalAlignment.Center
                    );
                }
                // First element allocated, second collides, without alternative placement,
                // centered labels are not handled with multi-anchor placement.
                // Because it's a new label it retrieves PlacementResult.Invisible status.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Invisible);
            });

            it("place two approaching texts", async function() {
                const elements = await createPointTextElements(
                    textCanvas,
                    ["Test 1", "Test 2"],
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below,
                        wrappingMode: WrappingMode.None
                    }
                );
                const states = createTextElementsStates(elements);
                // Offset big enough to place without collisions
                let offset = 50;
                const inPositions = [new THREE.Vector2(-offset, 0), new THREE.Vector2(offset, 0)];
                const outPositions = [new THREE.Vector3(), new THREE.Vector3()];

                // Place each text element sequentially.
                const results: PlacementResult[] = [0, 0];
                for (let i = 0; i < states.length; ++i) {
                    textCanvas.textRenderStyle = elements[i].renderStyle!;
                    textCanvas.textLayoutStyle = elements[i].layoutStyle!;
                    results[i] = placePointLabel(
                        states[i],
                        inPositions[i],
                        1.0,
                        textCanvas,
                        screenCollisions,
                        false,
                        outPositions[i],
                        false
                    );
                    expect(outPositions[i].x).to.equal(inPositions[i].x);
                    expect(outPositions[i].y).to.equal(inPositions[i].y);
                }
                // First element allocated, second collides, because it's a new label
                // it retrieves PlacementResult.Invisible status.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Ok);
                // Update their states
                states[0].update(1);
                states[1].update(1);
                expect(states[0].textRenderState).to.be.not.undefined;
                expect(states[1].textRenderState).to.be.not.undefined;
                states[0].textRenderState?.startFadeIn(1);
                states[1].textRenderState?.startFadeIn(1);
                // Labels gets persistent state.
                expect(states[0].visible).to.be.true;
                expect(states[1].visible).to.be.true;

                // Cleanup for the next - approaching frame.
                screenCollisions.reset();
                // Change the offset - labels approaching.
                offset = 5;
                inPositions[0].set(-offset, 0);
                inPositions[1].set(offset, 0);
                // Try again with multi-placement support and possible collisions.
                for (let i = 0; i < states.length; ++i) {
                    textCanvas.textRenderStyle = elements[i].renderStyle!;
                    textCanvas.textLayoutStyle = elements[i].layoutStyle!;
                    results[i] = placePointLabel(
                        states[i],
                        inPositions[i],
                        1.0,
                        textCanvas,
                        screenCollisions,
                        false,
                        outPositions[i],
                        true
                    );
                }
                // First element has placement unchanged.
                expect(outPositions[0].x).to.equal(inPositions[0].x);
                expect(outPositions[0].y).to.equal(inPositions[0].y);
                // Second occupies alternative placement.
                expect(
                    outPositions[1].x === inPositions[1].x && outPositions[1].y === inPositions[1].y
                ).to.be.false;
                // As also with different anchor.
                const layout0 = states[0].textLayoutState!;
                const layout1 = states[1].textLayoutState!;
                expect(
                    layout0.horizontalAlignment === layout1.horizontalAlignment ||
                        layout0.horizontalAlignment === layout1.horizontalAlignment
                ).to.be.false;
                // Both elements allocated.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Ok);
                // Update states.
                states[0].textRenderState?.updateFading(2, false);
                states[1].textRenderState?.updateFading(2, false);
                expect(states[0].visible).to.be.true;
                expect(states[1].visible).to.be.true;

                // Cleanup for the next - approaching frame.
                screenCollisions.reset();
                // Change the offset - labels are at very same position - impossible for placement.
                offset = 0;
                inPositions[0].set(-offset, 0);
                inPositions[1].set(offset, 0);
                // Try again with multi-placement support and possible collisions.
                for (let i = 0; i < states.length; ++i) {
                    textCanvas.textRenderStyle = elements[i].renderStyle!;
                    textCanvas.textLayoutStyle = elements[i].layoutStyle!;
                    results[i] = placePointLabel(
                        states[i],
                        inPositions[i],
                        1.0,
                        textCanvas,
                        screenCollisions,
                        false,
                        outPositions[i],
                        true
                    );
                }
                // First element has placement unchanged.
                expect(outPositions[0].x).to.equal(inPositions[0].x);
                expect(outPositions[0].y).to.equal(inPositions[0].y);
                // Second element has to stay at the same placement - for fading.
                expect(outPositions[0].x).to.equal(inPositions[0].x);
                expect(outPositions[0].y).to.equal(inPositions[0].y);
                // First element space allocated - placed.
                expect(results[0]).to.equal(PlacementResult.Ok);
                // Second is rejected, but not invisible, because of its persistence
                // state, it may start fading out now.
                expect(results[1]).to.equal(PlacementResult.Rejected);
            });
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
