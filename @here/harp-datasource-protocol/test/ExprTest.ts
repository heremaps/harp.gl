/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Env, Expr, MapEnv, Value, ValueMap } from "../lib/Expr";

function evaluate(expr: string, env?: Env | ValueMap): Value {
    if (typeof env === "object" && !(env instanceof Env)) {
        env = new MapEnv(env);
    }
    return Expr.parse(expr).evaluate(env || new Env());
}

describe("Expr", function() {
    describe("language features", function() {
        it("supports length function", function() {
            assert.equal(evaluate("length('foo')"), 3);
            assert.equal(evaluate("length('')"), 0);

            const env = { str: "bar", n: 3 };
            assert.equal(evaluate("length(str)", env), 3);
            assert.throw(() => evaluate("length(n)", env));
            assert.throw(() => evaluate("length(1 == 1)"));

            assert.throws(() => evaluate("length()"), "Syntax error");
        });
        it("supports has function", function() {
            assert.equal(evaluate("has(foo)"), false);

            const env = { str: "bar", n: 3 };
            assert.equal(evaluate("has(str)", env), true);
            assert.equal(evaluate("has(n)", env), true);
            assert.equal(evaluate("has(foo)", env), false);
        });
    });
});

describe("MapEnv", function() {
    let env: MapEnv;
    before(function() {
        env = new MapEnv(
            {
                foo: "foo",
                bar: undefined
            },
            new MapEnv({
                parentProperty: 123,
                bar: "bar"
            })
        );
    });
    it("provides entries", function() {
        assert.strictEqual(env.lookup("foo"), "foo");
        assert.isUndefined(env.lookup("baz"));
    });
    it("asks parent for undefined properties", function() {
        assert.strictEqual(env.lookup("parentProperty"), 123);
        assert.strictEqual(env.lookup("bar"), "bar");
    });
    it("doesn't expose properties inherited from Object.prototype", function() {
        assert.isUndefined(env.lookup("hasOwnProperty"));
        assert.isUndefined(env.lookup("constructor"));
        assert.isUndefined(env.lookup("__proto__"));
    });
});
