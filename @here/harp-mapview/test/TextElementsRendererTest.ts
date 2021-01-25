/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TextStyleDefinition } from "@here/harp-datasource-protocol";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { TextElement } from "../lib/text/TextElement";
import { DEFAULT_FONT_CATALOG_NAME } from "../lib/text/TextElementsRenderer";
import { TextElementType } from "../lib/text/TextElementType";
import { PoiInfoBuilder } from "./PoiInfoBuilder";
import {
    createPath,
    DEF_PATH,
    lineMarkerBuilder,
    pathTextBuilder,
    poiBuilder,
    pointTextBuilder
} from "./TextElementBuilder";
import {
    DEF_TEXT_HEIGHT,
    DEF_TEXT_WIDTH,
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
    framesEnabled,
    frameStates,
    iconFrameStates,
    INITIAL_TIME,
    InputTextElement,
    InputTile,
    not
} from "./TextElementsRendererTestUtils";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

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
        tiles: [{ labels: [[lineMarkerBuilder(WORLD_SCALE), [FADE_IN, FADE_IN], [], []]] }],
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
                labels: [
                    [
                        lineMarkerBuilder(WORLD_SCALE),
                        [
                            fadeInAndFadedOut(FADE_2_CYCLES.length),
                            fadeInAndFadedOut(FADE_2_CYCLES.length)
                        ],
                        [],
                        []
                    ]
                ],
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
    // TRANSITORY LABEL GROUPS (ADDED/REMOVED AFTER FIRST FRAME).
    {
        name: "Poi added after first frames fades in",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder(),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        ),
                        not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Two pois added in different frames to same tile fade in",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("Marker 1")
                            .withMayOverlap(true)
                            .withPoiInfo(new PoiInfoBuilder().withMayOverlap(true)),
                        fadedOut(2).concat(fadeIn(FADE_2_CYCLES.length - 2)),
                        not(firstNFrames(FADE_2_CYCLES, 2))
                    ],
                    [
                        poiBuilder("Marker 2")
                            .withMayOverlap(true)
                            .withPoiInfo(new PoiInfoBuilder().withMayOverlap(true)),
                        fadedOut(FADE_IN.length).concat(
                            fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                        ),
                        not(firstNFrames(FADE_2_CYCLES, FADE_IN.length))
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Removed poi fades out",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder(),
                        FADE_IN.concat(fadedOut(FADE_2_CYCLES.length - FADE_IN.length)),
                        firstNFrames(FADE_2_CYCLES, FADE_IN.length)
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "From two pois in same tile, removed poi fades out, remaining poi is faded in",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("Marker 1")
                            .withMayOverlap(true)
                            .withPoiInfo(new PoiInfoBuilder().withMayOverlap(true)),
                        fadeIn(FADE_2_CYCLES.length)
                    ],
                    [
                        poiBuilder("Marker 2")
                            .withMayOverlap(true)
                            .withPoiInfo(new PoiInfoBuilder().withMayOverlap(true)),
                        FADE_IN.concat(fadedOut(FADE_2_CYCLES.length - FADE_IN.length)),
                        firstNFrames(FADE_2_CYCLES, FADE_IN.length)
                    ]
                ]
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
                    [
                        lineMarkerBuilder(WORLD_SCALE, "P0").withPriority(0),
                        [FADE_IN_OUT, FADE_IN_OUT],
                        [],
                        []
                    ],
                    [
                        lineMarkerBuilder(WORLD_SCALE, "P1").withPriority(1),
                        [fadeIn(FADE_IN_OUT.length), fadeIn(FADE_IN_OUT.length)],
                        [],
                        []
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
    {
        name: "Text is rendered although icon is invisible",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("P0")
                            .withPriority(0)
                            .withPosition(
                                SCREEN_WIDTH / WORLD_SCALE / 2,
                                SCREEN_HEIGHT / WORLD_SCALE / 2
                            )
                            .withPoiInfo(
                                new PoiInfoBuilder()
                                    .withPoiTechnique()
                                    .withIconOffset(SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.5 + 10)
                                    .withIconOptional(false)
                            ),
                        fadeIn(FADE_IN_OUT.length),
                        [],
                        fadedOut(FADE_IN_OUT.length)
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Text is not rendered because the valid icon is rejected",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("P1")
                            .withPriority(1)
                            .withPosition(0, 0)
                            .withPoiInfo(
                                new PoiInfoBuilder().withPoiTechnique().withIconOptional(false)
                            )
                            .withOffset(0, 20),
                        fadeIn(FADE_IN_OUT.length),
                        [],
                        fadeIn(FADE_IN_OUT.length)
                    ],
                    [
                        poiBuilder("P0")
                            .withPriority(0)
                            // Manual testing and debugging showed that this position lets the icon
                            // area be covered by the first poi, while the text area is available.
                            .withPosition(0, 5)
                            .withPoiInfo(
                                new PoiInfoBuilder().withPoiTechnique().withIconOptional(false)
                            )
                            .withOffset(0, 20),
                        fadedOut(FADE_IN_OUT.length),
                        [],
                        fadedOut(FADE_IN_OUT.length)
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Text is rendered because the invalid and optional icon is rejected",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("P1")
                            .withPriority(1)
                            .withPosition(0, 0)
                            .withPoiInfo(
                                new PoiInfoBuilder().withPoiTechnique().withIconOptional(false)
                            )
                            .withOffset(0, 20),
                        fadeIn(FADE_IN_OUT.length),
                        [],
                        fadeIn(FADE_IN_OUT.length)
                    ],
                    [
                        poiBuilder("P0")
                            .withPriority(0)
                            // Manual testing and debugging showed that this position lets the icon
                            // area be covered by the first poi, while the text area is available.
                            // Same values as in test above.
                            .withPosition(0, 5)
                            .withPoiInfo(
                                new PoiInfoBuilder()
                                    .withPoiTechnique()
                                    .withIconOptional(true)
                                    .withIconValid(false)
                            )
                            .withOffset(0, 20),
                        fadeIn(FADE_IN_OUT.length), // text should fade in
                        [],
                        fadedOut(FADE_IN_OUT.length) // icon should stay faded out
                    ]
                ]
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    // DEDUPLICATION
    {
        name: "Second from two near, non-colliding point labels with same text never fades in",
        tiles: [
            {
                labels: [
                    [
                        pointTextBuilder().withPosition(
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH)) / SCREEN_WIDTH,
                            (WORLD_SCALE * (4 * DEF_TEXT_HEIGHT)) / SCREEN_HEIGHT
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
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH)) / SCREEN_WIDTH,
                            (WORLD_SCALE * (4 * DEF_TEXT_HEIGHT)) / SCREEN_HEIGHT
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
                        poiBuilder().withFeatureId(1).withPosition(WORLD_SCALE, WORLD_SCALE),
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
            "Longest path label with same text within distance tolerance replaces predecessor" +
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
    {
        name: "Line marker replaces predecessor with same text and nearby location without fading",
        tiles: [
            {
                labels: [
                    [
                        lineMarkerBuilder(WORLD_SCALE).withPath(
                            createPath(WORLD_SCALE, [
                                new THREE.Vector3(0, 0, 0),
                                new THREE.Vector3(0.3, 0.3, 0),
                                new THREE.Vector3(0.6, 0.6, 0)
                            ])
                        ),
                        [
                            fadeInAndFadedOut(FADE_2_CYCLES.length),
                            fadeInAndFadedOut(FADE_2_CYCLES.length),
                            fadeInAndFadedOut(FADE_2_CYCLES.length)
                        ],
                        [], // all frames enabled
                        [] // same frame states for icons and text.
                    ]
                ],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            },
            {
                labels: [
                    [
                        lineMarkerBuilder(WORLD_SCALE).withPath(
                            createPath(WORLD_SCALE, [
                                new THREE.Vector3(0.3, 0.3, 0),
                                new THREE.Vector3(0.9, 0.9, 0)
                            ])
                        ),
                        [
                            fadedOut(FADE_IN.length).concat(
                                fadedIn(FADE_2_CYCLES.length - FADE_IN.length)
                            ),
                            fadedOut(FADE_IN.length).concat(
                                fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                            )
                        ],
                        [], // all frames enabled
                        [] // same frame states for icons and text.
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
                        [
                            fadedOut(FADE_IN.length).concat(
                                fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                            ),
                            fadedOut(FADE_IN.length).concat(
                                fadeIn(FADE_2_CYCLES.length - FADE_IN.length)
                            )
                        ],
                        [],
                        []
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
    },
    {
        name: "Poi only fades in, if its inside frustum",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("outside frustum marker").withPosition(
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH)) / SCREEN_WIDTH,
                            (WORLD_SCALE * (40 * DEF_TEXT_HEIGHT)) / SCREEN_HEIGHT,
                            -WORLD_SCALE * 10
                        ),
                        fadedOut(FADE_2_CYCLES.length)
                    ]
                ],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            }
        ],
        frameTimes: FADE_2_CYCLES
    },
    {
        name: "Poi only fades in, if in front of camera",
        tiles: [
            {
                labels: [
                    [
                        poiBuilder("behind camera marker").withPosition(
                            (WORLD_SCALE * (4 * DEF_TEXT_WIDTH)) / SCREEN_WIDTH,
                            (WORLD_SCALE * (4 * DEF_TEXT_HEIGHT)) / SCREEN_HEIGHT,
                            -1
                        ),
                        fadedOut(FADE_2_CYCLES.length)
                    ]
                ],
                frames: firstNFrames(FADE_2_CYCLES, FADE_IN.length)
            }
        ],
        frameTimes: FADE_2_CYCLES
    }
];

describe("TextElementsRenderer", function () {
    const inNodeContext = typeof window === "undefined";

    let fixture: TestFixture;
    const sandbox = sinon.createSandbox();

    beforeEach(async function () {
        if (inNodeContext) {
            (global as any).window = { location: { href: "http://harp.gl" } };
        }

        fixture = new TestFixture(sandbox);
        await fixture.setUp();
    });

    afterEach(function () {
        sandbox.restore();
        if (inNodeContext) {
            delete (global as any).window;
        }
    });

    type ElementFrameStates = Array<[TextElement, FadeState[][], FadeState[][] | undefined]>;
    function buildLabels(
        inputElements: InputTextElement[] | undefined,
        elementFrameStates: ElementFrameStates,
        frameCount: number
    ): TextElement[] {
        if (!inputElements) {
            return [];
        }
        return inputElements.map((inputElement: InputTextElement) => {
            let textFrameStates = frameStates(inputElement);
            let iconStates = iconFrameStates(inputElement);

            expect(textFrameStates).not.empty;

            if (!Array.isArray(textFrameStates[0])) {
                textFrameStates = [textFrameStates as FadeState[]];
                if (iconStates !== undefined) {
                    iconStates = [iconStates as FadeState[]];
                }
            } else if (iconStates && iconStates.length > 0) {
                expect(iconStates).has.lengthOf(textFrameStates.length);
            }

            textFrameStates.forEach((e: any) =>
                expect(e).lengthOf(frameCount, "one state per frame required")
            );

            iconStates?.forEach((e: any) =>
                expect(e).lengthOf(frameCount, "one state per frame required")
            );
            // Only used to identify some text elements for testing purposes.
            const dummyUserData = {};
            const element = builder(inputElement).withUserData(dummyUserData).build();
            elementFrameStates.push([
                element,
                textFrameStates as FadeState[][],
                iconStates as FadeState[][]
            ]);
            return element;
        });
    }
    async function initTest(
        test: TestCase
    ): Promise<{
        elementFrameStates: ElementFrameStates;
        prevOpacities: Array<[number, number]>;
    }> {
        // Array with all text elements and their corresponding expected frame states.
        const elementFrameStates: ElementFrameStates = new Array();

        let enableElevation = false;
        const allTileIndices: number[] = [];
        // For each tile, build all its text elements and add them together with their expected
        // frame states to an array.
        test.tiles.forEach((tile: InputTile, tileIndex: number) => {
            if (tile.frames !== undefined) {
                expect(tile.frames.length).equal(
                    test.frameTimes.length,
                    "frames length is the same"
                );
            }
            if (tile.terrainFrames !== undefined) {
                expect(tile.terrainFrames.length).equal(
                    test.frameTimes.length,
                    "terrainFrames length is the same"
                );
                enableElevation = true;
            }
            const labels = buildLabels(tile.labels, elementFrameStates, test.frameTimes.length);
            allTileIndices.push(tileIndex);
            fixture.addTile(labels);
        });

        // Keeps track of the opacity that text elements had in the previous frame.
        const prevOpacities = new Array(elementFrameStates.length).fill([0, 0]);

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

    function prepareTextElements(frameIdx: number, tiles: InputTile[], tileIndices: number[]) {
        for (const tileIndex of tileIndices) {
            const tile = tiles[tileIndex];
            const elementsEnabled = tile.labels.map(
                label => framesEnabled(label)?.[frameIdx] ?? true
            );
            fixture.setTileTextElements(tileIndex, elementsEnabled);
        }
    }

    for (const test of tests) {
        it(test.name, async function () {
            const { elementFrameStates, prevOpacities } = await initTest(test);

            for (let frameIdx = 0; frameIdx < test.frameTimes.length; ++frameIdx) {
                const { tileIdcs, terrainTileIdcs } = getFrameTileIndices(frameIdx, test.tiles);
                const frameTime = test.frameTimes[frameIdx];
                const collisionEnabled =
                    test.collisionFrames === undefined ? true : test.collisionFrames[frameIdx];
                prepareTextElements(frameIdx, test.tiles, tileIdcs);
                await fixture.renderFrame(frameTime, tileIdcs, terrainTileIdcs, collisionEnabled);

                let opacityIdx = 0;

                for (const [
                    textElement,
                    expectedStates,
                    expectedIconStates
                ] of elementFrameStates) {
                    let stateIdx = 0;
                    for (const textState of expectedStates) {
                        const elementNewOpacities = fixture.checkTextElementState(
                            textElement,
                            textState[frameIdx],
                            expectedIconStates?.[stateIdx][frameIdx],
                            prevOpacities[opacityIdx],
                            textElement.type === TextElementType.LineMarker ? stateIdx : undefined
                        );
                        prevOpacities[opacityIdx] = elementNewOpacities;
                        opacityIdx++;
                        stateIdx++;
                    }
                }
            }
        });
    }

    it("updates FontCatalogs", async function () {
        expect(fixture.loadCatalogStub.calledOnce, "default catalog was set").to.be.true;
        await fixture.textRenderer.updateFontCatalogs([
            {
                name: "catalog1",
                url: "some-url-1"
            },
            {
                name: "catalog2",
                url: "some-url-2"
            }
        ]);
        expect(fixture.loadCatalogStub.calledThrice).to.be.true;

        await fixture.textRenderer.updateFontCatalogs([
            {
                name: "catalog1",
                url: "some-url-1"
            },
            {
                name: "catalog2",
                url: "some-other-url-2"
            }
        ]);
        expect(fixture.loadCatalogStub.calledThrice, "no new catalog added").to.be.true;

        await fixture.textRenderer.updateFontCatalogs([
            {
                name: "catalog1",
                url: "some-url-1"
            },
            {
                name: "catalog3",
                url: "some-url-3"
            }
        ]);
        expect(fixture.loadCatalogStub.callCount, "adds catalog3").to.equal(4);

        await fixture.textRenderer.updateFontCatalogs([
            {
                name: "catalog2",
                url: "some-url-2"
            }
        ]);
        expect(
            fixture.loadCatalogStub.callCount,
            "adds catalog2 back, removed in last step"
        ).to.equal(5);

        await fixture.textRenderer.updateFontCatalogs([]);
        expect(fixture.loadCatalogStub.callCount).to.equal(5);

        await fixture.textRenderer.updateFontCatalogs([
            {
                name: DEFAULT_FONT_CATALOG_NAME,
                url: "some-url"
            }
        ]);
        expect(fixture.loadCatalogStub.callCount).to.equal(6);

        await fixture.textRenderer.updateFontCatalogs([
            {
                name: DEFAULT_FONT_CATALOG_NAME,
                url: "some-other-url"
            }
        ]);
        expect(fixture.loadCatalogStub.callCount).to.equal(7);
    });

    it("updates TextStyles", async function () {
        const style1: TextStyleDefinition = {
            name: "style-1",
            fontCatalogName: "catalog-1"
        };

        const style2: TextStyleDefinition = {
            name: "style-2",
            fontCatalogName: "catalog-2"
        };

        const style3: TextStyleDefinition = {
            name: "style-3",
            fontCatalogName: "catalog-3"
        };

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").name).to.equal(
            "default"
        );
        await fixture.textRenderer.updateTextStyles();
        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").name).to.equal(
            "default"
        );

        await fixture.textRenderer.updateTextStyles([]);

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").name).to.equal(
            "default"
        );

        await fixture.textRenderer.updateTextStyles([], style2);

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").fontCatalog).to.equal(
            "catalog-2",
            "the new default is using style-2"
        );

        await fixture.textRenderer.updateTextStyles([]);

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").name).to.equal(
            "default",
            "the default is reset to 'default'"
        );

        await fixture.textRenderer.updateTextStyles([style1, style2]);

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").name).to.equal(
            "style-1",
            "the style is found in the list"
        );

        await fixture.textRenderer.updateTextStyles([style3, style2]);

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-1").name).to.equal(
            "default",
            "style-1 was removed, using default instead"
        );

        expect(fixture.textRenderer.styleCache.getTextElementStyle("style-3").name).to.equal(
            "style-3",
            "the style is found in the list"
        );
    });
});
