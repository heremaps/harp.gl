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
