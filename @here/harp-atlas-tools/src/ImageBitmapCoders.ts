/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Jimp from "jimp";

import { ColorUtils } from "./ColorUtils";
import { FileSystem, ImageFormat } from "./FileSystem";
import {
    Color,
    ImageDecoder,
    ImageDecoderConstructor,
    ImageEncoder,
    ImageEncoderConstructor
} from "./ImageFactory";

export class ImageBitmapDecoderConstructor implements ImageDecoderConstructor {
    load(filePath: string): Promise<ImageDecoder> {
        return Jimp.read(filePath).then((loadedImage: Jimp) => {
            return new ImageBitmapDecoder(loadedImage);
        });
    }
}

export class ImageBitmapEncoderConstructor implements ImageEncoderConstructor {
    // Auxillary function not defined in interface
    static clone(image: Jimp.Jimp): ImageEncoder {
        return new ImageBitmapEncoder(image.clone());
    }

    // Auxillary function
    static create(image: Jimp.Jimp): ImageEncoder {
        return new ImageBitmapEncoder(image);
    }

    create(width: number, height: number): Promise<ImageEncoder> {
        return new Promise((resolve, reject) => {
            Jimp(width, height, (error, image) => {
                if (error) {
                    reject(new Error(error.message));
                } else {
                    resolve(new ImageBitmapEncoder(image));
                }
            });
        });
    }
}

/**
 * Bitmap based image encoder (mutable) with support for multiple bitmap formats.
 *
 * Allows to access and change pixel colors, resize image (bicubic interpolation) as also
 * save image in different (but still raster) format.
 * Supported formats are: JPEG, PNG, BMP, TIFF, GIF.
 */
class ImageBitmapEncoder implements ImageEncoder {
    readonly width: number;
    readonly height: number;
    private readonly m_image: Jimp.Jimp;

    constructor(image: Jimp.Jimp) {
        this.m_image = image;
        this.width = image.bitmap.width;
        this.height = image.bitmap.height;
    }

    setPixelAt(x: number, y: number, color: Color): void {
        if (x >= this.width && y >= this.height) {
            throw new Error(`Access to pixel outside the image boundary!`);
        }
        try {
            this.m_image.setPixelColor(
                Jimp.rgbaToInt(color.r, color.g, color.b, color.a),
                x,
                y,
                (err: Error | null, image: Jimp) => {
                    if (err) {
                        throw new Error(`Can not convert pixel value:
                            ${JSON.stringify(color)}!`);
                    }
                }
            );
        } catch (err) {
            // Jimp does not throw standarized errors so we need to handle it here.
            throw new Error(`Can not write pixel value:
                ${JSON.stringify(color)}!`);
        }
    }

    getPixelAt(x: number, y: number): Color {
        if (x < this.width && y < this.height) {
            return getJimpPixelAt(this.m_image, x, y);
        } else {
            throw new Error(`Access to pixel outside the image boundary!`);
        }
    }

    copy(): ImageEncoder {
        return ImageBitmapEncoderConstructor.clone(this.m_image);
    }

    resize(width: number, height: number): ImageEncoder {
        return new ImageBitmapEncoder(
            this.m_image.clone().resize(width, height, Jimp.RESIZE_BICUBIC)
        );
    }

    /**
     * Write image to file asynchronously.
     * The image can be written to disk in PNG, JPEG or BMP format (based on the file extension)
     * or if no extension is provided the original image's MIME type which, if not available,
     * defaults to PNG).
     *
     * @param filePath - file storage path.
     * @returns Promise.
     */
    write(filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!checkExportPath(filePath)) {
                reject(
                    new Error(
                        "Failed to write and image: " +
                            filePath +
                            " only BMP, PNG, JPG formats are supported"
                    )
                );
            } else {
                this.m_image.write(filePath, (err, image) => {
                    if (err) {
                        reject(new Error("Failed to write and image: " + filePath));
                    } else {
                        resolve();
                    }
                });
            }
        });
    }
}

/**
 * Bitmap based imaged decoder (inmutable) with support for multiple image formats.
 *
 * Supported formats are: JPEG, PNG, BMP, TIFF, GIF.
 */
class ImageBitmapDecoder implements ImageDecoder {
    readonly width: number;
    readonly height: number;
    private readonly m_image: Jimp.Jimp;

    constructor(image: Jimp.Jimp) {
        this.m_image = image;
        this.width = image.bitmap.width;
        this.height = image.bitmap.height;
    }

    getPixelAt(x: number, y: number): Color {
        if (x < this.width && y < this.height) {
            return getJimpPixelAt(this.m_image, x, y);
        } else {
            throw new Error("Access to pixel outside the image boundary!");
        }
    }

    copy(): ImageEncoder {
        return ImageBitmapEncoderConstructor.clone(this.m_image);
    }
}

function getJimpPixelAt(image: Jimp.Jimp, x: number, y: number): Color {
    // Interface function Jimp.intToRgba is not properly implemented in Jimp,
    // because JS object prototype exposes intToRGBA method insted.
    const value: number = image.getPixelColor(x, y);
    const rgba: Color = {
        r: ColorUtils.red(value),
        g: ColorUtils.green(value),
        b: ColorUtils.blue(value),
        a: ColorUtils.alpha(value)
    };
    return rgba;
}

function checkExportPath(filePath: string): boolean {
    if (FileSystem.getFileExtension(filePath).length === 0) {
        return false;
    }
    const imageFormat: ImageFormat = FileSystem.getImageFormat(filePath);
    switch (imageFormat) {
        case ImageFormat.BMP:
        case ImageFormat.PNG:
        case ImageFormat.JPG:
            return true;
        default:
            return false;
    }
}
