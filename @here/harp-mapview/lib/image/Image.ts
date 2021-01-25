/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
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

const logger = LoggerManager.instance.create("loadImage");
const mipMapGenerator = new MipMapGenerator();

/**
 * `ImageItem` is used to identify an image in the {@link ImageCache}.
 */
export class ImageItem {
    /** Mip maps for image data */
    mipMaps?: ImageData[];
    /** Turns to `true` if the loading has been cancelled. */
    cancelled?: boolean;
    /** `loadingPromise` is only used during loading/generating the image. */
    private loadingPromise?: Promise<ImageItem | undefined>;

    /**
     * Create the `ImageItem`.
     *
     * @param url - URL of the image, or unique identifier.
     * @param image - Optional image if already loaded.
     */
    constructor(readonly url: string, public image?: TexturizableImage) {}

    get loaded(): boolean {
        return this.image !== undefined && this.mipMaps !== undefined;
    }

    get loading(): boolean {
        return this.loadingPromise !== undefined;
    }

    /**
     * Load an {@link ImageItem}.
     *
     * @remarks
     * If the loading process is already running, it returns the current promise.
     *
     * @param imageItem - `ImageItem` containing the URL to load image from.
     * @returns An {@link ImageItem} if the image has already been loaded, a promise otherwise.
     */
    loadImage(): Promise<ImageItem | undefined> {
        if (this.loaded) {
            return Promise.resolve(this);
        }

        if (this.loading) {
            return this.loadingPromise!;
        }

        this.loadingPromise = new Promise((resolve, reject) => {
            if (this.image) {
                const image = this.image;
                if (image instanceof HTMLImageElement && !image.complete) {
                    image.addEventListener("load", this.finalizeImage.bind(this, image, resolve));
                    image.addEventListener("error", reject);
                } else {
                    this.finalizeImage(this.image, resolve);
                }
                return;
            }

            logger.debug(`Loading image: ${this.url}`);
            if (this.cancelled === true) {
                logger.debug(`Cancelled loading image: ${this.url}`);
                resolve(undefined);
            } else {
                new THREE.ImageLoader().load(
                    this.url,
                    (image: HTMLImageElement) => {
                        if (this.cancelled === true) {
                            logger.debug(`Cancelled loading image: ${this.url}`);
                            resolve(undefined);
                            return;
                        }

                        this.finalizeImage(image, resolve);
                    },
                    undefined,
                    errorEvent => {
                        logger.error(`... loading image failed: ${this.url} : ${errorEvent}`);

                        this.loadingPromise = undefined;
                        reject(`... loading image failed: ${this.url} : ${errorEvent}`);
                    }
                );
            }
        });

        return this.loadingPromise;
    }

    private finalizeImage(image: TexturizableImage, resolve: (item: ImageItem) => void) {
        this.image = image;
        this.mipMaps = mipMapGenerator.generateTextureAtlasMipMap(this);
        this.loadingPromise = undefined;
        resolve(this);
    }
}
