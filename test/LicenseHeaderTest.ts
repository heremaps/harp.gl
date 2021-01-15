/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";

const licenseRegEx = /\/\*\n \* Copyright \(C\) (\d\d\d\d)-?(\d\d\d\d)? HERE Europe.B\.V\.\n \* Licensed under Apache 2\.0\, see full license in LICENSE\n \* SPDX\-License\-Identifier\: Apache\-2\.0\n \*\//;

describe("LicenseHeaderCheck", function () {
    let sourceFiles: string[];

    before(function () {
        sourceFiles = glob
            .sync(path.join(__dirname, "..", "**/*.ts"))
            .filter(file => !file.includes("/node_modules/"))
            .filter(file => !file.includes("/dist/"))
            .filter(file => !file.endsWith(".d.ts"));
    });

    it("Contains license header", function () {
        const failedFiles = new Array<string>();
        for (const sourceFile of sourceFiles) {
            let contents = fs.readFileSync(sourceFile, { encoding: "utf8" });

            // support for shebang scripts
            if (contents.startsWith("#!/")) {
                const firstNewLineIndex = contents.indexOf("\n");
                if (firstNewLineIndex !== -1) {
                    contents = contents.substr(firstNewLineIndex + 1);
                }
            }

            const match = licenseRegEx.exec(contents);
            let validLicenseRange = false;
            if (match !== null && match.length === 3) {
                const currentYear = new Date().getFullYear();
                const start = parseInt(match[1], 10);
                if (match[2] !== undefined) {
                    // Year is a range
                    const end = parseInt(match[2], 10);
                    validLicenseRange =
                        !isNaN(start) &&
                        !isNaN(end) &&
                        start >= 2017 &&
                        start < end &&
                        end <= currentYear;
                } else {
                    // Year is just one value
                    validLicenseRange = !isNaN(start) && start >= 2017 && start <= currentYear;
                }
            }
            if (!validLicenseRange) {
                failedFiles.push(sourceFile);
            }
        }
        assert.deepEqual(failedFiles, [], "Some files did not contain correct license header");
    });
});
