/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { Expr } from "../lib/Expr";
import { ExprPool } from "../lib/ExprPool";

describe("ExprPool", function () {
    const expressions = [
        1,
        "string",
        ["get", "attribute"],
        ["has", "attribute"],
        ["!", ["!", 1]],
        ["in", 1, ["literal", [1]]],
        ["in", "x", ["literal", ["x", "y"]]],
        ["all", ["==", ["get", "a"], 1], ["==", ["get", "b"], 2]],
        [
            "all",
            ["==", ["get", "a"], 1],
            ["any", ["!=", ["get", "b"], 123], ["==", ["get", "x"], 2]]
        ],
        [
            "case",
            ["<=", ["interpolate", ["linear"], ["zoom"], 0, 0, 5, 0, 5, 9], 0],
            0,
            ["ppi-scale", ["step", ["zoom"], 2, 10, 0], ["+", ["*", ["-", ["ppi"], 72], 0.004], 1]]
        ],
        ["match", ["get", "kind"], "locality", ["get", "attribute"], null]
    ];

    expressions.forEach(expr => {
        it(`intern '${JSON.stringify(expr)}'`, function () {
            const pool = new ExprPool();
            const otherPool = new ExprPool();

            assert.notEqual(Expr.fromJSON(expr), Expr.fromJSON(expr));

            assert.equal(Expr.fromJSON(expr).intern(pool), Expr.fromJSON(expr).intern(pool));

            assert.notEqual(
                Expr.fromJSON(expr).intern(pool),
                Expr.fromJSON(expr).intern(otherPool)
            );
        });
    });

    it("intern 'in' expressions", function () {
        const pool = new ExprPool();

        const elements1 = [1, 2];
        const elements2 = [1, 2, 3];

        assert.strictEqual(
            Expr.fromJSON(["in", 1, ["literal", elements1]]).intern(pool),
            Expr.fromJSON(["in", 1, ["literal", elements1]]).intern(pool)
        );

        assert.strictEqual(
            Expr.fromJSON(["in", 1, ["literal", [1, 2]]]).intern(pool),
            Expr.fromJSON(["in", 1, ["literal", elements1]]).intern(pool)
        );

        assert.strictEqual(
            Expr.fromJSON(["in", "a", ["literal", ["a", "b"]]]).intern(pool),
            Expr.fromJSON(["in", "a", ["literal", ["a", "b"]]]).intern(pool)
        );

        assert.notStrictEqual(
            Expr.fromJSON(["in", 1, ["literal", elements1]]).intern(pool),
            Expr.fromJSON(["in", 1, ["literal", elements2]]).intern(pool)
        );

        assert.strictEqual(
            Expr.fromJSON(["in", "a", "aa"]).intern(pool),
            Expr.fromJSON(["in", "a", "aa"]).intern(pool)
        );
    });
});
