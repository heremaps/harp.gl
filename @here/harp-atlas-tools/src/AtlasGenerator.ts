/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from "path";

import {
    BlendAlpha,
    BlendAlphaPremultiplied,
    BlendMultiply,
    BlendMultiplyRGB,
    BlendOperation,
    BlendOverlay,
    BlendScreen
} from "./BlendOperations";
import { FileSystem, ImageFormat } from "./FileSystem";
import { ImageBitmapDecoderConstructor, ImageBitmapEncoderConstructor } from "./ImageBitmapCoders";
import { Color, ImageDecoder, ImageEncoder, ImageFactory } from "./ImageFactory";
import {
    AddBackground,
    AddForeground,
    BlendImages,
    Colorize,
    CombineImages,
    Grayscale,
    GrayscaleMethod,
    ImageProcessor,
    InvertColor,
    MaskImage,
    Resize
} from "./ImageProcessing";
import { ResultImageSizeSpecifier } from "./ImageUtils";
import { ImageVectorDecoderConstructor, ImageVectorEncoderConstructor } from "./ImageVectorCoders";
import { getLogger, Logger, LogLevel } from "./Logger";

export interface ProcessingOptions {
    readonly input: string;
    readonly output: string;
    readonly width: number;
    readonly height: number;
    readonly verbose: boolean;
    readonly jobs: number;
    readonly processConfig: string;
}

export interface AtlasOptions extends ProcessingOptions {
    readonly padding: number;
    readonly minify: boolean;
}

export async function generateSprites(options: ProcessingOptions): Promise<string[]> {
    const outputDir = path.relative(process.cwd(), options.output);
    // Input path may take a from of wildcards expression, i.e. icons/*.png
    const inputPath = path.relative(process.cwd(), options.input);

    const logger: Logger = getLogger(options.verbose);

    logger.log(LogLevel.INFO, `Input path: '${inputPath}'`);
    logger.log(LogLevel.INFO, `Output dir: '${outputDir}'`);

    // Parse list of input files.
    const inputFiles: string[] = getInputFilesSync(inputPath, logger);

    // Create directory for post-processing output.
    // NOTE: In case of leave the output directory, something may reside there.
    createOutDirSync(outputDir, logger);

    // Post-process and prepare input files for atlas creation, export them to PNG format.
    const outputFiles: string[] = await prepareSprites(
        inputFiles,
        options.processConfig,
        ImageFormat.PNG,
        outputDir,
        options.width,
        options.height,
        logger,
        options.jobs
    );

    return outputFiles;
}

export async function generateSpritesAtlas(options: AtlasOptions): Promise<any> {
    const outputPath = path.relative(process.cwd(), options.output);
    const outputDir = path.dirname(outputPath);
    // Input path may take a from of wildcards expression, i.e. icons/*.png
    const inputPath = path.relative(process.cwd(), options.input);

    const logger: Logger = getLogger(options.verbose);

    logger.log(LogLevel.INFO, `Input path: '${inputPath}'`);
    logger.log(LogLevel.INFO, `Output path: '${outputPath}[.png|.json]'`);
    logger.log(LogLevel.INFO, `Output dir: '${outputDir}'`);

    // Parse list of input files.
    const inputFiles: string[] = getInputFilesSync(inputPath, logger);

    // Create directory for atlas files and temporary folder for post-processing output.
    const tempOutputDir = createTempDirSync(createOutDirSync(outputDir, logger), logger);

    try {
        // Post-process and prepare input files for atlas creation, export them to PNG format.
        const intermediateFiles: string[] = await prepareSprites(
            inputFiles,
            options.processConfig,
            ImageFormat.PNG,
            tempOutputDir,
            options.width,
            options.height,
            logger,
            options.jobs
        );

        // Finally generate atlas from it.
        const result = await mergeSpritesIntoAtlas(
            intermediateFiles,
            outputPath,
            options.padding,
            options.minify,
            logger
        );

        // Cleanup temporary directory.
        removeTempDirSync(tempOutputDir, logger);
        return result;
    } catch (err) {
        // In case of error remove temps but leave the output directory, something may reside there.
        removeTempDirSync(tempOutputDir, logger);
        throw err;
    }
}

async function prepareSprites(
    inputFiles: string[],
    processConfigPath: string,
    outputFormat: ImageFormat,
    outputDir: string,
    outWidth: number,
    outHeight: number,
    logger: Logger,
    jobsNum: number = 8
): Promise<string[]> {
    // Prepare factory of image loaders.
    const imageFactory: ImageFactory = new ImageFactory();

    // Register bitmap MIME/image types supported.
    const bitmapDecoder = new ImageBitmapDecoderConstructor();
    const bitmapEncoder = new ImageBitmapEncoderConstructor();
    imageFactory.registerImageType(ImageFormat.PNG, bitmapDecoder, bitmapEncoder);
    imageFactory.registerImageType(ImageFormat.BMP, bitmapDecoder, bitmapEncoder);
    imageFactory.registerImageType(ImageFormat.JPG, bitmapDecoder, bitmapEncoder);
    imageFactory.registerImageType(ImageFormat.TIFF, bitmapDecoder, bitmapEncoder);
    imageFactory.registerImageType(ImageFormat.GIF, bitmapDecoder, bitmapEncoder);

    // TODO: Figure out late SVG convertion or adjust to image being blend (background, overlays).
    const exportWidth = outWidth === 0 ? outHeight : outWidth;
    const exportHeight = outHeight === 0 ? outWidth : outHeight;
    // Register vector data sources supported (SVG).
    const vectorDecoder = new ImageVectorDecoderConstructor(exportWidth, exportHeight);
    const vectorEncoder = new ImageVectorEncoderConstructor();
    imageFactory.registerImageType(ImageFormat.SVG, vectorDecoder, vectorEncoder);

    // Read and prepare image post-processing operations.
    // Parse processing steps from json file.
    const processingSteps: ImageProcessor[] = [];
    if (processConfigPath !== undefined && processConfigPath.length > 0) {
        const configPath: string = path.relative(process.cwd(), processConfigPath);
        const processingConfig: any = JSON.parse(FileSystem.readFileSync(configPath).toString());
        if (
            processingConfig.processingSteps === undefined ||
            !Array.isArray(processingConfig.processingSteps)
        ) {
            logger.log(LogLevel.ERROR, "'processingSteps' node should be defined as JSON array");
            throw new Error("'processingSteps' node should be defined as JSON array");
        } else {
            logger.log(LogLevel.DEBUG, "\nProcessing steps configured:");
            logger.log(LogLevel.DEBUG, processingConfig);
            logger.log(LogLevel.DEBUG, "\n");
            for (const element of processingConfig.processingSteps) {
                // TODO: Remove undefined allow some debuging
                const imageProcess: ImageProcessor | undefined = await parseImageProcess(
                    element,
                    imageFactory
                );
                if (imageProcess !== undefined) {
                    processingSteps.push(imageProcess);
                }
            }
        }
    }
    // Add the end of processing add resizing step
    if (outWidth !== 0 && outHeight !== 0) {
        processingSteps.push(new Resize(outWidth, outHeight));
    }

    // Post-process input files.
    const images: ImageEncoder[] = await processImages(
        inputFiles,
        imageFactory,
        processingSteps,
        logger,
        jobsNum
    );

    // Store all post-processed images into output directory.
    return await storeImages(inputFiles, images, outputDir, outputFormat);
}

function processImages(
    inputFiles: string[],
    imageFactory: ImageFactory,
    operations: ImageProcessor[],
    logger: Logger,
    jobsNum: number = 8,
    outputDir?: string
): Promise<ImageEncoder[]> {
    // Process the input images in the source folder.
    // Since it will run in one process per image, the number of parallel jobs (promises)
    // is limited by options parmeter 'jobs'. This should be choosen wiselly, such like
    // 2 jobs per single CPU core. Otherwise, the memory usage may explode (> 16GB).
    const readPromises: Array<Promise<ImageEncoder>> = [];

    // TODO: Solve imports
    const promiseLimit = require("promise-limit");
    const jobLimit = promiseLimit(jobsNum);

    // Create image post-processing promises.
    const outputExt: string = ".png";
    for (const inputFile of inputFiles) {
        let outFile: string;
        if (outputDir !== undefined) {
            outFile = path.join(
                outputDir,
                path.basename(inputFile, path.extname(inputFile)) + outputExt
            );
        }
        const readPromise: Promise<ImageEncoder> = jobLimit(() => {
            return readAndProcessImage(inputFile, imageFactory, operations, logger, outFile);
        });
        readPromises.push(readPromise);
    }

    // Process all input images in parallel jobs.
    return Promise.all(readPromises);
}

async function storeImages(
    inputFiles: string[],
    images: ImageEncoder[],
    outputDir: string,
    outputFormat: ImageFormat = ImageFormat.PNG
): Promise<string[]> {
    if (inputFiles.length !== images.length) {
        throw new Error("Not all files has been processed, files and encoders lists vary in size!");
    }

    const outputExt: string = FileSystem.getImageFormatExtensions(outputFormat)[0];
    const outputFiles: string[] = [];
    for (let i = 0; i < inputFiles.length; ++i) {
        const inputFile: string = inputFiles[i];
        const encoder: ImageEncoder = images[i];
        const outFile: string = path.join(
            outputDir,
            path.basename(inputFile, path.extname(inputFile)) + outputExt
        );
        await encoder.write(outFile);
        outputFiles.push(outFile);
    }
    return outputFiles;
}

function mergeSpritesIntoAtlas(
    inputFiles: string[],
    outputPath: string,
    paddingSize: number,
    minify: boolean,
    logger: Logger
): Promise<string> {
    // Generate texture atlas using spritesmith tool.
    const atlasPath = outputPath + ".png";
    const descriptorPath = outputPath + ".json";
    const spritesmith = require("spritesmith");
    return new Promise((resolve, reject) => {
        spritesmith.run({ src: inputFiles, padding: paddingSize }, (err: Error, result: any) => {
            if (err) {
                reject(new Error("Atlas creation failed! " + err));
                return;
            }
            // Save atlas image files
            logger.log(LogLevel.DEBUG, "Writing atlas image:", atlasPath);
            FileSystem.writeFileSync(atlasPath, result.image);

            // Save json descriptor file
            const jsonDescriptor: any = {};
            for (const spritePath of Object.keys(result.coordinates)) {
                jsonDescriptor[path.basename(spritePath, path.extname(spritePath))] =
                    result.coordinates[spritePath];
            }
            logger.log(LogLevel.DEBUG, "Writing atlas descriptor:", descriptorPath);
            const descriptorBuffer = minify
                ? JSON.stringify(jsonDescriptor)
                : JSON.stringify(jsonDescriptor, undefined, 4);

            FileSystem.writeFileSync(descriptorPath, descriptorBuffer);

            resolve(atlasPath);
        });
    });
}

async function readAndProcessImage(
    inFile: string,
    imageFactory: ImageFactory,
    operations: ImageProcessor[],
    logger: Logger,
    outFile?: string
): Promise<ImageEncoder> {
    logger.log(LogLevel.DEBUG, `Processing file: '${inFile}`);
    const imageDecoder = await imageFactory.loadImage(inFile);
    let imageOutput: ImageEncoder = imageDecoder.copy();
    operations.forEach(imageProcess => {
        logger.log(LogLevel.DEBUG, "Running image process: ", imageProcess);
        imageOutput = imageProcess.run(imageOutput);
    });
    if (outFile !== undefined) {
        await imageOutput.write(outFile);
        logger.log(LogLevel.DEBUG, `Written intermediate file: '${outFile}'`);
    }
    return imageOutput;
}

async function parseImageProcess(
    jsonElement: any,
    imageFactory: ImageFactory
): Promise<ImageProcessor> {
    if (jsonElement.name === undefined || jsonElement.name.length < 1) {
        throw new Error("Unrecognized processing step, please define 'name' attribute!");
    }
    const processName: string = jsonElement.name;
    switch (processName) {
        case InvertColor.name:
            return new InvertColor();
        case Grayscale.name:
            if (jsonElement.method !== undefined) {
                return new Grayscale(jsonElement.method as GrayscaleMethod);
            } else {
                return new Grayscale();
            }
        case Colorize.name:
            return new Colorize(jsonElement.color as Color);
        case AddBackground.name:
        case AddForeground.name:
        case MaskImage.name:
            if (jsonElement.image === undefined) {
                throw new Error(
                    `${processName} 'image' attribute ` + `is not defined for processing step!`
                );
            } else {
                const offset =
                    jsonElement.offset !== undefined ? jsonElement.offset : { x: 0, y: 0 };
                const image: ImageDecoder = await imageFactory.loadImage(jsonElement.image);
                if (jsonElement.name === AddBackground.name) {
                    return new AddBackground(image, offset);
                } else {
                    return new AddForeground(image, offset);
                }
            }
        case BlendImages.name:
        case CombineImages.name:
            if (jsonElement.image === undefined) {
                throw new Error(
                    `Destination 'image' attribute not defined ` + `for ${processName} step!`
                );
            } else if (jsonElement.blendMode === undefined) {
                throw new Error(
                    `Atrribute 'blendMode' is not defined ` + `for ${processName} step!`
                );
            }

            const blendOperation: BlendOperation | undefined = getBlendOperationByName(
                jsonElement.blendMode
            );
            if (blendOperation === undefined) {
                throw new Error(
                    `Atrribute 'blendMode' not recognized as proper BlendOperation ` +
                        `for ${processName} step!`
                );
            }

            const imageDst: ImageDecoder = await imageFactory.loadImage(jsonElement.image);
            if (jsonElement.name === BlendImages.name) {
                return new BlendImages(imageDst, blendOperation);
            } else {
                const offset =
                    jsonElement.offset !== undefined ? jsonElement.offset : { x: 0, y: 0 };
                const sizeRef: ResultImageSizeSpecifier =
                    jsonElement.sizeRef !== undefined
                        ? jsonElement.sizeRef
                        : ResultImageSizeSpecifier.Bigger;
                return new CombineImages(imageDst, blendOperation, sizeRef, offset);
            }

        default:
            throw new Error("Unrecognized processing step: " + jsonElement.name);
    }
}

function getBlendOperationByName(blendModeName: string): BlendOperation {
    const blendOperations: Map<string, BlendOperation> = new Map([
        ["BlendAlpha", BlendAlpha],
        ["BlendAlphaPremultiplied", BlendAlphaPremultiplied],
        ["BlendMultiply", BlendMultiply],
        ["BlendMultiplyRGB", BlendMultiplyRGB],
        ["BlendOverlay", BlendOverlay],
        ["BlendScreen", BlendScreen]
    ]);

    const blendOp: BlendOperation | undefined = blendOperations.get(blendModeName);
    if (blendOp === undefined) {
        throw new Error("Undefined blend operation: " + blendModeName);
    }
    return blendOp;
}

function getInputFilesSync(inputPath: string, logger: Logger) {
    const inputDir = path.dirname(inputPath);
    // Parse list of input files.
    let inputFiles: string[];
    try {
        logger.log(LogLevel.DEBUG, `\nReading input files in: '${inputDir}' ...`);
        inputFiles = FileSystem.listFilesSync(inputPath);
        if (inputFiles.length > 0) {
            logger.log(LogLevel.DEBUG, inputFiles);
        } else {
            logger.log(LogLevel.ERROR, "No input files found.");
            throw new Error("No input files found!");
        }
    } catch (error) {
        logger.log(
            LogLevel.ERROR,
            `Could not locate files at input path: '${inputPath}'. (${error})`
        );
        throw new Error(`Could not locate files at input path: '${inputPath}'. (${error})`);
    }
    return inputFiles;
}

function createOutDirSync(outputDir: string, logger: Logger): string {
    // Prepare output directory for post-processed images.
    try {
        logger.log(LogLevel.DEBUG, `Creating output directory: '${outputDir}' ...`);
        FileSystem.createDirSync(outputDir);
    } catch (error) {
        logger.log(LogLevel.ERROR, `Creating path '${outputDir}' failed. (${error})`);
        throw new Error(`Creating path '${outputDir}' failed. (${error})`);
    }
    return outputDir;
}

function createTempDirSync(outputDir: string, logger: Logger): string {
    // Prepare temporary directory for post-processed output.
    const tempOutputDir: string = path.join(outputDir, "temp");
    try {
        logger.log(LogLevel.DEBUG, `Creating temporary directory: '${tempOutputDir}' ...`);
        FileSystem.createDirSync(tempOutputDir);
    } catch (error) {
        logger.log(LogLevel.ERROR, `Creating path '${tempOutputDir}' failed. (${error})`);
        throw new Error(`Creating path '${tempOutputDir}' failed. (${error})`);
    }
    return tempOutputDir;
}

function removeTempDirSync(tempDir: string, logger: Logger) {
    // Remove entire directory, also deleting files inside - forcefully.
    logger.log(LogLevel.DEBUG, `Cleaning temporary output: '${tempDir}' ...`);
    FileSystem.removeDirSync(tempDir, true);
}
