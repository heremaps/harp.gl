/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { getTestResourceUrl } from "@here/harp-test-utils";
import { expect } from "chai";

import { ImageItem } from "../lib/image/Image";
import { MipMapGenerator } from "../lib/image/MipMapGenerator";

const isNode = typeof window === "undefined";

describe("MipMapGenerator", function () {
    let imageData: ImageData;
    let imageBitmap: ImageBitmap;
    before(async function () {
        if (!isNode) {
            const imageUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/headshot.png"
            );
            const image = new Image();
            return await new Promise((resolve, reject) => {
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

    describe("generateTextureAtlasMipMap", function () {
        if (isNode) {
            it("throws an error in node context", function () {
                const mipMapGenerator = new MipMapGenerator();
                expect(() => mipMapGenerator.generateTextureAtlasMipMap({} as any)).to.throw;
            });
        } else {
            it("creates mipmaps from ImageData", function () {
                const mipMapGenerator = new MipMapGenerator();
                const mipMaps = mipMapGenerator.generateTextureAtlasMipMap(
                    new ImageItem("/test.png", imageData)
                );

                expect(mipMaps).to.have.length(7);
                for (let level = 0; level < mipMaps.length; ++level) {
                    const size = Math.pow(2, 6 - level);
                    const image = mipMaps[level];
                    expect(image.width).to.equal(size);
                    // The image's height is 32, and not padded to 64 as the width is, hence we
                    // ensure the correct height of the mipmap, note we need to ensure we clamp to 1
                    // hence the `ceil`.
                    expect(image.height).to.equal(Math.ceil(size / 2));
                }
            });

            it("creates mipmaps from ImageBitmap", function () {
                const mipMapGenerator = new MipMapGenerator();
                const mipMaps = mipMapGenerator.generateTextureAtlasMipMap(
                    new ImageItem("/test.png", imageBitmap)
                );
                expect(mipMaps).to.have.length(7);
                for (let level = 0; level < mipMaps.length; ++level) {
                    const size = Math.pow(2, 6 - level);
                    const image = mipMaps[level];
                    expect(image.width).to.equal(size);
                    // See comment above.
                    expect(image.height).to.equal(Math.ceil(size / 2));
                }
            });
        }
    });
});
