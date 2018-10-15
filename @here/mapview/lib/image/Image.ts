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
