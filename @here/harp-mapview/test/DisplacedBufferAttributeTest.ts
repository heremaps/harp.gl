/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";
import * as THREE from "three";

import { DisplacedBufferAttribute } from "../lib/geometry/DisplacedBufferAttribute";

function createBuffer(array: number[], itemSize: number) {
    return new THREE.BufferAttribute(new Uint32Array(array), itemSize);
}

function createTexture(array: number[]) {
    const side = Math.sqrt(array.length);
    expect(side).to.satisfy(Number.isInteger);
    return new THREE.DataTexture(new Float32Array(array), side, side);
}

function getPos(attribute: DisplacedBufferAttribute, index: number): number[] {
    return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
}
describe("DisplacedBufferAttribute", function () {
    it("after reset new attributes and displacement map are used", function () {
        const oldPositions = createBuffer([1, 1, 1], 3);
        const oldNormals = createBuffer([0, 0, 1], 3);
        const oldUvs = createBuffer([0, 0], 2);
        const oldMap = createTexture([10, 11, 12, 13]);
        const displacedAttribute = new DisplacedBufferAttribute(
            oldPositions,
            oldNormals,
            oldUvs,
            oldMap
        );

        const newPositions = createBuffer([5, 5, 5], 3);
        const newNormals = createBuffer([1, 1, 1], 3);
        const newUvs = createBuffer([1, 1], 2);
        const newMap = createTexture([1, 2, 3, 4]);
        displacedAttribute.reset(newPositions, newNormals, newUvs, newMap);

        expect(getPos(displacedAttribute, 0)).deep.equals([9, 9, 9]);
    });

    it("after reset old displaced geometry is dicarded", function () {
        const oldPositions = createBuffer([1, 1, 1], 3);
        const oldNormals = createBuffer([0, 0, 1], 3);
        const oldUvs = createBuffer([0, 0], 2);
        const oldMap = createTexture([1, 1, 1, 1]);
        const displacedAttribute = new DisplacedBufferAttribute(
            oldPositions,
            oldNormals,
            oldUvs,
            oldMap
        );
        expect(getPos(displacedAttribute, 0)).deep.equals([1, 1, 2]);

        oldPositions.setX(0, 2);
        displacedAttribute.reset(oldPositions, oldNormals, oldUvs, oldMap);

        expect(getPos(displacedAttribute, 0)).deep.equals([2, 1, 2]);
    });

    it("consecutive calls to getX/Y/Z with the same index reuse computed position", function () {
        const oldPositions = createBuffer([1, 1, 1], 3);
        const oldNormals = createBuffer([0, 0, 1], 3);
        const oldUvs = createBuffer([0, 0], 2);
        const oldMap = createTexture([1, 1, 1, 1]);
        const displacedAttribute = new DisplacedBufferAttribute(
            oldPositions,
            oldNormals,
            oldUvs,
            oldMap
        );
        expect(getPos(displacedAttribute, 0)).deep.equals([1, 1, 2]);

        oldPositions.setX(0, 2);

        expect(getPos(displacedAttribute, 0)).deep.equals([1, 1, 2]);
    });
});
