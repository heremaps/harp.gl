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

const EPSILON = 1e-8;

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

            assert.throw(() => {
                evaluate(["length", 123]);
            }, "invalid operand '123' for operator 'length'");

            assert.throw(() => {
                evaluate(["length", ["get", "on"]]);
            }, "invalid operand 'true' for operator 'length'");
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

    describe("Operator 'number'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["boolean", true]), true);
            assert.strictEqual(evaluate(["boolean", false]), false);
            assert.strictEqual(evaluate(["boolean", "x", true]), true);
            assert.strictEqual(evaluate(["boolean", 0, "x", true]), true);
            assert.strictEqual(evaluate(["boolean", ["get", "someText"], true]), true);
            assert.strictEqual(evaluate(["boolean", ["get", "off"], true]), false);
        });
    });

    describe("Operator 'number'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["number", 123]), 123);
            assert.approximately(Number(evaluate(["number", 123])), 123, EPSILON);
            assert.strictEqual(evaluate(["number", "x", "y", 123, "z", 321]), 123);
            assert.strictEqual(evaluate(["number", "x", "y", "123", "z", 321]), 321);
        });
    });

    describe("Operator 'string'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["string", "x", "y"]), "x");
            assert.strictEqual(evaluate(["string", 123, "y"]), "y");
            assert.strictEqual(
                evaluate(["string", ["get", "emptyText"], "x"]),
                defaultEnv.emptyText
            );
        });
    });

    describe("Operator 'typeof'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["typeof", "x"]), "string");
            assert.strictEqual(evaluate(["typeof", 123]), "number");
            assert.strictEqual(evaluate(["typeof", false]), "boolean");
            assert.strictEqual(evaluate(["typeof", ["get", "off"]]), "boolean");
            assert.strictEqual(evaluate(["typeof", ["get", "emptyText"]]), "string");
        });
    });

    describe("Operator 'min'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["min", 1, 2, 3]), 1);
            assert.strictEqual(evaluate(["min", 3, 2, 1]), 1);
        });
    });

    describe("Operator 'max'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["max", 1, 2, 3]), 3);
            assert.strictEqual(evaluate(["max", 3, 2, 1]), 3);
        });
    });

    describe("Operator 'pi'", function() {
        it("evaluate", function() {
            assert.approximately(Number(evaluate(["pi"])), Math.PI, EPSILON);
        });
    });

    describe("Operator 'to-boolean'", function() {
        it("evaluate", function() {
            assert.equal(evaluate(["to-boolean", true]), true);
            assert.equal(evaluate(["to-boolean", false]), false);
            assert.equal(evaluate(["to-boolean", 0]), false);
            assert.equal(evaluate(["to-boolean", 1]), true);
            assert.equal(evaluate(["to-boolean", 1123.3]), true);
        });
    });

    describe("Operator 'to-number'", function() {
        it("evaluate", function() {
            assert.equal(evaluate(["to-number", true]), 1);
            assert.equal(evaluate(["to-number", false]), 0);
            assert.equal(evaluate(["to-number", "123"]), 123);
            assert.approximately(evaluate(["to-number", "123.123"]) as number, 123.123, EPSILON);
        });
    });

    describe("Operator 'to-string'", function() {
        it("evaluate", function() {
            assert.equal(evaluate(["to-string", true]), "true");
            assert.equal(evaluate(["to-string", false]), "false");
            assert.equal(evaluate(["to-string", 123]), "123");
        });
    });
});
