import { assert } from "chai";
import "../index";

// tslint:disable:only-arrow-functions

describe("Fetch", function() {
    it("fetch", function() {
        assert.isFunction(fetch);
    });

    it("headers", function() {
        const headers = new Headers();
        headers.append("testName", "testValue");

        assert.strictEqual(headers.get("testName"), "testValue");
    });

    it("AbortController", function() {
        const abortController = new AbortController();
        const signal = abortController.signal;
        assert.isFalse(signal.aborted);
    });
});
