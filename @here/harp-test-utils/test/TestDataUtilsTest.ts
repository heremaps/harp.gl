/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { loadTestResource } from "../index";

// tslint:disable:only-arrow-functions

describe("@here/harp-test-utils", function() {
    describe("#loadTestResource", function() {
        it(`loads static text file`, async function() {
            const textFromFile = await loadTestResource(
                "harp-test-utils",
                "./test/resources/test.txt",
                "text"
            );

            assert(textFromFile);
            assert.equal(textFromFile, "Test message\n");
        });
        it(`loads static json file`, async function() {
            const jsonFromFile = await loadTestResource(
                "harp-test-utils",
                "./test/resources/test.json",
                "json"
            );

            assert(jsonFromFile);
            assert.equal(jsonFromFile.message, "Test message");
        });
        it(`loads static binary file`, async function() {
            const bufferResult = await loadTestResource(
                "harp-test-utils",
                "./test/resources/test.bin",
                "arraybuffer"
            );

            assert(bufferResult);
            assert.equal(bufferResult.byteLength, 4);
            const resultBytes = new Uint8Array(bufferResult);
            assert.equal(resultBytes[0], 1);
            assert.equal(resultBytes[1], 2);
            assert.equal(resultBytes[2], 3);
            assert.equal(resultBytes[3], 4);
        });
    });
});
