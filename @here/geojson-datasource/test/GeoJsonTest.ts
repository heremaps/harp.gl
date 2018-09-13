/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { assert } from "chai";
import { Flattener } from "./../lib/utils/Flattener";

describe("FlatCopier", () => {
    it("flattens JSON-like objects", () => {
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

        const result = Flattener.flatten(jsonLike);

        assert.equal(result.number, 0);
        assert.equal(result.boolean, false);
        assert.equal(result.string, "fre");
        assert.equal(result.null, null);
        assert.equal(result["nested.a"], null);
        assert.equal(result["nested.b.c"], "foo");
        assert.equal(result["nested.b.d[0]"], 34);
        assert.equal(result["array[0]"], 32);
        assert.equal(result["array[1].a"], "foo");
        assert.equal(result["array[1].b[0]"], 120);
        assert.equal(result["array[2][0]"], "bar");
    });
});
