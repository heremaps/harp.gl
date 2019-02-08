/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Color, DataTexture } from "three";
import {
    DEFAULT_MONOMIAL_POWER,
    DEFAULT_TEXTURE_HEIGHT,
    SkyGradientTexture
} from "../lib/SkyGradientTexture";

function getSample(
    grad: SkyGradientTexture
): {
    groundPixel: Uint8ClampedArray;
    bottomPixel: Uint8ClampedArray;
    topPixel: Uint8ClampedArray;
    middlePixel: Uint8ClampedArray;
} {
    const textureData = grad.texture.image.data;
    const textureSize = grad.texture.image.height;
    const stride = 3;
    const middlePosition = stride * Math.floor(textureSize / 2);
    const groundPixel = Uint8ClampedArray.from(textureData.slice(0, stride));
    const bottomPixel = Uint8ClampedArray.from(textureData.slice(stride, stride * 2));
    const middlePixel = Uint8ClampedArray.from(
        textureData.slice(middlePosition, middlePosition + stride)
    );
    const topPixel = Uint8ClampedArray.from(textureData.slice(stride * textureSize - stride));
    const sample = {
        groundPixel,
        bottomPixel,
        middlePixel,
        topPixel
    };
    return sample;
}

describe("SkyGradientTexture", function() {
    describe("SkyGradientTexture()", function() {
        it("generates a texture and has a topColor and an bottomColor", function() {
            const grad = new SkyGradientTexture(
                new Color("#FF0000"),
                new Color("#0000FF"),
                new Color("#00FF00"),
                DEFAULT_MONOMIAL_POWER
            );
            const sample = getSample(grad);
            const expectedGroundPixel = Uint8ClampedArray.from([0, 255, 0]);
            const expectedTopPixel = Uint8ClampedArray.from([254, 0, 0]);
            const expectedBottomPixel = Uint8ClampedArray.from([
                Math.floor(255 * (1 / DEFAULT_TEXTURE_HEIGHT) ** DEFAULT_MONOMIAL_POWER),
                0,
                Math.floor(255 - 255 * (1 / DEFAULT_TEXTURE_HEIGHT) ** DEFAULT_MONOMIAL_POWER)
            ]);

            assert.deepEqual(sample.groundPixel, expectedGroundPixel);
            assert.deepEqual(sample.topPixel, expectedTopPixel);
            assert.deepEqual(sample.bottomPixel, expectedBottomPixel);
            assert.instanceOf(grad.texture, DataTexture, "is an instance of DataTexture");
        });

        it("generates an interpolated texture", function() {
            const grad = new SkyGradientTexture(
                new Color("#FF0000"),
                new Color("#0000FF"),
                new Color("#00FF00"),
                DEFAULT_MONOMIAL_POWER
            );
            const sample = getSample(grad);
            const expectedMiddlePixel = Uint8ClampedArray.from([
                Math.floor(255 * 0.5 ** DEFAULT_MONOMIAL_POWER),
                0,
                Math.floor(255 - 255 * 0.5 ** DEFAULT_MONOMIAL_POWER)
            ]);

            assert.deepEqual(sample.middlePixel, expectedMiddlePixel);
            assert.instanceOf(grad.texture, DataTexture, "is an instance of DataTexture");
        });

        it("generates a texture with a given height", function() {
            const grad = new SkyGradientTexture(
                new Color("#FF0000"),
                new Color("#0000FF"),
                new Color("#00FF00"),
                DEFAULT_MONOMIAL_POWER,
                512
            );

            const sample = getSample(grad);
            const expectedGroundPixel = Uint8ClampedArray.from([0, 255, 0]);
            const expectedTopPixel = Uint8ClampedArray.from([254, 0, 0]);
            const expectedBottomPixel = Uint8ClampedArray.from([
                Math.floor(255 * (1 / DEFAULT_TEXTURE_HEIGHT) ** DEFAULT_MONOMIAL_POWER),
                0,
                Math.floor(255 - 255 * (1 / DEFAULT_TEXTURE_HEIGHT) ** DEFAULT_MONOMIAL_POWER)
            ]);
            const expectedHeight = 512;

            assert.deepEqual(sample.groundPixel, expectedGroundPixel);
            assert.deepEqual(sample.topPixel, expectedTopPixel);
            assert.deepEqual(sample.bottomPixel, expectedBottomPixel);
            assert.equal(grad.texture.image.height, expectedHeight);
            assert.instanceOf(grad.texture, DataTexture, "is an instance of DataTexture");
        });
    });

    describe("update()", function() {
        it("it updates the gradient with the given colors", function() {
            const grad = new SkyGradientTexture(
                new Color("#FFF000"),
                new Color("#00F0FF"),
                new Color("#0FFF00"),
                DEFAULT_MONOMIAL_POWER
            );
            let sample = getSample(grad);

            grad.update(new Color("#00FF00"), new Color("#0000FF"), new Color("#FF0000"));
            sample = getSample(grad);
            const expectedGroundPixel = Uint8ClampedArray.from([255, 0, 0]);
            const expectedTopPixel = Uint8ClampedArray.from([0, 254, 0]);
            const expectedBottomPixel = Uint8ClampedArray.from([
                0,
                Math.floor(255 * (1 / DEFAULT_TEXTURE_HEIGHT) ** DEFAULT_MONOMIAL_POWER),
                Math.floor(255 - 255 * (1 / DEFAULT_TEXTURE_HEIGHT) ** DEFAULT_MONOMIAL_POWER)
            ]);

            assert.deepEqual(sample.groundPixel, expectedGroundPixel);
            assert.deepEqual(sample.topPixel, expectedTopPixel);
            assert.deepEqual(sample.bottomPixel, expectedBottomPixel);
            assert.instanceOf(grad.texture, DataTexture, "is an instance of DataTexture");
        });
    });

    describe("updateYOffset()", function() {
        it("it updates the texture y-offset", function() {
            const grad = new SkyGradientTexture(
                new Color("#FFF000"),
                new Color("#00F0FF"),
                new Color("#0FFF00"),
                DEFAULT_MONOMIAL_POWER
            );
            grad.updateYOffset(-11);
            assert.equal(grad.texture.offset.y, -11);
        });
    });
});
