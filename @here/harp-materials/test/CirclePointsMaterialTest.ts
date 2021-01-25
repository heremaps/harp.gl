/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";
import * as THREE from "three";

import { CirclePointsMaterial } from "../lib/CirclePointsMaterial";

describe("CirclePointsMaterial", function () {
    describe("#constructor()", function () {
        it("creates material with default parameters", function () {
            const material = new CirclePointsMaterial();
            expect(material).to.be.an.instanceof(CirclePointsMaterial);
        });

        it("creates material with empty parameters", function () {
            const material = new CirclePointsMaterial({
                rendererCapabilities: { isWebGL2: false } as any
            });

            expect(material.size).to.equal(CirclePointsMaterial.DEFAULT_CIRCLE_SIZE);
            expect(material.color.getHex()).to.equal(0xffffff);
            expect(material.opacity).to.equal(1.0);
        });

        it("creates material with partial parameters object", function () {
            const material = new CirclePointsMaterial({
                color: new THREE.Color(0xfefefe),
                rendererCapabilities: { isWebGL2: false } as any
            });

            expect(material.size).to.equal(CirclePointsMaterial.DEFAULT_CIRCLE_SIZE);
            expect(material.color.getHex()).to.equal(0xfefefe);
            expect(material.opacity).to.equal(1.0);
        });

        it("creates material with parameters object", function () {
            const material = new CirclePointsMaterial({
                size: 32,
                color: new THREE.Color(0xfefefe),
                opacity: 0.5,
                rendererCapabilities: { isWebGL2: false } as any
            });

            expect(material.size).to.equal(32);
            expect(material.color.getHex()).to.equal(0xfefefe);
            expect(material.opacity).to.equal(0.5);
        });
    });

    describe("#size", function () {
        it("updates size", function () {
            const material = new CirclePointsMaterial({
                rendererCapabilities: { isWebGL2: false } as any
            });
            material.size = 32;

            expect(material.size).to.equal(32);
            expect(material.uniforms.size.value).to.equal(32);
        });
    });

    describe("#setOpacity", function () {
        it("updates opacity", function () {
            const material = new CirclePointsMaterial({
                rendererCapabilities: { isWebGL2: false } as any
            });
            material.setOpacity(0.7);

            expect(material.opacity).to.equal(0.7);
            expect(material.uniforms.opacity.value).to.equal(0.7);
        });
    });

    describe("#color", function () {
        it("updates color", function () {
            const material = new CirclePointsMaterial({
                rendererCapabilities: { isWebGL2: false } as any
            });
            material.color = new THREE.Color(0xfefefe);

            expect(material.color.getHex()).to.equal(0xfefefe);
            expect(material.uniforms.diffuse.value.getHex()).to.equal(0xfefefe);
            expect(material.uniforms.diffuse.value).to.equal(material.color);
        });

        it("updates color with set", function () {
            const material = new CirclePointsMaterial({
                rendererCapabilities: { isWebGL2: false } as any
            });
            material.color.set(0xfefefe);

            expect(material.color.getHex()).to.equal(0xfefefe);
            expect(material.uniforms.diffuse.value.getHex()).to.equal(0xfefefe);
            expect(material.uniforms.diffuse.value).to.equal(material.color);
        });
    });
});
