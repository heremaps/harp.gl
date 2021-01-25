/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as glob from "glob";
import * as path from "path";

import { checkLicenses } from "../scripts/checkLicenses";

const APACHE_LICENSE = /\/\*\n \* Copyright \(C\) (\d{4})(?:-(\d{4}))? HERE Europe B\.V\.\n \* Licensed under Apache 2\.0\, see full license in LICENSE\n \* SPDX\-License\-Identifier\: Apache\-2\.0\n \*\//;
// To fix wrong year(s) of the copyright notice on a local machine automatically:
const AUTO_FIX = process.argv.slice(2).includes("--fix");

describe("LicenseHeaderCheck", function () {
    it("Contains correct license header", function (done) {
        // In some cases (coverage run on CI) --no-timeouts flag is not passed,
        // so we have to set it here specifically.
        this.timeout(180000); // 3 mins
        const sourceFiles = glob
            .sync(path.join(__dirname, "..", "**/*.ts"))
            .filter(file => !file.includes("/node_modules/"))
            .filter(file => !file.includes("/dist/"))
            .filter(file => !file.endsWith(".d.ts"))
            .sort();

        checkLicenses(
            sourceFiles,
            APACHE_LICENSE,
            errors => {
                assert.deepEqual(errors, []);
                done();
            },
            AUTO_FIX
        );
    });
});
