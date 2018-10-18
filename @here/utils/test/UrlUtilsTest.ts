/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { baseUrl, getUrlOrigin, resolveReferenceUrl } from "../lib/UrlUtils";

describe("UrlUtils", () => {
    describe("#resolveReferenceUrl", () => {
        it("correctly resolves relative child URL", () => {
            assert.equal(
                resolveReferenceUrl("https://bar.com:999/foo", "bar.js"),
                "https://bar.com:999/bar.js"
            );
            assert.equal(
                resolveReferenceUrl("https://bar.com/foo/", "bar.js"),
                "https://bar.com/foo/bar.js"
            );
        });
        it("correctly resolves origin-absolute URLs", () => {
            assert.equal(
                resolveReferenceUrl("https://user@bar.com/foo/theme.json", "/bar.js"),
                "https://user@bar.com/bar.js"
            );
        });
        it("handles file: scheme", () => {
            assert.equal(resolveReferenceUrl("file://foo/", "bar.js"), "file://foo/bar.js");
            assert.equal(resolveReferenceUrl("file://foo/", "/bar.js"), "file:///bar.js");
        });
        it("handles relative parent URL", () => {
            assert.equal(
                resolveReferenceUrl("resources/day.json", "font.json"),
                "resources/font.json"
            );
            assert.equal(
                resolveReferenceUrl("/resources/day.json", "font.json"),
                "/resources/font.json"
            );
        });
        it("returns absolute URLs unchanged", () => {
            assert.equal(
                resolveReferenceUrl("https://spam.com", "https://bar.com/foo"),
                "https://bar.com/foo"
            );
            assert.equal(resolveReferenceUrl("https://bar.com", "//bar.com/foo"), "//bar.com/foo");
        });
    });

    describe("#baseUrl", () => {
        it("removes leafs", () => {
            assert.equal(baseUrl("https://foo.com/themes/a.json"), "https://foo.com/themes/");
            assert.equal(baseUrl("https://foo.com/themes"), "https://foo.com/");
            assert.equal(baseUrl("themes/day.json"), "themes/");
        });
        it("treats trailing / as location", () => {
            assert.equal(baseUrl("https://foo.com/themes/"), "https://foo.com/themes/");
            assert.equal(baseUrl("themes/"), "themes/");
        });
        it("standalone files are relative to current dir", () => {
            assert.equal(baseUrl("themes"), "./");
        });
    });

    describe("#getUrlOrigin", () => {
        it("extracts origin part of URL", () => {
            assert.equal(getUrlOrigin("https://example.com/foo"), "https://example.com");
            assert.equal(getUrlOrigin("//example.com/"), "//example.com");
            assert.equal(getUrlOrigin("file:///etc/hosts"), "file://");
        });
    });
});
