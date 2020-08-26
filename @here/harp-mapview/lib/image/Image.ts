/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `ImageItem` is used to identify an image in the {@link ImageCache}.
 */
export interface ImageItem {
    /** URL of the image, or unique identifier. */
    url: string;
    /** Pixel data. */
    imageData?: ImageData | ImageBitmap;
    /** Mip maps for image data */
    mipMaps?: ImageData[];
    /**
     * Reference to an Image or Canvas to be used instead of loading an Image from the url.
     * When specified the url property is used as a unique identifier to avoid duplication.
     */
    htmlElement?: HTMLImageElement | HTMLCanvasElement;
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
