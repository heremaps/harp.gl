/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Math2D, MathUtils } from "@here/harp-utils";

/**
 * It returns an array containing the channel colors for the pixel at the given coordinates.
 *
 * @param xPos - X value of the pixel.
 * @param yPos - Y value of the pixel.
 * @param image - The image source.
 * @param canvas - Canvas element that will be used to draw the image, in case the imageData is an
 * ImageBitmap
 */
export function getPixelFromImage(
    xPos: number,
    yPos: number,
    image: CanvasImageSource | ImageData,
    canvas?: HTMLCanvasElement
): Uint8ClampedArray | undefined {
    if (image instanceof ImageData) {
        const stride = image.data.length / (image.height * image.width);
        return getPixelFromImageData(image, xPos, yPos, stride);
    }

    if (!canvas) {
        canvas = document.createElement("canvas");
    }
    return getPixelFromCanvasImageSource(image, xPos, yPos, canvas);
}

/**
 * Given the x and y position in screen coordinates inside the target box, it map them to the UV
 * coordinates.
 * @param screenX - X value in screen coordinates.
 * @param screenY - Y value in screen coordinates.
 * @param box - Bounding box in screen coordinates.
 * @param uvBox - Uv box referred to the given bounding box.
 */
export function screenToUvCoordinates(
    screenX: number,
    screenY: number,
    box: Math2D.Box,
    uvBox: Math2D.UvBox
): { u: number; v: number } {
    const minX = box.x;
    const maxX = box.x + box.w;
    const minY = box.y;
    const maxY = box.y + box.h;
    const u = MathUtils.map(screenX, minX, maxX, uvBox.s0, uvBox.s1);
    const v = MathUtils.map(screenY, minY, maxY, uvBox.t0, uvBox.t1);

    return { u, v };
}

/**
 * It returns an Uint8ClampedArray containing the color channel values for the given pixel
 * coordinates. It returns undefined if the given coordinates are out of range.
 *
 * @param image - Image source.
 * @param xPos - X value of the pixel.
 * @param yPos - Y value of the pixel.
 * @param canvas - HTML Canvas element on which the image is drawn.
 */
export function getPixelFromCanvasImageSource(
    image: CanvasImageSource,
    xPos: number,
    yPos: number,
    canvas: HTMLCanvasElement
): Uint8ClampedArray | undefined {
    const { width, height } = image instanceof SVGImageElement ? image.getBBox() : image;

    if (xPos > width || xPos < 0 || yPos > height || yPos < 0) {
        return undefined;
    }

    let pixelData;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (context !== null) {
        context.drawImage(image, 0, 0);
        pixelData = context.getImageData(xPos, yPos, 1, 1).data;
    }
    return pixelData;
}

/**
 * It returns an Uint8ClampedArray containing the color channel values for the given pixel
 * coordinates. It returns undefined if the given coordinates are out of range.
 *
 * @param image - Image data in which the pixels are stored.
 * @param xPos - X value of the pixel.
 * @param yPos - Y value of the pixel.
 * @param stride - The stride value of the image data.
 */
export function getPixelFromImageData(
    imgData: ImageData,
    xPos: number,
    yPos: number,
    stride: number
): Uint8ClampedArray | undefined {
    const getPixel = (imageData: ImageData, index: number, strd: number) => {
        const i = index * strd;
        const d = imageData.data;
        const pixel = new Uint8ClampedArray(strd);
        for (let s = 0; s < strd; s++) {
            pixel[0] = d[i + s];
        }
        return pixel;
    };
    if (xPos > imgData.width || xPos < 0 || yPos > imgData.height || yPos < 0) {
        return undefined;
    }
    return getPixel(imgData, yPos * imgData.width + xPos, stride);
}
