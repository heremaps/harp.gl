/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { getTestResourceUrl } from "@here/harp-test-utils";
import { ImageCache } from "../lib/image/ImageCache";
import { MapViewImageCache } from "../lib/image/MapViewImageCache";
import { MapView } from "../lib/MapView";

class ImageData {
    constructor(public width: number, public height: number) {}
    close() {
        /* mock only */
    }
}

describe("MapViewImageCache", function() {
    // tslint:disable-next-line:no-object-literal-type-assertion
    const mapView: MapView = {} as MapView;

    it("#empty", function() {
        const cache = new MapViewImageCache(mapView);
        assert.equal(cache.numberOfNames, 0);
        assert.equal(cache.numberOfUrls, 0);
        assert.notExists(cache.findNames("xxx"));
    });

    it("#registerImage", function() {
        const cache = new MapViewImageCache(mapView);

        const imageData = new ImageData(16, 16);

        cache.registerImage("testImage", "httpx://naxos.de", imageData);

        const testImage1 = cache.findImageByName("testImage");
        const testImage2 = cache.findImageByUrl("httpx://naxos.de");

        assert.equal(cache.numberOfNames, 1);
        assert.equal(cache.numberOfUrls, 1);
        assert.notExists(cache.findImageByName("xxx"));
        assert.notExists(cache.findImageByUrl("xxx"));
        assert.exists(testImage1);
        assert.equal(imageData, testImage1!.imageData);
        assert.exists(testImage2);
        assert.equal(imageData, testImage2!.imageData);
    });

    if (typeof document !== "undefined") {
        it("#addImage", async function() {
            const cache = new MapViewImageCache(mapView);
            cache.clear();

            const imageName = "headshot.png";
            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const promise = cache.addImage(imageName, imageUrl, true);

            const testImage = cache.findImageByName(imageName);
            assert.exists(testImage);
            assert.isUndefined(testImage!.imageData);
            assert.isFalse(testImage!.loaded);

            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                await promise;
                const loadedImageItem = cache.findImageByName(imageName);
                assert.exists(loadedImageItem);
                assert.isDefined(loadedImageItem!.imageData);
                assert.isTrue(loadedImageItem!.loaded);
                const image = loadedImageItem!.imageData!;
                assert.equal(image.width, 37);
                assert.equal(image.height, 32);
            }
        });
    }

    it("#clear", function() {
        const cache = new MapViewImageCache(mapView);

        const imageData = new ImageData(16, 16);

        cache.registerImage("testImage", "httpx://naxos.de", imageData);
        assert.equal(cache.numberOfNames, 1);
        assert.equal(cache.numberOfUrls, 1);

        cache.clear();

        assert.equal(cache.numberOfNames, 0);
    });

    it("#add images", function() {
        const cache = new MapViewImageCache(mapView);

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
        assert.equal(imageData1, testImage1!.imageData);
        assert.equal(imageData1, testImage11!.imageData);
        assert.exists(testImage2);
        assert.equal(imageData2, testImage2!.imageData);
        assert.equal(imageData2, testImage22!.imageData);

        assert.isTrue(cache.hasName("testImage1"));
        assert.isTrue(cache.hasName("testImage2"));
        assert.isTrue(cache.hasUrl("httpx://naxos.de"));
        assert.isTrue(cache.hasUrl("httpx://naxos.de-2"));
    });

    it("#add images with same url but differing names", function() {
        const cache = new MapViewImageCache(mapView);

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
        assert.deepEqual(imageData1, testImage1!.imageData);
        assert.deepEqual(imageData1, testImage11!.imageData);
        assert.exists(testImage2);
        assert.deepEqual(imageData1, testImage2!.imageData);

        assert.deepEqual(cache.findNames("httpx://naxos.de"), ["testImage1", "testImage2"]);
    });

    it("#add images with same name but differing urls", function() {
        const cache = new MapViewImageCache(mapView);
        assert.throws(() => {
            cache.registerImage("testImage", "httpx://naxos.de", undefined);
            cache.registerImage("testImage", "httpx://naxos.de-2", undefined);
        });
    });
});

describe("ImageCache", function() {
    it("#instance", function() {
        const instance = ImageCache.instance;
        const instance2 = ImageCache.instance;
        assert.exists(instance);
        assert.equal(instance, instance2);
        instance.clearAll();
    });

    it("#empty", function() {
        const instance = ImageCache.instance;
        assert.equal(instance.size, 0);
        const found = instance.findImage("xxx");
        assert.notExists(found);
    });

    it("#registerImage", function() {
        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView: MapView = {} as MapView;
        const instance = ImageCache.instance;
        instance.clearAll();

        const imageData = new ImageData(16, 16);

        instance.registerImage(mapView, "httpx://naxos.de", imageData);

        const testImage = instance.findImage("httpx://naxos.de");

        assert.equal(instance.size, 1);
        assert.notExists(instance.findImage("xxx"));
        assert.exists(testImage);
        assert.equal(imageData, testImage!.imageData);
    });

    if (typeof document !== "undefined") {
        it("#addImage", async function() {
            // tslint:disable-next-line:no-object-literal-type-assertion
            const mapView: MapView = {} as MapView;
            const instance = ImageCache.instance;
            instance.clearAll();

            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );

            const promise = instance.addImage(mapView, imageUrl, true);

            const testImage = instance.findImage(imageUrl);
            assert.exists(testImage);
            assert.isUndefined(testImage!.imageData);
            assert.isFalse(testImage!.loaded);

            assert.isTrue(promise instanceof Promise);

            if (promise instanceof Promise) {
                await promise;
                const loadedImageItem = instance.findImage(imageUrl);
                assert.exists(loadedImageItem);
                assert.isDefined(loadedImageItem!.imageData);
                assert.isTrue(loadedImageItem!.loaded);
                const image = loadedImageItem!.imageData!;
                assert.equal(image.width, 37);
                assert.equal(image.height, 32);
            }
        });
    }

    it("#clearAll", function() {
        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView: MapView = {} as MapView;
        const instance = ImageCache.instance;
        const imageData = new ImageData(16, 16);
        instance.registerImage(mapView, "httpx://naxos.de", imageData);

        instance.clearAll();

        assert.equal(instance.size, 0);
        assert.notExists(instance.findImage("testImage"));
    });

    it("#dispose", function() {
        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView: MapView = {} as MapView;
        const instance = ImageCache.instance;
        const imageData = new ImageData(16, 16);
        instance.registerImage(mapView, "httpx://naxos.de", imageData);

        ImageCache.dispose();

        assert.equal(ImageCache.instance.size, 0);
    });

    it("#register same image in multiple MapViews", function() {
        const instance = ImageCache.instance;
        instance.clearAll();

        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView1: MapView = {} as MapView;
        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView2: MapView = {} as MapView;

        const imageData1 = new ImageData(16, 16);

        instance.registerImage(mapView1, "httpx://naxos.de", imageData1);
        instance.registerImage(mapView2, "httpx://naxos.de", imageData1);

        const testImage = instance.findImage("httpx://naxos.de");

        assert.equal(instance.size, 1);
        assert.notExists(instance.findImage("xxx"));
        assert.exists(testImage);
        assert.equal(imageData1, testImage!.imageData);
    });

    it("#register different images in multiple MapViews", function() {
        const instance = ImageCache.instance;
        instance.clearAll();

        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView1: MapView = {} as MapView;
        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView2: MapView = {} as MapView;

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        instance.registerImage(mapView1, "httpx://naxos.de", imageData1);
        instance.registerImage(mapView2, "httpx://naxos.de-2", imageData2);

        const testImage1 = instance.findImage("httpx://naxos.de");
        const testImage2 = instance.findImage("httpx://naxos.de-2");

        assert.equal(instance.size, 2);
        assert.notExists(instance.findImage("xxx"));
        assert.exists(testImage1);
        assert.equal(imageData1, testImage1!.imageData);
        assert.exists(testImage2);
        assert.equal(imageData2, testImage2!.imageData);
    });

    it("#clear images in multiple MapViews", function() {
        const instance = ImageCache.instance;
        instance.clearAll();

        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView1: MapView = {} as MapView;
        // tslint:disable-next-line:no-object-literal-type-assertion
        const mapView2: MapView = {} as MapView;

        const imageData1 = new ImageData(16, 16);
        const imageData2 = new ImageData(32, 32);

        instance.registerImage(mapView1, "httpx://naxos.de", imageData1);
        instance.registerImage(mapView2, "httpx://naxos.de-2", imageData2);

        instance.clear(mapView1);

        assert.equal(instance.size, 1);

        assert.notExists(instance.findImage("httpx://naxos.de"));
        assert.exists(instance.findImage("httpx://naxos.de-2"));
    });
});
