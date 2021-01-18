/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { TestOptions } from "./RenderingTestHelper";

declare const require: any;
const pixelmatch = require("pixelmatch");

const logger = LoggerManager.instance.create("DomImageUtils");

/**
 * Create a HTML <img> element from either `ImageData`, `ImageBitmap` or just source URL.
 */
export function createImgElement(data: ImageData | ImageBitmap | string) {
    const img = document.createElement("img");
    if (typeof data === "string") {
        img.src = data;
    } else {
        const canvas = document.createElement("canvas");
        canvas.width = data.width;
        canvas.height = data.height;

        const context = canvas.getContext("2d");
        if (context === null) {
            throw new Error("#createImg: unable to obtain 2d context from canvas");
        }
        if (data instanceof ImageData) {
            context.putImageData(data, 0, 0);
        } else {
            context.drawImage(data, 0, 0);
        }
        img.src = canvas.toDataURL();
    }
    return img;
}

/**
 * Captures raw image from canvas with fallback for 'webgl' canvases, for which '2d' context cannot
 * be obtained as they have `webgl` context already attached.
 *
 * Note, on MS Edge it requires this polyfill: https://github.com/blueimp/JavaScript-Canvas-to-Blob
 */
export async function canvasToImageData(canvas: HTMLCanvasElement): Promise<ImageData> {
    const context = canvas.getContext("2d");
    if (context === null) {
        // if webgl context was already obtained, 2d returns null
        // hackaround with canvas.toBlob()
        return await new Promise<ImageData>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob === null) {
                    reject(new Error("#canvasToImageData: unable to capture image from canvas"));
                    return;
                }
                const url = URL.createObjectURL(blob);
                resolve(loadImageData(url));
            });
        });
    } else {
        return context.getImageData(0, 0, canvas.width, canvas.height);
    }
}

/**
 * Returns image which can be used in another canvas or html element.
 */
export function imageDataToDataUrl(image: ImageData) {
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = image.width;
    tmpCanvas.height = image.height;
    const context = tmpCanvas.getContext("2d")!;
    context.putImageData(image, 0, 0);

    return tmpCanvas.toDataURL();
}

/**
 * Load image from URL as `ImageData` so it can be easily compared by image comparision libraries.
 */
export function loadImageData(url: string): Promise<ImageData> {
    return new Promise<ImageData>((resolve, reject) => {
        new THREE.ImageLoader().load(
            url,
            image => {
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;

                const context = canvas.getContext("2d");
                if (context === null) {
                    reject(new Error("#loadImageData: unable to create 2d context out of canvas"));
                    return;
                }
                context.drawImage(
                    image,
                    0,
                    0,
                    image.width,
                    image.height,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
                const imageData = context.getImageData(0, 0, image.width, image.height);
                resolve(imageData);
            },
            undefined, // onProgress
            errorEvent => {
                logger.error(`#loadImageData: failed to load image from ${url}`, errorEvent);
                reject(new Error(`#loadImageData failed to load image from ${url}`));
            }
        );
    });
}

/**
 * Compare two images with specified threshold and returns json with comparison result.
 */
export function compareImages(
    actualImage: ImageData,
    referenceImage: ImageData,
    options: TestOptions
) {
    const { width, height } = actualImage;

    const diffCanvas = document.createElement("canvas");
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffContext = diffCanvas.getContext("2d")!;
    const diffData = diffContext.createImageData(width, height);

    const mismatchedPixels = pixelmatch(
        referenceImage.data,
        actualImage.data,
        diffData.data,
        width,
        height,
        { threshold: options.threshold }
    );
    return {
        mismatchedPixels,
        diffImage: diffData
    };
}

export async function waitImageLoaded(img: HTMLImageElement): Promise<void> {
    if (img.complete) {
        return;
    }

    if (img.naturalWidth !== 0) {
        return;
    }

    return await new Promise((resolve, reject) => {
        const cleanup = () => {
            img.removeEventListener("load", onLoaded);
            img.removeEventListener("error", onError);
        };
        const onLoaded = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("#imageDataFromImage: failed to load image"));
        };
        img.addEventListener("load", onLoaded);
        img.addEventListener("error", onError);
    });
}

export async function imageDataFromImage(img: HTMLImageElement): Promise<ImageData> {
    await waitImageLoaded(img);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
