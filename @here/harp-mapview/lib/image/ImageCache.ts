/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { ImageItem, TexturizableImage } from "./Image";
import { MipMapGenerator } from "./MipMapGenerator";

const logger = LoggerManager.instance.create("ImageCache");
const mipMapGenerator = new MipMapGenerator();

/**
 * Combines an {@link ImageItem} with a list of owners (which can be any object) that reference it.
 */
class ImageCacheItem {
    /**
     * The list of owners referencing the {@link ImageItem}.
     */
    owners: any[] = [];

    /**
     * Instantiates `ImageCacheItem`.
     *
     * @param imageItem - The {@link ImageItem} referenced by the associated owners.
     * @param owner - An optional first owner referencing the {@link ImageItem}.
     */
    constructor(public imageItem: ImageItem, owner?: any) {
        if (owner !== undefined) {
            this.owners.push(owner);
        }
    }
}

/**
 * @internal
 *
 * `ImageCache` is a singleton, so it can be used with multiple owners on a single page.
 *
 * @remarks
 * This allows to have an image loaded only once for multiple views.
 * THREE is doing something similar,
 * but does not allow to share images that have been loaded from a canvas (which we may need to do
 * if we use SVG images for textures).
 *
 * One application that makes our own cache necessary is the generation of our own textures from
 * data that is not an URL.
 *
 * The `ImageCache` can be improved by adding statistics for memory footprint as well.
 */
export class ImageCache {
    /**
     * Returns the singleton `instance` of the `ImageCache`.
     */
    static get instance(): ImageCache {
        if (ImageCache.m_instance === undefined) {
            ImageCache.m_instance = new ImageCache();
        }
        return ImageCache.m_instance;
    }

    /**
     * Dispose the singleton object.
     *
     * @remarks
     * Not normally implemented for singletons, but good for debugging.
     */
    static dispose(): void {
        ImageCache.m_instance = undefined;
    }

    private static m_instance: ImageCache | undefined;

    private readonly m_images: Map<string, ImageCacheItem> = new Map();

    /**
     * Add an image definition to the global cache. Useful when the image data is already loaded.
     *
     * @param owner - Specify which {@link any} requests the image.
     * @param url - URL of image.
     * @param image - Optional {@link TexturizableImage}.
     */
    registerImage(owner: any, url: string, image?: TexturizableImage): ImageItem {
        let imageCacheItem = this.findImageCacheItem(url);
        if (imageCacheItem) {
            if (owner !== undefined && !imageCacheItem.owners.includes(owner)) {
                imageCacheItem.owners.push(owner);
            }
            return imageCacheItem.imageItem;
        }

        imageCacheItem = {
            imageItem: {
                url,
                image,
                loaded: image !== undefined
            },
            owners: [owner]
        };

        this.m_images.set(url, imageCacheItem);

        return imageCacheItem.imageItem;
    }

    /**
     * Remove an image from the cache..
     *
     * @param url - URL of the image.
     * @param owner - Optional: Specify {@link any} removing the image.
     * @returns `true` if image has been removed.
     */
    removeImage(url: string, owner?: any): boolean {
        const cacheItem = this.m_images.get(url);
        if (cacheItem !== undefined) {
            this.unlinkCacheItem(cacheItem, owner);
            return true;
        }
        return false;
    }

    /**
     * Find {@link ImageItem} for the specified URL.
     *
     * @param url - URL of image.
     * @returns `ImageItem` for the URL if the URL is registered, `undefined` otherwise.
     */
    findImage(url: string): ImageItem | undefined {
        const cacheItem = this.m_images.get(url);
        if (cacheItem !== undefined) {
            return cacheItem.imageItem;
        }
        return undefined;
    }

    /**
     * Clear all {@link ImageItem}s belonging to an owner.
     *
     * @remarks
     * May remove cached items if no owner is registered anymore.
     *
     * @param owner - specify to remove all items registered by {@link any}.
     * @returns Number of images removed.
     */
    clear(owner: any) {
        this.m_images.forEach(cacheItem => {
            this.unlinkCacheItem(cacheItem, owner);
        });
    }

    /**
     * Returns the number of all cached {@link ImageItem}s.
     */
    get size(): number {
        return this.m_images.size;
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
    loadImage(imageItem: ImageItem): ImageItem | Promise<ImageItem | undefined> {
        if (imageItem.image !== undefined) {
            return imageItem;
        }

        if (imageItem.loadingPromise !== undefined) {
            return imageItem.loadingPromise;
        }

        imageItem.loadingPromise = new Promise((resolve, reject) => {
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
                        } else {
                            imageItem.image = image;
                            imageItem.mipMaps = mipMapGenerator.generateTextureAtlasMipMap(
                                imageItem
                            );
                            imageItem.loadingPromise = undefined;
                            imageItem.loaded = true;
                            resolve(imageItem);
                        }
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

    /**
     * Find the cached {@link ImageItem} by URL.
     *
     * @param url - URL of image.
     */
    private findImageCacheItem(url: string): ImageCacheItem | undefined {
        return this.m_images.get(url);
    }

    /**
     * Cancel loading an image.
     *
     * @param imageItem - Item to cancel loading.
     */
    private cancelLoading(imageItem: ImageItem) {
        if (imageItem.loadingPromise !== undefined) {
            // Notify that we are cancelling.
            imageItem.cancelled = true;
        }
    }

    /**
     * Remove the cacheItem from cache, unless the item is used by another owner, in that case the
     * link to the owner is removed from the item, just like a reference count.
     *
     * @param cacheItem The cache item to be removed.
     * @param owner - Optional: Specify which owner ({@link any}) removes the image.
     * If no owner is specified, the cache item is removed even if it has owners.
     */
    private unlinkCacheItem(cacheItem: ImageCacheItem, owner?: any) {
        if (owner) {
            const ownerIndex = cacheItem.owners.indexOf(owner);
            if (ownerIndex >= 0) {
                cacheItem.owners.splice(ownerIndex, 1);
            }
            if (cacheItem.owners.length > 0) {
                // Do not delete the item, it is still used.
                return;
            }
        }

        this.m_images.delete(cacheItem.imageItem.url);
        this.cancelLoading(cacheItem.imageItem);
    }
}
