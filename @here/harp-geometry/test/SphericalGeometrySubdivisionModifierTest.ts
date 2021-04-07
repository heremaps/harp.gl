/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as geo from "@here/harp-geoutils";
import { assert } from "chai";
import * as THREE from "three";

import { SphericalGeometrySubdivisionModifier } from "../lib/SphericalGeometrySubdivisionModifier";

describe("SphericalGeometrySubdivisionModifier", function () {
    it("SubdivideTileBounds", function () {
        const geoPoint = new geo.GeoCoordinates(53.3, 13.4);

        const tileKey = geo.webMercatorTilingScheme.getTileKey(geoPoint, 3);

        assert.isDefined(tileKey);

        const { south, north, east, west } = geo.webMercatorTilingScheme.getGeoBox(tileKey!);

        const geometry = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(
            new Float32Array([
                ...geo.sphereProjection
                    .projectPoint(new geo.GeoCoordinates(south, west), new THREE.Vector3())
                    .toArray(),
                ...geo.sphereProjection
                    .projectPoint(new geo.GeoCoordinates(south, east), new THREE.Vector3())
                    .toArray(),
                ...geo.sphereProjection
                    .projectPoint(new geo.GeoCoordinates(north, west), new THREE.Vector3())
                    .toArray(),
                ...geo.sphereProjection
                    .projectPoint(new geo.GeoCoordinates(north, east), new THREE.Vector3())
                    .toArray()
            ]),
            3
        );
        geometry.setAttribute("position", posAttr);
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));

        const quality = THREE.MathUtils.degToRad(2);

        const modifier = new SphericalGeometrySubdivisionModifier(quality);
        modifier.modify(geometry);

        assert.equal(posAttr.count, 1851 / posAttr.itemSize);

        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const geoIndex = geometry.getIndex();
        assert.isNotNull(geoIndex);
        const idxBuffer = geoIndex!.array;
        for (let i = 0; i < idxBuffer.length; i += 3) {
            a.set(
                posAttr.array[idxBuffer[i] * 3],
                posAttr.array[idxBuffer[i] * 3 + 1],
                posAttr.array[idxBuffer[i] * 3 + 2]
            );
            b.set(
                posAttr.array[idxBuffer[i + 1] * 3],
                posAttr.array[idxBuffer[i + 1] * 3 + 1],
                posAttr.array[idxBuffer[i + 1] * 3 + 2]
            );
            c.set(
                posAttr.array[idxBuffer[i + 2] * 3],
                posAttr.array[idxBuffer[i + 2] * 3 + 1],
                posAttr.array[idxBuffer[i + 2] * 3 + 2]
            );

            assert.isAtMost(a.angleTo(b), quality);
            assert.isAtMost(b.angleTo(c), quality);
            assert.isAtMost(c.angleTo(a), quality);

            assert.isAbove(a.angleTo(b), 0);
            assert.isAbove(b.angleTo(c), 0);
            assert.isAbove(c.angleTo(a), 0);
        }
    });
});
