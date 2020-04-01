/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";

import { getTestResourceUrl } from "@here/harp-test-utils";
import { MipMapGenerator } from "../lib/image/MipMapGenerator";

const isNode = typeof window === "undefined";

describe("MipMapGenerator", function() {
    let imageData: ImageData;
    let imageBitmap: ImageBitmap;
    before(async function() {
        if (!isNode) {
            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );
            const image = new Image();
            return new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = imageUrl;
            })
                .then(() => {
                    // create image data
                    const canvas = document.createElement("canvas");
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const context = canvas.getContext("2d")!;
                    context.drawImage(image, 0, 0);
                    imageData = context.getImageData(0, 0, image.width, image.height);

                    // create image bitmap
                    return createImageBitmap(image);
                })
                .then(bitmap => {
                    imageBitmap = bitmap;
                });
        }
    });

    describe("generateTextureAtlasMipMap", function() {
        if (isNode) {
            it("throws an error in node context", function() {
                const mipMapGenerator = new MipMapGenerator();
                expect(() => mipMapGenerator.generateTextureAtlasMipMap({} as any)).to.throw;
            });
        } else {
            it("creates mipmaps from ImageData", function() {
                const mipMapGenerator = new MipMapGenerator();
                const mipMaps = mipMapGenerator.generateTextureAtlasMipMap({
                    url: "/test.png",
                    imageData,
                    loaded: true
                });

                expect(mipMaps).to.have.length(7);
                for (let level = 0; level < mipMaps.length; ++level) {
                    const size = Math.pow(2, 6 - level);
                    const image = mipMaps[level];
                    expect(image.width).to.equal(size);
                    expect(image.height).to.equal(size);
                }
            });

            it("creates mipmaps from ImageBitmap", function() {
                const mipMapGenerator = new MipMapGenerator();
                const mipMaps = mipMapGenerator.generateTextureAtlasMipMap({
                    url: "/test.png",
                    imageData: imageBitmap,
                    loaded: true
                });
                expect(mipMaps).to.have.length(7);
                for (let level = 0; level < mipMaps.length; ++level) {
                    const size = Math.pow(2, 6 - level);
                    const image = mipMaps[level];
                    expect(image.width).to.equal(size);
                    expect(image.height).to.equal(size);
                }
            });
        }
    });
});
