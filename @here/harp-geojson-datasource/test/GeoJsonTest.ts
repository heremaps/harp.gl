/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Flattener } from "./../lib/utils/Flattener";

describe("FlatCopier", function() {
    it("flattens JSON-like objects", function() {
        const jsonLike = {
            number: 0,
            boolean: false,
            string: "fre",
            null: null,
            nested: {
                a: null,
                b: {
                    c: "foo",
                    d: [34]
                }
            },
            array: [
                32,
                {
                    a: "foo",
                    b: [120]
                },
                ["bar"]
            ]
        };

        const result = Flattener.flatten(jsonLike, "properties");

        assert.equal(result["properties.number"], 0);
        assert.equal(result["properties.boolean"], false);
        assert.equal(result["properties.string"], "fre");
        assert.equal(result["properties.null"], null);
        assert.equal(result["properties.nested.a"], null);
        assert.equal(result["properties.nested.b.c"], "foo");
        assert.equal(result["properties.nested.b.d[0]"], 34);
        assert.equal(result["properties.array[0]"], 32);
        assert.equal(result["properties.array[1].a"], "foo");
        assert.equal(result["properties.array[1].b[0]"], 120);
        assert.equal(result["properties.array[2][0]"], "bar");
    });
});
