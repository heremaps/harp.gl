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
 * Interface for classes that access the shared {@link ImageCache} and need to be informed when an
 * image is removed from the cache. It also acts as a reference for the cache. For most operations,
 * an image will not be removed from the cache as long as there is at least one owner left for that
 * image.
 */
export interface ImageCacheOwner {
    /**
     * Notify the owner that an image has been removed either by the owner itself, or by another
     * owner.
     *
     * @param url - The URL of the image which is used as the key to the cache.
     */
    imageRemoved(url: string): void;
}

/**
 * Combines an {@link ImageItem} with a list of owners (which can be any object) that reference it.
 */
class ImageCacheItem {
    /**
     * The list of owners referencing the {@link ImageItem}. The owners are implementers of
     * {@link ImageCacheOwner} which are notified if the cache item has been removed from the
     * cache.
     */
    owners: ImageCacheOwner[] = [];

    /**
     * Instantiates `ImageCacheItem`.
     *
     * @param imageItem - The {@link ImageItem} referenced by the associated owners.
     * @param owner - An optional first owner referencing the {@link ImageItem}.
     */
    constructor(public imageItem: ImageItem, owner?: ImageCacheOwner) {
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

    private m_images: Map<string, ImageCacheItem> = new Map();

    /**
     * Add an image definition to the global cache. Useful when the image data is already loaded.
     *
     * @param owner - Specify which {@link ImageCacheOwner} requests the image.
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
     * @param owner - Optional: Specify {@link ImageCacheOwner} removing the image.
     * @returns `true` if image has been removed.
     */
    removeImage(url: string, owner?: ImageCacheOwner): boolean {
        const cacheItem = this.m_images.get(url);
        if (cacheItem !== undefined) {
            this.unlinkCacheItem(cacheItem, owner);
            return true;
        }
        return false;
    }

    /**
     * Remove an image from the cache.
     *
     * @param imageItem - Item identifying the image.
     * @param owner - Optional: Specify {@link ImageCacheOwner} removing the image.
     * @returns `true` if image has been removed.
     */
    removeImageItem(imageItem: ImageItem, owner?: ImageCacheOwner): boolean {
        const cacheItem = this.m_images.get(imageItem.url);
        if (cacheItem !== undefined) {
            this.unlinkCacheItem(cacheItem, owner);
            return true;
        }
        return false;
    }

    /**
     * Remove images from the cache using a filter function.
     *
     * @param itemFilter - Filter to identify images to remove. Should return `true` if item
     * should be removed.
     * @param owner - Optional: Specify {@link ImageCacheOwner} removing the image.
     * @returns Number of images removed.
     */
    removeImageItems(itemFilter: (item: ImageItem) => boolean, owner?: ImageCacheOwner): number {
        const oldSize = this.m_images.size;
        [...this.m_images.values()].filter((cacheItem: ImageCacheItem) => {
            if (itemFilter(cacheItem.imageItem)) {
                this.unlinkCacheItem(cacheItem, owner);
            }
        });
        return oldSize - this.m_images.size;
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
     * @param owner - specify to remove all items registered by {@link ImageCacheOwner}.
     * @returns Number of images removed.
     */
    clear(owner: ImageCacheOwner): number {
        const oldSize = this.m_images.size;
        const itemsToRemove: ImageCacheItem[] = [];

        this.m_images.forEach(cacheItem => {
            const ownerIndex = cacheItem.owners.indexOf(owner);
            if (ownerIndex >= 0) {
                itemsToRemove.push(cacheItem);
            }
        });

        for (const cacheItem of itemsToRemove) {
            this.unlinkCacheItem(cacheItem, owner);
        }
        return oldSize - this.m_images.size;
    }

    /**
     * Clear all {@link ImageItem}s from all owners.
     */
    clearAll() {
        this.m_images.forEach(cacheItem => {
            this.unlinkCacheItem(cacheItem);
        });
        this.m_images = new Map();
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
     * Apply a function to every `ImageItem` in the cache.
     *
     * @param func - Function to apply to every `ImageItem`.
     */
    apply(func: (imageItem: ImageItem) => void) {
        this.m_images.forEach(cacheItem => {
            func(cacheItem.imageItem);
        });
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
     * Remove the cacheItem from cache and from the owners that have this item in their
     * cache. If the item is used by another owner, the item is not removed, but the link
     * to the owner is removed from the item, just like a reference count.
     *
     * @param cacheItem The cache item to be removed.
     * @param owner - Optional: Specify {@link ImageCacheOwner} removing the image.
     */
    private unlinkCacheItem(cacheItem: ImageCacheItem, owner?: ImageCacheOwner) {
        if (owner) {
            const ownerIndex = cacheItem.owners.indexOf(owner);
            if (ownerIndex >= 0) {
                cacheItem.owners.splice(ownerIndex, 1);
            }
            if (cacheItem.owners.length === 0) {
                this.m_images.delete(cacheItem.imageItem.url);
                this.cancelLoading(cacheItem.imageItem);
                owner.imageRemoved(cacheItem.imageItem.url);
            }
        } else {
            this.m_images.delete(cacheItem.imageItem.url);
            this.cancelLoading(cacheItem.imageItem);
        }
    }
}
