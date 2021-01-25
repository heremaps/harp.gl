/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";

import { ImageItem, TexturizableImage } from "./Image";
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
    private readonly m_name2Url: Map<string, string> = new Map();
    private readonly m_urlNameCount: Map<string, number> = new Map();

    /**
     * Add an image from an URL and optionally start loading it, storing the resulting
     * {@link TexturizableImage} in a {@link ImageItem}.
     *
     * @remarks
     * Names are unique within a {@link MapView}. URLs are not unique, multiple images with
     * different names can have the same URL. Still, URLs are are loaded only once.
     * If an image with the same name is already registered an error is thrown.
     *
     * @param name - Image name.
     * @param url - Image URL.
     * @param startLoading - Optional. Pass `true` to start loading the image in the background.
     * @returns The resulting {@link ImageItem} or a promise for it if it starts loading.
     */
    addImage(
        name: string,
        url: string,
        startLoading?: boolean
    ): ImageItem | Promise<ImageItem | undefined>;

    /**
     * Add an image storing it in a {@link ImageItem}.
     *
     * @remarks
     * Names are unique within a {@link MapView}. If an image with the same name is already
     * registered an error is thrown.
     *
     * @param name - Unique image name.
     * @param image - The image to add.
     * @returns The resulting {@link ImageItem}
     */
    addImage(name: string, image: TexturizableImage): ImageItem;

    addImage(
        name: string,
        urlOrImage: string | TexturizableImage,
        startLoading = true
    ): ImageItem | Promise<ImageItem | undefined> {
        if (typeof urlOrImage === "string") {
            const url = urlOrImage;
            const imageItem = this.registerImage(name, url);

            return startLoading ? imageItem.loadImage() : imageItem;
        }

        const image = urlOrImage;
        return this.registerImage(name, undefined, image);
    }

    /**
     * Remove the image with this name from the cache.
     *
     * @param name - Name of the image.
     * @returns `true` if item has been removed.
     */
    removeImage(name: string): boolean {
        const url = this.m_name2Url.get(name);
        if (url !== undefined) {
            this.m_name2Url.delete(name);

            let nameCount = 1;
            if (name !== url) {
                const result = this.m_urlNameCount.get(url);
                assert(result !== undefined);
                nameCount = result!;
                assert(nameCount > 0);
            }

            if (nameCount > 1) {
                // There is another name sharing this URL.
                this.m_urlNameCount.set(url, nameCount - 1);
            } else {
                // URL was used by this image only, remove the image.
                this.m_urlNameCount.delete(url);
                ImageCache.instance.removeImage(url, this);
            }
            return true;
        }
        return false;
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
     * Remove all {@link ImageItem}s from the cache.
     *
     * @remarks
     * Also removes all {@link ImageItem}s that belong to this
     * {@link MapView} from the global {@link ImageCache}.
     * @returns Number of images removed.
     */
    clear() {
        ImageCache.instance.clear(this);
        this.m_name2Url.clear();
        this.m_urlNameCount.clear();
    }

    /**
     * Register an existing image by name. If the name already exists and error is thrown.
     *
     * @param name - Image name.
     * @param url - Optional image URL.
     * @param image - Optional {@link TexturizableImage}.
     */
    private registerImage(name: string, url?: string, image?: TexturizableImage): ImageItem {
        if (this.hasName(name)) {
            throw new Error("duplicate name in cache");
        }

        if (url === undefined) {
            // If no url given, an image must be provided directly. In this case the name is used
            // as url.
            assert(image !== undefined);
            url = name;
        }

        if (url !== name) {
            const nameCount = this.m_urlNameCount.get(url) ?? 0;
            this.m_urlNameCount.set(url, nameCount + 1);
        }

        this.m_name2Url.set(name, url);
        return ImageCache.instance.registerImage(this, url, image);
    }

    private hasName(name: string): boolean {
        return this.m_name2Url.get(name) !== undefined;
    }
}
