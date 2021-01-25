/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// @here:check-imports:environment:node

import { LoggerManager } from "@here/harp-utils";
import * as program from "commander";
import * as fs from "fs";

import { genHtmlReport } from "./HtmlReport";
import { ImageTestResultLocal } from "./Interface";
import { getOutputImagePath, loadSavedResults } from "./RenderingTestResultCommon";

const logger = LoggerManager.instance.create("RenderingTestResultCli");

let createMissingReferences: boolean = true;
let forceApprovals: boolean = false;

async function genConsoleReport(results: ImageTestResultLocal[]): Promise<boolean> {
    let someTestsFailed = false;
    results.forEach(info => {
        const referencePath = getOutputImagePath(
            { ...info.imageProps, extra: ".reference" },
            baseResultsPath
        );

        if (createMissingReferences && info.actualImagePath && !fs.existsSync(referencePath)) {
            logger.log(`${referencePath}: establishing reference image`);
            fs.copyFileSync(info.actualImagePath, referencePath);
        } else if (info.mismatchedPixels) {
            if ((info.approveDifference === true || forceApprovals) && info.actualImagePath) {
                logger.log(
                    `${referencePath}: difference explicitly approved, establishing reference image`
                );
                fs.copyFileSync(info.actualImagePath, referencePath);
            } else {
                logger.log(`${referencePath}: failed, ${info.mismatchedPixels} mismatched pixels`);
                if (info.diffImagePath) {
                    logger.log(`   see ${info.diffImagePath}`);
                }
                someTestsFailed = true;
            }
        } else {
            logger.log(`${referencePath}: success`);
        }
    });
    return !someTestsFailed;
}
let baseResultsPath = "rendering-test-results";

async function main() {
    program.usage("[options] COMMAND").option(
        "-D, --dir <DIR>",
        "base test results path",
        (value: string) => {
            baseResultsPath = value;
            return value;
        },
        baseResultsPath
    );

    program
        .command("html-report")
        .description("generate HTML report from all IBCT test results")
        .alias("r")
        .action(async function () {
            const results = await loadSavedResults(baseResultsPath);
            const r = await genHtmlReport(results, {}, baseResultsPath);
            const overallTestsResult = r[0];
            const reportHtml = r[1];
            if (process.stdout.isTTY) {
                const fileName = "ibct-report.html";
                logger.info(`(stdout is tty, saving HTML to ${fileName})`);
                fs.writeFileSync(fileName, reportHtml, "utf-8");
            } else {
                fs.writeSync(1, Buffer.from(reportHtml, "utf-8"));
            }
            process.exit(overallTestsResult ? 0 : 1);
        });

    program
        .command("approve")
        .description("approve current results locally")
        .alias("a")
        .action(async function () {
            logger.info("approving all actual images");

            const results = await loadSavedResults(baseResultsPath);
            forceApprovals = true;
            const overallTestsResult = await genConsoleReport(results);
            process.exit(overallTestsResult ? 0 : 1);
        });

    program
        .command("save-reference")
        .description("establish missing reference images")
        .alias("s")
        .action(async function () {
            logger.info("saving actual images as reference");
            const results = await loadSavedResults(baseResultsPath);
            createMissingReferences = true;
            const overallTestsResult = await genConsoleReport(results);
            process.exit(overallTestsResult ? 0 : 1);
        });

    return program.parse(process.argv);
}

main().catch(error => {
    logger.log("error:", error);
    process.exit(2);
});
