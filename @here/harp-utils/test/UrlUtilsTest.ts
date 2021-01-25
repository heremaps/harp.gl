/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { baseUrl, getUrlOrigin, resolveReferenceUri } from "../lib/UrlUtils";

describe("UrlUtils", function () {
    describe("#resolveReferenceUrl", function () {
        it("correctly resolves relative child URL", function () {
            assert.equal(
                resolveReferenceUri("https://bar.com:999/foo", "bar.js"),
                "https://bar.com:999/bar.js"
            );
            assert.equal(
                resolveReferenceUri("https://bar.com/foo/", "bar.js"),
                "https://bar.com/foo/bar.js"
            );
        });
        it("ignores / after #", function () {
            assert.equal(
                resolveReferenceUri("https://bar.com/foo/#bar/baz", "bar.js"),
                "https://bar.com/foo/bar.js"
            );
            assert.equal(
                resolveReferenceUri("https://bar.com/#/foo/bar/baz", "bar.js"),
                "https://bar.com/bar.js"
            );
        });
        it("correctly resolves origin-absolute URLs", function () {
            assert.equal(
                resolveReferenceUri("https://user@bar.com/foo/day.json", "/bar.js"),
                "https://user@bar.com/bar.js"
            );
        });
        it("handles file: scheme", function () {
            assert.equal(resolveReferenceUri("file://foo/", "bar.js"), "file://foo/bar.js");
            assert.equal(resolveReferenceUri("file://foo/", "/bar.js"), "file:///bar.js");
        });
        it("handles data: scheme", function () {
            assert.equal(
                resolveReferenceUri("https://bar.com/foo/", "data:whatever"),
                "data:whatever"
            );
        });
        it("handles relative parent URL", function () {
            assert.equal(
                resolveReferenceUri("resources/day.json", "font.json"),
                "resources/font.json"
            );
            assert.equal(
                resolveReferenceUri("/resources/day.json", "font.json"),
                "/resources/font.json"
            );
        });
        it("returns absolute URLs unchanged", function () {
            assert.equal(
                resolveReferenceUri("https://spam.com", "https://bar.com/foo"),
                "https://bar.com/foo"
            );
            assert.equal(resolveReferenceUri("https://bar.com", "//bar.com/foo"), "//bar.com/foo");
        });
    });

    describe("#baseUrl", function () {
        it("removes leafs", function () {
            assert.equal(baseUrl("https://foo.com/themes/a.json"), "https://foo.com/themes/");
            assert.equal(baseUrl("https://foo.com/themes"), "https://foo.com/");
            assert.equal(baseUrl("themes/day.json"), "themes/");
        });
        it("support #", function () {
            assert.equal(baseUrl("https://foo.com/themes/#/foo"), "https://foo.com/themes/");
            assert.equal(baseUrl("https://foo.com/#/themes/foo"), "https://foo.com/");
            assert.equal(baseUrl("#foo"), "./");
        });
        it("treats trailing / as location", function () {
            assert.equal(baseUrl("https://foo.com/themes/"), "https://foo.com/themes/");
            assert.equal(baseUrl("themes/"), "themes/");
        });
        it("standalone files are relative to current dir", function () {
            assert.equal(baseUrl("themes"), "./");
        });
    });

    describe("#getUrlOrigin", function () {
        it("extracts origin part of URL", function () {
            assert.equal(getUrlOrigin("https://example.com/foo"), "https://example.com");
            assert.equal(getUrlOrigin("//example.com/"), "//example.com");
            assert.equal(getUrlOrigin("file:///etc/hosts"), "file://");
        });
    });
});
