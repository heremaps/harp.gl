import { assert } from "chai";
import { Flattener } from "./../lib/utils/Flattener";

describe("FlatCopier", () => {
    it("flattens JSON-like objects", () => {
        const jsonLike = {
            number: 0,
            boolean: false,
            string: "fre",
            null: null,
            nested: {
                a: null,
                b: {
                    c: "foo",
                    d: [34]
                }
            },
            array: [
                32,
                {
                    a: "foo",
                    b: [120]
                },
                ["bar"]
            ]
        };

        const result = Flattener.flatten(jsonLike, "properties");

        assert.equal(result["properties.number"], 0);
        assert.equal(result["properties.boolean"], false);
        assert.equal(result["properties.string"], "fre");
        assert.equal(result["properties.null"], null);
        assert.equal(result["properties.nested.a"], null);
        assert.equal(result["properties.nested.b.c"], "foo");
        assert.equal(result["properties.nested.b.d[0]"], 34);
        assert.equal(result["properties.array[0]"], 32);
        assert.equal(result["properties.array[1].a"], "foo");
        assert.equal(result["properties.array[1].b[0]"], 120);
        assert.equal(result["properties.array[2][0]"], "bar");
    });
});
