#!/usr/bin/env node
/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as program from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { AtlasOptions, generateSpritesAtlas } from "./AtlasGenerator";
import { getLogger, Logger, LogLevel } from "./Logger";

const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
    .version;
const cpus: number = os.cpus() ? os.cpus().length : 4;

const _defaultOutputFile: string = "./output/sprites-atlas";
const _defaultPadding: number = 1;
const _defaultWidth: number = 0;
const _defaultHeight: number = 0; // height may be contrained to width with original aspect ratio
const _defaultVerbose: boolean = false;
const _defaultJobsNum: number = cpus;

program
    .version(version)
    .description("CLI tool for generating texture atlases from multiple image sources.")
    .usage("[options] URL")
    .option("-i, --in [path]", "Input path")
    .option("-o, --out [file]", "Output atlas and definition file name", _defaultOutputFile)
    .option("-p, --padding [num]", "Padding between icons", String(_defaultPadding))
    .option(
        "-w, --width [num]",
        "Width of sprite in atlas, set to zero leaves size unchanged " +
            "or constraints to height (if set) while preserving aspect ratio",
        String(_defaultWidth)
    )
    .option(
        "-h, --height [num]",
        "Height of sprite in atlas, zero leaves original size " +
            "or constraints to width (if set) while preserving aspect ratio",
        String(_defaultHeight)
    )
    .option("-m, --minify", "Minify JSON")
    .option("-v, --verbose", "Verbose mode", _defaultVerbose)
    .option("-j, --jobs [num]", "Number of processing threads", String(_defaultJobsNum))
    .option("-c, --processConfig [path]", "Processing steps configuration json file")
    .parse(process.argv);

// Parse atlas options
const cliOptions = program.opts();
const options: AtlasOptions = {
    input: cliOptions.in,
    output: cliOptions.out,
    padding: parseInt(cliOptions.padding, 10),
    width: parseInt(cliOptions.width, 10),
    height: parseInt(cliOptions.height, 10),
    minify: cliOptions.minify !== undefined ? true : false,
    verbose: cliOptions.verbose !== undefined ? true : false,
    jobs: parseInt(cliOptions.jobs, 10),
    processConfig: cliOptions.processConfig
};

const logger: Logger = getLogger(options.verbose);

if (options.verbose) {
    logger.log(LogLevel.DEBUG, "\nVerbose mode active, params list:");
    logger.log(LogLevel.DEBUG, "Input path: '%s'", options.input);
    logger.log(LogLevel.DEBUG, "Input config: '%s'", options.processConfig);
    logger.log(LogLevel.DEBUG, "Output PNG image: '%s.png'", options.output);
    logger.log(LogLevel.DEBUG, "Output JSON file: '%s.json'", options.output);
    logger.log(LogLevel.DEBUG, "Sprite width: %s px", options.width);
    logger.log(LogLevel.DEBUG, "Sprite height: %s px", options.height);
    logger.log(LogLevel.DEBUG, "Padding: %s px", options.padding);
    logger.log(LogLevel.DEBUG, "Minify JSON: %s", options.minify);
    logger.log(LogLevel.DEBUG, "Number of jobs: %s\n", options.jobs);
}

// Validate input/output parameters
if (options.input === undefined || options.input.length < 1) {
    logger.log(LogLevel.ERROR, "\nMissing input path!\n");
    program.outputHelp();
    process.exit(1);
} else if (options.output.length < 1) {
    logger.log(LogLevel.ERROR, "\nInvalid output path, please specify -o [path]\n");
    program.outputHelp();
    process.exit(1);
} else if (options.output === _defaultOutputFile) {
    logger.log(LogLevel.INFO, "\nUsing default output path: %s[.png|.json]\n", _defaultOutputFile);
}

// Run texture atlas generator
generateSpritesAtlas(options)
    .then(outputFile => {
        logger.log(LogLevel.INFO, "Image atlas created at: ", outputFile);
        process.exit(0);
    })
    .catch((err: Error) => {
        logger.log(LogLevel.ERROR, "Could not create image atlas.\nError: ", err);
        process.exit(1);
    });
