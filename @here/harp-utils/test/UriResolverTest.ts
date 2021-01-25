/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";

import { PrefixMapUriResolver, RelativeUriResolver } from "../lib/UriResolver";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("UriResolver", function () {
    describe("PrefixMapUriResolver", function () {
        const resolver = new PrefixMapUriResolver({
            "fonts://fira": "ACTUAL_FONT_LOCATION.json",
            "icons://": "ACTUAL_ICONS_LOCATION/"
        });

        it("resolves exact matches", function () {
            assert.equal(resolver.resolveUri("fonts://fira"), "ACTUAL_FONT_LOCATION.json");
        });

        it("resolves prefixed matches", function () {
            assert.equal(
                resolver.resolveUri("icons://foo/maki_icons.png"),
                "ACTUAL_ICONS_LOCATION/foo/maki_icons.png"
            );
        });
    });
    describe("RelativeUriResolver", function () {
        const leafParent = new RelativeUriResolver("https://foo.bar.com/abc/foo.json");
        const dirParent = new RelativeUriResolver("https://foo.bar.com/dir/");

        it("resolves basic relative url against leaf parent", function () {
            assert.equal(leafParent.resolveUri("bar.json"), "https://foo.bar.com/abc/bar.json");
        });
        it("resolves url with .. against leaf parent", function () {
            assert.equal(
                leafParent.resolveUri("../bar.json"),
                "https://foo.bar.com/abc/../bar.json"
            );
        });
        it("resolves origin absolute url against leaf parent", function () {
            assert.equal(leafParent.resolveUri("/bar.json"), "https://foo.bar.com/bar.json");
        });
        it("resolves relative url against dir parent", function () {
            assert.equal(dirParent.resolveUri("bar.json"), "https://foo.bar.com/dir/bar.json");
        });
        it("resolves relative url with dir parent", function () {
            assert.equal(dirParent.resolveUri("bar.json"), "https://foo.bar.com/dir/bar.json");
        });
    });
});
