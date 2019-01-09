/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";

import { assert } from "chai";

// tslint:disable:only-arrow-functions

const license = `/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
`;

describe("LicenseHeaderCheck", function() {
    const sourceFiles = glob
        .sync(path.join(__dirname, "..", "**/*.ts"))
        .filter(file => !file.includes("/node_modules/"))
        .filter(file => !file.endsWith(".d.ts"));

    it("Contains license header", function() {
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

            if (!contents.startsWith(license)) {
                failedFiles.push(sourceFile);
            }
        }
        assert.deepEqual(failedFiles, [], "Some files did not contain correct license header");
    });
});
