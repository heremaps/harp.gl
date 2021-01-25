/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { cloneDeep } from "../lib/ObjectUtils";

describe("ObjectUtils", function () {
    describe("#cloneDeep", function () {
        function basicDeepEqualAssertion(o: any) {
            assert.deepEqual(cloneDeep(o), o);
        }
        function basicStrictEqualAssertion(o: any) {
            assert.deepEqual(cloneDeep(o), o);
        }

        it("basic types support", function () {
            basicStrictEqualAssertion(undefined);
            basicStrictEqualAssertion(null);
            basicStrictEqualAssertion("abc");
            basicStrictEqualAssertion("");
            basicStrictEqualAssertion(123);
            assert.isNaN(cloneDeep(NaN));
            basicStrictEqualAssertion(0);
            basicStrictEqualAssertion(false);
            basicStrictEqualAssertion(true);
        });

        it("basic arrray support", function () {
            basicDeepEqualAssertion([]);
            basicDeepEqualAssertion([1, "2"]);
            basicDeepEqualAssertion([
                [1, 2],
                [2, 3]
            ]);
            basicDeepEqualAssertion([1, "2"]);

            basicDeepEqualAssertion([null]);
            basicDeepEqualAssertion([null, null]);
            basicDeepEqualAssertion([undefined]);
            basicDeepEqualAssertion([undefined, 1, undefined]);
        });

        it("suppports object traversal", function () {
            basicDeepEqualAssertion({});
            basicDeepEqualAssertion({ a: 1, b: "2" });
            basicDeepEqualAssertion({ a: 1, b: { bb: "2" }, c: "c" });
            basicDeepEqualAssertion({ a: 1, b: "2", c: undefined, d: null });
        });

        it("really clones objects", function () {
            const a = { s: "s" };
            const clonedA = cloneDeep(a);
            assert.deepEqual(clonedA, a);
            assert.notStrictEqual(a, clonedA);
            clonedA.s = "changed";
            assert.deepEqual(a, { s: "s" });
        });
        it("really clones arrays", function () {
            const a = [1, 2, 3];
            const clonedA = cloneDeep(a);
            assert.deepEqual(clonedA, a);
            assert.notStrictEqual(a, clonedA);
            clonedA[0] = 1111;
            assert.deepEqual(a, [1, 2, 3]);
        });
        it("support cycles #1", function () {
            const a: { a?: any } = {};
            a.a = a;
            basicDeepEqualAssertion(a);
        });
        it("support cycles #2", function () {
            const a: { b?: any } = {};
            const b = { a };
            a.b = b;
            basicDeepEqualAssertion(a);
        });
        it("support weird tree with loops", function () {
            const p = { p: "i am parent" };
            const a: { b?: any; p: any } = { p };
            const b: { a?: any; p: any } = { p };
            a.b = b;
            b.a = a;
            basicDeepEqualAssertion([a, { b: a }, [a, a, a, a, b, b, b]]);
        });
        it("doesn't clone functions", function () {
            function foo() {
                /** */
            }
            basicStrictEqualAssertion(foo);
            basicStrictEqualAssertion(() => foo());
        });
        it("realiably fails objects with prototypes", function () {
            class Foo {
                foo = "foo";
                bar() {
                    return this.foo;
                }
            }
            assert.throws(() => {
                cloneDeep({ a: new Foo() });
            }, "cloneDeep doesn't support objects with custom prototypes");
        });
    });
});
