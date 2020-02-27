/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import {
    Env,
    Expr,
    ExprScope,
    JsonArray,
    JsonExpr,
    JsonValue,
    MapEnv,
    ValueMap
} from "../lib/Expr";
import { getPropertyValue } from "../lib/InterpolatedProperty";

import * as THREE from "three";

const EPSILON = 1e-8;

describe("ExprEvaluator", function() {
    const defaultEnv = {
        on: true,
        off: false,
        someText: "some text",
        emptyText: "",
        zero: 0,
        one: 1,
        two: 2,
        numbers: [1, 2, 3],
        strings: ["aa", "bb", "cc"]
    };

    function evaluate(
        expr: JsonValue,
        values: ValueMap = defaultEnv,
        scope: ExprScope = ExprScope.Value
    ) {
        const env = new MapEnv(values);
        return Expr.fromJSON(expr).evaluate(env, scope);
    }

    function dependencies(json: JsonValue) {
        const expr = Expr.fromJSON(json);
        const dynamic = expr.isDynamic();
        const deps = expr.dependencies();
        const properties = Array.from(deps.properties).sort();
        return {
            properties: Array.from(properties).sort(),
            dynamic
        };
    }

    function envForZoom(zoom: number) {
        return new MapEnv({ $zoom: zoom });
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
            assert.strictEqual(evaluate(["get", "has"]), null);
            assert.strictEqual(evaluate(["get", "get"]), null);
            assert.strictEqual(evaluate(["get", "length"]), null);
        });

        it("Object access", function() {
            const object = { x: 1, y: 2, z: 3, k: "point" };
            assert.strictEqual(evaluate(["literal", object]), object);
            assert.strictEqual(evaluate(["get", "x", ["literal", object]]), object.x);
            assert.strictEqual(evaluate(["get", "y", ["literal", object]]), object.y);
            assert.strictEqual(evaluate(["get", "z", ["literal", object]]), object.z);
            assert.strictEqual(evaluate(["get", "k", ["literal", object]]), object.k);
            assert.strictEqual(evaluate(["get", "w", ["literal", object]]), null);

            assert.strictEqual(evaluate(["get", ["string", "k"], ["literal", object]]), object.k);
        });

        it("Serialize object access", function() {
            const expr = ["get", "x", ["literal", { x: 1 }]];
            assert.equal(JSON.stringify(expr), JSON.stringify(Expr.fromJSON(expr)));
        });

        it("Serialize access", function() {
            const expr = ["get", "x"];
            assert.equal(JSON.stringify(expr), JSON.stringify(Expr.fromJSON(expr)));
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

        it("Object access", function() {
            const object = { x: 1, y: 2, z: 3, k: "point" };
            assert.isTrue(evaluate(["has", "x", ["literal", object]]));
            assert.isTrue(evaluate(["has", "y", ["literal", object]]));
            assert.isTrue(evaluate(["has", "z", ["literal", object]]));
            assert.isTrue(evaluate(["has", "k", ["literal", object]]));
            assert.isFalse(evaluate(["has", "w", ["literal", object]]));
        });

        it("Serialize object access", function() {
            const expr = ["has", "x", ["literal", { x: 1 }]];
            assert.equal(JSON.stringify(expr), JSON.stringify(Expr.fromJSON(expr)));
        });

        it("Serialize access", function() {
            const expr = ["has", "x"];
            assert.equal(JSON.stringify(expr), JSON.stringify(Expr.fromJSON(expr)));
        });
    });

    describe("Operator '!has'", function() {
        Object.getOwnPropertyNames(defaultEnv).forEach(property => {
            it(`has property '${property}'`, function() {
                assert.isFalse(evaluate(["!has", property]));
            });
        });

        it("Ensure builtin symbols are not accessible", function() {
            assert.isTrue(evaluate(["!has", "has"]));
            assert.isTrue(evaluate(["!has", "get"]));
            assert.isTrue(evaluate(["!has", "length"]));
        });

        it("Object access", function() {
            const object = { x: 1, y: 2, z: 3, k: "point" };
            assert.isFalse(evaluate(["!has", "x", ["literal", object]]));
            assert.isFalse(evaluate(["!has", "y", ["literal", object]]));
            assert.isFalse(evaluate(["!has", "z", ["literal", object]]));
            assert.isFalse(evaluate(["!has", "k", ["literal", object]]));
            assert.isTrue(evaluate(["!has", "w", ["literal", object]]));
        });
    });

    describe("Operator 'dynamic-properties'", function() {
        it("evaluation scope", function() {
            // the ["dynamic-properties"] in a dynamic scope should return the current environment.
            assert.isTrue(
                Env.isEnv(evaluate(["dynamic-properties"], undefined, ExprScope.Dynamic))
            );

            // the ["dynamic-properties"] in a static scope should return itself.
            assert.isTrue(
                Expr.isExpr(evaluate(["dynamic-properties"], undefined, ExprScope.Value))
            );

            // the ["dynamic-properties"] in a condition scope should return itself.
            assert.isTrue(
                Expr.isExpr(evaluate(["dynamic-properties"], undefined, ExprScope.Condition))
            );
        });

        it("get", function() {
            const values: ValueMap = { x: 123 };

            assert.strictEqual(
                evaluate(["get", "x", ["dynamic-properties"]], values, ExprScope.Dynamic),
                123
            );

            assert.isTrue(
                evaluate(["has", "x", ["dynamic-properties"]], values, ExprScope.Dynamic)
            );

            assert.isFalse(
                evaluate(["has", "y", ["dynamic-properties"]], values, ExprScope.Dynamic)
            );
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
            assert.isTrue(evaluate(["in", "x", ["literal", ["x"]]]));
            assert.isFalse(evaluate(["in", "x", ["literal", ["y"]]]));
            assert.isTrue(evaluate(["in", "hello", "hello world"]));
            assert.isTrue(evaluate(["in", "world", "hello world"]));
            assert.isFalse(evaluate(["in", "ciao", "hello world"]));

            assert.isTrue(evaluate(["in", 1, ["get", "numbers"]]));
            assert.isFalse(evaluate(["in", 100, ["get", "numbers"]]));

            assert.isTrue(evaluate(["in", "bb", ["get", "strings"]]));
            assert.isFalse(evaluate(["in", "zz", ["get", "strings"]]));

            assert.isTrue(evaluate(["in", "some", ["get", "someText"]]));
            assert.isTrue(evaluate(["in", "text", ["get", "someText"]]));
            assert.isFalse(evaluate(["in", "zz", ["get", "someText"]]));

            assert.isTrue(
                evaluate(["in", ["get", "someText"], ["literal", [defaultEnv.someText]]])
            );

            assert.isTrue(
                evaluate(["in", ["get", "emptyText"], ["literal", [defaultEnv.emptyText]]])
            );

            assert.throw(() => evaluate(["in", ["get", "someText"]]));
        });
    });

    describe("Operator '!in'", function() {
        it("evaluate", function() {
            assert.isFalse(evaluate(["!in", "x", ["literal", ["x"]]]));
            assert.isTrue(evaluate(["!in", "x", ["literal", ["y"]]]));
            assert.isFalse(evaluate(["!in", "hello", "hello world"]));
            assert.isFalse(evaluate(["!in", "world", "hello world"]));
            assert.isTrue(evaluate(["!in", "ciao", "hello world"]));

            assert.isFalse(
                evaluate(["!in", ["get", "someText"], ["literal", [defaultEnv.someText]]])
            );

            assert.isFalse(
                evaluate(["!in", ["get", "emptyText"], ["literal", [defaultEnv.emptyText]]])
            );

            assert.throw(() => evaluate(["!in", ["literal", ["get", "someText"]]]));
        });
    });

    describe("Operator '!'", function() {
        it("evaluate", function() {
            assert.isTrue(evaluate(["!", false]));
            assert.isFalse(evaluate(["!", ["!", false]]));
            assert.isTrue(evaluate(["!", ["!", ["!", false]]]));

            assert.isTrue(evaluate(["!", ["has", "xx"]]));

            assert.isFalse(
                evaluate(["!", ["in", ["get", "emptyText"], ["literal", [defaultEnv.emptyText]]]])
            );

            assert.strictEqual(evaluate(null), null);
            assert.isTrue(evaluate(["!", null]));
            assert.isFalse(evaluate(["!", ["!", null]]));
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

    describe("Operator '-'", function() {
        it("evaluate", function() {
            assert.strictEqual(evaluate(["-", 123, 321]), 123 - 321);
            assert.strictEqual(evaluate(["-", 123]), -123);
            assert.throws(() => evaluate(["-", "a"]));
            assert.throws(() => evaluate(["-", "a", 321]));
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
            assert.throw(() => evaluate(["to-number", "x"]));
            assert.equal(evaluate(["to-number", "x", true]), 1);
            assert.equal(evaluate(["to-number", "123y", false]), 0);
            assert.equal(evaluate(["to-number", "0y1", "123"]), 123);
            assert.equal(evaluate(["to-number", 10_000, "123"]), 10_000);
        });
    });

    describe("Operator 'to-string'", function() {
        it("evaluate", function() {
            assert.equal(evaluate(["to-string", true]), "true");
            assert.equal(evaluate(["to-string", false]), "false");
            assert.equal(evaluate(["to-string", 123]), "123");
        });
    });

    describe("Operator 'match'", function() {
        it("evaluate", function() {
            assert.equal(
                evaluate([
                    "match",
                    ["get", "someText"],
                    "some text",
                    true,
                    false // otherwise
                ]),
                true
            );

            assert.equal(evaluate(["match", ["get", "one"], 1, true, false]), true);

            assert.equal(evaluate(["match", ["get", "two"], [0, 1], false, 2, true, false]), true);
        });

        it("serialize", function() {
            const expr = ["match", ["get", "someText"], ["some text", "y"], 1, "z", 2, 3];
            assert.equal(JSON.stringify(expr), JSON.stringify(Expr.fromJSON(expr)));
            assert.equal(evaluate(expr), 1);
        });

        it("parse", function() {
            assert.throw(() => Expr.fromJSON(["match"]), "not enough arguments");
            assert.throw(() => Expr.fromJSON(["match", ["get", "x"]]), "not enough arguments");
            assert.throw(
                () => Expr.fromJSON(["match", ["get", "x"], "value1"]),
                "not enough arguments"
            );
            assert.throw(
                () => Expr.fromJSON(["match", ["get", "x"], "value1", "result1"]),
                "fallback is missing in 'match' expression"
            );
            assert.throw(
                () => Expr.fromJSON(["match", ["get", "x"], [0, "value1"], "result1", "fallback"]),
                "'[0,\"value1\"]' is not a valid label for 'match'"
            );
        });
    });

    describe("Operator 'case'", function() {
        it("evaluate", function() {
            assert.equal(evaluate(["case", true, 123, 321]), 123);
            assert.equal(evaluate(["case", false, 123, 321]), 321);
            assert.equal(evaluate(["case", ["has", "one"], 123, 321]), 123);
            assert.equal(evaluate(["case", ["has", "something"], 123, 321]), 321);
            assert.equal(
                evaluate([
                    "case",
                    ["has", "something"],
                    123,
                    ["==", ["get", "someText"], "some text"],
                    444,
                    321 // fallback
                ]),
                444
            );
            assert.equal(evaluate(["case", false, 123, ["has", "something"], 123, 321]), 321);
        });

        it("serialize", function() {
            const expr = [
                "case",
                ["has", "something"],
                123,
                ["==", ["get", "someText"], "some text"],
                444,
                321 // fallback
            ];
            assert.equal(JSON.stringify(expr), JSON.stringify(Expr.fromJSON(expr)));
        });

        it("parse", function() {
            assert.throw(() => Expr.fromJSON(["case"]), "not enough arguments");

            assert.throw(() => Expr.fromJSON(["case", ["get", "x"]]), "not enough arguments");

            assert.throw(
                () => Expr.fromJSON(["case", ["get", "x"], "result1"]),
                "fallback is missing in 'case' expression"
            );

            assert.throw(
                () =>
                    Expr.fromJSON([
                        "case",
                        ["get", "x"],
                        "result1", // if x returns result1
                        ["get", "y"],
                        "result2" // if y returns result2
                    ]),
                "fallback is missing in 'case' expression"
            );
        });
    });

    describe("Operator 'literal'", function() {
        it("evaluate", function() {
            assert.isTrue(evaluate(["==", ["typeof", ["literal", { x: 10, y: 20 }]], "object"]));
            assert.isTrue(evaluate(["==", ["typeof", ["literal", [10, 20, 30]]], "object"]));
            assert.isTrue(evaluate(["==", ["typeof", ["literal", ["x", "y", "z"]]], "object"]));

            assert.equal(evaluate(["length", ["literal", ["x", "y", "z"]]]), 3);
        });
    });

    describe("Operator 'at'", function() {
        it("retrieve array element", function() {
            assert.equal(evaluate(["at", 0, ["literal", ["x", "y", "z"]]]), "x");
            assert.equal(evaluate(["at", 1, ["literal", ["x", "y", "z"]]]), "y");
            assert.equal(evaluate(["at", 2, ["literal", ["x", "y", "z"]]]), "z");
            assert.isNull(evaluate(["at", 3, ["literal", ["x", "y", "z"]]]));
            assert.isNull(evaluate(["at", -1, ["literal", ["x", "y", "z"]]]));

            assert.throws(() => evaluate(["at", "pos", ["literal", ["x", "y", "z"]]]));
            assert.throws(() => evaluate(["at", "pos", "string"]));
        });
    });

    describe("Operator 'interpolate'", function() {
        it("parse", function() {
            assert.isNotNull(evaluate(["interpolate", ["linear"], ["zoom"], 0, 0, 1, 1, 2, 2]));

            assert.isNotNull(evaluate(["interpolate", ["discrete"], ["zoom"], 0, 0, 1, 1, 2, 2]));

            assert.isNotNull(
                evaluate(["interpolate", ["exponential", 2], ["zoom"], 0, 0, 1, 1, 2, 2])
            );

            assert.throws(() => evaluate(["interpolate"]), "expected an interpolation type");

            assert.throws(
                () => evaluate(["interpolate", "linear"]),
                "expected an interpolation type"
            );

            assert.throws(
                () => evaluate(["interpolate", ["linear"]]),
                "expected the input of the interpolation"
            );

            assert.throws(
                () => evaluate(["interpolate", ["discrete"]]),
                "expected the input of the interpolation"
            );

            assert.throws(
                () => evaluate(["interpolate", ["cubic"]]),
                "expected the input of the interpolation"
            );

            assert.throws(
                () => evaluate(["interpolate", ["exponential", 2]]),
                "expected the input of the interpolation"
            );

            assert.throws(
                () => evaluate(["interpolate", ["exponential"]]),
                "expected the base of the exponential interpolation"
            );

            assert.throws(
                () => evaluate(["interpolate", ["linear"], ["time"]]),
                "only 'zoom' is supported"
            );

            assert.throws(
                () => evaluate(["interpolate", ["linear"], ["zoom"]]),
                "invalid number of samples"
            );

            assert.throws(
                () => evaluate(["interpolate", ["linear"], ["zoom"], 0, 1, 2]),
                "invalid number of samples"
            );
        });
    });

    describe("Operator 'zoom'", function() {
        it("evaluate", function() {
            assert.throw(() => evaluate(["zoom"]), "invalid usage of the 'zoom' operator");

            assert.throw(
                () => evaluate(["zoom"], { $zoom: 10 }),
                "invalid usage of the 'zoom' operator"
            );

            assert.strictEqual(evaluate(["zoom"], { $zoom: 10 }, ExprScope.Condition), 10);
        });
    });

    describe("Operator 'step'", function() {
        it("parse", function() {
            assert.throws(() => evaluate(["step"]), "expected the input of the 'step' operator");

            assert.throws(
                () => evaluate(["step"], {}, ExprScope.Condition),
                "expected the input of the 'step' operator"
            );

            assert.throws(
                () => evaluate(["step", ["get", "x"]], { x: "text" }, ExprScope.Condition),
                "not enough arguments"
            );

            assert.throws(
                () => evaluate(["step", ["get", "x"]], { x: 1 }, ExprScope.Condition),
                "not enough arguments"
            );

            assert.throws(
                () =>
                    evaluate(
                        [
                            "step",
                            ["get", "x"],
                            false, // default value
                            10 // first step
                            // error, missing value for first step
                        ],
                        { x: 10 },
                        ExprScope.Condition
                    ),
                "not enough arguments"
            );

            assert.throws(
                () =>
                    evaluate(
                        [
                            "step",
                            ["get", "x"],
                            false, // default value
                            10, // first step
                            true,
                            15 // second step
                            // error, missing value for second step
                        ],
                        { x: 10 },
                        ExprScope.Condition
                    ),
                "not enough arguments"
            );
        });

        it("condition", function() {
            assert.isFalse(
                evaluate(
                    ["step", ["zoom"], false, 13, true],
                    {
                        $zoom: 0
                    },
                    ExprScope.Condition
                )
            );

            assert.isTrue(
                evaluate(
                    ["step", ["zoom"], false, 13, true],
                    {
                        $zoom: 13
                    },
                    ExprScope.Condition
                )
            );

            for (let level = 0; level < 5; ++level) {
                assert.strictEqual(
                    evaluate(
                        ["step", ["zoom"], "default", 5, "a", 10, "b"],
                        {
                            $zoom: level
                        },
                        ExprScope.Condition
                    ),
                    "default"
                );
            }

            for (let level = 5; level < 10; ++level) {
                assert.strictEqual(
                    evaluate(
                        ["step", ["zoom"], "default", 5, "a", 10, "b"],
                        {
                            $zoom: level
                        },
                        ExprScope.Condition
                    ),
                    "a"
                );
            }

            for (let level = 10; level < 20; ++level) {
                assert.strictEqual(
                    evaluate(
                        ["step", ["zoom"], "default", 5, "a", 10, "b"],
                        {
                            $zoom: level
                        },
                        ExprScope.Condition
                    ),
                    "b"
                );
            }
        });

        it("Operator 'id'", function() {
            assert.strictEqual(evaluate(["id"], { $id: 123 }), 123);
            assert.strictEqual(evaluate(["id"], { $id: "473843" }), "473843");
            assert.strictEqual(evaluate(["id"]), null);

            assert.deepStrictEqual(dependencies(["id"]), {
                properties: ["$id"],
                dynamic: false
            });
        });

        it("Operator 'geometry-type'", function() {
            // Returns a string representing the feature type using the GoeJSON conversion,
            // Point, LineString, or Polygon.

            assert.strictEqual(evaluate(["geometry-type"], { $geometryType: "point" }), "Point");

            assert.strictEqual(
                evaluate(["geometry-type"], { $geometryType: "line" }),
                "LineString"
            );

            assert.strictEqual(
                evaluate(["geometry-type"], { $geometryType: "polygon" }),
                "Polygon"
            );

            assert.deepStrictEqual(dependencies(["geometry-type"]), {
                properties: ["$geometryType"],
                dynamic: false
            });
        });

        it("dynamic interpolation (without step 0)", function() {
            const interpolation = evaluate(["step", ["zoom"], "#ff0000", 13, "#000000"]);
            for (let zoom = 0; zoom < 13; ++zoom) {
                assert.strictEqual(
                    getPropertyValue(interpolation, envForZoom(zoom)),
                    getPropertyValue("#ff0000", envForZoom(zoom))
                );
            }
            for (let zoom = 13; zoom < 20; ++zoom) {
                assert.strictEqual(
                    getPropertyValue(interpolation, envForZoom(zoom)),
                    getPropertyValue("#000000", envForZoom(zoom))
                );
            }
        });

        it("dynamic interpolation (with step 0)", function() {
            const interpolation = evaluate([
                "step",
                ["zoom"],
                "#ff0000",
                0,
                "#00ff00",
                13,
                "#000000"
            ]);

            assert.strictEqual(
                getPropertyValue(interpolation, envForZoom(-1)),
                getPropertyValue("#ff0000", envForZoom(-1))
            );

            for (let zoom = 0; zoom < 13; ++zoom) {
                assert.strictEqual(
                    getPropertyValue(interpolation, envForZoom(zoom)),
                    getPropertyValue("#00ff00", envForZoom(zoom))
                );
            }
            for (let zoom = 13; zoom < 20; ++zoom) {
                assert.strictEqual(
                    getPropertyValue(interpolation, envForZoom(zoom)),
                    getPropertyValue("#000000", envForZoom(zoom))
                );
            }
        });

        for (const scope of [ExprScope.Value, ExprScope.Condition]) {
            it(`selection for scope '${ExprScope[scope]}'`, function() {
                for (let i = 0; i < 5; ++i) {
                    assert.strictEqual(
                        evaluate(
                            ["step", ["get", "i"], "default", 5, "a", 10, "b"],
                            {
                                i
                            },
                            ExprScope.Condition
                        ),
                        "default"
                    );
                }

                for (let i = 5; i < 10; ++i) {
                    assert.strictEqual(
                        evaluate(
                            ["step", ["get", "i"], "default", 5, "a", 10, "b"],
                            {
                                i
                            },
                            ExprScope.Condition
                        ),
                        "a"
                    );
                }

                for (let i = 10; i < 20; ++i) {
                    assert.strictEqual(
                        evaluate(
                            ["step", ["get", "i"], "default", 5, "a", 10, "b"],
                            {
                                i
                            },
                            ExprScope.Condition
                        ),
                        "b"
                    );
                }
            });
        }

        it("default value of a step", function() {
            assert.strictEqual(
                evaluate(
                    ["step", ["get", "x"], "default value", 0, "value"],
                    {
                        x: null
                    },
                    ExprScope.Dynamic
                ),
                "default value"
            );
        });
    });

    it("Dependencies", function() {
        assert.deepEqual(dependencies(true), { properties: [], dynamic: false });
        assert.deepEqual(dependencies(["get", "x"]), { properties: ["x"], dynamic: false });
        assert.deepEqual(dependencies(["has", "x"]), { properties: ["x"], dynamic: false });

        assert.deepEqual(
            dependencies(["interpolate", ["exponential", 2], ["zoom"], 0, 0, 1, 1, ["get", "max"]]),
            { properties: ["max"], dynamic: true }
        );

        assert.deepEqual(dependencies(["step", ["zoom"], "default", 5, "a", 10, "b"]), {
            properties: [],
            dynamic: true
        });

        assert.deepEqual(dependencies(["match", ["get", "two"], [0, 1], false, 2, true, false]), {
            properties: ["two"],
            dynamic: false
        });

        assert.deepEqual(
            dependencies([
                "case",
                ["get", "x"],
                "result1",
                ["step", ["zoom"], "default", 5, "a", 10, "b"],
                "result2",
                ["get", "fallback-value"]
            ]),
            {
                properties: ["fallback-value", "x"],
                dynamic: true
            }
        );
    });

    describe("Operator 'hsl'", function() {
        it("call", function() {
            assert.strictEqual(
                new THREE.Color(evaluate(["hsl", 20, 100, 50]) as string).getHexString(),
                new THREE.Color("hsl(20, 100%, 50%)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["hsl", 20, 100, 50]) as number).getHexString(),
                new THREE.Color("hsl(20, 100%, 50%)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["hsl", 370, 100, 50]) as string).getHexString(),
                new THREE.Color("hsl(370, 100%, 50%)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["hsl", 370, 100, 50]) as number).getHexString(),
                new THREE.Color("hsl(370, 100%, 50%)").getHexString()
            );

            assert.throw(
                () => evaluate(["hsl", 10.3, -40, 50]),
                "unknown color 'hsl(10.3,-40%,50%)'"
            );
        });
    });

    describe("Operator 'rgb'", function() {
        it("call", function() {
            assert.strictEqual(
                new THREE.Color(evaluate(["rgb", 255, 0, 0]) as string).getHexString(),
                new THREE.Color("rgb(255, 0, 0)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgb", 255, 255, 0]) as string).getHexString(),
                new THREE.Color("rgb(255, 255, 0)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgb", 255, 255, 255]) as string).getHexString(),
                new THREE.Color("rgb(255, 255, 255)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgb", 300, 300, 300]) as string).getHexString(),
                new THREE.Color("rgb(300, 300, 300)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgb", 127, 127, 127]) as string).getHexString(),
                new THREE.Color("rgb(127, 127, 127)").getHexString()
            );

            assert.throw(() => evaluate(["rgb", -20, 40, 50]), "unknown color 'rgb(-20,40,50)'");
            assert.throw(() => evaluate(["rgb", "a", 40, 50]), "unknown color 'rgb(a,40,50)'");
        });
    });

    describe("Operator 'rgba'", function() {
        it("call", function() {
            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 0, 0, 0, 1.0]) as string).getHexString(),
                new THREE.Color("rgb(0, 0, 0)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 255, 0, 0, 1]) as string).getHexString(),
                new THREE.Color("rgb(255, 0, 0)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 255, 255, 0, 1]) as string).getHexString(),
                new THREE.Color("rgb(255, 255, 0)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 255, 255, 255, 1]) as string).getHexString(),
                new THREE.Color("rgb(255, 255, 255)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 127, 127, 127, 1]) as string).getHexString(),
                new THREE.Color("rgb(127, 127, 127)").getHexString()
            );

            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 500, 500, 500, 1]) as string).getHexString(),
                new THREE.Color("rgb(500, 500, 500)").getHexString()
            );

            // Difference in alpha channel should be recognizable when color is represented
            // (stored) in internal format.
            assert.notEqual(
                evaluate(["rgba", 255, 0, 0, 0.5]) as string,
                evaluate(["rgba", 255, 0, 0, 0.6]) as string
            );

            // When alpha is 1.0, colors should be the same with and without alpha specified.
            // This is the unique property of our own hex color format and applies only to it.
            assert.strictEqual(
                evaluate(["rgba", 0, 0, 255, 1.0]) as string,
                evaluate(["rgb", 0, 0, 255]) as string
            );

            assert.strictEqual(
                evaluate(["rgba", 0, 0, 0, 1.0]) as number,
                evaluate(["rgb", 0, 0, 0]) as number
            );
            assert.strictEqual(
                evaluate(["rgba", 255, 0, 0, 1.0]) as number,
                evaluate(["rgb", 255, 0, 0]) as number
            );
            assert.strictEqual(
                evaluate(["rgba", 0, 255, 0, 1.0]) as number,
                evaluate(["rgb", 0, 255, 0]) as number
            );
            assert.strictEqual(
                evaluate(["rgba", 0, 0, 255, 1.0]) as number,
                evaluate(["rgb", 0, 0, 255]) as number
            );

            // After passing to THREE, alpha should be silently ignored.
            assert.strictEqual(
                new THREE.Color(evaluate(["rgba", 255, 255, 255, 0.5]) as string).getHexString(),
                new THREE.Color("rgb(255, 255, 255)").getHexString()
            );

            // Bad statements.
            assert.throw(
                () => evaluate(["rgba", -20, 40, 50, 1]),
                "unknown color 'rgba(-20,40,50,1)'"
            );
            assert.throw(
                () => evaluate(["rgba", 20, 40, 50, -1]),
                "unknown color 'rgba(20,40,50,-1)'"
            );
            assert.throw(
                () => evaluate(["rgba", 20, 40, 50, "a"]),
                "unknown color 'rgba(20,40,50,a)'"
            );
            assert.throw(
                () => evaluate(["rgba", 20, 40, 50, 1.1]),
                "unknown color 'rgba(20,40,50,1.1)'"
            );
            assert.throw(
                () => evaluate(["rgba", 20, 40, 50, 2]),
                "unknown color 'rgba(20,40,50,2)'"
            );
        });
    });

    describe("Operator 'alpha'", function() {
        const EPS = 0.01;
        it("call", function() {
            assert.approximately(evaluate(["alpha", ["rgba", 0, 0, 0, 0.5]]) as number, 0.5, EPS);
            assert.approximately(evaluate(["alpha", ["rgba", 0, 0, 0, 0.2]]) as number, 0.2, EPS);
            assert.approximately(evaluate(["alpha", "#ff000000"]) as number, 0, EPS);
            assert.approximately(evaluate(["alpha", "#ff0000ff"]) as number, 1, EPS);
        });
    });

    describe("getPropertyValue", function() {
        const env = new MapEnv(
            {
                $zoom: 14,
                $pixelToMeters: 2,
                time: 1
            },
            new MapEnv(defaultEnv)
        );

        it("evaluate", function() {
            assert.strictEqual(
                getPropertyValue(Expr.fromJSON(["rgb", 255, 0, ["*", ["get", "time"], 255]]), env),
                0xff00ff
            );

            assert.strictEqual(
                getPropertyValue(
                    Expr.fromJSON(["step", ["zoom"], ["get", "one"], 14, ["get", "two"]]),
                    env
                ),
                2
            );

            assert.strictEqual(
                getPropertyValue(Expr.fromJSON(["step", ["zoom"], "10px", 14, "20px"]), env),
                40
            );

            assert.strictEqual(
                getPropertyValue(Expr.fromJSON(["step", ["zoom"], "10px", 15, "20px"]), env),
                20
            );

            assert.strictEqual(
                getPropertyValue(
                    Expr.fromJSON([
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        0,
                        0,
                        20,
                        ["*", ["get", "two"], 10]
                    ]),
                    env
                ),
                14
            );

            assert.strictEqual(
                getPropertyValue(
                    Expr.fromJSON(["interpolate", ["linear"], ["zoom"], 1, "1px", 20, "20px"]),
                    env
                ),
                28
            );
        });
    });

    describe("Interpolations with duplicate keys", function() {
        // prettier-ignore
        const interp =  Expr.fromJSON(["interpolate", ["linear"], ["zoom"],
            0, 0,
            4, 0,
            4, 4,
            5, 5,
            6, 6
        ]);

        for (let zoom = 0; zoom < 7; zoom += 0.5) {
            const value = getPropertyValue(interp, envForZoom(zoom));
            if (zoom < 4) {
                assert.strictEqual(value, 0);
            } else {
                assert.isAtLeast(value, 4);
            }
        }
    });

    describe("Instantiations", function() {
        const instantiationEnv = new MapEnv({
            y: 123
        });

        function instantiate(
            expr: JsonExpr,
            env: Env = instantiationEnv,
            preserve = new Set<string>(["z"])
        ) {
            return Expr.fromJSON(expr)
                .instantiate({ env, preserve })
                .toJSON();
        }

        it("basic", function() {
            assert.deepStrictEqual(instantiate(["get", "x"]), null);
            assert.deepStrictEqual(instantiate(["has", "x"]), false);

            assert.deepStrictEqual(instantiate(["get", "y"]), 123);
            assert.deepStrictEqual(instantiate(["has", "y"]), true);

            assert.deepStrictEqual(instantiate(["get", "z"]), ["get", "z"]);
            assert.deepStrictEqual(instantiate(["has", "z"]), ["has", "z"]);

            assert.deepStrictEqual(instantiate(["+", ["get", "y"], 1]), ["+", 123, 1]);

            assert.deepStrictEqual(instantiate(["+", ["get", "z"], 1]), ["+", ["get", "z"], 1]);
        });

        it("zoom", function() {
            assert.deepStrictEqual(instantiate(["step", ["zoom"], ["get", "y"], 5, 10]), [
                "step",
                ["zoom"],
                123,
                5,
                10
            ]);

            assert.deepStrictEqual(
                instantiate(["interpolate", ["linear"], ["zoom"], 0, ["get", "y"], 5, 10]),
                ["interpolate", ["linear"], ["zoom"], 0, 123, 5, 10]
            );
        });

        it("nested", function() {
            assert.deepStrictEqual(
                instantiate(["case", ["has", "y"], ["+", ["get", "y"], 1], 321]),
                ["+", 123, 1]
            );

            assert.deepStrictEqual(
                instantiate(["case", ["has", "y"], ["+", ["get", "y"], 1], ["get", "y"]]),
                ["+", 123, 1]
            );

            assert.deepStrictEqual(
                instantiate(["case", ["has", "x"], ["+", ["get", "y"], 1], ["get", "y"]]),
                123
            );

            assert.deepStrictEqual(
                instantiate(["case", ["zoom"], ["+", ["get", "y"], 1], ["get", "y"]]),
                ["case", ["zoom"], ["+", 123, 1], 123]
            );

            assert.deepStrictEqual(
                instantiate([
                    "match",
                    ["get", "two"],
                    [0, 1],
                    ["get", "x"],
                    2,
                    ["get", "y"],
                    ["get", "y"]
                ]),
                123
            );

            assert.deepStrictEqual(
                instantiate([
                    "match",
                    ["get", "y"],
                    123,
                    ["step", ["zoom"], ["get", "y"], 1, ["get", "z"]],
                    ["step", ["zoom"], 0, 2, 2]
                ]),
                ["step", ["zoom"], 123, 1, ["get", "z"]]
            );

            assert.deepStrictEqual(
                instantiate([
                    "match",
                    ["get", "x"],
                    123,
                    ["step", ["zoom"], 0, 1, ["get", "z"]],
                    ["step", ["zoom"], 0, 2, ["get", "y"]]
                ]),
                ["step", ["zoom"], 0, 2, 123]
            );

            // assert.deepStrictEqual(
            //     instantiate(["in", ["get", "two"], ["literal", ["aa", "bb"]]]),
            //     false
            // );

            // assert.deepStrictEqual(
            //     instantiate(["in", ["get", "y"], ["literal", [123, 321]]]),
            //     true
            // );

            assert.deepStrictEqual(instantiate(["get", "x", ["dynamic-properties"]]), [
                "get",
                "x",
                ["dynamic-properties"]
            ]);
        });
    });

    describe("Expression Dynamic State", function() {
        function isDynamic(expr: JsonArray) {
            return Expr.fromJSON(expr).isDynamic();
        }

        it("expressions", function() {
            assert.isTrue(
                isDynamic([
                    "match",
                    ["get", "x"],
                    123,
                    ["step", ["zoom"], 0, 1, ["get", "z"]],
                    ["step", ["zoom"], 0, 2, ["get", "y"]]
                ])
            );

            assert.isTrue(isDynamic(["step", ["zoom"], 0, 1, ["get", "z"]]));
            assert.isTrue(isDynamic(["interpolate", ["linear"], ["zoom"], 0, 0, 1, 1, 2, 2]));

            assert.isFalse(isDynamic(["step", ["get", "y"], 0, 1, ["get", "z"]]));

            assert.isFalse(isDynamic(["case", ["has", "something"], 123, 321]));

            assert.isTrue(
                isDynamic([
                    "case",
                    ["has", "something"],
                    123,
                    ["step", ["zoom"], 0, 1, ["get", "z"]]
                ])
            );

            assert.isFalse(isDynamic(["match", ["get", "one"], 1, true, false]));

            assert.isTrue(
                isDynamic([
                    "match",
                    ["get", "one"],
                    1,
                    ["step", ["zoom"], 0, 1, ["get", "z"]],
                    false
                ])
            );

            assert.isTrue(isDynamic(["match", ["step", ["zoom"], 0, 1, ["get", "z"]], 1, 2, 3]));

            assert.isFalse(isDynamic(["in", ["get", "two"], ["aa", "bb"]]));

            assert.isTrue(isDynamic(["in", ["zoom"], ["literal", [1, 2]]]));
        });
    });
});
