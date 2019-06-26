/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { MapEnv } from "../lib/Expr";
import { StyleSetEvaluator } from "../lib/StyleSetEvaluator";
import { StyleSet } from "../lib/Theme";

describe("StyleSetEvaluator", function() {
    const basicStyleSetAutoOrder: StyleSet = [
        {
            description: "first",
            technique: "fill",
            when: "kind == 'bar'",
            attr: { color: "yellow" }
        },
        {
            description: "second",
            technique: "fill",
            when: "kind == 'park'",
            attr: { color: "green" }
        }
    ];

    it("doesn't modify input style set", function() {
        const ev = new StyleSetEvaluator(basicStyleSetAutoOrder);
        const parsedStyles = ev.styleSet;

        ev.getMatchingTechniques(new MapEnv({ kind: "bar" }));

        assert.notEqual(parsedStyles[0].renderOrder, undefined);
        assert.notEqual(parsedStyles[1].renderOrder, undefined);
        assert.notEqual(parsedStyles[0]._whenExpr, undefined);
        assert.notEqual(parsedStyles[1]._whenExpr, undefined);
        assert.equal((basicStyleSetAutoOrder[0] as any).renderOrder, undefined);
        assert.equal((basicStyleSetAutoOrder[1] as any).renderOrder, undefined);
        assert.equal((basicStyleSetAutoOrder[0] as any)._whenExpr, undefined);
        assert.equal((basicStyleSetAutoOrder[1] as any)._whenExpr, undefined);
        assert.equal((basicStyleSetAutoOrder[0] as any)._index, undefined);
        assert.equal((basicStyleSetAutoOrder[1] as any)._index, undefined);
    });

    it("finds techniques with equality operator", function() {
        const ev = new StyleSetEvaluator(basicStyleSetAutoOrder);
        const result = ev.getMatchingTechniques(new MapEnv({ kind: "bar" }));

        assert.equal(result.length, 1);
        assert.deepNestedInclude(result[0], {
            name: "fill",
            color: "yellow",
            renderOrder: 0
        });
    });

    it("matches multiple techniques style", function() {
        const ev = new StyleSetEvaluator([
            basicStyleSetAutoOrder[0],
            {
                description: "injected",
                technique: "fill",
                when: "kind == 'park'",
                attr: { color: "red" }
            },
            basicStyleSetAutoOrder[1]
        ]);
        const result = ev.getMatchingTechniques(new MapEnv({ kind: "park" }));

        assert.equal(result.length, 2);
        assert.deepNestedInclude(result[0], {
            name: "fill",
            color: "red",
            renderOrder: 1
        });
        assert.deepNestedInclude(result[1], {
            name: "fill",
            color: "green",
            renderOrder: 2
        });
    });

    it("supports final style", function() {
        const ev = new StyleSetEvaluator([
            basicStyleSetAutoOrder[0],
            {
                description: "injected",
                technique: "fill",
                when: "kind == 'park'",
                final: true,
                attr: { color: "red" }
            },
            basicStyleSetAutoOrder[1]
        ]);
        const result = ev.getMatchingTechniques(new MapEnv({ kind: "park" }));

        assert.equal(result.length, 1);
        assert.deepNestedInclude(result[0], {
            name: "fill",
            color: "red",
            renderOrder: 1
        });
    });

    it("generates implicit renderOrder", function() {
        const ev = new StyleSetEvaluator(basicStyleSetAutoOrder);

        const parsedStyles = ev.styleSet;
        assert.equal(parsedStyles[0].renderOrder, 0);
        assert.equal(parsedStyles[1].renderOrder, 1);
    });
    it("properly mixes auto-generated and explicit renderOrder", function() {
        const ev = new StyleSetEvaluator([
            {
                description: "foo",
                technique: "fill",
                when: "kind == 'ground'",
                renderOrder: 33,
                attr: { color: "brown" }
            },
            ...basicStyleSetAutoOrder
        ]);

        const parsedStyles = ev.styleSet;
        assert.equal(parsedStyles[0].renderOrder, 33);

        assert.equal(parsedStyles[0].renderOrder, 33);
        assert.equal(parsedStyles[1].renderOrder, 0);
        assert.equal(parsedStyles[2].renderOrder, 1);
    });

    it("supports renderOrderGroups", function() {
        const styleSetWithRenderOrderBiasGroups: StyleSet = [
            {
                description: "first",
                technique: "fill",
                renderOrderBiasGroup: "bar",
                renderOrderBiasRange: [0, 1000],
                when: "kind == 'bar'",
                attr: { color: "yellow" }
            },
            {
                description: "second",
                technique: "fill",
                renderOrderBiasGroup: "park",
                renderOrderBiasRange: [0, 100],
                when: "kind == 'park'",
                attr: { color: "green" }
            }
        ];
        const ev = new StyleSetEvaluator(styleSetWithRenderOrderBiasGroups);

        const parsedStyles = ev.styleSet;
        assert.equal(parsedStyles[0].renderOrder, 0);
        assert.equal(parsedStyles[1].renderOrder, 1001);
    });
});
