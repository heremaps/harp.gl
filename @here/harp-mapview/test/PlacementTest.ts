/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import "@here/harp-fetch";

import { Env } from "@here/harp-datasource-protocol";
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
    TextPlacements,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    VerticalPlacement,
    vPlacementFromAlignment,
    WrappingMode
} from "@here/harp-text-canvas";
import { getAppBaseUrl } from "@here/harp-utils";
import { assert, expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import * as THREE from "three";

import { PoiBuffer } from "../lib/poi/PoiRenderer";
import { ScreenCollisions } from "../lib/ScreenCollisions";
import {
    checkReadyForPlacement,
    placeIcon,
    PlacementResult,
    placePointLabel,
    PrePlacementResult
} from "../lib/text/Placement";
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

/**
 * Possible placement scenarios in clock-wise order, based on centered placements.
 */
const placementsCentered: TextPlacement[] = [
    { h: HorizontalPlacement.Center, v: VerticalPlacement.Top },
    { h: HorizontalPlacement.Right, v: VerticalPlacement.Center },
    { h: HorizontalPlacement.Center, v: VerticalPlacement.Bottom },
    { h: HorizontalPlacement.Left, v: VerticalPlacement.Center }
];

/**
 * Placement anchors in clock-wise order, for corner based placements.
 */
const placementsCornered: TextPlacement[] = [
    { h: HorizontalPlacement.Right, v: VerticalPlacement.Top },
    { h: HorizontalPlacement.Right, v: VerticalPlacement.Bottom },
    { h: HorizontalPlacement.Left, v: VerticalPlacement.Bottom },
    { h: HorizontalPlacement.Left, v: VerticalPlacement.Top }
];

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
        renderer: { capabilities: { isWebGL2: false } },
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

function createTextPlacements(
    baseHPlacement: HorizontalPlacement,
    baseVPlacement: VerticalPlacement
): TextPlacements {
    const placementCentered =
        baseHPlacement === HorizontalPlacement.Center ||
        baseVPlacement === VerticalPlacement.Center;
    const placements = placementCentered ? placementsCentered : placementsCornered;
    const placementsNum = placements.length;
    // Find first placement on the placements list.
    const firstIdx = placements.findIndex(p => p.h === baseHPlacement && p.v === baseVPlacement);
    expect(firstIdx >= 0).to.be.true;
    const result: TextPlacements = [];
    // Iterate all placements starting from the first one and create full clock wise placement list.
    for (let i = firstIdx; i < placementsNum + firstIdx; ++i) {
        result.push(placements[i % placementsNum]);
    }
    return result;
}

describe("Placement", function () {
    const sandbox = sinon.createSandbox();
    let textCanvas: TextCanvas;
    const screenCollisions: ScreenCollisions = new ScreenCollisions();
    screenCollisions.update(screenWidth, screenHeight);
    const appBaseUrl = getAppBaseUrl();
    // Canvas padding - padding applied in bounds calculated on TextCanvas.measureText()
    const cPadding = new THREE.Vector2(2, 2);

    before(async function () {
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

    after(function () {
        if (inNodeContext) {
            delete (global as any).window;
            delete (global as any).document;
        }
        sandbox.restore();
    });

    afterEach(function () {
        screenCollisions.reset();
    });

    describe("placePointLabel", function () {
        context("single line text", function () {
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
                    outPosition: new THREE.Vector2(cPadding.x, -cPadding.y)
                },
                {
                    it: "places text center-below alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    outPosition: new THREE.Vector2(0, -cPadding.y)
                },
                {
                    it: "places text right-below alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    outPosition: new THREE.Vector2(-cPadding.x / 2, -cPadding.y)
                },
                {
                    it: "places text with left-center alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    outPosition: new THREE.Vector2(cPadding.x, 0.25)
                },
                {
                    it: "places text center-center alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    outPosition: new THREE.Vector2(0, 0.25)
                },
                {
                    it: "places text right-center alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Center
                    },
                    outPosition: new THREE.Vector2(-cPadding.x / 2, 0.25)
                },
                {
                    it: "places text with left-above alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    outPosition: new THREE.Vector2(cPadding.x, 0.5 + cPadding.y)
                },
                {
                    it: "places text center-above alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    outPosition: new THREE.Vector2(0, 0.5 + cPadding.y)
                },
                {
                    it: "places text right-above alignment",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Above
                    },
                    outPosition: new THREE.Vector2(-cPadding.x / 2, 0.5 + cPadding.y)
                },
                {
                    it: "places text below aligned (left by default) ",
                    layout: {
                        verticalAlignment: VerticalAlignment.Below
                    },
                    outPosition: new THREE.Vector2(cPadding.x, -cPadding.y)
                },
                {
                    it: "places text center aligned (left by default) ",
                    layout: {
                        verticalAlignment: VerticalAlignment.Center
                    },
                    outPosition: new THREE.Vector2(cPadding.x, 0.25)
                },
                {
                    it: "places text aligned above (left by default)",
                    layout: {
                        verticalAlignment: VerticalAlignment.Above
                    },
                    outPosition: new THREE.Vector2(cPadding.x, 0.5 + cPadding.y)
                },
                {
                    it: "places text with left-below alignment and offset",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Left,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    xOffset: 5,
                    yOffset: 5,
                    outPosition: new THREE.Vector2(5 + cPadding.x, 5 - cPadding.y)
                },
                {
                    it: "places text with right-below alignment and offset",
                    layout: {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below
                    },
                    xOffset: 5,
                    yOffset: 5,
                    outPosition: new THREE.Vector2(5 - cPadding.x / 2, 5 - cPadding.y)
                }
            ];
            runs.forEach(function (run) {
                it(run.it, async function () {
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
                        outPosition
                    );

                    expect(result).to.equal(PlacementResult.Ok);
                    expect(outPosition.x).to.equal(run.outPosition.x);
                    expect(outPosition.y).to.equal(run.outPosition.y);
                });
            });
        });

        context("multi line text", function () {
            it("places text below", async function () {
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
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(cPadding.x);
                expect(position.y).to.equal(-cPadding.y);
            });

            it("places text center", async function () {
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
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(cPadding.x);
                expect(position.y).to.equal(76 + 0.25);
            });

            it("places text above", async function () {
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
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(cPadding.x);
                expect(position.y).to.equal(152 + 0.5 + cPadding.y);
            });

            it("places text with offset", async function () {
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
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(5);
                expect(position.y).to.equal(5 + 19 + 0.5 + cPadding.y);
            });

            it("scales offsets", async function () {
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
                    position
                );

                expect(result).to.equal(PlacementResult.Ok);
                expect(position.x).to.equal(0.8 * 5);
                expect(position.y).to.equal(0.8 * (5 + 19 + 0.5 + cPadding.y));
            });
        });

        context("single text with and without alternative placement", function () {
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
                        verticalAlignment: VerticalAlignment.Below,
                        placements: createTextPlacements(
                            HorizontalPlacement.Left,
                            VerticalPlacement.Bottom
                        )
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
                        verticalAlignment: VerticalAlignment.Below,
                        placements: createTextPlacements(
                            HorizontalPlacement.Right,
                            VerticalPlacement.Bottom
                        )
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
                        verticalAlignment: VerticalAlignment.Above,
                        placements: createTextPlacements(
                            HorizontalPlacement.Right,
                            VerticalPlacement.Top
                        )
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
                        verticalAlignment: VerticalAlignment.Above,
                        placements: createTextPlacements(
                            HorizontalPlacement.Left,
                            VerticalPlacement.Top
                        )
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
                        verticalAlignment: VerticalAlignment.Center,
                        placements: createTextPlacements(
                            HorizontalPlacement.Left,
                            VerticalPlacement.Center
                        )
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
                        verticalAlignment: VerticalAlignment.Center,
                        placements: createTextPlacements(
                            HorizontalPlacement.Right,
                            VerticalPlacement.Center
                        )
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
                        verticalAlignment: VerticalAlignment.Below,
                        placements: createTextPlacements(
                            HorizontalPlacement.Center,
                            VerticalPlacement.Bottom
                        )
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
                        verticalAlignment: VerticalAlignment.Above,
                        placements: createTextPlacements(
                            HorizontalPlacement.Center,
                            VerticalPlacement.Top
                        )
                    },
                    placement: {
                        h: HorizontalPlacement.Right,
                        v: VerticalPlacement.Center
                    }
                }
            ];
            runs.forEach(function (run) {
                it(run.it, async function () {
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

        context("single text moving to the screen edge", function () {
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
                        verticalAlignment: VerticalAlignment.Center,
                        placements: createTextPlacements(
                            HorizontalPlacement.Left,
                            VerticalPlacement.Center
                        )
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
                        verticalAlignment: VerticalAlignment.Center,
                        placements: createTextPlacements(
                            HorizontalPlacement.Right,
                            VerticalPlacement.Center
                        )
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
                        verticalAlignment: VerticalAlignment.Below,
                        placements: createTextPlacements(
                            HorizontalPlacement.Center,
                            VerticalPlacement.Bottom
                        )
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
                        verticalAlignment: VerticalAlignment.Above,
                        placements: createTextPlacements(
                            HorizontalPlacement.Center,
                            VerticalPlacement.Top
                        )
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
            runs.forEach(function (run) {
                it(run.it, async function () {
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
                    textElement.bounds = new THREE.Box2();
                    textCanvas.measureText(textElement.glyphs!, textElement.bounds, {
                        pathOverflow: false,
                        letterCaseArray: textElement.glyphCaseArray
                    });
                    state.update(1);

                    // Process each frame sequentially.
                    run.frames.forEach(function (frame) {
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
                            expect(state.visible).to.be.false;
                            expect(state.textRenderState!.isFadingIn()).to.be.true;
                            expect(state.textRenderState!.opacity).to.equal(0);
                        }
                        // Cleanup screen for next frame
                        screenCollisions.reset();
                    });
                });
            });
        });

        context("texts colliding with alternative placements", function () {
            it("place two text at almost the same position", async function () {
                const elements = await createPointTextElements(
                    textCanvas,
                    ["Test 1", "Test 1"],
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below,
                        placements: createTextPlacements(
                            HorizontalPlacement.Left,
                            VerticalPlacement.Bottom
                        ),
                        wrappingMode: WrappingMode.None
                    }
                );
                expect(elements.length).to.equal(2);
                const states = createTextElementsStates(elements);
                const offset = 5; // Need to keep some offset because of internal margin
                const inPositions = [new THREE.Vector2(-offset, 0), new THREE.Vector2(offset, 0)];
                const outPositions = [new THREE.Vector3(), new THREE.Vector3()];
                const marginX = -cPadding.x / 2;
                const marginY = -cPadding.y;

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
                        outPositions[i]
                    );
                    const textPlacement = states[i].textPlacement;
                    expect(textPlacement.h).to.be.equal(HorizontalPlacement.Left);
                    expect(textPlacement.v).to.be.equal(VerticalPlacement.Bottom);
                    expect(inPositions[i].x).to.equal(outPositions[i].x + marginX);
                    expect(inPositions[i].y).to.equal(outPositions[i].y - marginY);
                }
                // First element allocated, second collides.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Rejected);

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
                        outPositions[i],
                        true
                    );
                }
                // First element has placement unchanged.
                expect(inPositions[0].x).to.equal(outPositions[0].x + marginX);
                expect(inPositions[0].y).to.equal(outPositions[0].y - marginY);
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

            it("fail to place two centered texts at almost the same position", async function () {
                const elements = await createPointTextElements(
                    textCanvas,
                    ["Test 1", "Test 2"],
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Center,
                        verticalAlignment: VerticalAlignment.Center,
                        placements: [
                            {
                                h: HorizontalPlacement.Center,
                                v: VerticalPlacement.Center
                            }
                        ],
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
                        outPositions[i],
                        true
                    );
                    // Even with multi-placement turned on, only single placement has been provided
                    // alternative placement algorithm will have no options, but surrender.
                    expect(states[i].textPlacement.h).to.equal(HorizontalPlacement.Center);
                    expect(states[i].textPlacement.v).to.equal(VerticalPlacement.Center);
                }
                // First element allocated, second collides, without alternative placement,
                // centered labels are not handled with multi-anchor placement.
                expect(results[0]).to.equal(PlacementResult.Ok);
                expect(results[1]).to.equal(PlacementResult.Rejected);
            });

            it("place two approaching texts", async function () {
                const elements = await createPointTextElements(
                    textCanvas,
                    ["Test 1", "Test 1"],
                    {},
                    {
                        horizontalAlignment: HorizontalAlignment.Right,
                        verticalAlignment: VerticalAlignment.Below,
                        placements: createTextPlacements(
                            HorizontalPlacement.Left,
                            VerticalPlacement.Bottom
                        ),
                        wrappingMode: WrappingMode.None
                    }
                );
                const states = createTextElementsStates(elements);
                // Offset big enough to place without collisions
                let offset = 50;
                const inPositions = [new THREE.Vector2(-offset, 0), new THREE.Vector2(offset, 0)];
                const outPositions = [new THREE.Vector3(), new THREE.Vector3()];
                const marginX = -cPadding.x / 2;
                const marginY = -cPadding.y;

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
                        outPositions[i],
                        false
                    );
                    expect(inPositions[0].x).to.equal(outPositions[0].x + marginX);
                    expect(inPositions[0].y).to.equal(outPositions[0].y - marginY);
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
                expect(states[0].visible).to.be.false;
                expect(states[1].visible).to.be.false;
                expect(states[0].textRenderState!.isFadingIn()).to.be.true;
                expect(states[0].textRenderState!.opacity).to.equal(0);
                expect(states[1].textRenderState!.isFadingIn()).to.be.true;
                expect(states[1].textRenderState!.opacity).to.equal(0);

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
                        outPositions[i],
                        true
                    );
                }
                // First element has placement unchanged.
                expect(inPositions[0].x).to.equal(outPositions[0].x + marginX);
                expect(inPositions[0].y).to.equal(outPositions[0].y - marginY);
                // Second occupies alternative placement.
                expect(outPositions[1].x === inPositions[1].x - marginX).to.be.false;
                expect(outPositions[1].y === inPositions[1].y - marginY).to.be.false;
                const alternativePos = outPositions[1].clone();
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
                offset -= 5;
                alternativePos.x -= 5;
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
                        outPositions[i],
                        true
                    );
                }
                // First element has placement unchanged.
                expect(inPositions[0].x).to.equal(outPositions[0].x + marginX);
                expect(inPositions[0].y).to.equal(outPositions[0].y - marginY);
                // Second element has to stay at the same placement - for fading.
                expect(alternativePos.x).to.equal(outPositions[1].x);
                expect(alternativePos.y).to.equal(outPositions[1].y);
                // First element space allocated - placed.
                expect(results[0]).to.equal(PlacementResult.Ok);
                // Second is rejected, but not invisible, because of its persistence
                // state, it may start fading out now.
                expect(results[1]).to.equal(PlacementResult.Rejected);
            });
        });

        it("only sets label bounds on successful placement", async function () {
            const collisionsStub = new ScreenCollisions();

            const textElement = await createTextElement(
                textCanvas,
                "Text",
                new THREE.Vector3(),
                {},
                {
                    horizontalAlignment: HorizontalAlignment.Right,
                    verticalAlignment: VerticalAlignment.Below,
                    placements: createTextPlacements(
                        HorizontalPlacement.Left,
                        VerticalPlacement.Bottom
                    )
                }
            );
            const state = new TextElementState(textElement);
            const screenPos = new THREE.Vector2(0, 0);
            const scale = 1.0;
            const env = new Env();
            const outPos = new THREE.Vector3();
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;

            const visibleStub = sandbox.stub(collisionsStub, "isVisible").returns(false);
            const allocatedStub = sandbox.stub(collisionsStub, "isAllocated").returns(false);

            placePointLabel(state, screenPos, scale, textCanvas, env, collisionsStub, outPos, true);

            expect(textElement.bounds).to.be.undefined;

            visibleStub.returns(true);
            allocatedStub.returns(true);

            placePointLabel(state, screenPos, scale, textCanvas, env, collisionsStub, outPos, true);

            expect(textElement.bounds).to.be.undefined;

            visibleStub.returns(true);
            allocatedStub.returns(false);

            placePointLabel(state, screenPos, scale, textCanvas, env, collisionsStub, outPos, true);

            expect(textElement.bounds).to.not.be.undefined;
        });

        it("returns rejected for visible new labels with no available space", async function () {
            const collisionsStub = new ScreenCollisions();

            const textElement = await createTextElement(
                textCanvas,
                "Text",
                new THREE.Vector3(),
                {},
                {
                    horizontalAlignment: HorizontalAlignment.Right,
                    verticalAlignment: VerticalAlignment.Below,
                    placements: createTextPlacements(
                        HorizontalPlacement.Left,
                        VerticalPlacement.Bottom
                    )
                }
            );
            const state = new TextElementState(textElement);
            const screenPos = new THREE.Vector2(0, 0);
            const scale = 1.0;
            const env = new Env();
            const outPos = new THREE.Vector3();
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;

            sandbox.stub(collisionsStub, "isVisible").returns(true);
            sandbox.stub(collisionsStub, "isAllocated").returns(true);

            const result = placePointLabel(
                state,
                screenPos,
                scale,
                textCanvas,
                env,
                collisionsStub,
                outPos,
                true
            );

            expect(result).equals(PlacementResult.Rejected);
        });
    });

    describe("placeIcon", function () {
        it("places icon without offset", function () {
            const iconRenderState = new RenderState();
            iconRenderState.updateFading(800, true);

            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                buffer: {} as PoiBuffer,
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

        it("places icon with offset", function () {
            const iconRenderState = new RenderState();
            iconRenderState.updateFading(800, true);

            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                buffer: {} as PoiBuffer,
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

    describe("checkReadyForPlacement", () => {
        let textElement: TextElement;
        function checkPlacementResult(
            textElement: TextElement,
            viewState: any = {},
            poiManager?: any
        ) {
            return checkReadyForPlacement(
                textElement,
                undefined,
                {
                    ...viewState,
                    projection: {},
                    worldCenter: new THREE.Vector3(),
                    lookAtVector: new THREE.Vector3()
                },
                poiManager ?? {
                    updatePoiFromPoiTable: () => true
                },
                1000
            ).result;
        }

        before(async () => {
            textElement = await createTextElement(textCanvas, "Test", new THREE.Vector3(), {}, {});
        });

        it("NotReady while if updatePoiFromPoiTable returns false", async () => {
            assert.equal(
                checkPlacementResult(
                    textElement,
                    {},
                    {
                        updatePoiFromPoiTable: () => false
                    }
                ),
                PrePlacementResult.NotReady
            );
        });

        it("Invisible if textElement is invisible", async () => {
            textElement.visible = false;
            assert.equal(checkPlacementResult(textElement), PrePlacementResult.Invisible);
        });

        it("Invisible if textElement is out of zoom range", async () => {
            textElement.visible = true;
            textElement.minZoomLevel = 6;
            textElement.maxZoomLevel = 14;

            assert.equal(
                checkPlacementResult(textElement, { zoomLevel: 5 }),
                PrePlacementResult.Invisible
            );

            assert.equal(
                checkPlacementResult(textElement, { zoomLevel: 7 }),
                PrePlacementResult.Ok
            );

            assert.equal(
                checkPlacementResult(textElement, { zoomLevel: 14 }),
                PrePlacementResult.Invisible
            );

            assert.equal(
                checkPlacementResult(textElement, { zoomLevel: 14.1 }),
                PrePlacementResult.Invisible
            );
        });

        it("Invisible if both min and max zoom range are the same", () => {
            textElement.minZoomLevel = 7;
            textElement.maxZoomLevel = 7;
            assert.equal(
                checkPlacementResult(textElement, { zoomLevel: 7 }),
                PrePlacementResult.Invisible
            );
        });
    });
});
