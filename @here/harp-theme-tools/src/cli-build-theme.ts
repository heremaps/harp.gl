#!/usr/bin/env node
/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { FlatTheme } from "@here/harp-datasource-protocol";
import { ThemeLoader } from "@here/harp-mapview";
import * as program from "commander";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";

const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
    .version;

const _defaultInputPath: string = process.cwd();
const _defaultOutputPath: string = process.cwd() + "/resources";
const _defaultMinify: boolean = false;

program
    .version(version)
    .description("CLI tool for building theme files.")
    .usage("[options]")
    .requiredOption("-i, --in [file]", "Input file(s). Can contain wildcards as well.")
    .option("-C, --chdir [path]", "Change dir to resolve relative paths.", _defaultInputPath)
    .option("-o, --out [path]", "Output dir", _defaultOutputPath)
    .option("-m, --minify", "Minify JSON", _defaultMinify)
    .parse(process.argv);

const cliOptions = program.opts();

if (typeof cliOptions.in !== "string" || cliOptions.in.length === 0) {
    console.error("No input files specified");
    program.outputHelp();
    process.exit(1);
}

process.chdir(cliOptions.chdir);

const inFileNames = glob.sync(cliOptions.in);

if (inFileNames.length === 0) {
    console.error("No input files found");
    program.outputHelp();
    process.exit(1);
}

inFileNames.forEach(inFileName => {
    ThemeLoader.load(inFileName, {
        resolveResourceUris: false,
        resolveIncludeUris: true
    }).then(theme => {
        theme.url = undefined;
        const json = cliOptions.minify
            ? JSON.stringify(theme)
            : JSON.stringify(theme, undefined, 4);

        const unifiedDefinitionsFileName =
            path.dirname(inFileName) +
            path.sep +
            "unified-definitions" +
            path.sep +
            path.basename(inFileName);

        // If unified definitions file exists then we split a theme to unified with native and
        // non-unified with native parts. We need such split to explain users which parts of
        // the theme will stay backward compatible and which ones will not:
        if (fs.existsSync(unifiedDefinitionsFileName)) {
            // Private (non-unified) part:
            const outFileBaseNamePrivate = `${path.basename(inFileName, "json")}private.json`;
            const outFileNamePrivate = cliOptions.out + path.sep + outFileBaseNamePrivate;
            console.log(`Writing ${outFileNamePrivate}`);
            fs.writeFileSync(outFileNamePrivate, json);

            // Public (unified) part:
            const themePublic: FlatTheme = {
                extends: [outFileBaseNamePrivate],
                definitions: {}
            };
            const unifiedDefinitions: string[] = JSON.parse(
                fs.readFileSync(unifiedDefinitionsFileName, "utf8")
            );
            unifiedDefinitions.forEach(def => {
                if (theme.definitions && themePublic.definitions) {
                    themePublic.definitions[def] = theme.definitions[def];
                }
            });
            const jsonPublic = cliOptions.minify
                ? JSON.stringify(themePublic)
                : JSON.stringify(themePublic, undefined, 4);
            const outFileNamePublic = `${cliOptions.out}/${path.basename(inFileName)}`;
            console.log(`Writing ${outFileNamePublic}`);
            fs.writeFileSync(outFileNamePublic, jsonPublic);
        } else {
            const outFileName = `${cliOptions.out}/${path.basename(inFileName)}`;
            console.log(`Writing ${outFileName}`);
            fs.writeFileSync(outFileName, json);
        }
    });
});
