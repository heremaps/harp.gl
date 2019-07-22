/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Expr, MapEnv, ValueMap } from "../lib/Expr";
import { ExprEvaluator } from "../lib/ExprEvaluator";

describe("ExprEvaluator", function() {
    const evaluator = new ExprEvaluator();

    const defaultEnv = {
        on: true,
        off: false,
        someText: "some text",
        emptyText: ""
    };

    function evaluate(expr: unknown, env: ValueMap = defaultEnv) {
        return evaluator.evaluate(Expr.fromJSON(expr), new MapEnv(env));
    }

    describe("Operator 'all'", function() {
        it("evaluate", function() {
            assert.isTrue(
                Boolean(
                    evaluate([
                        "all",
                        true,
                        1,
                        "string literal",
                        ["has", "on"],
                        ["get", "on"],
                        ["has", "off"],
                        ["!", ["get", "off"]]
                    ])
                )
            );

            assert.isFalse(Boolean(evaluate(["all", true, 1, "string literal", ["get", "flag"]])));
        });
    });

    describe("Operator 'any'", function() {
        it("evaluate", function() {
            assert.isTrue(Boolean(evaluate(["any", 1, true, "string", ["get", "on"]])));
            assert.isFalse(Boolean(evaluate(["any", 0, false, "", ["get", "off"]])));
        });
    });

    describe("Operator 'get'", function() {
        Object.getOwnPropertyNames(defaultEnv).forEach((property: any) => {
            const propertyName = property as keyof typeof defaultEnv;
            it(`get property '${propertyName}'`, function() {
                assert.strictEqual(evaluate(["get", propertyName]), defaultEnv[propertyName]);
            });
        });

        it("Ensure builtin symbols are not accessible", function() {
            assert.isUndefined(evaluate(["get", "has"]));
            assert.isUndefined(evaluate(["get", "get"]));
            assert.isUndefined(evaluate(["get", "length"]));
        });
    });

    describe("Operator 'has'", function() {
        Object.getOwnPropertyNames(defaultEnv).forEach(property => {
            it(`has property '${property}'`, function() {
                assert.isTrue(evaluate(["has", property]));
            });
        });

        it("Ensure builtin symbols are not accessible", function() {
            assert.isFalse(evaluate(["has", "has"]));
            assert.isFalse(evaluate(["has", "get"]));
            assert.isFalse(evaluate(["has", "length"]));
        });
    });

    describe("Operator 'length'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["length", "ciao"]), 4);

            assert.strictEqual(
                evaluate(["length", ["get", "emptyText"]]),
                defaultEnv.emptyText.length
            );

            assert.strictEqual(
                evaluate(["length", ["get", "someText"]]),
                defaultEnv.someText.length
            );

            assert.isUndefined(evaluate(["length", 123]));

            assert.isUndefined(evaluate(["length", ["get", "on"]]));
        });
    });

    describe("Operator 'in'", function() {
        it("evaluate", function() {
            assert.isTrue(evaluate(["in", "x", ["x"]]));
            assert.isFalse(evaluate(["in", "x", ["y"]]));

            assert.isTrue(evaluate(["in", ["get", "someText"], [defaultEnv.someText]]));
            assert.isTrue(evaluate(["in", ["get", "emptyText"], [defaultEnv.emptyText]]));
        });
    });

    describe("Operator '!'", function() {
        it("evaluate", function() {
            assert.isTrue(evaluate(["!", false]));
            assert.isFalse(evaluate(["!", ["!", false]]));
            assert.isTrue(evaluate(["!", ["!", ["!", false]]]));

            assert.isTrue(evaluate(["!", ["has", "xx"]]));

            assert.isFalse(evaluate(["!", ["in", ["get", "emptyText"], [defaultEnv.emptyText]]]));
        });
    });

    describe("Operator 'concat'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["concat", 1, 2, 3]), "123");
            assert.strictEqual(evaluate(["concat", "hello", " ", "world"]), "hello world");
            assert.strictEqual(evaluate(["concat", "string", "_", 123]), "string_123");
            assert.strictEqual(
                evaluate(["concat", ["get", "someText"], "_", 123]),
                "some text_123"
            );
            assert.strictEqual(evaluate(["concat", "on is ", ["get", "on"]]), "on is true");
            assert.strictEqual(evaluate(["concat", "off is ", ["get", "off"]]), "off is false");
        });
    });

    describe("Operator 'downcase'", function() {
        it("evaluate", function() {
            assert.strictEqual(
                evaluate(["downcase", ["get", "someText"]]),
                defaultEnv.someText.toLocaleLowerCase()
            );
        });
    });

    describe("Operator 'upcase'", function() {
        it("evaluate", function() {
            assert.strictEqual(
                evaluate(["upcase", ["get", "someText"]]),
                defaultEnv.someText.toLocaleUpperCase()
            );
        });
    });

    describe("Operator '+'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["+", 123, 321]), 123 + 321);
        });
    });

    describe("Operator '*'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["*", 1, 2, 3, 4]), 1 * 2 * 3 * 4);
        });
    });
});
