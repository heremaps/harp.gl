/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { MipMapGenerator } from "./MipMapGenerator";

/** Any type supported by WebGLRenderingContext.texImage2D() for texture creation */
export type TexturizableImage =
    | HTMLImageElement
    | HTMLCanvasElement
    | HTMLVideoElement
    | ImageData
    | ImageBitmap;

/**
 * `ImageItem` is used to identify an image in the {@link ImageCache}.
 */
export interface ImageItem {
    /** URL of the image, or unique identifier. */
    url: string;
    image?: TexturizableImage;
    /** Mip maps for image data */
    mipMaps?: ImageData[];
    /** Turns to `true` when the data has finished loading. */
    loaded: boolean;
    /** Turns to `true` if the loading has been cancelled. */
    cancelled?: boolean;
    /** `loadingPromise` is only used during loading/generating the image. */
    loadingPromise?: Promise<ImageItem | undefined>;
}

export namespace ImageItem {
    /**
     * Missing Typedoc
     */
    export function isLoading(imageItem: ImageItem): boolean {
        return imageItem.loadingPromise !== undefined;
    }
}

const logger = LoggerManager.instance.create("loadImage");
const mipMapGenerator = new MipMapGenerator();

/**
 * Load an {@link ImageItem}.
 *
 * @remarks
 * If the loading process is already running, it returns the current promise.
 *
 * @param imageItem - `ImageItem` containing the URL to load image from.
 * @returns An {@link ImageItem} if the image has already been loaded, a promise otherwise.
 */
export function loadImage(imageItem: ImageItem): ImageItem | Promise<ImageItem | undefined> {
    const finalizeImage = (image: TexturizableImage, resolve: (item: ImageItem) => void) => {
        imageItem.image = image;
        imageItem.mipMaps = mipMapGenerator.generateTextureAtlasMipMap(imageItem);
        imageItem.loadingPromise = undefined;
        imageItem.loaded = true;
        resolve(imageItem);
    };

    if (imageItem.loaded) {
        return imageItem;
    }

    if (imageItem.loadingPromise !== undefined) {
        return imageItem.loadingPromise;
    }

    imageItem.loadingPromise = new Promise((resolve, reject) => {
        if (imageItem.image) {
            const image = imageItem.image;
            if (image instanceof HTMLImageElement && !image.complete) {
                image.addEventListener("load", finalizeImage.bind(undefined, image, resolve));
                image.addEventListener("error", reject);
            } else {
                finalizeImage(imageItem.image, resolve);
            }
            return;
        }

        logger.debug(`Loading image: ${imageItem.url}`);
        if (imageItem.cancelled === true) {
            logger.debug(`Cancelled loading image: ${imageItem.url}`);
            resolve(undefined);
        } else {
            new THREE.ImageLoader().load(
                imageItem.url,
                (image: HTMLImageElement) => {
                    if (imageItem.cancelled === true) {
                        logger.debug(`Cancelled loading image: ${imageItem.url}`);
                        resolve(undefined);
                        return;
                    }

                    finalizeImage(image, resolve);
                },
                undefined,
                errorEvent => {
                    logger.error(`... loading image failed: ${imageItem.url} : ${errorEvent}`);

                    imageItem.loadingPromise = undefined;
                    reject(`... loading image failed: ${imageItem.url} : ${errorEvent}`);
                }
            );
        }
    });

    return imageItem.loadingPromise;
}
