/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Jimp from "jimp";
import * as sharp from "sharp";

import { ColorUtils } from "./ColorUtils";
import { FileSystem, ImageFormat } from "./FileSystem";
import { ImageBitmapEncoderConstructor } from "./ImageBitmapCoders";
import {
    Color,
    ImageDecoder,
    ImageDecoderConstructor,
    ImageEncoder,
    ImageEncoderConstructor
} from "./ImageFactory";

export class ImageVectorDecoderConstructor implements ImageDecoderConstructor {
    readonly targetWidth: number;
    readonly targetHeight: number;

    constructor(desiredWidth: number, desiredHeight: number) {
        this.targetWidth = desiredWidth;
        this.targetHeight = desiredHeight;
    }

    async load(filePath: string): Promise<ImageDecoder> {
        const fileBuffer: Buffer = await FileSystem.readFile(filePath);
        const resize = this.targetWidth !== 0 && this.targetHeight !== 0;
        const png = resize
            ? sharp(fileBuffer).resize({ width: this.targetWidth, height: this.targetHeight }).png()
            : sharp(fileBuffer).png();
        const bitmap: Jimp = await Jimp.read(await png.toBuffer());
        return new ImageVectorDecoder(fileBuffer, bitmap);
    }
}

export class ImageVectorEncoderConstructor implements ImageEncoderConstructor {
    create(width: number, height: number): Promise<ImageEncoder> {
        // We do not support writing to blank vector file so use bitmap encoder
        // instead as fallback support.
        const bitmapEncoderCtor = new ImageBitmapEncoderConstructor();
        return bitmapEncoderCtor.create(width, height);
    }
}

/**
 * Class that holds SVG vector data as also its bitmap exported (png) counterpart.
 * Allows to resize image by looseless conversion and change the pixel colors, but
 * this is irreversible operation that looses vector data quality, any operation
 * after pixel change will be performed on bitmap data only.
 * Image data may be stored before and after modifications, but only in the one
 * of raster formats (BMP, PNG, JPEG). It is impossible to recreate (save) SVG vector
 * file after pixel based modifications.
 */
class ImageVectorEncoder implements ImageEncoder {
    readonly width: number;
    readonly height: number;
    private readonly m_vectorData: Buffer;
    private readonly m_bitmap: Jimp.Jimp;
    private m_pixelModified: boolean;

    constructor(vectorData: Buffer, bitmap: Jimp.Jimp) {
        this.m_vectorData = vectorData;
        this.m_bitmap = bitmap;
        this.width = bitmap.bitmap.width;
        this.height = bitmap.bitmap.height;
        this.m_pixelModified = false;
    }

    getPixelAt(x: number, y: number): Color {
        if (x < this.width && y < this.height) {
            return getJimpPixelAt(this.m_bitmap, x, y);
        } else {
            throw new Error(
                "Access to pixel outside the declared boundaries," +
                    "you may resize vector graphics losselesly before modifing pixels!"
            );
        }
    }

    setPixelAt(x: number, y: number, color: Color): void {
        this.m_pixelModified = true;
        if (x < this.width && y < this.height) {
            try {
                this.m_bitmap.setPixelColor(
                    Jimp.rgbaToInt(color.r, color.g, color.b, color.a),
                    x,
                    y,
                    (err: Error | null, image: Jimp) => {
                        if (err) {
                            throw new Error("Can not write new pixel value!");
                        }
                    }
                );
            } catch (err) {
                // Jimp does not throw standarized errors so we need to handle it here.
                throw new Error("Can not write pixel value!");
            }
        } else {
            throw new Error("Access to pixel outside the image boundary!");
        }
    }

    copy(): ImageEncoder {
        // No need to keep vector data, we may expose bitmap encoder only.
        if (this.m_pixelModified) {
            return ImageBitmapEncoderConstructor.clone(this.m_bitmap);
        }
        // Recreate using bitmap and vector data, thus image may be still resized looselessly.
        else {
            return new ImageVectorEncoder(this.m_vectorData, this.m_bitmap.clone());
        }
    }

    resize(width: number, height: number): ImageEncoder {
        // Pixels has been modified, drop vector data and resize using bitmap encoder.
        if (this.m_pixelModified) {
            return ImageBitmapEncoderConstructor.create(this.m_bitmap).resize(width, height);
        }
        // Pixels not modified yet re-convert vector data to bitmap using new size.
        else {
            const bitmapResized: Jimp.Jimp = this.m_bitmap.clone().resize(width, height);
            return new ImageVectorEncoder(this.m_vectorData, bitmapResized);
        }
    }

    /**
     * Write image to file asynchronously.
     * The image can be written to disk in SVG (if not changed) or PNG, JPEG and BMP format
     * (based on the file extension provided) or if no extension is provided the PNG image
     * format is used.
     *
     * @param filePath - file storage path.
     */
    write(filePath: string): Promise<any> {
        if (!this.m_pixelModified && FileSystem.getImageFormat(filePath) === ImageFormat.SVG) {
            return FileSystem.writeFile(filePath, this.m_vectorData);
        } else {
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
                    this.m_bitmap.write(filePath, (err, image) => {
                        if (err) {
                            reject(new Error("Failed to write and image: " + filePath));
                        } else {
                            resolve(undefined);
                        }
                    });
                }
            });
        }
    }
}

/**
 * Holds SVG vector data as also its bitmap exported (png) counterpart.
 * Allows to read pixels from declared (bitmap based c-tor) region and create
 * an copy to muttable encoder which allows further modifications.
 */
class ImageVectorDecoder implements ImageDecoder {
    readonly width: number;
    readonly height: number;
    private readonly m_vectorData: Buffer;
    private readonly m_bitmap: Jimp.Jimp;

    constructor(vectorData: Buffer, bitmap: Jimp.Jimp) {
        this.m_vectorData = vectorData;
        this.m_bitmap = bitmap;
        this.width = bitmap.bitmap.width;
        this.height = bitmap.bitmap.height;
    }

    getPixelAt(x: number, y: number): Color {
        if (x < this.width && y < this.height) {
            return getJimpPixelAt(this.m_bitmap, x, y);
        } else {
            throw new Error(
                "Access to pixel outside the declared boundaries," +
                    "you may resize vector graphics using encoder!"
            );
        }
    }

    copy(): ImageEncoder {
        return new ImageVectorEncoder(this.m_vectorData, this.m_bitmap.clone());
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
