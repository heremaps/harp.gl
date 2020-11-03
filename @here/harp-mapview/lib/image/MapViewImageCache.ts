/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImageItem } from "./Image";
import { ImageCache } from "./ImageCache";

/**
 * Cache images wrapped into {@link ImageItem}s for a {@link MapView}.
 *
 * @remarks
 * An image may have multiple names in a theme, the `MapViewImageCache` maps different names to the
 * same image URL, and allows to share the image by URL to different MapViews.
 * Within a MapView instance, the (optional) name is unique, so registering multiple images with the
 * same name is invalid.
 *
 * The `MapViewImageCache` uses a global {@link ImageCache} to actually store (and generate) the
 * image data.
 */
export class MapViewImageCache {
    private m_name2Url: Map<string, string> = new Map();
    private m_url2Name: Map<string, string[]> = new Map();

    /**
     * The constructor for `MapViewImageCache`.
     */
    constructor() {}

    /**
     * Register an existing image by name.
     *
     * @param name - Name of the image from {@link @here/harp-datasource-protocol#Theme}.
     * @param url - URL of image.
     * @param image - Optional {@link ImageData} of image.
     * @param htmlElement - Optional raw data in case {@link HTMLImageElement} or {@link HTMLCanvasElement} reference is available.
     *                In that case url is used as a unique identifier to avoid image duplicates and the specified
     *                raw data is used for the rendering.
     */
    registerImage(
        name: string | undefined,
        url: string,
        image?: ImageData | ImageBitmap,
        htmlElement?: HTMLImageElement | HTMLCanvasElement
    ): ImageItem {
        if (name !== undefined) {
            if (this.hasName(name)) {
                throw new Error("duplicate name in cache");
            }

            const oldNames = this.m_url2Name.get(url);
            if (oldNames !== undefined) {
                if (!oldNames.includes(name)) {
                    oldNames.push(name);
                }
            } else {
                this.m_url2Name.set(url, [name]);
            }
            this.m_name2Url.set(name, url);
        }

        // Register new image or add this mapView to list of MapViews using this image (identified
        // by URL).)
        return ImageCache.instance.registerImage(this, url, image, htmlElement);
    }

    /**
     * Add an image and optionally start loading it. Once done, the [[ImageData]] or [[ImageBitmap]]
     * will be stored in the {@link ImageItem}.
     *
     * Names are unique within a {@link MapView}. URLs are not unique, multiple images with
     * different names can have the same URL. Still, URLs are are loaded only once.
     *
     * @param name - Name of image from {@link @here/harp-datasource-protocol#Theme}.
     * @param url URL of image.
     * @param htmlElement Optional raw data in case HTMLImageElement or HTMLCanvasElement reference is available.
     *                In that case url is used as a unique identifier to avoid image duplicates and the specified
     *                raw data is used for the rendering.
     * @param startLoading Optional. Pass `true` to start loading the image in the background or
     *  to start rendering the htmlElement if available.
     */
    addImage(
        name: string,
        url: string,
        startLoading = true,
        htmlElement?: HTMLImageElement | HTMLCanvasElement
    ): ImageItem | Promise<ImageItem | undefined> {
        const imageItem = this.registerImage(name, url, undefined, htmlElement);
        if (startLoading === true) {
            return ImageCache.instance.loadImage(imageItem);
        }
        return imageItem;
    }

    /**
     * Remove the image with this name from the cache.
     *
     * @param name - Name of the image.
     * @returns `true` if item has been removed.
     */
    removeImage(name: string): boolean {
        return this.removeImageInternal(name);
    }

    /**
     * Remove images using the URL from the cache.
     *
     * @param url - URL of the image.
     * @returns `true` if image has been removed. If multiple images are referring to the same
     * image URL, they are all removed.
     */
    removeImageByUrl(url: string): boolean {
        const names = this.m_url2Name.get(url);
        if (names !== undefined) {
            for (const name of [...names]) {
                this.removeImageInternal(name);
            }
            return true;
        }
        return false;
    }

    /**
     * Remove images from the cache.
     *
     * @param itemFilter - Filter to identify images to remove. Should return `true` if item
     * should be removed.
     * @returns Number of images removed.
     */
    removeImages(itemFilter: (name: string, url: string) => boolean): number {
        let numImagesRemoved = 0;
        for (const [name, url] of [...this.m_name2Url]) {
            if (itemFilter(name, url)) {
                if (this.removeImage(name)) {
                    numImagesRemoved++;
                }
            }
        }
        return numImagesRemoved;
    }

    /**
     * Find {@link ImageItem} by its name.
     *
     * @param name - Name of image.
     */
    findImageByName(name: string): ImageItem | undefined {
        const url = this.m_name2Url.get(name);
        if (url === undefined) {
            return undefined;
        }
        return ImageCache.instance.findImage(url);
    }

    /**
     * Find {@link ImageItem} by URL.
     *
     * @param url - Url of image.
     */
    findImageByUrl(url: string): ImageItem | undefined {
        return ImageCache.instance.findImage(url);
    }

    /**
     * Load an {@link ImageItem}. Returns a promise or a loaded {@link ImageItem}.
     *
     * @param imageItem - ImageItem to load.
     */
    loadImage(imageItem: ImageItem): ImageItem | Promise<ImageItem | undefined> {
        return ImageCache.instance.loadImage(imageItem);
    }

    /**
     * Remove all {@link ImageItem}s from the cache.
     *
     * @remarks
     * Also removes all {@link ImageItem}s that belong to this
     * {@link MapView} from the global {@link ImageCache}.
     * @returns Number of images removed.
     */
    clear(): number {
        const oldSize = ImageCache.instance.size;
        ImageCache.instance.clear(this);
        this.m_name2Url = new Map();
        this.m_url2Name = new Map();
        return oldSize;
    }

    /**
     * Returns number of mappings from name to URL in the cache. Only items with a name can get
     * mapped to URL.
     */
    get numberOfNames(): number {
        return this.m_name2Url.size;
    }

    /**
     * Returns number of mappings from URL to name in the cache. Only items with a name can get
     * mapped from URL to name.
     */
    get numberOfUrls(): number {
        return this.m_url2Name.size;
    }

    /**
     * Return `true` if an image with the given name is known.
     *
     * @param name - Name of the image.
     */
    hasName(name: string): boolean {
        return this.m_name2Url.get(name) !== undefined;
    }

    /**
     * Return `true` if an image with the given URL is known. Only items with a name can get
     * mapped from URL to name.
     *
     * @param url - URL of image.
     */
    hasUrl(url: string): boolean {
        return this.m_url2Name.get(url) !== undefined;
    }

    /**
     * Return the names under which an image with the given URL is saved. Only items with a name
     * can get mapped from URL to name.
     */
    findNames(url: string): string[] | undefined {
        return this.m_url2Name.get(url);
    }

    /**
     * Remove the image with this name from the cache.
     *
     * @param name - Name of the image.
     * @returns `true` if item has been removed.
     */
    private removeImageInternal(name: string): boolean {
        const url = this.m_name2Url.get(name);
        if (url !== undefined) {
            this.m_name2Url.delete(name);
            const names = this.m_url2Name.get(url);
            if (names !== undefined && names.length > 1) {
                // There is another name sharing this URL.
                this.m_url2Name.set(url, names.splice(names.indexOf(name), 1));
            } else {
                // URL was used by this image only, remove the image.
                this.m_url2Name.delete(url);
                ImageCache.instance.removeImage(url, this);
            }
            return true;
        }
        return false;
    }
}
