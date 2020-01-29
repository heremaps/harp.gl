/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { TextElement } from "../lib/text/TextElement";
import { PoiInfoBuilder } from "./PoiInfoBuilder";
import {
    DEF_PATH,
    lineMarkerBuilder,
    pathTextBuilder,
    poiBuilder,
    pointTextBuilder
} from "./TextElementBuilder";
import {
    DEF_TEXT_WIDTH_HEIGHT,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    TestFixture,
    WORLD_SCALE
} from "./TextElementsRendererTestFixture";
import {
    builder,
    FADE_2_CYCLES,
    FADE_CYCLE,
    FADE_IN,
    FADE_IN_OUT,
    FADE_OUT,
    fadedIn,
    fadedOut,
    fadeIn,
    fadeInAndFadedOut,
    FadeState,
    firstNFrames,
    frameStates,
    INITIAL_TIME,
    InputTextElement,
    InputTile,
    not
} from "./TextElementsRendererTestUtils";

/**
 * Definition of a test case for TextElementsRenderer, including input data (tiles, text elements,
 * frame times...) and expected output (text element fade states at each frame).
 */
interface TestCase {
    // Name of the test.
    name: string;
    // Input tiles.
    tiles: InputTile[];
    // Time in ms when each frame starts.
    frameTimes: number[];
    // For each frame, true if collision test is enabled, false otherwise. By default, collision
    // test is enabled for all frames. Facilitates the setup of collision scenarios without changing
    // camera settings.
    collisionFrames?: boolean[];
}

const tests: TestCase[] = [
    // SINGLE LABEL TEST CASES
    {
        name: "Newly visited, visible point text fades in",
        tiles: [{ labels: [[pointTextBuilder(), FADE_IN]] }],
        frameTimes: FADE_CYCLE
    },
    {
        name: "Newly visited, visible poi fades in",
        tiles: [{ labels: [[poiBuilder(), FADE_IN]] }],
        frameTimes: FADE_CYCLE
    },
    {
        name: "Newly visited, visible line marker fades in",
        tiles: [{ labels: [[lineMarkerBuilder(WORLD_SCALE), FADE_IN]] }],
        frameTimes: FADE_CYCLE
    },
    {
        name: "Newly visited, visible path text fades in",
        tiles: [{ labels: [[pathTextBuilder(WORLD_SCALE), FADE_IN]] }],
        frameTimes: FADE_CYCLE
    },
    {
        name: "Non-visited, persistent point text is not rendered",
        tiles: [
            {
                labels: [[pointTextBuilder(), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Non-visited, persistent poi is not rendered",
        tiles: [
            {
                labels: [[poiBuilder(), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Non-visited, persistent line marker is not rendered",
        tiles: [
            {
                labels: [[lineMarkerBuilder(WORLD_SCALE), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Non-visited, persistent path text is not rendered",
        tiles: [
            {
                labels: [[pathTextBuilder(WORLD_SCALE), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    // LABEL COLLISIONS
    {
        name: "Least prioritized from two colliding persistent point texts fades out",
        tiles: [
            {
                labels: [
                    [pointTextBuilder("P0").withPriority(0), FADE_IN_OUT],
                    [pointTextBuilder("P1").withPriority(1), fadeIn(FADE_IN_OUT.length)]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES,
        collisionFrames: not(firstNFrames(FADE_2_CYCLES, 3))
    },
    {
        name: "Least prioritized from two colliding persistent pois fades out",
        tiles: [
            {
                labels: [
                    [poiBuilder("P0").withPriority(0), FADE_IN_OUT],
                    [poiBuilder("P1").withPriority(1), fadeIn(FADE_IN_OUT.length)]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES,
        collisionFrames: not(firstNFrames(FADE_2_CYCLES, 3))
    },
    {
        // TODO: HARP-7649. Add fade out transitions for path labels.
        name: "Least prioritized from two colliding persistent path texts fades out",
        tiles: [
            {
                labels: [
                    [
                        pathTextBuilder(WORLD_SCALE, "P0").withPriority(0),
                        FADE_IN.slice(0, -1).concat(fadedOut(FADE_OUT.length + 1)) /*FADE_IN_OUT*/
                    ],
                    [pathTextBuilder(WORLD_SCALE, "P1").withPriority(1), fadeIn(FADE_IN_OUT.length)]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES,
        collisionFrames: not(firstNFrames(FADE_2_CYCLES, 3))
    },
    {
        name: "Least prioritized from two colliding persistent line markers fades out",
        tiles: [
            {
                labels: [
                    [lineMarkerBuilder(WORLD_SCALE, "P0").withPriority(0), FADE_IN_OUT],
                    [
                        lineMarkerBuilder(WORLD_SCALE, "P1").withPriority(1),
                        fadeIn(FADE_IN_OUT.length)
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES,
        collisionFrames: not(firstNFrames(FADE_2_CYCLES, 3))
    },
    {
        name: "Least prioritized from two persistent pois colliding on text fades out",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("P0")
                            .withPriority(0)
                            .withPoiInfo(
                                new PoiInfoBuilder()
                                    .withPoiTechnique()
                                    .withIconOffset(SCREEN_WIDTH * 0.25, 0)
                            ),
                        FADE_IN_OUT
                    ],
                    [
                        poiBuilder("P1")
                            .withPriority(1)
                            .withPoiInfo(
                                new PoiInfoBuilder()
                                    .withPoiTechnique()
                                    .withIconOffset(-SCREEN_WIDTH * 0.25, 0)
                            ),
                        fadeIn(FADE_IN_OUT.length)
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES,
        collisionFrames: not(firstNFrames(FADE_2_CYCLES, 3))
    },
    // DEDUPLICATION
    {
        name: "Second from two near, non-colliding point labels with same text never fades in",
        tiles: [
            {
                labels: [
                    [
                        pointTextBuilder().withPosition(
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH_HEIGHT)) / SCREEN_WIDTH,
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH_HEIGHT)) / SCREEN_HEIGHT
                        ),
                        fadeIn(FADE_IN_OUT.length)
                    ],
                    [pointTextBuilder(), fadedOut(FADE_IN_OUT.length)]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Second from two near, non-colliding pois with same text never fades in",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder().withPosition(
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH_HEIGHT)) / SCREEN_WIDTH,
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH_HEIGHT)) / SCREEN_HEIGHT
                        ),
                        fadeIn(FADE_IN_OUT.length)
                    ],
                    [poiBuilder(), fadedOut(FADE_IN_OUT.length)]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Second from two pois with same text but far away is not a duplicate, so it fades in",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder().withPosition(WORLD_SCALE, WORLD_SCALE),
                        fadeIn(FADE_IN_OUT.length)
                    ],
                    [poiBuilder(), fadeIn(FADE_IN_OUT.length)]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    // PERSISTENCY ACROSS ZOOM LEVELS
    {
        name: "Poi replaces predecessor with same text and feature id without fading",
        tiles: [
            {
                labels: [[poiBuilder().withFeatureId(1), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        // location of replacement is disregarded when feature ids match.
                        poiBuilder()
                            .withFeatureId(1)
                            .withPosition(WORLD_SCALE, WORLD_SCALE),
                        fadedOut(FADE_IN.length).concat(
                            fadedIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                frames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Poi with same feature id but different text is not a replacement, so it fades in",
        tiles: [
            {
                labels: [
                    [poiBuilder("A").withFeatureId(1), fadeInAndFadedOut(FADE_2_CYCLES.length)]
                ],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        poiBuilder("B").withFeatureId(1),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                frames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Poi with same text but different feature id is not a replacement, so it fades in",
        tiles: [
            {
                labels: [[poiBuilder().withFeatureId(1), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        poiBuilder().withFeatureId(2),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                frames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Poi replaces predecessor with same text and nearby location without fading",
        tiles: [
            {
                labels: [[poiBuilder(), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        poiBuilder().withPosition(5, 0),
                        fadedOut(FADE_IN.length).concat(
                            fadedIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                frames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Poi with same text but far away location is not a replacement, so it fades in",
        tiles: [
            {
                labels: [[poiBuilder(), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        poiBuilder().withPosition(WORLD_SCALE, 0),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                frames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name:
            "Longest path label with same text within distance tolerace replaces predecessor" +
            " without fading",
        tiles: [
            {
                labels: [[pathTextBuilder(WORLD_SCALE), fadeInAndFadedOut(FADE_2_CYCLES.length)]],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        pathTextBuilder(WORLD_SCALE)
                            .withPathLengthSqr(10)
                            .withPath(
                                DEF_PATH.map((point: THREE.Vector3) =>
                                    point
                                        .clone()
                                        .multiplyScalar(WORLD_SCALE)
                                        .add(new THREE.Vector3(8, 0, 0))
                                )
                            ),
                        fadedOut(FADE_IN.length).concat(
                            fadedOut(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ],
                    [
                        pathTextBuilder(WORLD_SCALE)
                            .withPathLengthSqr(50)
                            .withPath(
                                DEF_PATH.map((point: THREE.Vector3) =>
                                    point
                                        .clone()
                                        .multiplyScalar(WORLD_SCALE)
                                        .add(new THREE.Vector3(0, 8, 0))
                                )
                            ),
                        fadedOut(FADE_IN.length).concat(
                            fadedIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                frames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    // TERRAIN OVERLAY TEST CASES
    {
        name: "Point text only fades in when terrain is available",
        tiles: [
            {
                labels: [
                    [
                        pointTextBuilder(),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                terrainFrames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Poi only fades in when terrain is available",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder(),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                terrainFrames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Line marker only fades in when terrain is available",
        tiles: [
            {
                labels: [
                    [
                        lineMarkerBuilder(WORLD_SCALE),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                terrainFrames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Path text only fades in when terrain is available",
        tiles: [
            {
                labels: [
                    [
                        pathTextBuilder(WORLD_SCALE),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        )
                    ]
                ],
                terrainFrames: not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
            }
        ],
        frameTimes: FADE_2_CYCLES
    }
];

describe("TextElementsRenderer", function() {
    const inNodeContext = typeof window === "undefined";

    let fixture: TestFixture;
    const sandbox = sinon.createSandbox();

    beforeEach(async function() {
        if (inNodeContext) {
            (global as any).window = { location: { href: "http://harp.gl" } };
        }

        fixture = new TestFixture(sandbox);
        const setupDone = await fixture.setUp();
        assert(setupDone, "Setup failed.");
    });

    afterEach(function() {
        sandbox.restore();
        if (inNodeContext) {
            delete (global as any).window;
        }
    });

    async function initTest(
        test: TestCase
    ): Promise<{
        elementFrameStates: Array<[TextElement, FadeState[]]>;
        prevOpacities: number[];
    }> {
        // Array with all text elements and their corresponding expected frame states.
        const elementFrameStates = new Array<[TextElement, FadeState[]]>();

        let enableElevation = false;
        const allTileIndices: number[] = [];
        // For each tile, build all its text elements and add them together with their expected
        // frame states to an array.
        test.tiles.forEach((tile: InputTile, tileIndex: number) => {
            if (tile.frames !== undefined) {
                expect(tile.frames.length).equal(test.frameTimes.length);
            }
            if (tile.terrainFrames !== undefined) {
                expect(tile.terrainFrames.length).equal(test.frameTimes.length);
                enableElevation = true;
            }
            const elements = tile.labels.map((inputElement: InputTextElement) => {
                expect(frameStates(inputElement).length).equal(test.frameTimes.length);
                // Only used to identify some text elements for testing purposes.
                const dummyUserData = {};
                const element = builder(inputElement)
                    .withUserData(dummyUserData)
                    .build(sandbox);
                elementFrameStates.push([element, frameStates(inputElement)]);
                return element;
            });
            allTileIndices.push(tileIndex);
            fixture.addTile(elements);
        });

        // Keeps track of the opacity that text elements had in the previous frame.
        const prevOpacities: number[] = new Array(elementFrameStates.length).fill(0);

        // Extra frame including all tiles to set the glyph loading state of all text elements
        // to initialized.
        await fixture.renderFrame(INITIAL_TIME, allTileIndices, []);
        fixture.setElevationProvider(enableElevation);

        return { elementFrameStates, prevOpacities };
    }

    // Returns an array with the indices for all tiles that are visible in the specified frame.
    function getFrameTileIndices(
        frameIdx: number,
        tiles: InputTile[]
    ): { tileIdcs: number[]; terrainTileIdcs: number[] } {
        const tileIdcs: number[] = [];
        const terrainTileIdcs: number[] = [];

        for (let i = 0; i < tiles.length; ++i) {
            const tile = tiles[i];
            if (!tile.frames || tile.frames[frameIdx]) {
                tileIdcs.push(i);
            }
            if (tile.terrainFrames && tile.terrainFrames[frameIdx]) {
                terrainTileIdcs.push(i);
            }
        }
        return { tileIdcs, terrainTileIdcs };
    }

    for (const test of tests) {
        it(test.name, async function() {
            const { elementFrameStates, prevOpacities } = await initTest(test);

            for (let frameIdx = 0; frameIdx < test.frameTimes.length; ++frameIdx) {
                const { tileIdcs, terrainTileIdcs } = getFrameTileIndices(frameIdx, test.tiles);
                const frameTime = test.frameTimes[frameIdx];
                const collisionEnabled =
                    test.collisionFrames === undefined ? true : test.collisionFrames[frameIdx];
                await fixture.renderFrame(frameTime, tileIdcs, terrainTileIdcs, collisionEnabled);

                let elementIdx = 0;
                for (const [textElement, expectedStates] of elementFrameStates) {
                    const expectedState = expectedStates[frameIdx];

                    const prevOpacity = prevOpacities[elementIdx];
                    const newOpacity = fixture.checkTextElementState(
                        textElement,
                        expectedState,
                        prevOpacity
                    );
                    prevOpacities[elementIdx++] = newOpacity;
                }
            }
        });
    }
});
