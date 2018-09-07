/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { assert } from "chai";

import { getOptionValue, mergeWithOptions } from "../lib/OptionsUtils";

describe("OptionsUtils", () => {
    describe("#getOptionValue", () => {
        it("returns first defined", () => {
            assert.equal(getOptionValue(), undefined);
            assert.equal(getOptionValue(undefined), undefined);
            assert.equal(getOptionValue(1), 1);
            assert.equal(getOptionValue(undefined, 2, 3), 2);
            assert.equal(getOptionValue(undefined, 2), 2);
        });
        it("erases 'undefined' from type if last param is defined", () => {
            const r1: number = getOptionValue(undefined, 2);
            assert.equal(r1, 2);
            const r2: number = getOptionValue(undefined, undefined, 3);
            assert.equal(r2, 3);
            const r3: number = getOptionValue(undefined, undefined, undefined, 4);
            assert.equal(r3, 4);
        });
    });

    describe("#mergeWithOptions", () => {
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

        it("copy defaults if no options were passed", () => {
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS), FOO_DEFAULTS);
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, {}), FOO_DEFAULTS);
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, undefined), FOO_DEFAULTS);
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, null!), FOO_DEFAULTS);
        });
        it("doesn't return defaults", () => {
            assert(mergeWithOptions(FOO_DEFAULTS) !== FOO_DEFAULTS);
        });
        it("doesn't copy options not existing in template", () => {
            // tslint:disable-next-line:no-object-literal-type-assertion
            const options: FooOptions = { someOtherOption: "a" } as FooOptions;
            assert.deepEqual(mergeWithOptions(FOO_DEFAULTS, options), FOO_DEFAULTS);
        });
        it("copies basic options, ignores undefineds", () => {
            assert.deepEqual(
                mergeWithOptions(FOO_DEFAULTS, { opacity: 0.5, someString: undefined }),
                {
                    useTextures: true,
                    opacity: 0.5,
                    someString: "foo"
                }
            );
        });
        it("treats false, empty string and 0 as defined", () => {
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
        it("doesn't copy undefineds when set, (as Object.assign does)", () => {
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

        it.skip("rationale: Object.assign and spread operator copy undefineds and nulls", () => {
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
