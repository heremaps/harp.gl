import { assert } from "chai";
import { loadTestResource } from "../index";

describe("test-utils", () => {
    it(`#load static text file`, async () => {
        const textFromFile = await loadTestResource(
            "test-utils",
            "./test/resources/test.txt",
            "text"
        );
        //Assess
        assert(textFromFile);
        assert.equal(textFromFile, "Test message\n");
    });
    it(`#load static json file`, async () => {
        const jsonFromFile = await loadTestResource(
            "test-utils",
            "./test/resources/test.json",
            "json"
        );
        //Assess
        assert(jsonFromFile);
        assert.equal(jsonFromFile.message, "Test message");
    });
    it(`#load static binary file`, async () => {
        const bufferResult = await loadTestResource(
            "test-utils",
            "./test/resources/test.bin",
            "arraybuffer"
        );
        //Assess
        assert(bufferResult);
        assert.equal(bufferResult.byteLength, 4);
        const resultBytes = new Uint8Array(bufferResult);
        assert.equal(resultBytes[0], 1);
        assert.equal(resultBytes[1], 2);
        assert.equal(resultBytes[2], 3);
        assert.equal(resultBytes[3], 4);
    });
});
