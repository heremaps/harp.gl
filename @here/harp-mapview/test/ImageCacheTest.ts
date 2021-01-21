/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { getTestResourceUrl, silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { LogLevel } from "@here/harp-utils";
import { assert } from "chai";

import { ImageItem } from "../lib/image/Image";
import { ImageCache } from "../lib/image/ImageCache";
import { MapViewImageCache } from "../lib/image/MapViewImageCache";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

class ImageData {
    constructor(public width: number, public height: number) {}
    close() {
        /* mock only */
    }
}

function getNameCount(imageCache: MapViewImageCache): number {
    return (imageCache as any).m_name2Url.size;
}

function clearCache() {
    (ImageCache.instance as any).m_images.clear();
}

describe("MapViewImageCache", function () {
    beforeEach(function () {
        clearCache();
    });

    it("#empty", function () {
        const cache = new MapViewImageCache();
        assert.equal(getNameCount(cache), 0);
        assert.notExists(cache.findImageByName("xxx"));
    });

    it("#addImage with data", function () {
        const cache = new MapViewImageCache();

        const imageData = new ImageData(16, 16);

        cache.addImage("testImage", imageData);

        const testImage1 = cache.findImageByName("testImage");

        assert.equal(getNameCount(cache), 1);
        assert.notExists(cache.findImageByName("xxx"));
        assert.exists(testImage1);
        assert.equal(imageData, testImage1!.image);
    });

    it("#addImage with url", function () {
        const cache = new MapViewImageCache();
        cache.clear();

        const imageName = "headshot.png";
        const imageUrl = getTestResourceUrl("@here/harp-mapview", "test/resources/headshot.png");

        const imageItem = cache.addImage(imageName, imageUrl, false);
        assert.isDefined(imageItem);
        assert.isFalse(imageItem instanceof Promise);

        const testImage = cache.findImageByName(imageName);
        assert.exists(testImage);
        assert.isUndefined(testImage!.image);
        assert.isFalse(testImage!.loaded);
    });

    if (typeof document !== "undefined") {
        it("#addImage with load", async function () {
            const cache = new MapViewImageCache();
            cache.clear();

            const imageName = "headshot.png";
            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const promise = cache.addImage(imageName, imageUrl, true);

            const testImage = cache.findImageByName(imageName);
            assert.exists(testImage);
            assert.isUndefined(testImage!.image);
            assert.isFalse(testImage!.loaded);

            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                await promise;
                const loadedImageItem = cache.findImageByName(imageName);
                assert.exists(loadedImageItem);
                assert.isDefined(loadedImageItem!.image);
                assert.isTrue(loadedImageItem!.loaded);
                const image = loadedImageItem!.image!;
                assert.equal(image.width, 37);
                assert.equal(image.height, 32);
            }
        });

        it("#addImage (load cancelled)", async function () {
            const cache = new MapViewImageCache();
            cache.clear();

            const imageName = "headshot.png";
            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const promise = cache.addImage(imageName, imageUrl, true);

            const testImage = cache.findImageByName(imageName);
            assert.exists(testImage);
            assert.isUndefined(testImage!.image);
            assert.isFalse(testImage!.loaded);

            assert.isTrue(promise instanceof Promise);

            // removal leads to cancel
            assert.isTrue(cache.removeImage(imageName), "remove failed");

            if (promise instanceof Promise) {
                const imageItem = cache.findImageByName(imageName);
                assert.notExists(imageItem, "image is still in cache");
                assert.isTrue(testImage!.cancelled);
                // result of promise ignored, it depends on timing of load and image generation:
                await promise;
                // only assured that cancelled is set to `true`, loaded may also be set to true if
                // cancelled after/during image generation.
                assert.isTrue(testImage!.cancelled);
            }
        });

        it("#loadImage", async function () {
            const cache = new MapViewImageCache();
            cache.clear();

            const imageName = "headshot.png";
            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const imageItem: ImageItem = cache.addImage(imageName, imageUrl, false) as ImageItem;
            assert.isDefined(imageItem);
            assert.isFalse(imageItem instanceof Promise);

            assert.isUndefined(imageItem.image);
            assert.isFalse(imageItem!.loaded);

            const promise = imageItem.loadImage();
            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                await promise;
                const loadedImageItem = cache.findImageByName(imageName);
                assert.exists(loadedImageItem);
                assert.isDefined(loadedImageItem!.image);
                assert.isTrue(loadedImageItem!.loaded);
                const image = loadedImageItem!.image!;
                assert.equal(image.width, 37);
                assert.equal(image.height, 32);
            }
        });
    }

    it("#clear", function () {
        const cache = new MapViewImageCache();

        const imageData = new ImageData(16, 16);

        cache.addImage("testImage", imageData);
        cache.addImage("testImage2", imageData);
        assert.equal(getNameCount(cache), 2);

        cache.clear();

        assert.equal(ImageCache.instance.size, 0, "wrong cache size");
        assert.equal(getNameCount(cache), 0, "wrong number of names");
    });

    it("#add images", function () {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.addImage("testImage1", imageData1);
        cache.addImage("testImage2", imageData2);

        const testImage1 = cache.findImageByName("testImage1");
        const testImage2 = cache.findImageByName("testImage2");

        assert.equal(getNameCount(cache), 2);
        assert.exists(testImage1);
        assert.equal(imageData1, testImage1!.image);
        assert.exists(testImage2);
        assert.equal(imageData2, testImage2!.image);
    });

    it("#add images with same url but differing names", function () {
        const cache = new MapViewImageCache();

        cache.addImage("testImage1", "httpx://naxos.de", false);
        cache.addImage("testImage2", "httpx://naxos.de", false);

        const testImage1 = cache.findImageByName("testImage1");
        const testImage2 = cache.findImageByName("testImage2");

        assert.equal(getNameCount(cache), 2, "should have 2 names");
        assert.exists(testImage1);
        assert.exists(testImage2);
        assert.deepEqual(testImage1, testImage2);
    });

    it("#add images with same name but differing urls", function () {
        const cache = new MapViewImageCache();
        assert.throws(() => {
            cache.addImage("testImage", "httpx://naxos.de", false);
            cache.addImage("testImage", "httpx://naxos.de-2", false);
        });
    });

    it("#remove image", function () {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);

        cache.addImage("testImage1", imageData1);

        assert.exists(cache.findImageByName("testImage1"));

        assert.equal(ImageCache.instance.size, 1);
        assert.equal(getNameCount(cache), 1, "wrong number of names");

        const imageRemoved = cache.removeImage("testImage1");
        assert.equal(imageRemoved, true);
        assert.equal(getNameCount(cache), 0, "wrong number of names");
    });

    it("#remove image 2", function () {
        const cache = new MapViewImageCache();

        cache.addImage("testImage1", "httpx://naxos.de", false);
        cache.addImage("testImage2", "httpx://naxos.de", false);

        assert.exists(cache.findImageByName("testImage1"));
        assert.exists(cache.findImageByName("testImage2"));

        assert.equal(ImageCache.instance.size, 1, "wrong cache size");
        assert.equal(getNameCount(cache), 2, "wrong number of names");

        const imageRemoved = cache.removeImage("testImage2");
        assert.equal(imageRemoved, true);
        assert.equal(ImageCache.instance.size, 1, "wrong cache size");
        assert.equal(getNameCount(cache), 1, "wrong number of names");
        assert.exists(cache.findImageByName("testImage1"));
    });

    it("#remove image by name", function () {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.addImage("testImage1", imageData1);
        cache.addImage("testImage2", imageData2);
        assert.equal(ImageCache.instance.size, 2);

        const imageRemoved = cache.removeImage("testImage1");
        assert.equal(imageRemoved, true);
        assert.equal(getNameCount(cache), 1, "wrong number of names");

        assert.equal(ImageCache.instance.size, 1);
    });

    it("#remove non-existent image returns false", function () {
        const cache = new MapViewImageCache();

        assert.equal(cache.removeImage("xxx"), false);
    });
});

describe("ImageCache", function () {
    beforeEach(function () {
        clearCache();
    });

    it("#instance", function () {
        const cache = ImageCache.instance;
        const instance2 = ImageCache.instance;
        assert.exists(cache);
        assert.equal(cache, instance2);
    });

    it("#empty", function () {
        const cache = ImageCache.instance;
        assert.equal(cache.size, 0);
        const found = cache.findImage("xxx");
        assert.notExists(found);
    });

    it("#registerImage", function () {
        const owner = new MapViewImageCache();
        const cache = ImageCache.instance;
        const imageData = new ImageData(16, 16);

        cache.registerImage(owner, "httpx://naxos.de", imageData);

        const testImage = cache.findImage("httpx://naxos.de");

        assert.equal(cache.size, 1);
        assert.notExists(cache.findImage("xxx"));
        assert.exists(testImage);
        assert.equal(imageData, testImage!.image);
    });

    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = 37;
        canvas.height = 32;
        var ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#00FF00";
            ctx.fillRect(0, 0, 37, 32);
        }
        const image = document.createElement("img");
        image.src = getTestResourceUrl("@here/harp-mapview", "test/resources/headshot.png");

        it("#addImage, from url", async function () {
            const owner = new MapViewImageCache();
            const cache = ImageCache.instance;

            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const promise = cache.registerImage(owner, imageUrl).loadImage();

            const testImage = cache.findImage(imageUrl);
            assert.exists(testImage);
            assert.isUndefined(testImage!.image);
            assert.isFalse(testImage!.loaded);

            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                await promise;
                const loadedImageItem = cache.findImage(imageUrl);
                assert.exists(loadedImageItem);
                assert.isDefined(loadedImageItem!.image);
                assert.isTrue(loadedImageItem!.loaded);
                const image = loadedImageItem!.image!;
                assert.equal(image.width, 37);
                assert.equal(image.height, 32);
            }
        });

        it("#loadImage, from url", async function () {
            const owner = {};
            const cache = ImageCache.instance;

            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const cacheItem = cache.registerImage(owner, imageUrl, undefined);

            const testImage = cache.findImage(imageUrl);
            assert.exists(testImage);
            assert.isUndefined(testImage!.image);
            assert.isFalse(testImage!.loaded);

            const promise = cacheItem.loadImage();

            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                await promise;
                const loadedImageItem = cache.findImage(imageUrl);
                assert.exists(loadedImageItem);
                assert.isDefined(loadedImageItem!.image);
                assert.isTrue(loadedImageItem!.loaded);
                const image = loadedImageItem!.image!;
                assert.equal(image.width, 37);
                assert.equal(image.height, 32);
            }
        });

        [
            { element: canvas, name: "HtmlCanvasElement" },
            { element: image, name: "HtmlImageElement" }
        ].forEach(testSetting => {
            it("#loadImage, from htmlElement " + testSetting.name, async function () {
                const owner = {};
                const cache = ImageCache.instance;

                const imageUrl = "htmlElementImage";
                const testImage = cache.registerImage(owner, imageUrl, testSetting.element);

                assert.exists(testImage);
                assert.isDefined(testImage!.image);
                assert.isFalse(testImage!.loaded);
                assert.equal(testImage!.image!.width, 37);
                assert.equal(testImage!.image!.height, 32);

                const promise = testImage.loadImage();

                assert.isTrue(promise instanceof Promise);

                if (promise instanceof Promise) {
                    await promise;
                    const loadedImageItem = cache.findImage(imageUrl);
                    assert.exists(loadedImageItem);
                    assert.isDefined(loadedImageItem!.image);
                    assert.isTrue(loadedImageItem!.loaded);
                    const image = loadedImageItem!.image!;
                    assert.equal(image.width, 37);
                    assert.equal(image.height, 32);
                    assert.isDefined(loadedImageItem!.mipMaps);
                    assert.isNotEmpty(loadedImageItem!.mipMaps);
                }
            });
        });

        it("#loadImage, from bad url", async function () {
            const owner = {};
            const cache = ImageCache.instance;

            const imageUrl = "?";
            const imageItem = cache.registerImage(owner, imageUrl) as ImageItem;

            assert.isDefined(imageItem);
            assert.isFalse(imageItem instanceof Promise);

            assert.isUndefined(imageItem.image);
            assert.isFalse(imageItem!.loaded);

            const promise = imageItem.loadImage();

            const isPromise = promise instanceof Promise;
            assert.isTrue(isPromise);

            if (promise instanceof Promise) {
                await silenceLoggingAroundFunction(
                    "loadImage",
                    async () => {
                        await promise.catch(() => {
                            assert.isRejected(promise);
                            const loadedImageItem = cache.findImage(imageUrl);
                            assert.exists(loadedImageItem);
                            assert.isUndefined(loadedImageItem!.image);
                            assert.isFalse(loadedImageItem!.loaded);
                        });
                    },
                    LogLevel.None
                );
            }
        });

        it("#loadImage, from bad HtmlImageElement", async function () {
            const url = "dummy";
            const badImage = document.createElement("img");
            badImage.src = "bad source";
            const owner = {};
            const cache = ImageCache.instance;

            const testImage = cache.registerImage(owner, url, badImage);

            assert.exists(testImage);
            assert.isDefined(testImage!.image);
            assert.isFalse(testImage!.loaded);

            const result = testImage.loadImage();

            assert.isTrue(result instanceof Promise);
            const promise = result as Promise<ImageItem | undefined>;
            assert.isRejected(promise);
        });
    }

    it("#dispose", function () {
        const owner = new MapViewImageCache();

        const imageData = new ImageData(16, 16);
        ImageCache.instance.registerImage(owner, "httpx://naxos.de", imageData);

        ImageCache.dispose();

        assert.equal(ImageCache.instance.size, 0);
    });

    it("#register same image in multiple MapViews", function () {
        const cache = ImageCache.instance;

        const owner1 = new MapViewImageCache();
        const owner2 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner2, "httpx://naxos.de", imageData1);

        const testImage = cache.findImage("httpx://naxos.de");

        assert.equal(cache.size, 1);
        assert.notExists(cache.findImage("xxx"));
        assert.exists(testImage);
        assert.equal(imageData1, testImage!.image);
    });

    it("#register different images in multiple MapViews", function () {
        const cache = ImageCache.instance;

        const owner1 = new MapViewImageCache();
        const owner2 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner2, "httpx://naxos.de-2", imageData2);

        const testImage1 = cache.findImage("httpx://naxos.de");
        const testImage2 = cache.findImage("httpx://naxos.de-2");

        assert.equal(cache.size, 2);
        assert.notExists(cache.findImage("xxx"));
        assert.exists(testImage1);
        assert.equal(imageData1, testImage1!.image);
        assert.exists(testImage2);
        assert.equal(imageData2, testImage2!.image);
    });

    it("#clear images in multiple MapViews", function () {
        const cache = ImageCache.instance;

        const owner1 = new MapViewImageCache();
        const owner2 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner2, "httpx://naxos.de-2", imageData2);

        cache.clear(owner1);

        assert.equal(cache.size, 1);

        assert.notExists(cache.findImage("httpx://naxos.de"));
        assert.exists(cache.findImage("httpx://naxos.de-2"));
    });

    it("#remove image", function () {
        const cache = ImageCache.instance;
        const owner1 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);

        assert.equal(cache.size, 1, "wrong cache size");

        const imageRemoved = cache.removeImage("httpx://naxos.de", owner1);
        assert.equal(imageRemoved, true);
        assert.equal(cache.size, 0, "wrong cache size");
    });

    it("#clear images shared in multiple MapViews", function () {
        const owner1 = new MapViewImageCache();
        const owner2 = new MapViewImageCache();

        const cache0 = ((owner1 as any).imageCache = new MapViewImageCache());
        const cache1 = ((owner2 as any).imageCache = new MapViewImageCache());

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache0.addImage("img0", imageData1);
        cache0.addImage("img1", imageData2);

        cache1.addImage("img0", imageData1);
        cache1.addImage("img1", imageData2);

        assert.equal(ImageCache.instance.size, 2);
        assert.equal(getNameCount(cache0), 2);
        assert.equal(getNameCount(cache1), 2);

        cache0.clear();

        assert.equal(ImageCache.instance.size, 2);
        assert.equal(getNameCount(cache0), 0);
        assert.equal(getNameCount(cache1), 2);

        cache1.clear();

        assert.equal(ImageCache.instance.size, 0);
        assert.equal(getNameCount(cache1), 0);
    });

    it("#share images in multiple MapViews", function () {
        const cache0 = new MapViewImageCache();
        const cache1 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        const imageItem0 = cache0.addImage("img0", imageData1);
        const imageItem1 = cache0.addImage("img1", imageData2);

        cache1.addImage("img0", imageData1);
        cache1.addImage("img1", imageData2);

        assert.equal(imageItem0, cache0.findImageByName("img0"));
        assert.equal(imageItem1, cache0.findImageByName("img1"));

        assert.equal(imageItem0, cache1.findImageByName("img0"));
        assert.equal(imageItem1, cache1.findImageByName("img1"));
    });

    it("#remove images shared in multiple MapViews", function () {
        const cache0 = new MapViewImageCache();
        const cache1 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache0.addImage("img0", imageData1);
        cache0.addImage("img1", imageData2);

        cache1.addImage("img0", imageData1);
        cache1.addImage("img1", imageData2);

        assert.equal(ImageCache.instance.size, 2);

        assert.isTrue(cache0.removeImage("img0"));

        assert.equal(ImageCache.instance.size, 2);

        assert.isTrue(cache1.removeImage("img0"));

        assert.equal(ImageCache.instance.size, 1);

        assert.isTrue(cache0.removeImage("img1"));

        assert.equal(ImageCache.instance.size, 1);

        assert.isTrue(cache1.removeImage("img1"));

        assert.equal(ImageCache.instance.size, 0);
    });
});
