/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions

import { LoggerManager } from "@here/harp-utils";
import { ImageTestResultLocal } from "./Interface";

import * as child_process from "child_process";
import * as program from "commander";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import { getOutputImagePath } from "./RenderingTestResultCommon";

const logger = LoggerManager.instance.create("ReferenceImageData");

const testResultsPath = "rendering-test-results";
const referenceImagesPath = "reference-images";
const referenceOutputPath = "./test/rendering/";

const refDataBranch = "ci-render-tests-images";
const referenceRepo = "https://github.com/arekspiewak1991/reference-images.git";

interface RefData {
    [testName: string]: string;
}

interface ActTestResults {
    [testName: string]: {
        path?: string;
        passed: boolean;
    };
}

async function check() {
    if (fs.existsSync(testResultsPath)) {
        if (!fs.existsSync(referenceImagesPath)) {
            fs.mkdirSync(referenceImagesPath, { recursive: true });
        }

        return getDirectories(testResultsPath);
    } else {
        throw new Error(`DIRECTORY ${testResultsPath} NOT FOUND`);
    }
}

export async function getReferenceImages(platform: string) {
    await execCommand(`rm -rf ${referenceImagesPath} && git clone ${referenceRepo}`);
    const referenceJson: RefData = await loadRefFile(`${referenceOutputPath}/${platform}.json`);
    for (const name of Object.keys(referenceJson)) {
        const sourcePath = path.join(referenceImagesPath, `${referenceJson[name]}.png`);
        const referenceResultsPath = path.join(testResultsPath, platform);
        const destPath = path.join(referenceResultsPath, `${name}.reference.png`);
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
        } else {
            logger.log(`WARNING: ${referenceResultsPath} folder doesn't exist`);
        }
    }
}

export async function updateReferenceImagesLocal(platform: string) {
    const referenceJson: RefData = await loadRefFile(`${referenceOutputPath}/${platform}.json`);
    const inputDir = path.join(testResultsPath, platform);
    const testResultsJsons = await readFileNamesFromDirectory(inputDir, [".ibct-result.json"]);
    const savedResults = testResultsJsons.map(match => {
        const filePath = path.resolve(path.join(process.cwd(), inputDir, match));
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content) as ImageTestResultLocal;
    });
    const referenceData: RefData = {};

    const actResult: ActTestResults = {};

    for (const actualTestResults of savedResults) {
        const basePath = getOutputImagePath(
            { ...actualTestResults.imageProps, extra: ".current" },
            testResultsPath
        );
        const testName =
            actualTestResults.imageProps.module + "-" + actualTestResults.imageProps.name;

        actResult[testName] = {
            path: basePath,
            passed: actualTestResults.passed
        };
    }

    const mergedResults = new Set(Object.keys(actResult).concat(Object.keys(referenceJson)));

    for (const name of mergedResults) {
        const refHash = referenceJson[name];
        const actInfo = actResult[name];
        let actHash: string = "";

        if (!actInfo) {
            logger.log(
                `[ERROR] No generated file for test: ${name},
                 platform ${platform}. Make sure test is running.`
            );
        }
        if (actInfo && actInfo.path) {
            actHash = await genActHash(actInfo.path);

            if (!refHash) {
                logger.log(
                    `[ERROR] No reference data for test: ${name}. Platform: ${platform}.
                     Add reference data for it. ACT HASH ${actHash}`
                );
            }
            if (actInfo.passed) {
                logger.log(`Test ${name} passed.`);
                logger.log(`ACTUAL HASH: ${actHash} , REF HASH: ${refHash}`);
                const currentFilePath = actInfo.path;
                const destFilePath = `${referenceImagesPath}/${actHash}.png`;

                if (referenceJson[name] && referenceJson[name] === actHash) {
                    logger.log(`SAVING actual file from ${currentFilePath} to ${destFilePath}`);
                    fs.copyFileSync(currentFilePath, destFilePath);
                }
            }
        }
        referenceData[name] = actHash || refHash;
    }

    if (program.opts().save) {
        await saveResultsFile(
            `${referenceOutputPath}${platform}.example.json`,
            JSON.stringify(referenceData, null, 4)
        );
    }
}

async function pushReferenceImages() {
    const commitMessage = "Upload ref images";
    const out = await execCommandWithCapture(`git ls-files -others`, referenceImagesPath);
    const files = out.split("\n").filter(name => name);
    if (files.length) {
        await execCommand(`git status`, referenceImagesPath);
        await execCommand(`git add *.png`, referenceImagesPath);
        await execCommand(`git commit -m "${commitMessage}"`, referenceImagesPath);
        await execCommand(`git push origin ${refDataBranch} -f`, referenceImagesPath);
    }
}

async function execCommandWithCapture(cmd: string, currentWorkingDir: string) {
    try {
        return child_process.execSync(cmd, {
            cwd: path.join(process.cwd(), currentWorkingDir),
            encoding: "utf8"
        });
    } catch (e) {
        throw new Error(`Error while running command ${cmd}`);
    }
}

async function execCommand(cmd: string, currentWorkingDir: string = ".") {
    try {
        child_process.execSync(cmd, {
            cwd: path.join(process.cwd(), currentWorkingDir),
            encoding: "utf8",
            stdio: "inherit"
        });
    } catch (err) {
        throw new Error(`Error while running command ${cmd}. Error: ${err}`);
    }
}

async function getDirectories(filePath: string): Promise<string[]> {
    return fs
        .readdirSync(filePath, { withFileTypes: true })
        .filter(file => file.isDirectory())
        .map(dirent => dirent.name);
}

async function readFileNamesFromDirectory(directoryPath: string, extensions: string[]) {
    const files: string[] = fs.readdirSync(directoryPath);
    return files.filter(fileName => {
        for (const fileExt of extensions) {
            if (fileName.toLowerCase().endsWith(fileExt)) {
                return true;
            }
        }
        return false;
    });
}

async function readImage(filePath: string): Promise<ImageData> {
    const imageFile = fs.readFileSync(filePath);

    return new Promise<ImageData>((resolve, reject) => {
        new PNG({ inputColorType: 2 }).parse(imageFile, (error, image) => {
            if (!error) {
                const imageData = Uint8ClampedArray.from(image.data);
                resolve({ height: image.height, width: image.width, data: imageData });
            } else {
                reject(error);
            }
        });
    });
}

async function loadRefFile(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
}

async function saveResultsFile(filePath: string, content: string) {
    logger.log(`SAVING file: ${filePath}`);
    try {
        fs.writeFileSync(filePath, content);
    } catch (e) {
        throw new Error(`[ERROR] while writing file: ${filePath}. Error: ${e}`);
    }
}

async function genActHash(filePath: string): Promise<string> {
    const image = await readImage(filePath);
    return crypto
        .createHash("md5")
        .update(`${image.width}:${image.height}`)
        .update(image.data)
        .digest("hex");
}

async function main() {
    program.usage("[options] COMMAND");
    program.option("-r, -repo <name>", "Reference images repository", referenceRepo);
    program.option("-s, --save", "Generate example reference JSON", false);

    program
        .command("getReferenceImages")
        .description("fetch reference images from ci-render-tests-images")
        .alias("get")
        .action(async function() {
            logger.info("Fetching reference images...");
            const platforms = await check();
            if (platforms.length) {
                for (const platform of platforms) {
                    await getReferenceImages(platform);
                }
            } else {
                logger.log("NO platforms found");
            }
        });

    program
        .command("updateReferenceImagesLocal")
        .description("update reference images locally")
        .alias("update")
        .action(async function() {
            logger.info("Updating reference images...");
            const platforms = await check();
            if (platforms.length) {
                for (const platform of platforms) {
                    await updateReferenceImagesLocal(platform);
                }
            } else {
                logger.log("WARNING: NO platforms found. Run tests first.");
            }
        });

    program
        .command("pushReferenceImages")
        .description("push reference images to branch ci-render-tests-images")
        .alias("push")
        .action(async function() {
            logger.info("Pushing reference images");
            await pushReferenceImages();
        });

    return program.parse(process.argv);
}

main().catch(error => {
    logger.log("Error occured in ReferenceImageData: ", error);
    process.exit(2);
});
