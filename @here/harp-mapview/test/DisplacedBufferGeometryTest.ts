/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import {
    DisplacedBufferGeometry,
    DisplacementRange
} from "../lib/geometry/DisplacedBufferGeometry";

function createBuffer(array: number[], itemSize: number) {
    return new THREE.BufferAttribute(new Uint32Array(array), itemSize);
}

function createTexture(array: number[]) {
    const side = Math.sqrt(array.length);
    expect(side).to.satisfy(Number.isInteger);
    return new THREE.DataTexture(new Float32Array(array), side, side);
}

function createGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.attributes.position = createBuffer([1, 1, 1, 2, 2, 2], 3);
    geometry.attributes.normal = createBuffer([0, 0, 1, 0, 0, 1], 3);
    geometry.attributes.uv = createBuffer([0, 0, 0, 0], 2);
    geometry.index = createBuffer([0, 1], 1);
    geometry.groups = [{ start: 0, count: 2 }];
    geometry.drawRange = { start: 0, count: 2 };
    return geometry;
}
describe("DisplacedBufferGeometry", function () {
    it("constructor sets all properties except position attributes with same values as in original \
    geometry", function () {
        const originalGeometry = createGeometry();
        const displacementMap = createTexture([1]);
        const displacementRange: DisplacementRange = { min: 1, max: 1 };
        const displacedGeometry = new DisplacedBufferGeometry(
            originalGeometry,
            displacementMap,
            displacementRange
        );
        expect(displacedGeometry.index).deep.equals(originalGeometry.index);
        expect(displacedGeometry.groups).deep.equals(originalGeometry.groups);
        expect(displacedGeometry.drawRange).deep.equals(originalGeometry.drawRange);
        expect(displacedGeometry.index).deep.equals(originalGeometry.index);

        expect(displacedGeometry.attributes.position).not.equals(
            originalGeometry.attributes.position
        );
        displacedGeometry.attributes.position = originalGeometry.attributes.position;
        expect(displacedGeometry.attributes).deep.equals(originalGeometry.attributes);
    });

    it("after reset new geometry and displacement map are used", function () {
        const originalGeometry = createGeometry();
        const displacementMap = createTexture([1]);
        const displacementRange: DisplacementRange = { min: 1, max: 1 };
        const displacedGeometry = new DisplacedBufferGeometry(
            originalGeometry,
            displacementMap,
            displacementRange
        );
        const newGeometry = createGeometry();
        newGeometry.attributes.position.setXYZ(0, 5, 5, 5);
        newGeometry.attributes.normal.setXYZ(0, 1, 1, 1);
        newGeometry.attributes.uv.setXY(0, 1, 0);
        newGeometry.index!.setX(1, 0);
        newGeometry.groups = [
            { start: 0, count: 1 },
            { start: 1, count: 1 }
        ];
        newGeometry.drawRange = { start: 0, count: 1 };
        const newMap = createTexture([100]);
        const newRange: DisplacementRange = { min: 100, max: 100 };
        displacedGeometry.reset(newGeometry, newMap, newRange);

        expect(displacedGeometry.attributes.position.getX(0)).equals(105);
        expect(displacedGeometry.index).deep.equals(newGeometry.index);
        expect(displacedGeometry.groups).deep.equals(newGeometry.groups);
        expect(displacedGeometry.drawRange).deep.equals(newGeometry.drawRange);
        expect(displacedGeometry.index).deep.equals(newGeometry.index);
        displacedGeometry.attributes.position = newGeometry.attributes.position;
        expect(displacedGeometry.attributes).deep.equals(newGeometry.attributes);
    });

    it("reset keeps valid bounding volumes", function () {
        const originalGeometry = createGeometry();
        const displacementMap = createTexture([1]);
        const displacementRange: DisplacementRange = { min: 1, max: 1 };
        const displacedGeometry = new DisplacedBufferGeometry(
            originalGeometry,
            displacementMap,
            displacementRange
        );
        displacedGeometry.computeBoundingBox();
        displacedGeometry.computeBoundingSphere();

        const computeBBoxSpy = sinon.spy(displacedGeometry, "computeBoundingBox");
        const computeBSphereSpy = sinon.spy(displacedGeometry, "computeBoundingSphere");
        displacedGeometry.reset(originalGeometry, displacementMap, displacementRange);

        expect(computeBBoxSpy.called).equals(false);
        expect(computeBSphereSpy.called).equals(false);
    });

    it("reset with new geometry updates old bounding volumes", function () {
        const originalGeometry = createGeometry();
        const displacementMap = createTexture([1]);
        const displacementRange: DisplacementRange = { min: 1, max: 1 };
        const displacedGeometry = new DisplacedBufferGeometry(
            originalGeometry,
            displacementMap,
            displacementRange
        );
        displacedGeometry.computeBoundingBox();
        displacedGeometry.computeBoundingSphere();

        // Bounding volumes are updated on reset to new geometry without bounding box.
        const newGeometry = createGeometry();

        const computeBBoxSpy = sinon.spy(displacedGeometry, "computeBoundingBox");
        const computeBSphereSpy = sinon.spy(displacedGeometry, "computeBoundingSphere");
        displacedGeometry.reset(newGeometry, displacementMap, displacementRange);

        expect(computeBBoxSpy.called).equals(true);
        expect(computeBSphereSpy.called).equals(true);

        // They are also updated on reset to new geometry with a different bounding box.
        computeBBoxSpy.resetHistory();
        computeBSphereSpy.resetHistory();
        newGeometry.attributes.position.setXYZ(0, 5, 5, 5);
        newGeometry.computeBoundingBox();
        displacedGeometry.reset(newGeometry, displacementMap, displacementRange);

        expect(computeBBoxSpy.called).equals(true);
        expect(computeBSphereSpy.called).equals(true);
    });

    it("reset with new displacement min/max updates old bounding volumes", function () {
        const originalGeometry = createGeometry();
        const displacementMap = createTexture([1]);
        const displacementRange: DisplacementRange = { min: 1, max: 1 };
        const displacedGeometry = new DisplacedBufferGeometry(
            originalGeometry,
            displacementMap,
            displacementRange
        );
        displacedGeometry.computeBoundingBox();
        displacedGeometry.computeBoundingSphere();

        const computeBBoxSpy = sinon.spy(displacedGeometry, "computeBoundingBox");
        const computeBSphereSpy = sinon.spy(displacedGeometry, "computeBoundingSphere");
        displacedGeometry.reset(displacedGeometry, displacementMap, { min: 2, max: 2 });

        expect(computeBBoxSpy.called).equals(true);
        expect(computeBSphereSpy.called).equals(true);
    });

    it("computeBoundingBox creates bbox containing all possible displaced positions", function () {
        const originalGeometry = createGeometry();
        const displacementMap = createTexture([1]);
        originalGeometry.attributes.position = createBuffer([1, 1, 1, 2, 2, 2], 3);
        originalGeometry.attributes.normal = createBuffer([0, 0, 1, 0, 0, 1], 3);
        const displacementRange: DisplacementRange = { min: 5, max: 25 };
        const displacedGeometry = new DisplacedBufferGeometry(
            originalGeometry,
            displacementMap,
            displacementRange
        );

        displacedGeometry.computeBoundingBox();
        const bbox: THREE.Box3 = displacedGeometry.boundingBox!;

        const positions = originalGeometry.attributes.position;
        const normals = originalGeometry.attributes.normal;

        for (let i = 0; i < positions.count; ++i) {
            const position = new THREE.Vector3().fromBufferAttribute(positions, i);
            const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
            bbox.containsPoint(
                position.clone().add(normal.clone().multiplyScalar(displacementRange.min))
            );
            bbox.containsPoint(
                position.clone().add(normal.clone().multiplyScalar(displacementRange.max))
            );
        }
    });
});
