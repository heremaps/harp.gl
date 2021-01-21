/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as THREE from "three";

import {
    DefaultTextStyle,
    FontStyle,
    FontUnit,
    FontVariant,
    TextRenderParameters,
    TextRenderStyle
} from "../index";
import {
    hAlignFromPlacement,
    HorizontalAlignment,
    HorizontalPlacement,
    TextLayoutParameters,
    TextLayoutStyle,
    TextPlacements,
    vAlignFromPlacement,
    VerticalAlignment,
    VerticalPlacement,
    WrappingMode
} from "../lib/rendering/TextStyle";

describe("TextRenderStyle", () => {
    let renderParams: TextRenderParameters;

    beforeEach(function () {
        renderParams = {
            fontName: "test",
            fontSize: {
                unit: FontUnit.Pixel,
                size: 8.0,
                backgroundSize: 1.0
            },
            fontStyle: FontStyle.Bold,
            fontVariant: FontVariant.AllCaps,
            rotation: 90.0,
            color: new THREE.Color(0xff0000),
            backgroundColor: new THREE.Color(0x00ff00),
            opacity: 0.5,
            backgroundOpacity: 0.2
        };
    });

    it("Empty c-tor initializes with default values.", () => {
        const rs = new TextRenderStyle();

        // Check only if values are equal, non-trivial object references should not be the same.
        assert.strictEqual(rs.fontName, DefaultTextStyle.DEFAULT_FONT_NAME);
        assert.deepEqual(rs.fontSize, DefaultTextStyle.DEFAULT_FONT_SIZE);
        assert.isFalse(Object.is(rs.fontSize, DefaultTextStyle.DEFAULT_FONT_SIZE));
        assert.strictEqual(rs.fontStyle, DefaultTextStyle.DEFAULT_FONT_STYLE);
        assert.strictEqual(rs.fontVariant, DefaultTextStyle.DEFAULT_FONT_VARIANT);
        assert.strictEqual(rs.rotation, DefaultTextStyle.DEFAULT_ROTATION);
        assert.deepEqual(rs.color, DefaultTextStyle.DEFAULT_COLOR);
        assert.isFalse(Object.is(rs.color, DefaultTextStyle.DEFAULT_COLOR));
        assert.strictEqual(rs.opacity, DefaultTextStyle.DEFAULT_OPACITY);
        assert.deepEqual(rs.backgroundColor, DefaultTextStyle.DEFAULT_BACKGROUND_COLOR);
        assert.isFalse(Object.is(rs.backgroundColor, DefaultTextStyle.DEFAULT_BACKGROUND_COLOR));
        assert.strictEqual(rs.backgroundOpacity, DefaultTextStyle.DEFAULT_BACKGROUND_OPACITY);
    });

    it("C-tor with parameters uses objects copy.", () => {
        const rs = new TextRenderStyle(renderParams);

        assert.strictEqual(rs.fontName, renderParams.fontName);
        assert.deepEqual(rs.fontSize, renderParams.fontSize);
        assert.isFalse(Object.is(rs.fontSize, renderParams.fontSize));
        assert.strictEqual(rs.fontStyle, renderParams.fontStyle);
        assert.strictEqual(rs.fontVariant, renderParams.fontVariant);
        assert.strictEqual(rs.rotation, renderParams.rotation);
        assert.deepEqual(rs.color, renderParams.color);
        assert.isFalse(Object.is(rs.color, renderParams.color));
        assert.strictEqual(rs.opacity, renderParams.opacity);
        assert.deepEqual(rs.backgroundColor, renderParams.backgroundColor);
        assert.isFalse(Object.is(rs.backgroundColor, renderParams.backgroundColor));
        assert.strictEqual(rs.backgroundOpacity, renderParams.backgroundOpacity);

        renderParams.fontName = "test2";
        renderParams.fontSize!.size += 1;
        renderParams.fontStyle = FontStyle.BoldItalic;
        renderParams.fontVariant = FontVariant.SmallCaps;
        renderParams.rotation! += 1;
        renderParams.color!.b += 1;
        renderParams.opacity! += 0.1;
        renderParams.backgroundColor!.b += 1;
        renderParams.backgroundOpacity! += 0.1;

        assert.notStrictEqual(rs.fontName, renderParams.fontName);
        assert.notDeepEqual(rs.fontSize, renderParams.fontSize);
        assert.notStrictEqual(rs.fontStyle, renderParams.fontStyle);
        assert.notStrictEqual(rs.fontVariant, renderParams.fontVariant);
        assert.notStrictEqual(rs.rotation, renderParams.rotation);
        assert.notDeepEqual(rs.color, renderParams.color);
        assert.notStrictEqual(rs.opacity, renderParams.opacity);
        assert.notDeepEqual(rs.backgroundColor, renderParams.backgroundColor);
        assert.notStrictEqual(rs.backgroundOpacity, renderParams.backgroundOpacity);
    });

    it("Property setters use objects' deep copy.", () => {
        const rs = new TextRenderStyle(renderParams);

        const fontSize = {
            unit: DefaultTextStyle.DEFAULT_FONT_SIZE.unit,
            size: DefaultTextStyle.DEFAULT_FONT_SIZE.size,
            backgroundSize: DefaultTextStyle.DEFAULT_FONT_SIZE.backgroundSize
        };
        const fontColor = new THREE.Color(0x111111);
        const fontBgColor = new THREE.Color(0x222222);
        rs.fontSize = fontSize;
        rs.color = fontColor;
        rs.backgroundColor = fontBgColor;

        assert.deepEqual(rs.fontSize, fontSize);
        assert.isFalse(Object.is(rs.fontSize, fontSize));
        assert.deepEqual(rs.color, fontColor);
        assert.isFalse(Object.is(rs.color, fontColor));
        assert.deepEqual(rs.backgroundColor, fontBgColor);
        assert.isFalse(Object.is(rs.backgroundColor, fontBgColor));
    });

    it("Makes a deep copy.", () => {
        // First instance with defaults.
        const rs0 = new TextRenderStyle();
        // Second with test params that are all different.
        const rs1 = new TextRenderStyle(renderParams);

        assert.notStrictEqual(rs0, rs1);
        assert.notDeepEqual(rs0, rs1);

        rs0.copy(rs1);

        assert.notStrictEqual(rs0, rs1);
        assert.isFalse(Object.is(rs0, rs1));
        assert.deepEqual(rs0, rs1);
    });

    it("Makes a deep clone.", () => {
        const rs0 = new TextRenderStyle(renderParams);
        const rs1 = rs0.clone();

        assert.notStrictEqual(rs0, rs1);
        assert.isFalse(Object.is(rs0, rs1));
        assert.deepEqual(rs0, rs1);
    });
});

describe("TextLayoutStyle", () => {
    let layoutParams: TextLayoutParameters;

    beforeEach(function () {
        layoutParams = {
            tracking: 1,
            leading: 2,
            maxLines: 3,
            lineWidth: 4,
            canvasRotation: 90,
            lineRotation: 15,
            wrappingMode: WrappingMode.Character,
            verticalAlignment: VerticalAlignment.Center,
            horizontalAlignment: HorizontalAlignment.Center,
            placements: [{ h: HorizontalPlacement.Center, v: VerticalPlacement.Center }]
        };
    });

    it("Empty c-tor initializes with default values.", () => {
        const ls = new TextLayoutStyle();

        // Check only if values are equal, non-trivial object references should not be the same.
        assert.strictEqual(ls.tracking, DefaultTextStyle.DEFAULT_TRACKING);
        assert.strictEqual(ls.leading, DefaultTextStyle.DEFAULT_LEADING);
        assert.strictEqual(ls.maxLines, DefaultTextStyle.DEFAULT_MAX_LINES);
        assert.strictEqual(ls.lineWidth, DefaultTextStyle.DEFAULT_LINE_WIDTH);
        assert.strictEqual(ls.canvasRotation, DefaultTextStyle.DEFAULT_CANVAS_ROTATION);
        assert.strictEqual(ls.lineRotation, DefaultTextStyle.DEFAULT_LINE_ROTATION);
        assert.strictEqual(ls.wrappingMode, DefaultTextStyle.DEFAULT_WRAPPING_MODE);
        assert.strictEqual(ls.verticalAlignment, DefaultTextStyle.DEFAULT_VERTICAL_ALIGNMENT);
        assert.strictEqual(ls.horizontalAlignment, DefaultTextStyle.DEFAULT_HORIZONTAL_ALIGNMENT);
        assert.deepEqual(ls.placements, DefaultTextStyle.DEFAULT_PLACEMENTS);
        assert.isFalse(Object.is(ls.placements, DefaultTextStyle.DEFAULT_PLACEMENTS));
    });

    it("C-tor with parameters uses object's copy.", () => {
        const ls = new TextLayoutStyle(layoutParams);

        assert.strictEqual(ls.tracking, layoutParams.tracking);
        assert.strictEqual(ls.leading, layoutParams.leading);
        assert.strictEqual(ls.maxLines, layoutParams.maxLines);
        assert.strictEqual(ls.lineWidth, layoutParams.lineWidth);
        assert.strictEqual(ls.canvasRotation, layoutParams.canvasRotation);
        assert.strictEqual(ls.lineRotation, layoutParams.lineRotation);
        assert.strictEqual(ls.wrappingMode, layoutParams.wrappingMode);
        assert.strictEqual(ls.verticalAlignment, layoutParams.verticalAlignment);
        assert.strictEqual(ls.horizontalAlignment, layoutParams.horizontalAlignment);
        assert.deepEqual(ls.placements, layoutParams.placements);
        assert.isFalse(Object.is(ls.placements, layoutParams.placements));

        layoutParams.tracking! += 1;
        layoutParams.leading! += 1;
        layoutParams.maxLines! += 1;
        layoutParams.lineWidth! += 1;
        layoutParams.canvasRotation! += 1;
        layoutParams.lineRotation! += 1;
        layoutParams.wrappingMode = WrappingMode.None;
        layoutParams.horizontalAlignment = HorizontalAlignment.Left;
        layoutParams.verticalAlignment = VerticalAlignment.Above;
        layoutParams.placements![0].h = HorizontalPlacement.Right;

        // Input parameters changed but object is not.
        assert.notStrictEqual(ls.tracking, layoutParams.tracking);
        assert.notStrictEqual(ls.leading, layoutParams.leading);
        assert.notStrictEqual(ls.maxLines, layoutParams.maxLines);
        assert.notStrictEqual(ls.lineWidth, layoutParams.lineWidth);
        assert.notStrictEqual(ls.canvasRotation, layoutParams.canvasRotation);
        assert.notStrictEqual(ls.lineRotation, layoutParams.lineRotation);
        assert.notStrictEqual(ls.wrappingMode, layoutParams.wrappingMode);
        assert.notStrictEqual(ls.verticalAlignment, layoutParams.verticalAlignment);
        assert.notStrictEqual(ls.horizontalAlignment, layoutParams.horizontalAlignment);
        assert.notDeepEqual(ls.placements, layoutParams.placements);
    });

    it("Property setters use objects' deep copy.", () => {
        const ls = new TextLayoutStyle(layoutParams);

        const placements = [
            {
                h: HorizontalPlacement.Left,
                v: VerticalPlacement.Top
            }
        ];
        ls.placements = placements;
        assert.deepEqual(ls.placements, placements);
        assert.isFalse(Object.is(ls.placements, placements));
    });

    it("Makes a deep copy.", () => {
        // First instance with defaults.
        const ls0 = new TextLayoutStyle();
        // Second with test params that are all different.
        const ls1 = new TextLayoutStyle(layoutParams);

        assert.notStrictEqual(ls0, ls1);
        assert.notDeepEqual(ls0, ls1);

        ls0.copy(ls1);

        assert.notStrictEqual(ls0, ls1);
        assert.isFalse(Object.is(ls0, ls1));
        assert.deepEqual(ls0, ls1);
    });

    it("Makes a deep clone.", () => {
        const ls0 = new TextLayoutStyle(layoutParams);
        const ls1 = ls0.clone();

        assert.notStrictEqual(ls0, ls1);
        assert.isFalse(Object.is(ls0, ls1));
        assert.deepEqual(ls0, ls1);
    });

    interface PlacementOverrideRun {
        placements: TextPlacements;
        hAlignExpected: HorizontalAlignment;
        vAlignExpected: VerticalAlignment;
    }
    const runs: PlacementOverrideRun[] = [
        {
            placements: [
                {
                    h: HorizontalPlacement.Left,
                    v: VerticalPlacement.Top
                }
            ],
            hAlignExpected: HorizontalAlignment.Right,
            vAlignExpected: VerticalAlignment.Above
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Center,
                    v: VerticalPlacement.Top
                }
            ],
            hAlignExpected: HorizontalAlignment.Center,
            vAlignExpected: VerticalAlignment.Above
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Right,
                    v: VerticalPlacement.Top
                }
            ],
            hAlignExpected: HorizontalAlignment.Left,
            vAlignExpected: VerticalAlignment.Above
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Right,
                    v: VerticalPlacement.Center
                }
            ],
            hAlignExpected: HorizontalAlignment.Left,
            vAlignExpected: VerticalAlignment.Center
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Right,
                    v: VerticalPlacement.Bottom
                }
            ],
            hAlignExpected: HorizontalAlignment.Left,
            vAlignExpected: VerticalAlignment.Below
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Center,
                    v: VerticalPlacement.Bottom
                }
            ],
            hAlignExpected: HorizontalAlignment.Center,
            vAlignExpected: VerticalAlignment.Below
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Left,
                    v: VerticalPlacement.Bottom
                }
            ],
            hAlignExpected: HorizontalAlignment.Right,
            vAlignExpected: VerticalAlignment.Below
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Left,
                    v: VerticalPlacement.Center
                }
            ],
            hAlignExpected: HorizontalAlignment.Right,
            vAlignExpected: VerticalAlignment.Center
        },
        {
            placements: [
                {
                    h: HorizontalPlacement.Center,
                    v: VerticalPlacement.Center
                }
            ],
            hAlignExpected: HorizontalAlignment.Center,
            vAlignExpected: VerticalAlignment.Center
        }
    ];

    context("Placement attributes override alignment in c-tor.", function () {
        runs.forEach(function (run) {
            const hPlacement = run.placements[0].h;
            const vPlacement = run.placements[0].v;
            const hPlacementStr = HorizontalPlacement[hPlacement];
            const vPlacementStr = VerticalPlacement[vPlacement];
            const hAlignStr = HorizontalAlignment[run.hAlignExpected];
            const vAlignStr = VerticalAlignment[run.vAlignExpected];
            it(`Placement ${hPlacementStr}-${vPlacementStr} overrides alignment to ${hAlignStr}-${vAlignStr}`, function () {
                layoutParams.horizontalAlignment = HorizontalAlignment.Center;
                layoutParams.verticalAlignment = VerticalAlignment.Center;
                // Copy run placements to layout params.
                layoutParams.placements = run.placements.map(v => ({ ...v }));
                // Append few dummy placements
                layoutParams.placements.push(
                    {
                        h: HorizontalPlacement.Center,
                        v: VerticalPlacement.Center
                    },
                    {
                        h: HorizontalPlacement.Center,
                        v: VerticalPlacement.Bottom
                    }
                );
                const ls = new TextLayoutStyle(layoutParams);
                assert.deepEqual(ls.placements, layoutParams.placements);
                // Test correct alignment deduction.
                assert.strictEqual(ls.horizontalAlignment, run.hAlignExpected);
                assert.strictEqual(ls.verticalAlignment, run.vAlignExpected);
                // Test utilities.
                assert.strictEqual(
                    ls.horizontalAlignment,
                    hAlignFromPlacement(layoutParams.placements[0].h)
                );
                assert.strictEqual(
                    ls.verticalAlignment,
                    vAlignFromPlacement(layoutParams.placements[0].v)
                );
            });
        });
    });

    context("Placement attributes override alignment settings via setter.", function () {
        runs.forEach(function (run) {
            const hPlacement = run.placements[0].h;
            const vPlacement = run.placements[0].v;
            const hPlacementStr = HorizontalPlacement[hPlacement];
            const vPlacementStr = VerticalPlacement[vPlacement];
            const hAlignStr = HorizontalAlignment[run.hAlignExpected];
            const vAlignStr = VerticalAlignment[run.vAlignExpected];
            it(`Placement ${hPlacementStr}-${vPlacementStr} overrides alignment to ${hAlignStr}-${vAlignStr}`, function () {
                const ls = new TextLayoutStyle(layoutParams);
                ls.placements = run.placements;
                assert.deepEqual(ls.placements, run.placements);
                assert.isFalse(Object.is(ls.placements, run.placements));
                // Test correct alignment deduction.
                assert.strictEqual(ls.horizontalAlignment, run.hAlignExpected);
                assert.strictEqual(ls.verticalAlignment, run.vAlignExpected);
                // Test also utility functions.
                assert.strictEqual(
                    ls.horizontalAlignment,
                    hAlignFromPlacement(run.placements[0].h)
                );
                assert.strictEqual(ls.verticalAlignment, vAlignFromPlacement(run.placements[0].v));
            });
        });
    });
});
