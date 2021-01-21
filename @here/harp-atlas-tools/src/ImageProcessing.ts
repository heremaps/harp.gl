/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlendAlpha, BlendMultiplyRGB, BlendOperation } from "./BlendOperations";
import {
    ColorGrayscaleAverage,
    ColorGrayscaleLightness,
    ColorGrayscaleLuminosity,
    ColorInvert
} from "./ColorOperations";
import { Color, ImageDecoder, ImageEncoder } from "./ImageFactory";
import { ImageUtils, ResultImageSizeSpecifier } from "./ImageUtils";
import { MaskAlpha } from "./MaskOperations";

export interface ImageProcessor {
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder;
}

export class InvertColor implements ImageProcessor {
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        return ImageUtils.processImageColor(srcImage, ColorInvert);
    }
}

export enum GrayscaleMethod {
    Lighness = "Lighness",
    Average = "Average",
    Luminosity = "Luminosity"
}

export class Grayscale implements ImageProcessor {
    constructor(private readonly method: GrayscaleMethod = GrayscaleMethod.Luminosity) {}
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        switch (this.method) {
            case GrayscaleMethod.Lighness:
                return ImageUtils.processImageColor(srcImage, ColorGrayscaleLightness);
            case GrayscaleMethod.Average:
                return ImageUtils.processImageColor(srcImage, ColorGrayscaleAverage);
            case GrayscaleMethod.Luminosity:
                return ImageUtils.processImageColor(srcImage, ColorGrayscaleLuminosity);
            default:
                throw new Error("Unrecognized grayscale method!");
        }
    }
}

export class Colorize implements ImageProcessor {
    constructor(readonly color: Color) {}
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        // Firstly convert image to grayscale using most common Luminosity method.
        let resultImage: ImageEncoder = ImageUtils.processImageColor(
            srcImage,
            ColorGrayscaleLuminosity
        );
        // Blend multiply luminosity values by desired color.
        resultImage = ImageUtils.blendImageColor(resultImage, BlendMultiplyRGB, this.color);
        return resultImage;
    }
}

export interface Offset {
    readonly x: number;
    readonly y: number;
}

export class BlendImages implements ImageProcessor {
    constructor(
        readonly dstImage: ImageDecoder,
        readonly blendOperation: BlendOperation,
        readonly offset: Offset = { x: 0, y: 0 }
    ) {}

    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        // TODO: Not all blending modes has been yet tested
        return ImageUtils.blendImages(
            this.dstImage,
            srcImage,
            this.blendOperation,
            this.offset.x,
            this.offset.y
        );
    }
}

export class CombineImages implements ImageProcessor {
    constructor(
        readonly dstImage: ImageDecoder,
        readonly blendOperation: BlendOperation,
        readonly sizeRef: ResultImageSizeSpecifier = ResultImageSizeSpecifier.Dst,
        readonly offset: Offset = { x: 0, y: 0 }
    ) {}

    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        return ImageUtils.combineImages(
            this.dstImage,
            srcImage,
            this.blendOperation,
            this.sizeRef,
            this.offset.x,
            this.offset.y
        );
    }
}

export class MaskImage implements ImageProcessor {
    constructor(readonly maskImage: ImageDecoder, readonly offset: Offset = { x: 0, y: 0 }) {}
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        return ImageUtils.maskImage(
            srcImage,
            this.maskImage,
            MaskAlpha,
            this.offset.x,
            this.offset.y
        );
    }
}

export class AddBackground implements ImageProcessor {
    constructor(readonly background: ImageDecoder, readonly offset: Offset = { x: 0, y: 0 }) {}
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        return ImageUtils.combineImages(
            this.background,
            srcImage,
            BlendAlpha,
            ResultImageSizeSpecifier.Bigger,
            this.offset.x,
            this.offset.y
        );
    }
}

export class AddForeground implements ImageProcessor {
    constructor(readonly foreground: ImageDecoder, readonly offset: Offset = { x: 0, y: 0 }) {}
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        return ImageUtils.combineImages(
            srcImage,
            this.foreground,
            BlendAlpha,
            ResultImageSizeSpecifier.Bigger,
            this.offset.x,
            this.offset.y
        );
    }
}

export class Resize implements ImageProcessor {
    constructor(readonly width: number, readonly height: number) {}
    run(srcImage: ImageDecoder | ImageEncoder): ImageEncoder {
        // If image dimensions are the same as desired or both target dimensions are set to
        // zero just return copy of the image.
        if (
            (this.width === 0 && this.height === 0) ||
            (this.width === srcImage.width && this.height === srcImage.height)
        ) {
            return srcImage.copy();
        }
        // If one of the parameters is set to zero then calculate its value by
        // preserving original aspect ratio.
        const aspect: number = srcImage.width / srcImage.height;
        const w: number = this.width === 0 ? this.height * aspect : this.width;
        const h: number = this.height === 0 ? this.width / aspect : this.height;
        // If we deal with ImageEncoder directly simply resize
        if ("resize" in srcImage) {
            return srcImage.resize(w, h);
        }
        // Otherwise explicit copy is required
        else {
            return srcImage.copy().resize(w, h);
        }
    }
}
