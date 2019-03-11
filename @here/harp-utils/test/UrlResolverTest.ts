/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { defaultUrlResolver, setDefaultUrlResolver } from "../lib/UrlResolver";

describe("UrlResolver", function() {
    describe("global url resolver handling", function() {
        const fooResolver = (url: string) => {
            if (url.startsWith("foo-cdn:")) {
                return "https://cdn.foo.com/res/" + url.substr(8);
            }
            return url;
        };

        afterEach(function() {
            setDefaultUrlResolver(undefined);
        });

        it("resolves normal urls without change", function() {
            assert.equal(defaultUrlResolver("https://x.y.com"), "https://x.y.com");
        });

        it("#setDefaultUrlResolver registers and unregisters resolvers", function() {
            setDefaultUrlResolver(fooResolver);
            assert.equal(
                defaultUrlResolver("foo-cdn:fonts/font.json"),
                "https://cdn.foo.com/res/fonts/font.json"
            );
            setDefaultUrlResolver(undefined);
            assert.equal(defaultUrlResolver("foo-cdn:fonts/font.json"), "foo-cdn:fonts/font.json");
        });
    });
});
