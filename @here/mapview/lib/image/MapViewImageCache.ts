import { MapView } from "../MapView";
import { ImageItem } from "./Image";
import { ImageCache } from "./ImageCache";

/**
 * Cache images wrapped into [[ImageItem]]s for a [[MapView]]. An image may have multiple names in
 * a theme, the `MapViewImageCache` will take care of that. Registering multiple images with the
 * same name is invalid.
 *
 * The `MapViewImageCache` uses a global [[ImageCache]] to actually store (and generate) the
 * image data.
 */
export class MapViewImageCache {
    private m_name2Url: Map<string, string> = new Map();
    private m_url2Name: Map<string, string[]> = new Map();

    /**
     * The constructor for `MapViewImageCache`.
     *
     * @param mapView a [[MapView]] instance.
     */
    constructor(public mapView: MapView) {}

    /**
     * Register an existing image by name.
     *
     * @param name Name of the image from [[Theme]].
     * @param url URL of image.
     * @param image Optional [[ImageData]] of image.
     */
    registerImage(
        name: string | undefined,
        url: string,
        image: ImageData | ImageBitmap | undefined
    ): ImageItem {
        if (name !== undefined) {
            if (this.hasName(name)) {
                throw new Error("duplicate name in cache");
            }

            const oldNames = this.m_url2Name.get(url);
            if (oldNames !== undefined) {
                if (oldNames.indexOf(name) < 0) {
                    oldNames.push(name);
                }
            } else {
                this.m_url2Name.set(url, [name]);
            }
            this.m_name2Url.set(name, url);
        }

        const imageItem = ImageCache.instance.findImage(url);
        if (imageItem === undefined) {
            return ImageCache.instance.registerImage(this.mapView, url, image);
        }
        return imageItem;
    }

    /**
     * Add an image and optionally start loading it. Once done, the [[ImageData]] or [[ImageBitmap]]
     * will be stored in the [[ImageItem]].
     *
     * @param name Name of image from [[Theme]].
     * @param url URL of image.
     * @param startLoading Optional. Pass `true` to start loading the image in the background.
     */
    addImage(
        name: string,
        url: string,
        startLoading = true
    ): ImageItem | Promise<ImageItem | undefined> {
        const imageItem = this.registerImage(name, url, undefined);
        if (startLoading === true) {
            return ImageCache.instance.loadImage(imageItem);
        }

        return imageItem;
    }

    /**
     * Find [[ImageItem]] by its name.
     *
     * @param name Name of image.
     */
    findImageByName(name: string): ImageItem | undefined {
        const url = this.m_name2Url.get(name);
        if (url === undefined) {
            return undefined;
        }
        return ImageCache.instance.findImage(url);
    }

    /**
     * Find [[ImageItem]] by URL.
     *
     * @param url Url of image.
     */
    findImageByUrl(url: string): ImageItem | undefined {
        return ImageCache.instance.findImage(url);
    }

    /**
     * Load an [[ImageItem]]. Returns a promise or a loaded [[ImageItem]].
     *
     * @param imageItem ImageItem to load.
     */
    loadImage(imageItem: ImageItem): ImageItem | Promise<ImageItem | undefined> {
        return ImageCache.instance.loadImage(imageItem);
    }

    /**
     * Remove all [[ImageItem]]s from the cache. Also removes all [[ImageItem]]s that belong to this
     * [[MapView]] from the global [[ImageCache]].
     */
    clear() {
        ImageCache.instance.clear(this.mapView);
        this.m_name2Url = new Map();
        this.m_url2Name = new Map();
    }

    /**
     * Returns number of image names stored in the cache.
     */
    get numberOfNames(): number {
        return this.m_name2Url.size;
    }

    /**
     * Returns number of image URLs in the cache.
     */
    get numberOfUrls(): number {
        return this.m_url2Name.size;
    }

    /**
     * Return `true` if an image with the given name is known.
     *
     * @param name Name of the image.
     */
    hasName(name: string): boolean {
        return this.m_name2Url.get(name) !== undefined;
    }

    /**
     * Return `true` if an image with the given URL is known.
     * @param url URL of image.
     */
    hasUrl(url: string): boolean {
        return this.m_url2Name.get(url) !== undefined;
    }

    /**
     * Return the names under which an image with the given URL is saved.
     */
    findNames(url: string): string[] | undefined {
        return this.m_url2Name.get(url);
    }
}
