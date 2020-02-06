/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
// tslint:disable:no-unused-expression
//    Chai uses properties instead of functions for some expect checks.

import { expect } from "chai";
import * as THREE from "three";

import * as geo from "@here/harp-geoutils";
import {
    EdgeLengthGeometrySubdivisionModifier,
    SubdivisionMode
} from "../lib/EdgeLengthGeometrySubdivisionModifier";

describe("EdgeLengthGeometrySubdivisionModifier", function() {
    it("subdivides tile bounds plane", function() {
        const geoPoint = new geo.GeoCoordinates(53.3, 13.4);
        const tileKey = geo.webMercatorTilingScheme.getTileKey(geoPoint, 3);

        // tslint:disable-next-line: no-unused-expression
        expect(tileKey).is.not.undefined;

        const geobox = geo.webMercatorTilingScheme.getGeoBox(tileKey!);
        const { south, north, east, west } = geobox;

        const geometry = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(
            new Float32Array([
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(south, west), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(south, east), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(north, west), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(north, east), new THREE.Vector3())
                    .toArray()
            ]),
            3
        );
        geometry.setAttribute("position", posAttr);
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));

        const modifier = new EdgeLengthGeometrySubdivisionModifier(
            2,
            geobox,
            SubdivisionMode.All,
            geo.mercatorProjection
        );
        modifier.modify(geometry);

        expect(posAttr.count).to.equal(13);

        const { maxLength } = modifier;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const geoIndex = geometry.getIndex();
        expect(geoIndex).to.not.be.null;
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

            expect(a.distanceTo(b)).to.be.lte(maxLength);
            expect(b.distanceTo(c)).to.be.lte(maxLength);
            expect(c.distanceTo(a)).to.be.lte(maxLength);

            expect(a.distanceTo(b)).to.be.greaterThan(0);
            expect(b.distanceTo(c)).to.be.greaterThan(0);
            expect(c.distanceTo(a)).to.be.greaterThan(0);
        }
    });

    it("subdivides tile bounds plane only at the edges", function() {
        const geoPoint = new geo.GeoCoordinates(53.3, 13.4);
        const tileKey = geo.webMercatorTilingScheme.getTileKey(geoPoint, 3);

        // tslint:disable-next-line: no-unused-expression
        expect(tileKey).is.not.undefined;

        const geobox = geo.webMercatorTilingScheme.getGeoBox(tileKey!);
        const { south, north, east, west } = geobox;

        const geometry = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(
            new Float32Array([
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(south, west), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(south, east), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(north, west), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(north, east), new THREE.Vector3())
                    .toArray()
            ]),
            3
        );
        geometry.setAttribute("position", posAttr);
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));

        const modifier = new EdgeLengthGeometrySubdivisionModifier(
            2,
            geobox,
            SubdivisionMode.OnlyEdges,
            geo.mercatorProjection
        );
        modifier.modify(geometry);

        expect(posAttr.count).to.equal(12);

        const { maxLength } = modifier;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const geoIndex = geometry.getIndex();
        expect(geoIndex).to.not.be.null;
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

            if (a.x === b.x || a.y === b.y) {
                expect(a.distanceTo(b)).to.be.lte(maxLength);
            }
            if (b.x === c.x || b.y === c.y) {
                expect(b.distanceTo(c)).to.be.lte(maxLength);
            }
            if (c.x === a.x || c.y === a.y) {
                expect(c.distanceTo(a)).to.be.lte(maxLength);
            }

            expect(a.distanceTo(b)).to.be.greaterThan(0);
            expect(b.distanceTo(c)).to.be.greaterThan(0);
            expect(c.distanceTo(a)).to.be.greaterThan(0);
        }
    });

    it("subdivides tile bounds plane without subdividing diagonals", function() {
        const geoPoint = new geo.GeoCoordinates(53.3, 13.4);
        const tileKey = geo.webMercatorTilingScheme.getTileKey(geoPoint, 3);

        // tslint:disable-next-line: no-unused-expression
        expect(tileKey).is.not.undefined;

        const geobox = geo.webMercatorTilingScheme.getGeoBox(tileKey!);
        const { south, north, east, west } = geobox;

        const geometry = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(
            new Float32Array([
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(south, west), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(south, east), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(north, west), new THREE.Vector3())
                    .toArray(),
                ...geo.mercatorProjection
                    .projectPoint(new geo.GeoCoordinates(north, east), new THREE.Vector3())
                    .toArray()
            ]),
            3
        );
        geometry.setAttribute("position", posAttr);
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));

        const modifier = new EdgeLengthGeometrySubdivisionModifier(
            2,
            geobox,
            SubdivisionMode.NoDiagonals,
            geo.mercatorProjection
        );
        modifier.modify(geometry);

        expect(posAttr.count).to.equal(12);

        const { maxLength } = modifier;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const geoIndex = geometry.getIndex();
        expect(geoIndex).to.not.be.null;
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

            if (a.x === b.x || a.y === b.y) {
                expect(a.distanceTo(b)).to.be.lte(maxLength);
            }
            if (b.x === c.x || b.y === c.y) {
                expect(b.distanceTo(c)).to.be.lte(maxLength);
            }
            if (c.x === a.x || c.y === a.y) {
                expect(c.distanceTo(a)).to.be.lte(maxLength);
            }

            expect(a.distanceTo(b)).to.be.greaterThan(0);
            expect(b.distanceTo(c)).to.be.greaterThan(0);
            expect(c.distanceTo(a)).to.be.greaterThan(0);
        }
    });
});
