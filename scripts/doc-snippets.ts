/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";

/*
Simple script that extracts all code snippets from examples
*/

// counts the leading spaces in a string
function countLeadingSpaces(line: string): number {
    let result = 0;
    for (const char of line) {
        if (char !== " ") {
            return result;
        }
        ++result;
    }
    return result;
}

// remove empty lines from top and bottom of snippet
function chop(lines: string[]) {
    while (lines[0] === "") {
        lines.shift();
    }
    while (lines[-1] === "") {
        lines.pop();
    }
}

function reindented(spaces: number, lines: string[]): string[] {
    if (spaces === 0) {
        return lines;
    }

    const prefix = " ".repeat(spaces);
    return lines.map(line => (line.startsWith(prefix) ? line.substring(spaces) : line));
}

// tslint:disable-next-line:no-var-requires
const mkpath = require("mkpath");

const sdkDir = path.resolve(__dirname, "..");
const outDir = path.resolve(sdkDir, "dist/doc-snippets");
mkpath.sync(outDir);

const sourceFiles = glob.sync(sdkDir + "/@here/harp-examples/**/*.{ts,tsx,html}");

const snippetRegex = /snippet:(\S+).*$([\s\S]*)^.*end:\1/gm;

for (const sourceFile of sourceFiles) {
    const contents = fs.readFileSync(sourceFile, { encoding: "utf8" });

    let match;
    // tslint:disable-next-line:no-conditional-assignment
    while ((match = snippetRegex.exec(contents)) !== null) {
        const fileName = match[1];
        const snippet = match[2];

        const lines = snippet.split("\n");
        chop(lines);

        if (lines.length === 0) {
            // tslint:disable-next-line:no-console
            console.error("ERROR: snippet", snippet, "in", fileName, "too short");
            continue;
        }

        // reindent the snippet
        const leadingSpaces = countLeadingSpaces(lines[0]);
        const result = reindented(leadingSpaces, lines).join("\n");

        fs.writeFileSync(path.resolve(outDir, fileName), result, { encoding: "utf8" });
        // tslint:disable-next-line:no-console
        console.log("generated", fileName, path.resolve(outDir, fileName));
    }
}

fs.copyFileSync(path.join(sdkDir, "LICENSE"), path.join(outDir, "LICENSE"));
