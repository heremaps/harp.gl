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
    HorizontalPlacement,
    hPlacementFromAlignment,
    TextCanvas,
    TextLayoutParameters,
    TextLayoutStyle,
    TextPlacement,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    VerticalPlacement,
    vPlacementFromAlignment,
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
const screenTopCenter = new THREE.Vector2(0, -screenHeight / 2);
const screenTopRight = new THREE.Vector2(screenWidth / 2, -screenHeight / 2);
const screenCenterLeft = new THREE.Vector2(-screenWidth / 2, 0);
const screenCenterRight = new THREE.Vector2(screenWidth / 2, 0);
const screenBottomLeft = new THREE.Vector2(-screenWidth / 2, screenHeight / 2);
const screenBottomCenter = new THREE.Vector2(0, screenHeight / 2);
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

function createTextElementState(textElement: TextElement): TextElementState {
    const state = new TextElementState(textElement);
    // At least one update required to initialize the state.
    state.update(1);
    return state;
}

function createTextElementsStates(textElements: TextElement[]): TextElementState[] {
    return textElements.map(element => createTextElementState(element));
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
            interface SingleTextPlacementRun {
                // Test run name.
                it: string;
                // Input / base text layout.
                layout: TextLayoutParameters;
                // Expected output position, input position always at (0, 0).
                outPosition: THREE.Vector2;
                // Optional text offsets to be applied, otherwise zero.
                xOffset?: number;
                yOffset?: number;
            }
            const runs: SingleTextPlacementRun[] = [
                {
                    it: "places text with left-below alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    outPosition: new THREE.Vector2(0, 0)
                },
                {
                    it: "places text center-below alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    outPosition: new THREE.Vector2(0, 0)
                },
                {
                    it: "places text right-below alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    outPosition: new THREE.Vector2(0, 0)
                },
                {
                    it: "places text center aligned",
                    layout: {
                        verticalAlignment: VerticalAlignment.Center
                    },
                    outPosition: new THREE.Vector2(0, 0.25)
                },
                {
                    it: "places text aligned above",
                    layout: {
                        verticalAlignment: VerticalAlignment.Above
                    },
                    outPosition: new THREE.Vector2(0, 2.5)
                },
                {
                    it: "places text with left-below alignment and offset",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    xOffset: 5,
                    yOffset: 5,
                    outPosition: new THREE.Vector2(5, 5)
                },
                {
                    it: "places text with right-below alignment and offset",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    xOffset: 5,
                    yOffset: 5,
                    outPosition: new THREE.Vector2(5, 5)
                }
            ];
            runs.forEach(function(run) {
                it(run.it, async function() {
                    const textElement = await createTextElement(
                        textCanvas,
                        "Test 123456",
                        new THREE.Vector3(),
                        {},
                        {
                            ...run.layout,
                            wrappingMode: WrappingMode.None
                        }
                    );
                    if (run.xOffset) {
                        textElement.xOffset = run.xOffset;
                    }
                    if (run.yOffset) {
                        textElement.yOffset = run.yOffset;
                    }

                    const state = new TextElementState(textElement);
                    const outPosition = new THREE.Vector3();
                    // Set the current style for the canvas.
                    textCanvas.textRenderStyle = textElement.renderStyle!;
                    textCanvas.textLayoutStyle = textElement.layoutStyle!;
                    const result = placePointLabel(
                        state,
                        new THREE.Vector2(0, 0),
                        1.0,
                        textCanvas,
                        new Env(),
                        screenCollisions,
                        false,
                        outPosition
                    );

                    expect(result).to.equal(PlacementResult.Ok);
                    expect(outPosition.x).to.equal(run.outPosition.x);
                    expect(outPosition.y).to.equal(run.outPosition.y);
                });
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
                    new Env(),
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
                    new Env(),
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
                    new Env(),
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0);
                expect(position.y).to.equal(154.5);
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
                    new Env(),
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
                    new Env(),
                    screenCollisions,
                    false,
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(4);
                expect(position.y).to.equal(21.200000000000003);
            });
        });

        context("single text with and without alternative placement", function() {
            interface PlacementAlternativesRun {
                // Test run name.
                it: string;
                // Label text.
                text: string;
                // Input position.
                position: THREE.Vector2;
                // Input / base text layout.
                layout: TextLayoutParameters;
                // Final placement.
                placement: TextPlacement;
            }
            const runs: PlacementAlternativesRun[] = [
                {
                    it: "places text in the top-left screen corner",
                    text: "Test Diagonal Alternative",
                    position: new THREE.Vector2(-10, -10).add(screenTopLeft),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    placement: {
                        h: HorizontalPlacement.Right,
                        v: VerticalPlacement.Top
                    }
                },
                {
                    it: "places text in the top-right screen corner",
                    text: "Test Diagonal Alternative",
                    position: new THREE.Vector2(10, -10).add(screenTopRight),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    placement: {
                        h: HorizontalPlacement.Left,
                        v: VerticalPlacement.Top
                    }
                },
                {
                    it: "places text in the bottom-right screen corner",
                    text: "Test Diagonal Alternative",
                    position: new THREE.Vector2(10, 10).add(screenBottomRight),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    placement: {
                        h: HorizontalPlacement.Left,
                        v: VerticalPlacement.Bottom
                    }
                },
                {
                    it: "places text in the bottom-left screen corner",
                    text: "Test Diagonal Alternative",
                    position: new THREE.Vector2(-10, 10).add(screenBottomLeft),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    placement: {
                        h: HorizontalPlacement.Right,
                        v: VerticalPlacement.Bottom
                    }
                },
                {
                    it: "places text in the center-left screen side",
                    text: "Test Horizontal Alternative",
                    position: new THREE.Vector2(-10, 0).add(screenCenterLeft),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    // Layout changed horizontally and vertically (clock-wise) to move
                    // text away from screen edge.
                    placement: {
                        h: HorizontalPlacement.Center,
                        v: VerticalPlacement.Top
                    }
                },
                {
                    it: "places text in the center-right screen side",
                    text: "Test Horizontal Alternative",
                    position: new THREE.Vector2(10, 0).add(screenCenterRight),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    // Layout changed horizontally and vertically (clock-wise).
                    placement: {
                        h: HorizontalPlacement.Center,
                        v: VerticalPlacement.Bottom
                    }
                },
                {
                    it: "places text in the top-center screen side",
                    text: "Test Vertical Alternative",
                    position: new THREE.Vector2(0, -10).add(screenTopCenter),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    placement: {
                        h: HorizontalPlacement.Left,
                        v: VerticalPlacement.Center
                    }
                },
                {
                    it: "places text in the bottom-center screen side",
                    text: "Test Vertical Alternative",
                    position: new THREE.Vector2(0, 10).add(screenBottomCenter),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    placement: {
                        h: HorizontalPlacement.Right,
                        v: VerticalPlacement.Center
                    }
                }
            ];
            runs.forEach(function(run) {
                it(run.it, async function() {
                    const textElement = await createTextElement(
                        textCanvas,
                        run.text,
                        new THREE.Vector3(),
                        {},
                        {
                            ...run.layout,
                            wrappingMode: WrappingMode.None
                        }
                    );
                    const state = createTextElementState(textElement);

                    const outPosition = new THREE.Vector3();
                    const inPosition = run.position.clone();

                    // Set the current style for the canvas.
                    textCanvas.textRenderStyle = textElement.renderStyle!;
                    textCanvas.textLayoutStyle = textElement.layoutStyle!;
                    // Run placement without multi-placement support.
                    let result = placePointLabel(
                        state,
                        inPosition,
                        1.0,
                        textCanvas,
                        new Env(),
                        screenCollisions,
                        false,
                        outPosition,
                        false
                    );

                    // Label out of screen and layout unchanged.
                    let textPlacement = state.textPlacement;
                    expect(run.layout.horizontalAlignment).to.be.not.undefined;
                    expect(run.layout.verticalAlignment).to.be.not.undefined;
                    expect(result).to.equal(PlacementResult.Invisible);
                    expect(textPlacement.h).to.be.equal(
                        hPlacementFromAlignment(run.layout.horizontalAlignment!)
                    );
                    expect(textPlacement.v).to.be.equal(
                        vPlacementFromAlignment(run.layout.verticalAlignment!)
                    );

                    // Place again with multi-placement support.
                    result = placePointLabel(
                        state,
                        inPosition,
                        1.0,
                        textCanvas,
                        new Env(),
                        screenCollisions,
                        false,
                        outPosition,
                        true
                    );
                    // Label placed and layout changed diagonally.
                    textPlacement = state.textPlacement;
                    expect(result).to.equal(PlacementResult.Ok);
                    expect(textPlacement.h).to.be.equal(run.placement.h);
                    expect(textPlacement.v).to.be.equal(run.placement.v);
                });
            });
        });

        context("single text moving to the screen edge", function() {
            interface AlternativesWithMovementRun {
                // Test run name.
                it: string;
                // Label text.
                text: string;
                // Input position.
                position: THREE.Vector2;
                // Input / base text layout.
                layout: TextLayoutParameters;
                // Flag indicating if fading should be performed.
                fading: boolean;
                // Holds each frame movement and final placement.
                frames: Array<{
                    // Move offset as percent of (relative to) label size.
                    move: THREE.Vector2;
                    // Final placement.
                    placement: TextPlacement;
                }>;
            }
            const runsNoFading: AlternativesWithMovementRun[] = [
                {
                    it: "places text moving to the center-left screen edge",
                    text: "Test Horizontal Alternative",
                    position: new THREE.Vector2(-10, 0).add(screenCenterLeft),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    fading: false,
                    frames: [
                        {
                            move: new THREE.Vector2(0, 0),
                            // Label placed, layout changed horizontally and vertically
                            // (clock-wise) in order to move text out of screen edge.
                            placement: {
                                h: HorizontalPlacement.Center,
                                v: VerticalPlacement.Top
                            }
                        },
                        {
                            move: new THREE.Vector2(-0.5, 0),
                            // Label placed with anchor changed to moved text even further from
                            // the screen edge.
                            placement: {
                                h: HorizontalPlacement.Right,
                                v: VerticalPlacement.Center
                            }
                        }
                    ]
                },
                {
                    it: "places text moving to the center-right screen edge",
                    text: "Test Horizontal Alternative",
                    position: new THREE.Vector2(10, 0).add(screenCenterRight),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    fading: false,
                    frames: [
                        {
                            move: new THREE.Vector2(0, 0),
                            placement: {
                                h: HorizontalPlacement.Center,
                                v: VerticalPlacement.Bottom
                            }
                        },
                        {
                            move: new THREE.Vector2(0.5, 0),
                            placement: {
                                h: HorizontalPlacement.Left,
                                v: VerticalPlacement.Center
                            }
                        }
                    ]
                },
                {
                    it: "places text moving to the top-center screen edge",
                    text: "Test Vertical Alternative",
                    position: new THREE.Vector2(0, -10).add(screenTopCenter),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    fading: false,
                    frames: [
                        {
                            move: new THREE.Vector2(0, 0),
                            placement: {
                                h: HorizontalPlacement.Left,
                                v: VerticalPlacement.Center
                            }
                        },
                        {
                            move: new THREE.Vector2(0.0, -0.3),
                            placement: {
                                h: HorizontalPlacement.Center,
                                v: VerticalPlacement.Top
                            }
                        }
                    ]
                },
                {
                    it: "places text moving to the bottom-center screen edge",
                    text: "Test Vertical Alternative",
                    position: new THREE.Vector2(0, 10).add(screenBottomCenter),
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    fading: false,
                    frames: [
                        {
                            move: new THREE.Vector2(0, 0),
                            placement: {
                                h: HorizontalPlacement.Right,
                                v: VerticalPlacement.Center
                            }
                        },
                        {
                            move: new THREE.Vector2(0.0, 0.3),
                            placement: {
                                h: HorizontalPlacement.Center,
                                v: VerticalPlacement.Bottom
                            }
                        }
                    ]
                }
            ];
            // Duplicate run set but with fading enabled.
            const runsWithFading: AlternativesWithMovementRun[] = [];
            runsNoFading.forEach(val =>
                runsWithFading.push({
                    ...val,
                    it: val.it + " with fading",
                    fading: true
                })
            );
            // Finally process all runs.
            const runs = runsNoFading.concat(runsWithFading);
            runs.forEach(function(run) {
                it(run.it, async function() {
                    const textElement = await createTextElement(
                        textCanvas,
                        run.text,
                        new THREE.Vector3(),
                        {},
                        {
                            ...run.layout,
                            wrappingMode: WrappingMode.None
                        }
                    );
                    const state = createTextElementState(textElement);

                    const outPosition = new THREE.Vector3();
                    const inPosition = run.position.clone();

                    // Set the current style for the canvas.
                    textCanvas.textRenderStyle = textElement.renderStyle!;
                    textCanvas.textLayoutStyle = textElement.layoutStyle!;
                    // Run placement firstly without multi-anchor support, just to calculate base
                    // label bounds for relative movement in the next frames.
                    placePointLabel(
                        state,
                        inPosition,
                        1.0,
                        textCanvas,
                        new Env(),
                        screenCollisions,
                        false,
                        outPosition,
                        false
                    );
                    state.update(1);

                    // Process each frame sequentially.
                    run.frames.forEach(function(frame) {
                        // Move label.
                        const textExtent = new THREE.Vector2(
                            state.element.bounds!.max.x - state.element.bounds!.min.x,
                            state.element.bounds!.max.y - state.element.bounds!.min.y
                        );
                        inPosition.x += textExtent.x * frame.move.x;
                        inPosition.y += textExtent.y * frame.move.y;

                        // Place again with multi-anchor placement support.
                        const result = placePointLabel(
                            state,
                            inPosition,
                            1.0,
                            textCanvas,
                            new Env(),
                            screenCollisions,
                            false,
                            outPosition,
                            true
                        );
                        // Label placed, layout changed horizontally and vertically to move text
                        // further from screen edge.
                        const textPlacement = state.textPlacement;
                        expect(result).to.equal(PlacementResult.Ok);
                        expect(textPlacement.h).to.be.equal(frame.placement.h);
                        expect(textPlacement.v).to.be.equal(frame.placement.v);
                        state.update(1);

                        if (run.fading) {
                            expect(state.textRenderState).to.be.not.undefined;
                            // Update its fading.
                            state.textRenderState?.startFadeIn(1);
                            // Labels gets persistent state - requires fading to start.
                            expect(state.visible).to.be.true;
                        }
                        // Cleanup screen for next frame
                        screenCollisions.reset();
                    });
                });
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
                const env = new Env();

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
                        env,
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
                        env,
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
                const placement0 = states[0].textPlacement;
                const placement1 = states[1].textPlacement;
                expect(placement0.h !== placement1.h || placement0.v !== placement1.v).to.be.true;
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
                const env = new Env();

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
                        env,
                        screenCollisions,
                        false,
                        outPositions[i],
                        true
                    );
                    // Even with multi-placement turned on, the labels are not using
                    // alternative placement algorithm - they are excluded.
                    // TODO: HARP-6487 This may be due to change when placements will be
                    // parsed from theme.
                    expect(states[i].textPlacement.h).to.equal(HorizontalPlacement.Center);
                    expect(states[i].textPlacement.v).to.equal(VerticalPlacement.Center);
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
                const env = new Env();

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
                        env,
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
                        env,
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
                const placement0 = states[0].textPlacement;
                const placement1 = states[1].textPlacement;
                expect(placement0.h === placement1.h && placement0.v === placement1.v).to.be.false;
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
                        env,
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
