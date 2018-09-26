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
import { defaultUrlResolver, setDefaultUrlResolver } from "../lib/UrlResolver";

describe("UrlResolver", () => {
    describe("global url resolver handling", () => {
        const fooResolver = (url: string) => {
            if (url.startsWith("foo-cdn:")) {
                return "https://cdn.foo.com/res/" + url.substr(8);
            }
            return url;
        };

        afterEach(() => {
            setDefaultUrlResolver(undefined);
        });

        it("resolves normal urls without change", () => {
            assert.equal(defaultUrlResolver("https://x.y.com"), "https://x.y.com");
        });

        it("#setDefaultUrlResolver registers and unregisters resolvers", () => {
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
