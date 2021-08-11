/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Env } from "@here/harp-datasource-protocol";
import { MapView, MapViewImageCache, PoiManager, TextElement } from "@here/harp-mapview";
import { Math2D } from "@here/harp-utils";
import { expect } from "chai";
import sinon = require("sinon");
import * as THREE from "three";

import { PoiBuffer, PoiRenderer } from "../lib/poi/PoiRenderer";

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

    describe.only("search for cached images", () => {
        const webGLRenderer = {
            capabilities: {
                isWebGL2: false
            }
        } as THREE.WebGLRenderer;
        const mapViewStub = sinon.createStubInstance(MapView);
        const poiManager = new PoiManager((mapViewStub as any) as MapView);
        const testImageName = "testImage";
        const mapEnv = new Env();

        it("poi is valid when in cache", async () => {
            const testCache = new MapViewImageCache();
            // Add a test image to the cache
            const testImageItem = testCache.addImage(
                testImageName,
                "https://picsum.photos/200/300",
                true
            );
            const caches = [testCache];
            const poiRenderer = new PoiRenderer(webGLRenderer, poiManager, caches);

            const pointLabel = {
                poiInfo: {
                    imageTextureName: testImageName,
                    isValid: true,
                    buffer: undefined,
                    technique: {}
                },
                visible: true
            } as TextElement;
            const waitingForLoad = poiRenderer.prepareRender(pointLabel, mapEnv);
            expect(waitingForLoad).false;

            // Promise.resolve used to convert the type `ImageItem | Promise<ImageItem>` to
            // `Promise<ImageItem>`.
            await Promise.resolve(testImageItem);

            const imageLoaded = poiRenderer.prepareRender(pointLabel, mapEnv);
            expect(imageLoaded).true;
        });

        it("poi is invalid when not cache, but recreated when added to cache", async () => {
            const testCache = new MapViewImageCache();
            // Empty cache for now
            const caches = [testCache];
            const poiRenderer = new PoiRenderer(webGLRenderer, poiManager, caches);

            const pointLabel = {
                poiInfo: {
                    imageTextureName: testImageName,
                    isValid: true,
                    buffer: undefined,
                    technique: {}
                },
                visible: true
            } as TextElement;
            const waitingForLoad = poiRenderer.prepareRender(pointLabel, mapEnv);
            expect(waitingForLoad).false;

            const testImageItem = testCache.addImage(
                testImageName,
                "https://picsum.photos/200/300",
                true
            );

            // Promise.resolve used to convert the type `ImageItem | Promise<ImageItem>` to
            // `Promise<ImageItem>`.
            await Promise.resolve(testImageItem);

            const imageLoaded = poiRenderer.prepareRender(pointLabel, mapEnv);
            expect(imageLoaded).true;
        });
    });
});
