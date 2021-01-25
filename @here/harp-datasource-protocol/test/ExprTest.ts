/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { CallExpr, Env, Expr, JsonExpr, MapEnv, Value, ValueMap } from "../lib/Expr";
import { Definitions } from "../lib/Theme";

function evaluate(expr: string | JsonExpr | Expr, env?: Env | ValueMap): Value {
    if (typeof env === "object" && !(env instanceof Env)) {
        env = new MapEnv(env);
    }
    return (Expr.isExpr(expr)
        ? expr
        : typeof expr === "string"
        ? Expr.parse(expr)
        : Expr.fromJSON(expr)
    ).evaluate(env ?? new Env());
}

describe("Expr", function () {
    describe("language features", function () {
        it("supports length function", function () {
            assert.equal(evaluate("length('foo')"), 3);
            assert.equal(evaluate("length('')"), 0);

            const env = { str: "bar", n: 3 };
            assert.equal(evaluate("length(str)", env), 3);
            assert.throw(() => evaluate("length(n)", env));
            assert.throw(() => evaluate("length(1 == 1)"));

            assert.throws(() => evaluate("length()"), "Syntax error");
        });
        it("supports has function", function () {
            assert.equal(evaluate("has(foo)"), false);

            const env = { str: "bar", n: 3 };
            assert.equal(evaluate("has(str)", env), true);
            assert.equal(evaluate("has(n)", env), true);
            assert.equal(evaluate("has(foo)", env), false);
        });

        it("supports of literals in the 'in' operator", function () {
            assert.equal(evaluate("2 in [1,2,3]"), true);
            assert.equal(evaluate("'x' in ['y','x','z']"), true);
            assert.throw(() => evaluate("1 in [1,2,(3)]"));
            assert.throw(() => evaluate("1 in [1,'x',(3)]"));
        });
    });

    describe("#fromJson", function () {
        describe("ref operator support", function () {
            const baseDefinitions: Definitions = {
                color: { value: "#ff0" },
                string: { value: "abc" },
                number: { type: "number", value: 123 },
                number2: { value: 234 },
                boolean: { value: true }
            };
            it("supports literal references", function () {
                assert.equal(evaluate(Expr.fromJSON(["ref", "color"], baseDefinitions)), "#ff0");
                assert.equal(evaluate(Expr.fromJSON(["ref", "string"], baseDefinitions)), "abc");
                assert.equal(evaluate(Expr.fromJSON(["ref", "number"], baseDefinitions)), 123);
                assert.equal(evaluate(Expr.fromJSON(["ref", "number2"], baseDefinitions)), 234);
                assert.equal(evaluate(Expr.fromJSON(["ref", "boolean"], baseDefinitions)), true);
            });
            it("throws on missing definitions", function () {
                assert.throws(() => {
                    Expr.fromJSON(["ref", "badRef"], baseDefinitions);
                }, /definition 'badRef' not found/);
            });
            it("supports basic expression references", function () {
                const definitions: Definitions = {
                    literalExpr: { value: ["+", 2, 3] },
                    boxedTypedExpr: { type: "selector", value: ["+", 3, 4] },
                    boxedUntypedExpr: { value: ["+", 4, 5] }
                };
                assert.equal(evaluate(Expr.fromJSON(["ref", "literalExpr"], definitions)), 5);
                assert.equal(evaluate(Expr.fromJSON(["ref", "boxedTypedExpr"], definitions)), 7);
                assert.equal(evaluate(Expr.fromJSON(["ref", "boxedUntypedExpr"], definitions)), 9);
            });
            it("supports embedded basic embedded references", function () {
                const definitions: Definitions = {
                    ...baseDefinitions,
                    refConstantExpr: { type: "selector", value: ["+", 2, ["ref", "number"]] }
                };
                assert.equal(evaluate(Expr.fromJSON(["ref", "refConstantExpr"], definitions)), 125);
            });
            it("supports complex embedded references", function () {
                const definitions: Definitions = {
                    number: { value: 1 },
                    refConstantExpr: { value: ["+", 1, ["ref", "number"]] },
                    refExpr1: {
                        value: ["+", ["ref", "number"], ["ref", "number"], ["ref", "refExpr2"]]
                    },
                    refExpr2: {
                        value: ["*", ["ref", "refConstantExpr"], ["ref", "refConstantExpr"]]
                    },
                    refTopExpr: {
                        // 6 - 4 -> 2, old syntax
                        type: "selector",
                        value: ["-", ["ref", "refExpr1"], ["ref", "refExpr2"]]
                    }
                };
                assert.equal(evaluate(Expr.fromJSON(["ref", "refExpr1"], definitions)), 6);
                assert.equal(evaluate(Expr.fromJSON(["ref", "refExpr2"], definitions)), 4);
                assert.equal(evaluate(Expr.fromJSON(["ref", "refTopExpr"], definitions)), 2);
            });
            it("rejects circular references", function () {
                const definitions: Definitions = {
                    refSelfReference: {
                        // 2
                        type: "selector",
                        value: ["+", 33, ["ref", "refSelfReference"]]
                    },
                    refExprFoo: {
                        // 1
                        type: "selector",
                        value: ["*", 44, ["ref", "refTopBar"]]
                    },
                    refTopBar: {
                        type: "selector",
                        value: ["-", 55, ["ref", "refExprFoo"]]
                    }
                };
                assert.throws(() => {
                    Expr.fromJSON(["ref", "refSelfReference"], definitions);
                }, /circular/);
                assert.throws(() => {
                    Expr.fromJSON(["ref", "refTopBar"], definitions);
                }, /circular referene to 'refTopBar'/);
            });
            it("reuses Expr instances created from same definition", function () {
                const definitions: Definitions = {
                    foo: {
                        type: "selector",
                        value: ["+", 4, 4]
                    },
                    topExpr: {
                        type: "selector",
                        value: ["+", ["ref", "foo"], ["ref", "foo"]]
                    }
                };
                const expr = Expr.fromJSON(["ref", "topExpr"], definitions);
                assert.instanceOf(expr, CallExpr);
                const callExpr = expr as CallExpr;
                assert.equal(callExpr.args.length, 2);

                // Assert that both children of both exprs refer to exactly same expr instance.
                assert.strictEqual(callExpr.args[0], callExpr.args[1]);
            });
            it("uses definitionExprCache across calls", function () {
                const definitions: Definitions = {
                    foo: {
                        type: "selector",
                        value: ["+", 4, 4]
                    }
                };
                const exprCache = new Map<string, Expr>();
                const expr1 = Expr.fromJSON(["ref", "foo"], definitions, exprCache);
                const expr2 = Expr.fromJSON(["ref", "foo"], definitions, exprCache);

                // Assert results of `fromJSON` refer to exactly same expr instance.
                assert.strictEqual(expr1, expr2);
            });
        });
    });
});

describe("MapEnv", function () {
    let env: MapEnv;
    before(function () {
        env = new MapEnv(
            {
                foo: "foo"
            },
            new MapEnv({
                parentProperty: 123,
                bar: "bar"
            })
        );
    });
    it("provides entries", function () {
        assert.strictEqual(env.lookup("foo"), "foo");
        assert.isUndefined(env.lookup("baz"));
    });
    it("asks parent for undefined properties", function () {
        assert.strictEqual(env.lookup("parentProperty"), 123);
        assert.strictEqual(env.lookup("bar"), "bar");
    });
    it("doesn't expose properties inherited from Object.prototype", function () {
        assert.isUndefined(env.lookup("hasOwnProperty"));
        assert.isUndefined(env.lookup("constructor"));
        assert.isUndefined(env.lookup("__proto__"));
    });
});
