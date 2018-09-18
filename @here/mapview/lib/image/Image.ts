/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/**
 * `ImageItem` is used to identify an image in the [[ImageCache]].
 */
export interface ImageItem {
    /** URL of the image, or unique identifier. */
    url: string;
    /** Pixel data. */
    imageData?: ImageData | ImageBitmap;
    /** Turns to `true` when the data has finished loading. */
    loaded: boolean;
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
