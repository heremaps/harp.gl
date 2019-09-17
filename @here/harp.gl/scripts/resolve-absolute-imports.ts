/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolve references in `.d.ts` files generated to `dist/types`.
 *
 * Types are generated to
 *   `root/harp-foobar/.../Module.d.ts`
 *
 * and in `d.ts` files are referenced as relative, CommonJS like paths:
 *
 *    `@here/harp-foobar/...`
 *
 * This script resolves actual path of "@here/harp*" imports, so they can
 * be packaged with `harp.js`.
 *
 * Usage:
 *    ts-node ./scripts/resolve-absolute-imports.ts dist/types
 */
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";

interface RemapConfig {
    rootDir: string;
}

function replaceWithMatch(
    regexp: RegExp,
    input: string,
    replacer: (match: RegExpExecArray) => string
) {
    let somethingReplaced = false;
    let prevIndex = 0;
    let result = "";
    const regexpCopy = new RegExp(regexp);
    while (true) {
        const match = regexpCopy.exec(input);
        if (!match) {
            break;
        }
        somethingReplaced = true;
        result += input.substr(prevIndex, match.index - prevIndex);
        const replaced = replacer(match);
        result += replaced;
        prevIndex = regexpCopy.lastIndex;
    }
    if (!somethingReplaced) {
        return input;
    }
    if (prevIndex !== input.length) {
        result += input.substr(prevIndex);
    }
    return result;
}

function remapImportsSource(source: string, sourceDir: string, remapingConfig: RemapConfig) {
    const importRE = new RegExp(/(import|export)\s*({[\s\S]*?}|\*)\s*from\s+["'](.*)["']/, "g");
    return replaceWithMatch(importRE, source, match => {
        const statement = match[1];
        const importSymbols = match[2];
        const importModuleOriginal = match[3];
        let importModule = importModuleOriginal;

        if (importModule.startsWith("@here/harp-")) {
            const relativeToRoot = importModule.substr(6);
            importModule = path.relative(
                sourceDir,
                path.join(remapingConfig.rootDir, relativeToRoot)
            );
        }
        return `${statement} ${importSymbols} from "${importModule}"`;
    });
}

function remapImportsFile(filePath: string, remapingConfig: RemapConfig) {
    const contents = fs.readFileSync(filePath, "utf-8");

    // tslint:disable-next-line:no-console
    console.log(`${filePath} ...`);
    const newContents = remapImportsSource(contents, path.dirname(filePath), remapingConfig);
    if (contents === newContents) {
        return;
    }
    fs.writeFileSync(filePath, newContents, "utf-8");
}

async function remapImportFiles(rootDir: string) {
    // now, iterate all typescript source files
    const sourceFiles = glob.sync(path.join(rootDir, "/**/*.ts"));

    let failed = false;

    for (const sourceFile of sourceFiles) {
        try {
            remapImportsFile(sourceFile, { rootDir });
        } catch (error) {
            // tslint:disable-next-line:no-console
            console.error(`resolve-absolute-imports: error processing ${sourceFile}: ${error}`);
            failed = false;
        }
    }
    process.exit(failed ? 1 : 0);
}

const root = process.argv.length === 3 ? process.argv[2] : "dist/types";

remapImportFiles(root).catch(error => {
    // tslint:disable-next-line:no-console
    console.error(`resolve-absolute-imports: unhandled exception: ${error}`, error);
    process.exit(2);
});
