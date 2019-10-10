/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Expr, ExprScope, MapEnv, ValueMap } from "../lib/Expr";
import { getPropertyValue, isInterpolatedProperty } from "../lib/InterpolatedProperty";
import { InterpolatedProperty, InterpolationMode } from "../lib/InterpolatedPropertyDefs";

const EPSILON = 1e-8;

describe("ExprEvaluator", function() {
    const defaultEnv = {
        on: true,
        off: false,
        someText: "some text",
        emptyText: "",
        zero: 0,
        one: 1,
        two: 2
    };

    function evaluate(
        expr: unknown,
        values: ValueMap = defaultEnv,
        scope: ExprScope = ExprScope.Value
    ) {
        const env = new MapEnv(values);
        return Expr.fromJSON(expr).evaluate(env, scope);
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

            assert.throw(() => evaluate(["in", ["get", "someText"]]));
        });
    });

    describe("Operator '!in'", function() {
        it("evaluate", function() {
            assert.isFalse(evaluate(["!in", "x", ["x"]]));
            assert.isTrue(evaluate(["!in", "x", ["y"]]));

            assert.isFalse(evaluate(["!in", ["get", "someText"], [defaultEnv.someText]]));
            assert.isFalse(evaluate(["!in", ["get", "emptyText"], [defaultEnv.emptyText]]));

            assert.throw(() => evaluate(["!in", ["get", "someText"]]));
        });
    });

    describe("Operator '!'", function() {
        it("evaluate", function() {
            assert.isTrue(evaluate(["!", false]));
            assert.isFalse(evaluate(["!", ["!", false]]));
            assert.isTrue(evaluate(["!", ["!", ["!", false]]]));

            assert.isTrue(evaluate(["!", ["has", "xx"]]));

            assert.isFalse(evaluate(["!", ["in", ["get", "emptyText"], [defaultEnv.emptyText]]]));

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
            assert.isTrue(
                isInterpolatedProperty(
                    evaluate(["interpolate", ["linear"], ["zoom"], 0, 0, 1, 1, 2, 2])
                )
            );

            assert.isTrue(
                isInterpolatedProperty(
                    evaluate(["interpolate", ["discrete"], ["zoom"], 0, 0, 1, 1, 2, 2])
                )
            );

            assert.isTrue(
                isInterpolatedProperty(
                    evaluate(["interpolate", ["exponential", 2], ["zoom"], 0, 0, 1, 1, 2, 2])
                )
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

        it("dynamic interpolation (without step 0)", function() {
            const interpolation: InterpolatedProperty<string> = evaluate([
                "step",
                ["zoom"],
                "#ff0000",
                13,
                "#000000"
            ]) as any;
            assert.isTrue(isInterpolatedProperty(interpolation));
            assert.strictEqual(interpolation.interpolationMode, InterpolationMode.Discrete);
            for (let i = 0; i < 13; ++i) {
                assert.strictEqual(getPropertyValue(interpolation, i), 0xff0000);
            }
            for (let i = 13; i < 20; ++i) {
                assert.strictEqual(getPropertyValue(interpolation, i), 0x000000);
            }
        });

        it("dynamic interpolation (with step 0)", function() {
            const interpolation: InterpolatedProperty<string> = evaluate([
                "step",
                ["zoom"],
                "#ff0000",
                0,
                "#00ff00",
                13,
                "#000000"
            ]) as any;
            assert.isTrue(isInterpolatedProperty(interpolation));
            assert.strictEqual(interpolation.interpolationMode, InterpolationMode.Discrete);

            assert.strictEqual(getPropertyValue(interpolation, -1), 0xff0000);

            for (let i = 0; i < 13; ++i) {
                assert.strictEqual(getPropertyValue(interpolation, i), 0x00ff00);
            }
            for (let i = 13; i < 20; ++i) {
                assert.strictEqual(getPropertyValue(interpolation, i), 0x000000);
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
                evaluate(["step", ["get", "x"], "default value", 0, "value"], {
                    x: null
                }),
                "default value"
            );
        });
    });
});
