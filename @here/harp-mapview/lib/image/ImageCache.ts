/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { MapView } from "../MapView";
import { ImageItem } from "./Image";
import { MipMapGenerator } from "./MipMapGenerator";

const logger = LoggerManager.instance.create("ImageCache");
const mipMapGenerator = new MipMapGenerator();

// override declaration of createImageBitmap, add optional options parameter that
// was removed in typings for TypeScript 3.1
declare function createImageBitmap(
    image: ImageBitmapSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    options?: any
): Promise<ImageBitmap>;

/**
 * Combines an {@link ImageItem} with a list of {@link MapView}s that reference it.
 */
class ImageCacheItem {
    /**
     * The list of {@link MapView}s referencing the {@link ImageItem}.
     */
    mapViews: MapView[] = [];

    /**
     * Instantiates `ImageCacheItem`.
     *
     * @param imageItem - The {@link ImageItem} referenced by
     *                    the associated {@link MapView}s instances.
     * @param mapView - An optional first {@link MapView} referencing the {@link ImageItem}.
     */
    constructor(public imageItem: ImageItem, mapView?: MapView) {
        if (mapView !== undefined) {
            this.mapViews.push(mapView);
        }
    }
}

/**
 * `ImageCache` is a singleton, so it can be used with multiple MapViews on a single page.
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
 * The `ImageCache` can be improved by adding satistics for memory footprint as well.
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
     * @param mapView - Specifiy which {@link MapView} requests the image.
     * @param url - URL of image.
     * @param imageData - Optional [ImageData]] containing the image content.
     */
    registerImage(mapView: MapView, url: string, imageData?: ImageData | ImageBitmap): ImageItem {
        let imageCacheItem = this.findImageCacheItem(url);
        if (imageCacheItem !== undefined) {
            if (mapView !== undefined && imageCacheItem.mapViews.indexOf(mapView) < 0) {
                imageCacheItem.mapViews.push(mapView);
            }
            return imageCacheItem.imageItem;
        }

        const mapViews: MapView[] = [];
        if (mapView !== undefined) {
            mapViews.push(mapView);
        }

        imageCacheItem = {
            imageItem: {
                url,
                imageData,
                loaded: false
            },
            mapViews
        };

        this.m_images.set(url, imageCacheItem);

        return imageCacheItem.imageItem;
    }

    /**
     * Add an image definition, and optionally start loading the content.
     *
     * @param mapView - {@link MapView} requesting the image.
     * @param url - URL of image.
     * @param startLoading - Optional flag. If `true` the image will be loaded in the background.
     */
    addImage(
        mapView: MapView,
        url: string,
        startLoading = true
    ): ImageItem | Promise<ImageItem | undefined> | undefined {
        const imageItem = this.registerImage(mapView, url, undefined);
        if (imageItem !== undefined && startLoading === true) {
            return this.loadImage(imageItem);
        }

        return imageItem;
    }

    /**
     * Remove an image from the cache..
     *
     * @param url - URL of the image.
     * @returns `true` if image has been removed.
     */
    removeImage(url: string): boolean {
        const cacheItem = this.m_images.get(url);
        if (cacheItem !== undefined) {
            this.m_images.delete(url);
            this.cancelLoading(cacheItem.imageItem);
            return true;
        }
        return false;
    }

    /**
     * Remove an image from the cache.
     *
     * @param imageItem - Item identifying the image.
     * @returns `true` if image has been removed.
     */
    removeImageItem(imageItem: ImageItem): boolean {
        if (this.m_images.has(imageItem.url) !== undefined) {
            this.m_images.delete(imageItem.url);
            this.cancelLoading(imageItem);
            return true;
        }
        return false;
    }

    /**
     * Remove images from the cache using a filter function.
     *
     * @param itemFilter - Filter to identify images to remove. Should return `true` if item
     * should be removed.
     * @returns Number of images removed.
     */
    removeImageItems(itemFilter: (item: ImageItem) => boolean): number {
        const oldSize = this.m_images.size;
        [...this.m_images.values()].filter((cacheItem: ImageCacheItem) => {
            if (itemFilter(cacheItem.imageItem)) {
                this.m_images.delete(cacheItem.imageItem.url);
                this.cancelLoading(cacheItem.imageItem);
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
     * Clear all {@link ImageItem}s belonging to a {@link MapView}.
     *
     * @remarks
     * May remove cached items if no
     * {@link MapView} are registered anymore.
     *
     * @param mapView - MapView to remove all {@link ImageItem}s from.
     * @returns Number of images removed.
     */
    clear(mapView: MapView): number {
        const oldSize = this.m_images.size;
        const itemsToRemove: string[] = [];

        this.m_images.forEach(cacheItem => {
            const mapViewIndex = cacheItem.mapViews.indexOf(mapView);
            if (mapViewIndex >= 0) {
                cacheItem.mapViews.splice(mapViewIndex, 1);
            }
            if (cacheItem.mapViews.length === 0) {
                itemsToRemove.push(cacheItem.imageItem.url);
                this.cancelLoading(cacheItem.imageItem);
            }
        });

        for (const keyToDelete of itemsToRemove) {
            this.m_images.delete(keyToDelete);
        }
        return oldSize - this.m_images.size;
    }

    /**
     * Clear all {@link ImageItem}s from all {@link MapView}s.
     */
    clearAll() {
        this.m_images.forEach(cacheItem => {
            this.cancelLoading(cacheItem.imageItem);
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
        if (imageItem.imageData !== undefined) {
            return imageItem;
        }

        if (imageItem.loadingPromise !== undefined) {
            return imageItem.loadingPromise;
        }

        const imageLoader = new THREE.ImageLoader();

        imageItem.loadingPromise = new Promise(resolve => {
            logger.debug(`Loading image: ${imageItem.url}`);
            if (imageItem.cancelled === true) {
                logger.debug(`Cancelled loading image: ${imageItem.url}`);
                resolve(undefined);
            } else {
                imageLoader.load(
                    imageItem.url,
                    image => {
                        logger.debug(`... finished loading image: ${imageItem.url}`);
                        if (imageItem.cancelled === true) {
                            logger.debug(`Cancelled loading image: ${imageItem.url}`);
                            resolve(undefined);
                        }
                        this.renderImage(imageItem, image)
                            .then(() => {
                                imageItem.mipMaps = mipMapGenerator.generateTextureAtlasMipMap(
                                    imageItem
                                );
                                imageItem.loadingPromise = undefined;
                                resolve(imageItem);
                            })
                            .catch(ex => {
                                logger.error(`... loading image failed: ${imageItem.url} : ${ex}`);
                                resolve(undefined);
                            });
                    },
                    // Loading events no longer supported
                    undefined,
                    errorEvent => {
                        logger.error(`... loading image failed: ${imageItem.url} : ${errorEvent}`);

                        imageItem.loadingPromise = undefined;
                        resolve(undefined);
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
     * Render the `ImageItem` by using `createImageBitmap()` or by rendering the image into a
     * `HTMLCanvasElement`.
     *
     * @param imageItem - {@link ImageItem} to assign image data to.
     * @param image - `HTMLImageElement`
     */
    private renderImage(
        imageItem: ImageItem,
        image: HTMLImageElement
    ): Promise<ImageData | ImageBitmap | undefined> {
        return new Promise((resolve, reject) => {
            if (imageItem.cancelled) {
                resolve(undefined);
            }
            // use createImageBitmap if it is available. It should be available in webworkers as
            // well
            if (typeof createImageBitmap === "function") {
                const options: ImageBitmapOptions = {
                    premultiplyAlpha: "default"
                };

                logger.debug(`Creating bitmap image: ${imageItem.url}`);
                createImageBitmap(image, 0, 0, image.width, image.height, options)
                    .then(imageBitmap => {
                        if (imageItem.cancelled) {
                            resolve(undefined);
                        }
                        logger.debug(`... finished creating bitmap image: ${imageItem.url}`);

                        imageItem.loadingPromise = undefined;
                        imageItem.imageData = imageBitmap;
                        imageItem.loaded = true;
                        resolve(imageBitmap);
                    })
                    .catch(ex => {
                        logger.error(`... loading image failed: ${imageItem.url} : ${ex}`);
                        resolve(undefined);
                    });
            } else {
                try {
                    if (typeof document === "undefined") {
                        logger.error("Error: document is not available, cannot generate image");
                        reject(
                            new Error(
                                "ImageCache#renderImage: document is not available, cannot " +
                                    "render image to create texture"
                            )
                        );
                    }

                    // TODO: Extract the rendering to the canvas part and make it configurable for
                    // the client, so it does not rely on the `document`.

                    // use the image, e.g. draw part of it on a canvas
                    const canvas = document.createElement("canvas");
                    canvas.width = image.width;
                    canvas.height = image.height;

                    const context = canvas.getContext("2d");
                    if (context !== null) {
                        logger.debug(
                            `... finished creating bitmap image in canvas: ${imageItem.url} ${image}`
                        );
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
                        imageItem.imageData = imageData;
                        imageItem.loaded = true;
                        resolve(imageData);
                    } else {
                        logger.error(`renderImage: no context found`);
                        reject(new Error(`ImageCache#renderImage: no context found`));
                    }
                } catch (ex) {
                    logger.error(`renderImage failed: ${ex}`);
                    imageItem.imageData = undefined;
                    imageItem.loaded = true;
                    reject(new Error(`ImageCache#renderImage failed: ${ex}`));
                }
            }
        });
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
}
