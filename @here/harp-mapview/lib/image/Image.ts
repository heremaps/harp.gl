/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

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
