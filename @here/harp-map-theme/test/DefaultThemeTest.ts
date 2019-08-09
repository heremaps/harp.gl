/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { loadTestResource } from "@here/harp-test-utils";
import * as Ajv from "ajv";
import * as path from "path";

describe("Berlin Theme", function() {
    let ajv: Ajv.Ajv;
    let schemaValidator: Ajv.ValidateFunction;
    before(async () => {
        ajv = new Ajv({ unknownFormats: "ignore", logger: false });
        const theme = await loadTestResource(
            "@here/harp-datasource-protocol",
            "./theme.schema.json",
            "json"
        );
        schemaValidator = ajv.compile(theme);
    });

    const themes = [
        "resources/berlin_derived.json",
        "resources/berlin_tilezen_base.json",
        "resources/berlin_tilezen_base_globe.json",
        "resources/berlin_tilezen_day_reduced.json",
        "resources/berlin_tilezen_night_reduced.json",
        "resources/berlin_tilezen_effects_outlines.json",
        "resources/berlin_tilezen_effects_streets.json"
    ];

    themes.forEach(themePath => {
        const baseName = path.basename(themePath);

        it(`${baseName} complies with JSON schema`, async function() {
            const theme = await loadTestResource("@here/harp-map-theme", themePath, "json");
            const valid = schemaValidator(theme);
            if (!valid && schemaValidator.errors) {
                // tslint:disable-next-line:no-console
                console.log("validation errors", schemaValidator.errors.length);
                // tslint:disable-next-line:no-console
                console.log(schemaValidator.errors);
            }
            assert.isTrue(valid);
        });
    });
});
