/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { LoggerManager } from "@here/harp-utils";
import { assert } from "chai";

declare const require: any;

const logger = LoggerManager.instance.create("ThemeTypingsTest");

const isNode = typeof window === "undefined";
const describeOnlyNode = isNode ? describe : xdescribe;

function validate(type: string, response: any, validationExpectedToFail: boolean = false) {
    try {
        const ts = require("typestring");
        const repl = ts.compile(
            `import { ${type} } from "./lib/Theme";\n` +
                `const reply: ${type} = ` +
                JSON.stringify(response) +
                ";", // {String} input - TypeScript to compile
            {}, // {Object} [refs] - map of referenced filenames to content
            {}, // {Object} [opts] - Options to TypeScript compiler
            false // {Boolean} [semantic] - if true, throw semantic errors
        );
        assert.isDefined(repl);
    } catch (err) {
        logger.log(err);
        if (!validationExpectedToFail) {
            assert.fail();
        }
    }
}

describeOnlyNode("Theme typings test", function() {
    this.timeout(30000);

    it("syntax test for properly defined Theme object", function() {
        this.timeout(30000);

        const ProperTheme = {
            styles: {
                "vector-tile": [
                    {
                        when: "kind_detail == 'pier' || landuse_kind == 'pier'",
                        technique: "solid-line",
                        final: true,
                        attr: {
                            color: "#fafdfe",
                            lineWidth: [
                                { maxLevel: 13, value: 1.5 },
                                { maxLevel: 14, value: 1.2 },
                                { value: 0.9 }
                            ]
                        }
                    }
                ]
            }
        };

        validate("Theme", ProperTheme);
    });

    it("syntax test for improperly defined Theme object (excessive properties)", function() {
        this.timeout(30000);

        const ImproperTheme = {
            styles: {
                "vector-tile": [
                    {
                        NOT_when: "bar",
                        NOT_technique: "foo",
                        attr: {
                            NOT_lineWidth: [{ maxLevel: 9, value: 160 }, { value: 4 }]
                        }
                    }
                ]
            }
        };

        validate("Theme", ImproperTheme, true);
    });
});
