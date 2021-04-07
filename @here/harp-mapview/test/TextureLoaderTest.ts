/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { getTestResourceUrl } from "@here/harp-test-utils";
import * as chai from "chai";
import * as chai_as_promised from "chai-as-promised";
chai.use(chai_as_promised);
const { expect } = chai;
import "@here/harp-fetch";

import * as THREE from "three";

import { TextureLoader } from "../lib/TextureLoader";

const inNodeContext = typeof window === "undefined";
const texturePath = getTestResourceUrl("@here/harp-mapview", "test/resources/headshot.png");
const jpgTexturePath = getTestResourceUrl("@here/harp-mapview", "test/resources/headshot.jpg");

describe("TextureLoader", function () {
    describe("load", function () {
        if (inNodeContext) {
            return;
        }

        it("loads images without request headers", async function () {
            const textureLoader = new TextureLoader();
            const texture = await textureLoader.load(texturePath);

            expect(texture.image).to.not.be.undefined;
            expect(texture.format).to.equal(THREE.RGBAFormat);
        });

        it("loads jpg images without request headers", async function () {
            const textureLoader = new TextureLoader();
            const texture = await textureLoader.load(jpgTexturePath);

            expect(texture.image).to.not.be.undefined;
            expect(texture.format).to.equal(THREE.RGBFormat);
        });

        it("loads images with request headers", async function () {
            const textureLoader = new TextureLoader();
            const texture = await textureLoader.load(texturePath, {
                Authorization: "Bearer Foo123"
            });

            expect(texture.image).to.not.be.undefined;
            expect(texture.format).to.equal(THREE.RGBAFormat);
        });

        it("loads jpg images with request headers", async function () {
            const textureLoader = new TextureLoader();
            const texture = await textureLoader.load(jpgTexturePath, {
                Authorization: "Bearer Foo123"
            });

            expect(texture.image).to.not.be.undefined;
            expect(texture.format).to.equal(THREE.RGBFormat);
        });

        it("throws an error if image can not be loaded", async function () {
            const textureLoader = new TextureLoader();

            expect(textureLoader.load("unknown_image.png")).to.eventually.be.rejectedWith(
                /failed to load texture/
            );
        });
    });
});
