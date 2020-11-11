/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { ImageItem, TexturizableImage } from "./Image";

const isNode = typeof window === "undefined";

/**
 * Mip map generator resizes textures to next bigger power-of-two size by adding padding
 * and creates mip map levels.
 * @internal
 */
export class MipMapGenerator {
    /**
     * Gets size of an image padded to the next bigger power-of-two size
     * @param width - Width of image
     * @param height - Height of image
     */
    static getPaddedSize(width: number, height: number): { width: number; height: number } {
        return {
            width: THREE.MathUtils.ceilPowerOfTwo(width),
            height: THREE.MathUtils.ceilPowerOfTwo(height)
        };
    }

    private readonly m_paddingCanvas?: HTMLCanvasElement;
    private readonly m_paddingContext?: CanvasRenderingContext2D;
    private readonly m_resizeCanvas?: HTMLCanvasElement;
    private readonly m_resizeContext?: CanvasRenderingContext2D;

    constructor() {
        if (!isNode) {
            this.m_paddingCanvas = document.createElement("canvas");
            this.m_paddingContext = this.m_paddingCanvas.getContext("2d")!;
            this.m_resizeCanvas = document.createElement("canvas");
            this.m_resizeContext = this.m_resizeCanvas.getContext("2d")!;
        }
    }

    /**
     * Generate downsampled mip map levels from an image.
     * If the input image is not power-of-two the image is padded to the
     * next bigger power-of-two size.
     * @param image - Input image
     * @returns A list of images with mip maps of the input image
     */
    generateTextureAtlasMipMap(image: ImageItem): ImageData[] {
        if (isNode) {
            throw new Error("MipMapGenerator only works in browser.");
        }

        if (image.image === undefined) {
            throw new Error("Can not generate mip maps. Image data not loaded!");
        }
        const imageData = image.image;
        const mipMaps: ImageData[] = [];

        // Add initial texture with padding as level 0
        const { width: paddedWidth, height: paddedHeight } = MipMapGenerator.getPaddedSize(
            imageData.width,
            imageData.height
        );
        this.copyImageWithPadding(imageData, paddedWidth, paddedHeight);
        mipMaps.push(this.m_paddingContext!.getImageData(0, 0, paddedWidth, paddedHeight));

        let width = paddedWidth * 0.5;
        let height = paddedHeight * 0.5;
        // HARP-10765 WebGL complains if we don't generate down to a 1x1 texture (this was the case
        // previously when height != width), and thus the final texture generated was 2x1 texture
        // and not 1x1.
        while (width >= 1 || height >= 1) {
            const mipMapLevel = mipMaps.length;
            const previousImage = mipMaps[mipMapLevel - 1];
            // Resize previous mip map level
            mipMaps.push(this.resizeImage(previousImage, Math.max(width, 1), Math.max(height, 1)));
            width *= 0.5;
            height *= 0.5;
        }

        return mipMaps;
    }

    /**
     * Copy image to a canvas and add padding if necessary.
     * @param image - Input image.
     * @param width - Width of output image
     * @param height - Width of output image
     * @returns Canvas with image and padding.
     */
    private copyImageWithPadding(
        image: TexturizableImage,
        width: number,
        height: number
    ): HTMLCanvasElement {
        this.m_paddingCanvas!.width = width;
        this.m_paddingCanvas!.height = height;

        this.m_paddingContext!.clearRect(0, 0, width, height);
        if (image instanceof ImageData) {
            this.m_paddingContext!.putImageData(image, 0, 0);
        } else {
            this.m_paddingContext!.drawImage(image, 0, 0);
        }

        // Add horizontal padding
        if (image.width !== width) {
            this.m_paddingContext!.drawImage(
                this.m_paddingCanvas!,
                image.width - 1,
                0,
                1,
                image.height,
                image.width,
                0,
                width - image.width,
                image.height
            );
        }

        // Add vertical padding
        if (image.height !== height) {
            this.m_paddingContext!.drawImage(
                this.m_paddingCanvas!,
                0,
                image.height - 1,
                width,
                1,
                0,
                image.height,
                width,
                height - image.height
            );
        }

        return this.m_paddingCanvas!;
    }

    /**
     * Resize an image.
     *
     * Quality of resized image is best when
     * image.width and image.height are even numbers and the image
     * is resized by factor 0.5 or 2.
     * @param image - Input image
     * @param width - Width of output image
     * @param height - Height of output image
     * @return Resized image
     */
    private resizeImage(image: ImageData, width: number, height: number): ImageData {
        //  Copy image data to canvas because ImageData can't be resized directly
        const paddedImage = this.copyImageWithPadding(image, image.width, image.height);

        // Resize image to resize canvas
        this.m_resizeCanvas!.width = width;
        this.m_resizeCanvas!.height = height;
        this.m_resizeContext!.clearRect(0, 0, width, height);
        this.m_resizeContext!.drawImage(paddedImage, 0, 0, width, height);

        return this.m_resizeContext!.getImageData(0, 0, width, height);
    }
}
