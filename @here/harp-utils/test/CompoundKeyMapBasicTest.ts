/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { CompoundKeyMapBasic } from "../lib/CompoundKeyMapBasic";

describe("CompoundKeyMapBasic", function() {
    it("basic properties", function() {
        const map = new CompoundKeyMapBasic<string>();
        assert.equal(map.size(), 0);
        assert.equal(map.get([1, 2, 3]), undefined);
        map.set([1, 2, 3], "foo");
        assert.equal(map.size(), 1);
        assert.equal(map.get([1, 2, 3]), "foo");
        assert.equal(map.get([1, 2]), undefined);
        map.set([2, 3], "bar");
        assert.equal(map.size(), 2);
        assert.equal(map.get([2, 3]), "bar");
        assert.equal(map.get([1, 2, 3]), "foo");
    });
    it("#delete", function() {
        const map = new CompoundKeyMapBasic<string>();
        map.set([3, 4, 6], "bar");
        map.set([1, 2, 3], "foo");
        map.set([5, 6, 7], "baz");
        assert.equal(map.size(), 3);
        assert.equal(map.get([1, 2, 3]), "foo");
        map.delete([1, 2, 3]);
        assert.equal(map.size(), 2);
        assert.equal(map.get([1, 2, 3]), undefined);
        assert.equal(map.get([3, 4, 6]), "bar");
        assert.equal(map.get([5, 6, 7]), "baz");
    });
    it("#getOrCreate", function() {
        const map = new CompoundKeyMapBasic<string>();
        assert.equal(
            map.getOrCreate([1, 2, 3], () => "foo"),
            "foo"
        );
        assert.equal(map.size(), 1);
        assert.equal(map.get([1, 2, 3]), "foo");

        // Check that we don't overwrite if stuff already exists.
        assert.equal(
            map.getOrCreate([1, 2, 3], () => "bar"),
            "foo"
        );
        assert.equal(map.size(), 1);
        assert.equal(map.get([1, 2, 3]), "foo");
    });
    it("supports empty keys", function() {
        const map = new CompoundKeyMapBasic<string>();
        map.set([1, 2, 3], "foo");
        assert.equal(map.get([1, 2, 3]), "foo");
        map.set([], "emptyKey");
        assert.equal(map.get([]), "emptyKey");
        assert.equal(map.get([1, 2, 3]), "foo");
    });
});
