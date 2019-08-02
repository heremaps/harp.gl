/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Expr } from "../lib/Expr";
import { ExprPool } from "../lib/ExprPool";

describe("ExprPool", function() {
    const expressions = [
        1,
        "string",
        ["get", "attribute"],
        ["has", "attribute"],
        ["!", ["!", 1]],
        ["in", 1, [1]],
        ["in", "x", ["x", "y"]],
        ["all", ["==", ["get", "a"], 1], ["==", ["get", "b"], 2]],
        [
            "all",
            ["==", ["get", "a"], 1],
            ["any", ["!=", ["get", "b"], 123], ["==", ["get", "x"], 2]]
        ]
    ];

    expressions.forEach(expr => {
        it(`intern '${JSON.stringify(expr)}'`, function() {
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

    it("intern 'in' expressions", function() {
        const pool = new ExprPool();

        assert.equal(
            Expr.fromJSON(["in", 1, [1, 2]]).intern(pool),
            Expr.fromJSON(["in", 1, [2, 1]]).intern(pool)
        );

        assert.notEqual(
            Expr.fromJSON(["in", 1, [1, 2]]).intern(pool),
            Expr.fromJSON(["in", 1, [1, 2, 3]]).intern(pool)
        );

        assert.notEqual(
            Expr.fromJSON(["in", 1, [3, 2, 1]]).intern(pool),
            Expr.fromJSON(["in", 1, [1, 2]]).intern(pool)
        );
    });
});
