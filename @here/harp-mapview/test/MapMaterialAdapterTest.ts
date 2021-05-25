/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr, MapEnv } from "@here/harp-datasource-protocol";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { MapMaterialAdapter } from "../lib/MapMaterialAdapter";

describe("MapMaterialAdapter", function () {
    const sandbox = sinon.createSandbox();

    afterEach(function () {
        sandbox.restore();
    });

    describe("ensureUpdated", function () {
        it("creates texture from dynamic property with HTML element", function () {
            const oldTexture = new THREE.Texture(
                undefined,
                undefined,
                THREE.RepeatWrapping,
                THREE.MirroredRepeatWrapping,
                THREE.NearestFilter,
                THREE.NearestMipmapNearestFilter
            );
            oldTexture.repeat = new THREE.Vector2(2, 3);
            const newImage = { nodeName: "IMG", complete: true };
            const material = new THREE.MeshStandardMaterial({ map: oldTexture });
            const adapter = new MapMaterialAdapter(material, {
                map: Expr.fromJSON(["get", "image", ["dynamic-properties"]])
            });
            const env = new MapEnv({ image: newImage });

            const updated = adapter.ensureUpdated({ env, frameNumber: 1 });

            assert.isTrue(updated);
            const newTexture = material.map!;
            assert.isDefined(newTexture);
            assert.notStrictEqual(newTexture, oldTexture);
            assert.strictEqual(newTexture.image, newImage);
            assert.equal(newTexture.wrapS, oldTexture.wrapS);
            assert.equal(newTexture.wrapT, oldTexture.wrapT);
            assert.equal(newTexture.magFilter, oldTexture.magFilter);
            assert.equal(newTexture.minFilter, oldTexture.minFilter);
            assert.equal(newTexture.flipY, oldTexture.flipY);
            assert.equal(newTexture.repeat, oldTexture.repeat);
        });

        it("waits for a HTMLImageElement to be complete before setting it in the material", function () {
            const oldTexture = new THREE.Texture();
            const material = new THREE.MeshStandardMaterial({ map: oldTexture });
            const adapter = new MapMaterialAdapter(material, {
                map: Expr.fromJSON(["get", "image", ["dynamic-properties"]])
            });
            let onLoadFunc: () => {} | undefined;
            const newImage = {
                nodeName: "IMG",
                complete: false,
                addEventListener: sinon.stub().callsFake((event: string, onLoad: () => {}) => {
                    assert.strictEqual(event, "load");
                    onLoadFunc = onLoad;
                }),
                removeEventListener: sinon.spy()
            };
            const env = new MapEnv({ image: newImage });

            const updated = adapter.ensureUpdated({ env, frameNumber: 1 });

            assert.isTrue(updated);
            const stillOldTexture = material.map!;
            assert.isDefined(stillOldTexture);
            assert.strictEqual(stillOldTexture, oldTexture);

            assert.isDefined(onLoadFunc!);
            onLoadFunc!();
            assert.isTrue(newImage.removeEventListener.called);
            const newTexture = material.map!;
            assert.notStrictEqual(newTexture, oldTexture);
            assert.strictEqual(newTexture.image, newImage);
        });

        it("creates texture from dynamic property with URL", function () {
            const fakeImageElement: HTMLImageElement = {} as any;
            const oldTexture = new THREE.Texture(
                undefined,
                undefined,
                THREE.RepeatWrapping,
                THREE.MirroredRepeatWrapping,
                THREE.NearestFilter,
                THREE.NearestMipmapNearestFilter
            );
            const material = new THREE.MeshStandardMaterial({ map: oldTexture });
            const newUrl = "foo";
            const env = new MapEnv({ url: newUrl });

            sandbox
                .stub(THREE.ImageLoader.prototype, "load")
                .callsFake((url, onLoad?, _onProgress?, _onError?) => {
                    assert.equal(url, newUrl);
                    onLoad?.(fakeImageElement);
                    return fakeImageElement;
                });

            const adapter = new MapMaterialAdapter(material, {
                map: Expr.fromJSON(["get", "url", ["dynamic-properties"]])
            });
            const updated = adapter.ensureUpdated({ env, frameNumber: 1 });

            assert.isTrue(updated);
            const newTexture = material.map!;
            assert.isDefined(newTexture);
            assert.notStrictEqual(newTexture, oldTexture);
            assert.strictEqual(newTexture.image, fakeImageElement);
            assert.equal(newTexture.wrapS, oldTexture.wrapS);
            assert.equal(newTexture.wrapT, oldTexture.wrapT);
            assert.equal(newTexture.magFilter, oldTexture.magFilter);
            assert.equal(newTexture.minFilter, oldTexture.minFilter);
            assert.equal(newTexture.flipY, oldTexture.flipY);
            assert.equal(newTexture.repeat, oldTexture.repeat);
        });
    });
});
