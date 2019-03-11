/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { getOptionValue, mergeWithOptions } from "../lib/OptionsUtils";

describe("OptionsUtils", function() {
    describe("#getOptionValue", function() {
        it("returns first defined", function() {
            assert.equal(getOptionValue(), undefined);
            assert.equal(getOptionValue(undefined), undefined);
            assert.equal(getOptionValue(1), 1);
            assert.equal(getOptionValue(undefined, 2, 3), 2);
            assert.equal(getOptionValue(undefined, 2), 2);
        });
        it("erases 'undefined' from type if last param is defined", function() {
            const r1: number = getOptionValue(undefined, 2);
            assert.equal(r1, 2);
            const r2: number = getOptionValue(undefined, undefined, 3);
            assert.equal(r2, 3);
            const r3: number = getOptionValue(undefined, undefined, undefined, 4);
            assert.equal(r3, 4);
        });
    });

    describe("#mergeWithOptions", function() {
        interface FooParams {
            useTextures: boolean;
            someString: string;
            opacity: number;
        }

        type FooOptions = Partial<FooParams>;

        const FOO_DEFAULTS: FooParams = {
            useTextures: true,
            someString: "foo",
            opacity: 0.8
        };

        it("copy defaults if no options were passed", function() {
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS), FOO_DEFAULTS);
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, {}), FOO_DEFAULTS);
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, undefined), FOO_DEFAULTS);
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, null!), FOO_DEFAULTS);
        });
        it("doesn't return defaults", function() {
            assert(mergeWithOptions(FOO_DEFAULTS) !== FOO_DEFAULTS);
        });
        it("doesn't copy options not existing in template", function() {
            // tslint:disable-next-line:no-object-literal-type-assertion
            const options: FooOptions = { someOtherOption: "a" } as FooOptions;
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, options), FOO_DEFAULTS);
        });
        it("copies basic options, ignores undefined", function() {
            assert.deepEqual(
                mergeWithOptions(FOO_DEFAULTS, { opacity: 0.5, someString: undefined }),
                {
                    useTextures: true,
                    opacity: 0.5,
                    someString: "foo"
                }
            );
        });
        it("treats false, empty string and 0 as defined", function() {
            assert.deepEqual(
                mergeWithOptions(FOO_DEFAULTS, {
                    useTextures: false,
                    someString: "",
                    opacity: 0
                }),
                {
                    useTextures: false,
                    someString: "",
                    opacity: 0.0
                }
            );
        });
        it("doesn't copy undefined when set, (as Object.assign does)", function() {
            assert.deepEqual(
                mergeWithOptions(FOO_DEFAULTS, {
                    useTextures: undefined,
                    opacity: null!
                }),
                {
                    useTextures: true,
                    someString: "foo",
                    opacity: 0.8
                }
            );
        });

        it.skip("rationale: Object.assign and spread operator copy undefined & null", function() {
            const maskedNull: boolean = (null as any) as boolean;
            const maskedUndefined: boolean = (undefined as any) as boolean;

            //
            // test Object.assign
            //
            // tslint:disable-next-line:prefer-object-spread
            const objectAssignWithNull = Object.assign({}, FOO_DEFAULTS, {
                useTextures: maskedNull
            });
            assert.deepEqual(objectAssignWithNull.useTextures, null);

            // tslint:disable-next-line:prefer-object-spread
            const objectAssignWithUndefined = Object.assign({}, FOO_DEFAULTS, {
                useTextures: maskedUndefined
            });
            assert.deepEqual(objectAssignWithUndefined.useTextures, undefined);

            //
            // test spread operator
            //
            const spreadWithNull = { ...FOO_DEFAULTS, ...{ useTextures: null } };
            assert.deepEqual(spreadWithNull.useTextures, null);

            const spreadWithUndefined = { ...FOO_DEFAULTS, ...{ useTextures: maskedUndefined } };
            assert.deepEqual(spreadWithUndefined.useTextures, undefined);
        });
    });
});
