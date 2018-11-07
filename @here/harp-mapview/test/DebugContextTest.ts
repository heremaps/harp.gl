/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { debugContext } from "../lib/DebugContext";

import { assert } from "chai";

describe("debug-context", function() {
    it("ok", function() {
        assert.isTrue(true);

        assert.isTrue(typeof debugContext === "object");

        const dc = debugContext;

        assert.isFalse(dc.hasOption("test"), "failed to generate option 'test'");
        dc.setValue("test", 10);

        assert.isTrue(dc.hasOption("test"));
        assert.equal(10, dc.getValue("test"), "failed to set value of option 'test'");

        dc.setValue("test", 20);

        assert.equal(20, dc.getValue("test"), "failed to set value of option 'test'");

        let newValue = 0;
        const listener = (event: any) => {
            newValue = event.value;
        };

        dc.addEventListener("test", listener);
        assert.isTrue(dc.hasEventListener("test", listener));

        dc.setValue("test", 20);
        assert.equal(20, newValue, "failed to add/call listener on setOption of option 'test'");

        dc.setValue("test", 25);
        assert.equal(25, newValue, "failed to add/call listener on setOption of option 'test'");
        assert.equal(25, dc.getValue("test"), "failed to set value of option 'test'");

        dc.removeEventListener("test", listener);
        dc.setValue("test", 30);
        assert.equal(25, newValue, "failed to remove listener of option 'test'");
    });
});
