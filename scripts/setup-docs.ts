/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as fse from "fs-extra";
import * as glob from "glob";
import * as path from "path";

/**
 * Script to extract all code snippets from examples, render Mermaid diagrams and
 * copy harp.gl landing page files to the output documentation.
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
const distOutDir = path.resolve(sdkDir, "dist/doc");
const distDocsOutDir = path.resolve(distOutDir, "docs");

mkpath.sync(outDir);
mkpath.sync(distOutDir);
mkpath.sync(distDocsOutDir);

function extractCodeSnippets() {
    // tslint:disable-next-line:no-console
    console.log("Extracting code snippets...");

    const sourceFiles = glob.sync(sdkDir + "/@here/verity-examples/**/*.{ts,tsx,html}");

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
}

function renderDiagrams() {
    // tslint:disable-next-line:no-console
    console.log("Rendering diagrams...");

    const inputExt = ".mmd";
    const outputExt = ".svg";
    const configFile = path.resolve(sdkDir, "puppeteer-config.json");
    const mediaOutDir = path.resolve(sdkDir, "dist/media");

    const sourceFiles = glob.sync(sdkDir + `/docs/@docs/**/*${inputExt}`);

    for (const sourceFile of sourceFiles) {
        const outSubDir = path.join(mediaOutDir, path.basename(path.dirname(sourceFile)));
        mkpath.sync(outSubDir);
        const outFile = path.resolve(outSubDir, path.basename(sourceFile, inputExt)) + outputExt;
        const cmd = `yarn run mmdc -p ${configFile} -i ${sourceFile} -o ${outFile}`;
        // tslint:disable-next-line:no-console
        console.log(cmd);
        execSync(cmd);
    }
}

function copyLandingPageFiles() {
    fs.copyFileSync(path.join(sdkDir, "LICENSE"), path.join(outDir, "LICENSE"));
    fs.copyFileSync(path.join(sdkDir, "LICENSE"), path.join(distOutDir, "LICENSE"));
    fse.copySync(path.join(sdkDir, "docs"), distDocsOutDir);
}

extractCodeSnippets();
renderDiagrams();
copyLandingPageFiles();
