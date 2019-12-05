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

let testResultsPath: string;
let referenceImagesPath: string;
let referenceMainDir: string;
let referenceOutputPath: string;
let referenceDataBranch: string;
let referenceRepo: string;
let exitCode = 0;

interface RefData {
    [testName: string]: string;
}

interface ActTestResults {
    [testName: string]: {
        path?: string;
        passed: boolean;
    };
}

async function fetchReferenceImages() {
    if (!fs.existsSync(referenceImagesPath)) {
        logger.log(`Creating a directory: ${referenceImagesPath}`);
        fs.mkdirSync(referenceImagesPath, { recursive: true });
        await execCommand(`git init`, referenceMainDir);
        await execCommand(`git remote add origin ${referenceRepo}`, referenceMainDir);
        await execCommand(`git fetch`, referenceMainDir);
        await execCommand(`git checkout master`, referenceMainDir);
    } else {
        logger.log(`Directory ${referenceMainDir} exists. Fetching changes...`);
        await execCommand(`git fetch`, referenceMainDir);
        await execCommand(`git reset --hard origin/master`, referenceMainDir);
    }
}

export async function approveReferenceImages(platform: string) {
    // reference-images should be already fetched from referenceRepo
    const referenceJson: RefData = await loadRefFile(`${referenceOutputPath}/${platform}.ref.json`);
    for (const name of Object.keys(referenceJson)) {
        const hash = referenceJson[name];
        const sourcePath = path.join(referenceImagesPath, `${hash}.png`);
        const referenceResultsPath = path.join(testResultsPath, platform);
        const destPath = path.join(referenceResultsPath, `${name}.reference.png`);
        if (fs.existsSync(sourcePath)) {
            logger.log(`Copying file: ${sourcePath} to ${destPath}`);
            fs.copyFileSync(sourcePath, destPath);
        } else {
            logger.log(`WARNING: ${sourcePath} file doesn't exist`);
        }
    }
}

export async function updateReferenceImagesLocal(platform: string, createRef: boolean = false) {
    const referenceJson: RefData = fs.existsSync(`${referenceOutputPath}/${platform}.ref.json`)
        ? await loadRefFile(`${referenceOutputPath}/${platform}.ref.json`)
        : {};
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
            exitCode = 4;
        }
        if (actInfo && actInfo.path) {
            actHash = await genActHash(actInfo.path);
            const destFilePath = `${referenceImagesPath}/${actHash}.png`;
            const currentFilePath = actInfo.path;
            logger.log(`ACTUAL HASH: ${actHash} , REF HASH: ${refHash}`);

            if (!refHash) {
                logger.log(
                    `[ERROR] No reference data for test: ${name}. Platform: ${platform}.
                     Add reference data for it. ACT HASH ${actHash}`
                );
                exitCode = 4;
            }
            if (actInfo.passed) {
                logger.log(`Test ${name} passed.`);
            }

            if (!fs.existsSync(destFilePath)) {
                logger.log(`SAVING actual file from ${currentFilePath} to ${destFilePath}`);
                fs.copyFileSync(currentFilePath, destFilePath);
            }
        }

        referenceData[name] = actHash || refHash;
    }

    if (createRef || program.opts().save) {
        logger.log(
            `[ERROR] CREATE and COMMIT reference file for new platform: ${platform}.ref.json` +
                ` from object: `,
            JSON.stringify(referenceData, null, 4)
        );
        await saveResultsFile(
            `${referenceOutputPath}/${platform}.ref.json`,
            JSON.stringify(referenceData, null, 4)
        );
    }
}

async function pushReferenceImages() {
    const commitMessage = "Upload ref images";
    const out = await execCommandWithCapture(`git ls-files --others`, referenceMainDir);
    const files = out.split("\n").filter(name => name);
    if (files.length) {
        logger.log(`${files.length} image(s) changed`);
        await execCommand(`git status`, referenceMainDir);
        await execCommand(`git add *.png`, referenceMainDir);
        await execCommand(`git commit -m "${commitMessage}" --signoff`, referenceMainDir);
        await execCommand(`git push origin HEAD:${referenceDataBranch} -f`, referenceMainDir);
    } else {
        logger.log("NO reference images changed");
    }
}

async function updatePlatformAndReferenceData(platformNames: string[]) {
    const files = await readFileNamesFromDirectory(referenceOutputPath, [".ref.json"]);
    const fileNames = files.map(file => file.split(".ref.json")[0]);
    for (const platform of platformNames) {
        if (fileNames.includes(platform)) {
            logger.log("Platform and reference file exist");
            await updateReferenceImagesLocal(platform);
        } else {
            logger.log(`[ERROR] Reference file for platform: ${platform} NOT exist`);
            await fetchReferenceImages();
            await updateReferenceImagesLocal(platform, true);
        }
    }
}

async function execCommandWithCapture(cmd: string, currentWorkingDir: string) {
    try {
        return child_process.execSync(cmd, {
            cwd: path.join(process.cwd(), currentWorkingDir),
            encoding: "utf8"
        });
    } catch (e) {
        throw new Error(`Failed command ${cmd}: ${e}`);
    }
}

async function execCommand(cmd: string, currentWorkingDir: string = ".") {
    try {
        child_process.execSync(cmd, {
            cwd: path.join(process.cwd(), currentWorkingDir),
            encoding: "utf8",
            stdio: "inherit"
        });
    } catch (e) {
        throw new Error(`Failed command ${cmd}: Error: ${e}`);
    }
}

async function getDirectories(filePath: string): Promise<string[]> {
    return fs
        .readdirSync(filePath, { withFileTypes: true })
        .filter(file => file.isDirectory())
        .map(dirent => dirent.name);
}

export async function readFileNamesFromDirectory(directoryPath: string, extensions: string[]) {
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
    program.option("-c, --config <path>", "Set config path", function(configPath: string) {
        logger.log("config path: ", configPath);
        const configJson = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configJson);
        referenceImagesPath = config.referenceImagesPath;
        referenceMainDir = config.referenceMainDir;
        testResultsPath = config.testResultsPath;
        referenceOutputPath = config.referenceOutputPath;
        referenceDataBranch = config.referenceDataBranch;
        referenceRepo = config.referenceRepo;
    });
    program.option("-r, --repo <name>", "Reference images repository", repoLink => {
        referenceRepo = repoLink;
    });
    program.option("-s, --save", "Generate example reference JSON", false);

    program
        .command("getReferenceImages")
        .description("fetch reference images from ci-render-tests-images")
        .alias("get")
        .action(
            commandErrorHandler(async function() {
                logger.info("Fetching reference images...");
                let platforms: string[];
                await fetchReferenceImages();
                if (fs.existsSync(testResultsPath)) {
                    platforms = await getDirectories(testResultsPath);
                } else {
                    throw new Error(`DIRECTORY ${testResultsPath} NOT FOUND`);
                }
                if (platforms.length) {
                    for (const platform of platforms) {
                        await approveReferenceImages(platform);
                    }
                } else {
                    logger.log("NO platforms found");
                }
            })
        );

    program
        .command("updateReferenceImagesLocal")
        .description("update reference images locally")
        .alias("update")
        .action(
            commandErrorHandler(async function() {
                logger.info("Updating reference images...");
                let platforms: string[];
                await fetchReferenceImages();
                if (fs.existsSync(testResultsPath)) {
                    platforms = await getDirectories(testResultsPath);
                } else {
                    throw new Error(`DIRECTORY ${testResultsPath} NOT FOUND`);
                }
                if (platforms.length) {
                    for (const platform of platforms) {
                        await updateReferenceImagesLocal(platform);
                    }
                } else {
                    logger.log("WARNING: NO platforms found. Run tests first.");
                }
            })
        );

    program
        .command("pushReferenceImages")
        .description("push reference images to branch ci-render-tests-images")
        .alias("push")
        .action(
            commandErrorHandler(async function() {
                logger.info("Pushing reference images");
                let attemptNo = 1;
                while (true) {
                    try {
                        await pushReferenceImages();
                        break;
                    } catch (error) {
                        logger.log("ERROR: ", error);
                        if (error.message.contains("rebase") && attemptNo < 5) {
                            await execCommand(`git fetch`, referenceMainDir);
                            await execCommand(`git reset --hard origin/master`, referenceMainDir);
                            attemptNo++;
                            logger.log("ATTEMPT: ", attemptNo);
                        } else {
                            throw error;
                        }
                    }
                }
            })
        );

    program
        .command("checkPlatformUpdate")
        .description("checks if platform has been updated")
        .alias("check")
        .action(
            commandErrorHandler(async function() {
                logger.info("Checking platform...");
                let platforms: string[];
                if (fs.existsSync(testResultsPath)) {
                    platforms = await getDirectories(testResultsPath);
                } else {
                    throw new Error(`DIRECTORY ${testResultsPath} NOT FOUND`);
                }
                await fetchReferenceImages();
                await updatePlatformAndReferenceData(platforms);
            })
        );

    return program.parse(process.argv);
}

function commandErrorHandler(action: () => Promise<void>): () => void {
    return async () => {
        try {
            await action();
            if (exitCode !== 0) {
                process.exit(exitCode);
            }
        } catch (e) {
            process.exit(3);
        }
    };
}

main().catch(error => {
    logger.log("Error occured in ReferenceImageData: ", error);
    process.exit(2);
});
