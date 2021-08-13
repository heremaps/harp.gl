/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Env } from "@here/harp-datasource-protocol";
import { Math2D } from "@here/harp-utils";
import { expect } from "chai";

import { MapViewImageCache } from "../lib/image/MapViewImageCache";
import { MapView } from "../lib/MapView";
import { PoiManager } from "../lib/poi/PoiManager";
import { PoiBuffer, PoiRenderer } from "../lib/poi/PoiRenderer";
import { TextElement } from "../lib/text/TextElement";

import sinon = require("sinon");
import * as THREE from "three";

describe("PoiRenderer", function () {
    describe("computeIconScreenBox", function () {
        it("computes screen box without offset", function () {
            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                buffer: {} as PoiBuffer,
                technique: {}
            };
            const env = new Env();
            const screenBox = new Math2D.Box();

            PoiRenderer.computeIconScreenBox(
                poiInfo as any,
                new THREE.Vector2(),
                1.0,
                env,
                screenBox
            );
            expect(screenBox.x).to.equal(-16);
            expect(screenBox.y).to.equal(-16);
            expect(screenBox.w).to.equal(32);
            expect(screenBox.h).to.equal(32);
        });

        it("computes screen box with offset", function () {
            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                buffer: {} as PoiBuffer,
                technique: {
                    iconXOffset: 16,
                    iconYOffset: -16
                }
            };
            const env = new Env();
            const screenBox = new Math2D.Box();

            PoiRenderer.computeIconScreenBox(
                poiInfo as any,
                new THREE.Vector2(),
                1.0,
                env,
                screenBox
            );
            expect(screenBox.x).to.equal(0);
            expect(screenBox.y).to.equal(-32);
            expect(screenBox.w).to.equal(32);
            expect(screenBox.h).to.equal(32);
        });

        it("computes screen box with scale", function () {
            const poiInfo = {
                computedWidth: 32,
                computedHeight: 32,
                mayOverlap: false,
                buffer: {} as PoiBuffer,
                technique: {
                    iconXOffset: 16,
                    iconYOffset: -16
                }
            };
            const env = new Env();
            const screenBox = new Math2D.Box();

            PoiRenderer.computeIconScreenBox(
                poiInfo as any,
                new THREE.Vector2(),
                0.5,
                env,
                screenBox
            );
            expect(screenBox.x).to.equal(0);
            expect(screenBox.y).to.equal(-16);
            expect(screenBox.w).to.equal(16);
            expect(screenBox.h).to.equal(16);
        });
    });

    describe("search for cached images", () => {
        const webGLRenderer = {
            capabilities: {
                isWebGL2: false
            }
        } as THREE.WebGLRenderer;
        const mapViewStub = sinon.createStubInstance(MapView);
        const poiManager = new PoiManager((mapViewStub as any) as MapView);
        const testImageName = "testImage";
        const mapEnv = new Env();

        const createPointLabel = (name: string) => {
            return {
                poiInfo: {
                    imageTextureName: name,
                    isValid: true,
                    buffer: undefined,
                    technique: {}
                },
                visible: true
            } as TextElement;
        };

        let x = 1;
        let y = 1;

        const addRandomImageToCache = (
            testCache: MapViewImageCache,
            name: string,
            load: boolean
        ) => {
            // Note, the images must be unique, otherwise the test will fail, because the internal
            // caching mechanism of the ImageCache will have already loaded the image.
            return testCache.addImage(name, `https://picsum.photos/${x++}/${y++}`, load);
        };

        it("poi is valid when in cache and loading started", async () => {
            this.timeout(5000);

            const testCache = new MapViewImageCache();
            const testImageItem = addRandomImageToCache(testCache, testImageName, true);
            const caches = [testCache];
            const poiRenderer = new PoiRenderer(webGLRenderer, poiManager, caches);
            const pointLabel = createPointLabel(testImageName);
            const waitingForLoad = poiRenderer.prepareRender(pointLabel, mapEnv);
            // This is false because the image is still being loaded in the background, notice the
            // true flag passed to the call to testCache.addImage.
            expect(waitingForLoad).false;

            // Promise.resolve used to convert the type `ImageItem | Promise<ImageItem>` to
            // `Promise<ImageItem>`.
            await Promise.resolve(testImageItem);

            const imageLoaded = poiRenderer.prepareRender(pointLabel, mapEnv);
            expect(imageLoaded).true;
        });

        it("poi is valid when in cache and loading not started", async () => {
            this.timeout(5000);

            const testCache = new MapViewImageCache();
            // This is the difference to the test above, we don't start loading, we expect the
            // prepareRender function to do this.
            addRandomImageToCache(testCache, testImageName, false);
            const caches = [testCache];
            const poiRenderer = new PoiRenderer(webGLRenderer, poiManager, caches);
            const pointLabel = createPointLabel(testImageName);
            const waitingForLoad = poiRenderer.prepareRender(pointLabel, mapEnv);
            const result = await Promise.resolve(waitingForLoad);
            expect(result).true;
        });

        it("poi is invalid when not in cache, adding to cache doesn't help", async () => {
            this.timeout(5000);

            const testCache = new MapViewImageCache();
            // Empty cache for now
            const caches = [testCache];
            const poiRenderer = new PoiRenderer(webGLRenderer, poiManager, caches);
            const pointLabel = createPointLabel(testImageName);
            const waitingForLoad = poiRenderer.prepareRender(pointLabel, mapEnv);
            expect(waitingForLoad).false;

            const testImageItem = addRandomImageToCache(testCache, testImageName, true);

            // Promise.resolve used to convert the type `ImageItem | Promise<ImageItem>` to
            // `Promise<ImageItem>`.
            await Promise.resolve(testImageItem);

            const imageLoaded = poiRenderer.prepareRender(pointLabel, mapEnv);
            // Check that adding to the cache late doesn't help.
            expect(imageLoaded).false;
        });
    });
});
