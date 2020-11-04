/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { getTestResourceUrl } from "@here/harp-test-utils";
import { assert } from "chai";
import * as sinon from "sinon";

import { ImageItem } from "../lib/image/Image";
import { ImageCache, ImageCacheOwner } from "../lib/image/ImageCache";
import { MapViewImageCache } from "../lib/image/MapViewImageCache";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

class ImageData {
    constructor(public width: number, public height: number) {}
    close() {
        /* mock only */
    }
}

class TestImageCacheOwner implements ImageCacheOwner {
    imageRemoved(url: string): void {}
}

describe("MapViewImageCache", function() {
    beforeEach(function() {
        ImageCache.instance.clearAll();
    });

    it("#empty", function() {
        const cache = new MapViewImageCache();
        assert.equal(cache.numberOfNames, 0);
        assert.equal(cache.numberOfUrls, 0);
        assert.notExists(cache.findNames("xxx"));
    });

    it("#registerImage", function() {
        const cache = new MapViewImageCache();

        const imageData = new ImageData(16, 16);

        cache.registerImage("testImage", "httpx://naxos.de", imageData);

        const testImage1 = cache.findImageByName("testImage");
        const testImage2 = cache.findImageByUrl("httpx://naxos.de");

        assert.equal(cache.numberOfNames, 1);
        assert.equal(cache.numberOfUrls, 1);
        assert.notExists(cache.findImageByName("xxx"));
        assert.notExists(cache.findImageByUrl("xxx"));
        assert.exists(testImage1);
        assert.equal(imageData, testImage1!.image);
        assert.exists(testImage2);
        assert.equal(imageData, testImage2!.image);
    });

    it("#addImage", function() {
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
        it("#addImage with load", async function() {
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

        it("#addImage (load cancelled)", async function() {
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

        it("#loadImage", async function() {
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

            const promise = cache.loadImage(imageItem);
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

    it("#clear", function() {
        const cache = new MapViewImageCache();

        const imageData = new ImageData(16, 16);

        cache.registerImage("testImage", "httpx://naxos.de", imageData);
        cache.registerImage("testImage2", "httpx://naxos.de", imageData);
        assert.equal(cache.numberOfNames, 2);
        assert.equal(cache.numberOfUrls, 1);

        const numImagesRemoved = cache.clear();

        assert.equal(ImageCache.instance.size, 0, "wrong cache size");
        assert.equal(cache.numberOfNames, 0, "wrong number of names");
        assert.equal(cache.numberOfUrls, 0, "wrong number of urls");
        assert.equal(numImagesRemoved, 1, "wrong number of removed images");
    });

    it("#clear calls imageRemoved", function() {
        const cache = new MapViewImageCache();
        const imageRemovedSpy = sinon.spy(cache, "imageRemoved");

        const imageData = new ImageData(16, 16);

        cache.registerImage("testImage", "httpx://naxos.de", imageData);
        cache.registerImage("testImage2", "httpx://naxos.de", imageData);
        assert.equal(cache.numberOfNames, 2);
        assert.equal(cache.numberOfUrls, 1);

        const numImagesRemoved = cache.clear();

        assert.equal(ImageCache.instance.size, 0, "wrong cache size");
        assert.equal(cache.numberOfNames, 0, "wrong number of names");
        assert.equal(cache.numberOfUrls, 0, "wrong number of urls");
        assert.equal(numImagesRemoved, 1, "wrong number of removed images");
        assert.equal(imageRemovedSpy.callCount, 1, "cache.imageRemoved() has not been called");
    });

    it("#add images", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de-2", imageData2);

        const testImage1 = cache.findImageByName("testImage1");
        const testImage2 = cache.findImageByName("testImage2");

        const testImage11 = cache.findImageByUrl("httpx://naxos.de");
        const testImage22 = cache.findImageByUrl("httpx://naxos.de-2");

        assert.equal(cache.numberOfNames, 2);
        assert.equal(cache.numberOfUrls, 2);
        assert.exists(testImage1);
        assert.equal(imageData1, testImage1!.image);
        assert.equal(imageData1, testImage11!.image);
        assert.exists(testImage2);
        assert.equal(imageData2, testImage2!.image);
        assert.equal(imageData2, testImage22!.image);

        assert.isTrue(cache.hasName("testImage1"));
        assert.isTrue(cache.hasName("testImage2"));
        assert.isTrue(cache.hasUrl("httpx://naxos.de"));
        assert.isTrue(cache.hasUrl("httpx://naxos.de-2"));
    });

    it("#add images with same url but differing names", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de", imageData2);

        const testImage1 = cache.findImageByName("testImage1");
        const testImage2 = cache.findImageByName("testImage2");

        const testImage11 = cache.findImageByUrl("httpx://naxos.de");

        assert.equal(cache.numberOfNames, 2, "should have 2 names");
        assert.equal(cache.numberOfUrls, 1, "should have just 1 url");
        assert.exists(testImage1);
        assert.deepEqual(imageData1, testImage1!.image);
        assert.deepEqual(imageData1, testImage11!.image);
        assert.exists(testImage2);
        assert.deepEqual(imageData1, testImage2!.image);

        assert.deepEqual(cache.findNames("httpx://naxos.de"), ["testImage1", "testImage2"]);
    });

    it("#add images with same name but differing urls", function() {
        const cache = new MapViewImageCache();
        assert.throws(() => {
            cache.registerImage("testImage", "httpx://naxos.de", undefined);
            cache.registerImage("testImage", "httpx://naxos.de-2", undefined);
        });
    });

    it("#remove image", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);

        assert.exists(cache.findImageByName("testImage1"));

        assert.equal(ImageCache.instance.size, 1);
        assert.equal(cache.numberOfNames, 1, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        const imageRemoved = cache.removeImage("testImage1");
        assert.equal(imageRemoved, true);
        assert.equal(cache.numberOfNames, 0, "wrong number of names");
        assert.equal(cache.numberOfUrls, 0, "wrong number of urls");
    });

    it("#remove image calls imageRemoved", function() {
        const cache = new MapViewImageCache();
        const imageRemovedSpy = sinon.spy(cache, "imageRemoved");

        const imageData1 = new ImageData(16, 16);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);

        assert.exists(cache.findImageByName("testImage1"));

        assert.equal(ImageCache.instance.size, 1);
        assert.equal(cache.numberOfNames, 1, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        const imageRemoved = cache.removeImage("testImage1");
        assert.equal(imageRemoved, true);
        assert.equal(cache.numberOfNames, 0, "wrong number of names");
        assert.equal(cache.numberOfUrls, 0, "wrong number of urls");
        assert.equal(imageRemovedSpy.callCount, 1, "cache.imageRemoved() has not been called");
    });

    it("#remove image 2", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de", imageData1);

        assert.exists(cache.findImageByName("testImage1"));
        assert.exists(cache.findImageByName("testImage2"));

        assert.equal(ImageCache.instance.size, 1, "wrong cache size");
        assert.equal(cache.numberOfNames, 2, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        const imageRemoved = cache.removeImage("testImage2");
        assert.equal(imageRemoved, true);
        assert.equal(ImageCache.instance.size, 1, "wrong cache size");
        assert.equal(cache.numberOfNames, 1, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");
        assert.exists(cache.findImageByName("testImage1"));
    });

    it("#remove image by URL", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de-2", imageData2);
        assert.equal(ImageCache.instance.size, 2);
        assert.equal(cache.numberOfNames, 2);
        assert.equal(cache.numberOfUrls, 2);

        const imageRemoved = cache.removeImageByUrl("httpx://naxos.de"!);
        assert.equal(imageRemoved, true);
        assert.equal(cache.numberOfNames, 1, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        assert.equal(ImageCache.instance.size, 1);
        const testImage2 = cache.findImageByUrl("httpx://naxos.de-2");
        assert.exists(testImage2);
    });

    it("#remove image by name", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de-2", imageData2);
        assert.equal(ImageCache.instance.size, 2);

        const imageRemoved = cache.removeImage("testImage1");
        assert.equal(imageRemoved, true);
        assert.equal(cache.numberOfNames, 1, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        assert.equal(ImageCache.instance.size, 1);
        const testImage2 = cache.findImageByUrl("httpx://naxos.de-2");
        assert.exists(testImage2);
    });

    it("#remove image by filter", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de-2", imageData2);
        cache.registerImage("testImage3", "httpx://naxos.de-3", imageData2);
        assert.equal(ImageCache.instance.size, 3);

        const imagesRemoved = cache.removeImages((name: string, url: string) => {
            return url === "httpx://naxos.de-2";
        });
        assert.equal(imagesRemoved, 1);
        assert.equal(cache.numberOfNames, 2, "wrong number of names");
        assert.equal(cache.numberOfUrls, 2, "wrong number of urls");

        assert.equal(ImageCache.instance.size, 2);
        assert.exists(cache.findImageByUrl("httpx://naxos.de"));
        assert.exists(cache.findImageByUrl("httpx://naxos.de-3"));
        assert.notExists(cache.findImageByUrl("httpx://naxos.de-2"));
    });

    it("#remove image by filter 2", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de", imageData2);
        cache.registerImage("testImage3", "httpx://naxos.de", imageData2);
        assert.equal(ImageCache.instance.size, 1, "wrong cache size");
        assert.equal(cache.numberOfNames, 3, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        const imagesRemoved = cache.removeImages((name: string, url: string) => {
            return name === "testImage3";
        });

        assert.equal(imagesRemoved, 1, "wrong number of removed images");
        assert.equal(cache.numberOfNames, 2, "wrong number of names");
        assert.equal(cache.numberOfUrls, 1, "wrong number of urls");

        assert.equal(ImageCache.instance.size, 1, "wrong cache size");
        assert.exists(cache.findImageByName("testImage1"));
        assert.exists(cache.findImageByName("testImage2"));
        assert.notExists(cache.findImageByName("testImage3"));
    });

    it("#remove image with name by filter", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de-2", imageData2);
        cache.registerImage("undefined", "httpx://naxos.de-3", imageData2);
        assert.equal(cache.numberOfNames, 3, "wrong number of names");
        assert.equal(ImageCache.instance.size, 3, "wrong cache size");

        const imagesRemoved = cache.removeImages((name: string, url: string) => {
            return url === "httpx://naxos.de-2";
        });
        assert.equal(imagesRemoved, 1);
        assert.equal(cache.numberOfNames, 2, "wrong number of names");
        assert.equal(cache.numberOfUrls, 2, "wrong number of urls");

        assert.equal(ImageCache.instance.size, 2);
        assert.exists(cache.findImageByUrl("httpx://naxos.de"));
        assert.exists(cache.findImageByUrl("httpx://naxos.de-3"));
        assert.notExists(cache.findImageByUrl("httpx://naxos.de-2"));
    });

    it("#remove all images by filter", function() {
        const cache = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage("testImage1", "httpx://naxos.de", imageData1);
        cache.registerImage("testImage2", "httpx://naxos.de-2", imageData2);
        cache.registerImage("testImage3", "httpx://naxos.de-3", imageData2);

        const imagesRemoved = cache.removeImages((name: string, url: string) => {
            return true;
        });
        assert.equal(imagesRemoved, 3);
        assert.equal(cache.numberOfNames, 0, "wrong number of names");
        assert.equal(cache.numberOfUrls, 0);

        assert.equal(ImageCache.instance.size, 0, "cache is not empty");
    });
});

describe("ImageCache", function() {
    beforeEach(function() {
        ImageCache.instance.clearAll();
    });

    it("#instance", function() {
        const cache = ImageCache.instance;
        const instance2 = ImageCache.instance;
        assert.exists(cache);
        assert.equal(cache, instance2);
        cache.clearAll();
    });

    it("#empty", function() {
        const cache = ImageCache.instance;
        assert.equal(cache.size, 0);
        const found = cache.findImage("xxx");
        assert.notExists(found);
    });

    it("#registerImage", function() {
        const owner = new TestImageCacheOwner();
        const cache = ImageCache.instance;
        cache.clearAll();

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

        it("#addImage, from url", async function() {
            const owner = new TestImageCacheOwner();
            const cache = ImageCache.instance;
            cache.clearAll();

            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const promise = cache.addImage(owner, imageUrl, true);

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

        it("#loadImage, from url", async function() {
            const owner = new TestImageCacheOwner();

            const cache = ImageCache.instance;
            cache.clearAll();

            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const cacheItem = cache.registerImage(owner, imageUrl, undefined);

            const testImage = cache.findImage(imageUrl);
            assert.exists(testImage);
            assert.isUndefined(testImage!.image);
            assert.isFalse(testImage!.loaded);

            const promise = cache.loadImage(cacheItem);

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
            it("#addImage, from htmlElement " + testSetting.name, async function() {
                const owner = new TestImageCacheOwner();
                const cache = ImageCache.instance;
                cache.clearAll();

                const imageUrl = "htmlElementImage";

                const promise = cache.addImage(owner, imageUrl, true, testSetting.element);

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

            it("#loadImage, from htmlElement:  " + testSetting.name, async function() {
                const owner = new TestImageCacheOwner();
                const cache = ImageCache.instance;
                cache.clearAll();

                const imageUrl = "htmlElementImage";

                const cacheItem = cache.registerImage(
                    owner,
                    imageUrl,
                    undefined,
                    testSetting.element
                );

                const testImage = cache.findImage(imageUrl);
                assert.exists(testImage);
                assert.isUndefined(testImage!.image);
                assert.isFalse(testImage!.loaded);

                const promise = cache.loadImage(cacheItem);

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

            it(
                "#addImage, from htmlElement and cancel loading: " + testSetting.name,
                async function() {
                    const owner = new TestImageCacheOwner();
                    const cache = ImageCache.instance;
                    cache.clearAll();

                    const imageUrl = "htmlElement";

                    const promise = cache.addImage(owner, imageUrl, true, testSetting.element);

                    const testImage = cache.findImage(imageUrl);
                    assert.exists(testImage);
                    assert.isUndefined(testImage!.image);
                    assert.isFalse(testImage!.loaded);

                    assert.isTrue(promise instanceof Promise);

                    // removal leads to cancel
                    assert.isTrue(cache.removeImage(imageUrl), "remove failed");

                    if (promise instanceof Promise) {
                        const imageItem = cache.findImage(imageUrl);
                        assert.notExists(imageItem, "image is still in cache");
                        assert.isTrue(testImage!.cancelled);
                        // result of promise ignored, it depends on timing of load and image generation:
                        await promise;
                        // only assured that cancelled is set to `true`, loaded may also be set to true if
                        // cancelled after/during image generation.
                        assert.isTrue(testImage!.cancelled);
                    }
                }
            );

            it("#loadImage, from htmlElement: " + testSetting.name, async function() {
                const owner = new TestImageCacheOwner();

                const cache = ImageCache.instance;
                cache.clearAll();

                const imageUrl = "htmlElement";

                const imageItem = cache.addImage(
                    owner,
                    imageUrl,
                    false,
                    testSetting.element
                ) as ImageItem;
                assert.isDefined(imageItem);
                assert.isFalse(imageItem instanceof Promise);

                assert.isUndefined(imageItem.image);
                assert.isFalse(imageItem!.loaded);

                const promise = cache.loadImage(imageItem);
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
        });

        it("#loadImage, from  HtmlImageElement with bad src", async function() {
            const owner = new TestImageCacheOwner();

            const cache = ImageCache.instance;
            cache.clearAll();

            const imageUrl = "htmlElement";
            const invalidImage = document.createElement("img");
            invalidImage.src = "fooba.png";

            const imageItem = cache.addImage(owner, imageUrl, false, invalidImage) as ImageItem;

            assert.isDefined(imageItem);
            assert.isFalse(imageItem instanceof Promise);

            assert.isUndefined(imageItem.image);
            assert.isFalse(imageItem!.loaded);

            const promise = cache.loadImage(imageItem);

            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                assert.isRejected(promise);

                const loadedImageItem = cache.findImage(imageUrl);
                assert.exists(loadedImageItem);
                assert.isUndefined(loadedImageItem!.image);
                assert.isFalse(loadedImageItem!.loaded);
            }
        });

        it("#loadImage, from HtmlImageElement without src", async function() {
            const owner = new TestImageCacheOwner();

            const cache = ImageCache.instance;
            cache.clearAll();

            const imageUrl = "htmlElement";
            const invalidImage = document.createElement("img");
            invalidImage.src = "fooba.png";

            const imageItem = cache.addImage(owner, imageUrl, false, invalidImage) as ImageItem;

            assert.isDefined(imageItem);
            assert.isFalse(imageItem instanceof Promise);

            assert.isUndefined(imageItem.image);
            assert.isFalse(imageItem!.loaded);

            const promise = cache.loadImage(imageItem);
            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                assert.isRejected(promise);
                const loadedImageItem = cache.findImage(imageUrl);
                assert.exists(loadedImageItem);
                assert.isUndefined(loadedImageItem!.image);
                assert.isFalse(loadedImageItem!.loaded);
            }
        });
    }

    it("#clearAll", function() {
        const owner = new TestImageCacheOwner();

        const cache = ImageCache.instance;
        const imageData = new ImageData(16, 16);
        cache.registerImage(owner, "httpx://naxos.de", imageData);

        cache.clearAll();

        assert.equal(cache.size, 0);
        assert.notExists(cache.findImage("testImage"));
    });

    it("#dispose", function() {
        const owner = new TestImageCacheOwner();

        const imageData = new ImageData(16, 16);
        ImageCache.instance.registerImage(owner, "httpx://naxos.de", imageData);

        ImageCache.dispose();

        assert.equal(ImageCache.instance.size, 0);
    });

    it("#register same image in multiple MapViews", function() {
        const cache = ImageCache.instance;
        cache.clearAll();

        const owner1 = new TestImageCacheOwner();
        const owner2 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner2, "httpx://naxos.de", imageData1);

        const testImage = cache.findImage("httpx://naxos.de");

        assert.equal(cache.size, 1);
        assert.notExists(cache.findImage("xxx"));
        assert.exists(testImage);
        assert.equal(imageData1, testImage!.image);
    });

    it("#register different images in multiple MapViews", function() {
        const cache = ImageCache.instance;
        cache.clearAll();

        const owner1 = new TestImageCacheOwner();
        const owner2 = new TestImageCacheOwner();

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

    it("#clear images in multiple MapViews", function() {
        const cache = ImageCache.instance;
        cache.clearAll();

        const owner1 = new TestImageCacheOwner();
        const owner2 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner2, "httpx://naxos.de-2", imageData2);

        cache.clear(owner1);

        assert.equal(cache.size, 1);

        assert.notExists(cache.findImage("httpx://naxos.de"));
        assert.exists(cache.findImage("httpx://naxos.de-2"));
    });

    it("#remove image item", function() {
        const cache = ImageCache.instance;
        const owner1 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);

        const item = cache.registerImage(owner1, "httpx://naxos.de", imageData1);

        assert.equal(cache.size, 1, "wrong cache size");

        const imageRemoved = cache.removeImageItem(item);
        assert.equal(imageRemoved, true);
        assert.equal(cache.size, 0, "wrong cache size");
    });

    it("#remove image", function() {
        const cache = ImageCache.instance;
        const owner1 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);

        assert.equal(cache.size, 1, "wrong cache size");

        const imageRemoved = cache.removeImage("httpx://naxos.de");
        assert.equal(imageRemoved, true);
        assert.equal(cache.size, 0, "wrong cache size");
    });

    it("#remove image by filter", function() {
        const cache = ImageCache.instance;
        const owner1 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner1, "httpx://naxos.de-2", imageData2);
        cache.registerImage(owner1, "httpx://naxos.de-3", imageData2);
        assert.equal(ImageCache.instance.size, 3, "wrong cache size");

        const imagesRemoved = cache.removeImageItems((imageItem: ImageItem) => {
            return imageItem.url === "httpx://naxos.de-2";
        });
        assert.equal(imagesRemoved, 1, "wrong number of images removed");
        assert.equal(cache.size, 2, "wrong cache size");
        assert.exists(cache.findImage("httpx://naxos.de"));
        assert.notExists(cache.findImage("httpx://naxos.de-2"));
        assert.exists(cache.findImage("httpx://naxos.de-3"));
    });

    it("#remove image by filter 2", function() {
        const cache = ImageCache.instance;
        const owner1 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner1, "httpx://naxos.de-2", imageData2);
        cache.registerImage(owner1, "httpx://XXX", imageData2);
        assert.equal(ImageCache.instance.size, 3, "wrong cache size");

        const imagesRemoved = cache.removeImageItems((imageItem: ImageItem) => {
            return imageItem.url.startsWith("httpx://naxos.de");
        });
        assert.equal(imagesRemoved, 2, "wrong number of images removed");
        assert.equal(cache.size, 1, "wrong cache size");
        assert.exists(cache.findImage("httpx://XXX"));
    });

    it("#remove all images by filter", function() {
        const cache = ImageCache.instance;
        const owner1 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner1, "httpx://naxos.de-2", imageData2);
        cache.registerImage(owner1, "httpx://naxos.de-3", imageData2);

        const imagesRemoved = cache.removeImageItems((imageItem: ImageItem) => {
            return true;
        });
        assert.equal(imagesRemoved, 3, "wrong number of images removed");
        assert.equal(cache.size, 0, "cache is not empty");
    });

    it("#apply", function() {
        const cache = ImageCache.instance;
        const owner1 = new TestImageCacheOwner();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache.registerImage(owner1, "httpx://naxos.de", imageData1);
        cache.registerImage(owner1, "httpx://naxos.de-2", imageData2);
        cache.registerImage(owner1, "httpx://naxos.de-3", imageData2);

        let numImagesInCache = 0;
        cache.apply(imageItem => {
            assert.equal(imageItem.url.split("-")[0], "httpx://naxos.de");
            numImagesInCache++;
        });

        assert.equal(numImagesInCache, 3, "wrong count");
        assert.equal(cache.size, 3, "wrong cache size");
    });

    it("#clear images shared in multiple MapViews", function() {
        const commonCache = ImageCache.instance;
        commonCache.clearAll();

        const owner1 = new TestImageCacheOwner();
        const owner2 = new TestImageCacheOwner();

        const cache0 = ((owner1 as any).imageCache = new MapViewImageCache());
        const cache1 = ((owner2 as any).imageCache = new MapViewImageCache());

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache0.registerImage("img0", "httpx://naxos.de", imageData1);
        cache0.registerImage("img1", "httpx://naxos.de-2", imageData2);

        cache1.registerImage("img0", "httpx://naxos.de", imageData1);
        cache1.registerImage("img1", "httpx://naxos.de-2", imageData2);

        assert.equal(ImageCache.instance.size, 2);
        assert.equal(cache0.numberOfNames, 2);
        assert.equal(cache1.numberOfNames, 2);
        assert.equal(cache0.numberOfUrls, 2);
        assert.equal(cache1.numberOfUrls, 2);

        cache0.clear();

        assert.equal(ImageCache.instance.size, 2);
        assert.equal(cache0.numberOfNames, 0);
        assert.equal(cache1.numberOfNames, 2);

        cache1.clear();

        assert.equal(ImageCache.instance.size, 0);
        assert.equal(cache1.numberOfNames, 0);
    });

    it("#share images in multiple MapViews", function() {
        const commonCache = ImageCache.instance;
        commonCache.clearAll();

        const cache0 = new MapViewImageCache();
        const cache1 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        const imageItem0 = cache0.registerImage("img0", "httpx://naxos.de", imageData1);
        const imageItem1 = cache0.registerImage("img1", "httpx://naxos.de-2", imageData2);

        cache1.registerImage("img0", "httpx://naxos.de", imageData1);
        cache1.registerImage("img1", "httpx://naxos.de-2", imageData2);

        assert.equal(imageItem0, cache0.findImageByName("img0"));
        assert.equal(imageItem1, cache0.findImageByName("img1"));

        assert.equal(imageItem0, cache1.findImageByName("img0"));
        assert.equal(imageItem1, cache1.findImageByName("img1"));
    });

    it("#remove images shared in multiple MapViews", function() {
        const commonCache = ImageCache.instance;
        commonCache.clearAll();

        const cache0 = new MapViewImageCache();
        const cache1 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache0.registerImage("img0", "httpx://naxos.de", imageData1);
        cache0.registerImage("img1", "httpx://naxos.de-2", imageData2);

        cache1.registerImage("img0", "httpx://naxos.de", imageData1);
        cache1.registerImage("img1", "httpx://naxos.de-2", imageData2);

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

    it("#remove images shared in multiple MapViews call imageRemoved", function() {
        const cache0 = new MapViewImageCache();
        const cache1 = new MapViewImageCache();

        const imageRemovedSpy0 = sinon.spy(cache0, "imageRemoved");
        const imageRemovedSpy1 = sinon.spy(cache1, "imageRemoved");

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache0.registerImage("img0", "httpx://naxos.de", imageData1);
        cache0.registerImage("img1", "httpx://naxos.de-2", imageData2);

        cache1.registerImage("img0", "httpx://naxos.de", imageData1);
        cache1.registerImage("img1", "httpx://naxos.de-2", imageData2);

        assert.equal(ImageCache.instance.size, 2);

        assert.isTrue(cache0.removeImage("img0"));
        // Reference to image removed in owner cache0, The callback "imageRemoved" is not called.
        assert.isFalse(imageRemovedSpy0.called, "cache.imageRemoved() has been called");

        assert.equal(ImageCache.instance.size, 2);

        assert.isTrue(cache1.removeImage("img0"));
        // All references removed, image is removed from shared ImageCache. Last owner is informed
        // about removal.
        assert.isTrue(imageRemovedSpy1.called, "cache.imageRemoved() has not been called");

        assert.equal(ImageCache.instance.size, 1);

        assert.isTrue(cache0.removeImage("img1"));
        // Reference to image removed in owner cache0, The callback "imageRemoved" is not called.
        assert.isFalse(imageRemovedSpy0.called, "cache.imageRemoved() has been called");

        assert.equal(ImageCache.instance.size, 1);

        assert.isTrue(cache1.removeImage("img1"));
        // All references removed, image is removed from shared ImageCache. Last owner is informed
        // about removal.
        assert.equal(imageRemovedSpy1.callCount, 2, "cache.imageRemoved() has not been called");
        imageRemovedSpy1.resetHistory();

        assert.equal(ImageCache.instance.size, 0);
    });

    it("#removeImageByUrl images shared in multiple MapViews", function() {
        const commonCache = ImageCache.instance;
        commonCache.clearAll();

        const cache0 = new MapViewImageCache();
        const cache1 = new MapViewImageCache();

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        cache0.registerImage("img0", "httpx://naxos.de", imageData1);
        cache0.registerImage("img1", "httpx://naxos.de-2", imageData2);

        cache1.registerImage("img0", "httpx://naxos.de", imageData1);
        cache1.registerImage("img1", "httpx://naxos.de-2", imageData2);

        assert.equal(ImageCache.instance.size, 2);

        assert.isTrue(cache0.removeImageByUrl("httpx://naxos.de"));

        assert.equal(ImageCache.instance.size, 2);

        assert.isTrue(cache1.removeImageByUrl("httpx://naxos.de"));

        assert.equal(ImageCache.instance.size, 1);

        assert.isTrue(cache0.removeImageByUrl("httpx://naxos.de-2"));

        assert.equal(ImageCache.instance.size, 1);

        assert.isTrue(cache1.removeImageByUrl("httpx://naxos.de-2"));

        assert.equal(ImageCache.instance.size, 0);
    });
});
