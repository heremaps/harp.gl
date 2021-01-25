/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import * as THREE from "three";

import { BufferAttribute, Geometry } from "../lib/DecodedTile";
import { ThreeBufferUtils } from "../lib/ThreeBufferUtils";

describe("ThreeBufferUtils", function () {
    function bufferElementSize(type: string) {
        switch (type) {
            case "int8":
                return 1;
            case "uint8":
                return 1;
            case "int16":
                return 2;
            case "uint16":
                return 2;
            case "int32":
                return 4;
            case "uint32":
                return 4;
            case "float":
                return 4;
        }
        throw new Error("Unknown buffer element type");
    }
    function compareBufferAttribute(
        threeBufferAttribute: THREE.BufferAttribute,
        harpBufferAttributue: BufferAttribute
    ) {
        expect(threeBufferAttribute.itemSize).to.be.equal(harpBufferAttributue.itemCount);
        const itemSize = bufferElementSize(harpBufferAttributue.type);
        expect(threeBufferAttribute.array.length).to.be.equal(
            harpBufferAttributue.buffer.byteLength / itemSize
        );
        expect(threeBufferAttribute.normalized).to.be.equal(harpBufferAttributue.normalized);
    }

    function compareBufferGeometry(
        threeBufferGeometry: THREE.BufferGeometry,
        harpBufferGeometry: Geometry
    ) {
        if (threeBufferGeometry.index === null) {
            assert(harpBufferGeometry.index === undefined);
        } else {
            assert(harpBufferGeometry.index !== undefined);
            compareBufferAttribute(threeBufferGeometry.index, harpBufferGeometry.index!);
        }
        for (const attrName in threeBufferGeometry.attributes) {
            if (!threeBufferGeometry.hasOwnProperty(attrName)) {
                continue;
            }
            const threeAttr = threeBufferGeometry.attributes[attrName];
            assert(threeAttr !== undefined);
            if (threeAttr.array === undefined) {
                // TODO: Check InterleavedBufferAttribute as well
                continue;
            }
            const threeBufferAttribute = threeAttr as THREE.BufferAttribute;
            const harpAttr = harpBufferGeometry.vertexAttributes?.find((buf: BufferAttribute) => {
                return buf.name === attrName;
            });
            assert(harpAttr !== undefined);
            compareBufferAttribute(threeBufferAttribute, harpAttr!);
        }
    }
    it("convert buffer geometry w/ index buffer", function () {
        const threeBufferGeometry = new THREE.BoxBufferGeometry();
        const techniqueIndex = 42;

        const harpBufferGeometry = ThreeBufferUtils.fromThreeBufferGeometry(
            threeBufferGeometry,
            techniqueIndex
        );

        compareBufferGeometry(threeBufferGeometry, harpBufferGeometry);
    });
    it("convert buffer geometry w/o index buffer", function () {
        const threeBufferGeometry = new THREE.BufferGeometry();
        const vertices = new Array<number>(30);
        const normals = new Array<number>(30);
        const uvs = new Array<number>(20);

        threeBufferGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        threeBufferGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        threeBufferGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

        const techniqueIndex = 42;

        const harpBufferGeometry = ThreeBufferUtils.fromThreeBufferGeometry(
            threeBufferGeometry,
            techniqueIndex
        );

        compareBufferGeometry(threeBufferGeometry, harpBufferGeometry);
    });
});
