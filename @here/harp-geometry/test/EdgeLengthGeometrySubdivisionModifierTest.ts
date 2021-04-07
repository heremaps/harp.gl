/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import * as geo from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import {
    EdgeLengthGeometrySubdivisionModifier,
    SubdivisionMode
} from "../lib/EdgeLengthGeometrySubdivisionModifier";

function checkVerticalAndHorizontalLines(
    a: THREE.Vector3,
    b: THREE.Vector3,
    maxLengthX: number,
    maxLengthY: number
): void {
    if (a.x === b.x) {
        expect(Math.abs(a.y - b.y)).to.be.lte(maxLengthY);
    } else if (a.y === b.y) {
        expect(Math.abs(a.x - b.x)).to.be.lte(maxLengthX);
    }
}

describe("EdgeLengthGeometrySubdivisionModifier", function () {
    it("Does not support spherical projections", function () {
        const geoPoint = new geo.GeoCoordinates(53.3, 13.4);
        const tileKey = geo.webMercatorTilingScheme.getTileKey(geoPoint, 3);
        const geobox = geo.webMercatorTilingScheme.getGeoBox(tileKey!);

        expect(
            () =>
                new EdgeLengthGeometrySubdivisionModifier(
                    2,
                    geobox,
                    SubdivisionMode.All,
                    geo.sphereProjection
                )
        ).to.throw;
    });

    describe("Webmercator tiling scheme", function () {
        let geobox: geo.GeoBox;
        let geometry: THREE.BufferGeometry;
        let posAttr: THREE.BufferAttribute;

        beforeEach(function () {
            const geoPoint = new geo.GeoCoordinates(53.3, 13.4);
            const tileKey = geo.webMercatorTilingScheme.getTileKey(geoPoint, 3);

            expect(tileKey).is.not.undefined;

            geobox = geo.webMercatorTilingScheme.getGeoBox(tileKey!);
            const { south, north, east, west } = geobox;

            geometry = new THREE.BufferGeometry();
            posAttr = new THREE.BufferAttribute(
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
        });

        it("subdivides tile bounds plane", function () {
            const modifier = new EdgeLengthGeometrySubdivisionModifier(
                2,
                geobox,
                SubdivisionMode.All,
                geo.mercatorProjection
            );
            modifier.modify(geometry);

            expect(posAttr.count).to.equal(9);

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

        it("subdivides only horizontal and vertical lines", function () {
            const modifier = new EdgeLengthGeometrySubdivisionModifier(
                2,
                geobox,
                SubdivisionMode.NoDiagonals,
                geo.mercatorProjection
            );
            modifier.modify(geometry);

            expect(posAttr.count).to.equal(12);

            const { maxLengthX, maxLengthY } = modifier;
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

                if (a.x === b.x) {
                    expect(a.x - b.x).to.be.lte(maxLengthY);
                } else if (a.y === b.y) {
                    expect(Math.abs(a.x - b.x)).to.be.lte(maxLengthX);
                }
                checkVerticalAndHorizontalLines(a, b, maxLengthX, maxLengthY);
                checkVerticalAndHorizontalLines(b, c, maxLengthX, maxLengthY);
                checkVerticalAndHorizontalLines(c, a, maxLengthX, maxLengthY);

                expect(a.distanceTo(b)).to.be.greaterThan(0);
                expect(b.distanceTo(c)).to.be.greaterThan(0);
                expect(c.distanceTo(a)).to.be.greaterThan(0);
            }
        });
    });

    describe("Here tiling scheme", function () {
        let geobox: geo.GeoBox;
        let geometry: THREE.BufferGeometry;
        let posAttr: THREE.BufferAttribute;

        beforeEach(function () {
            const geoPoint = new geo.GeoCoordinates(53.3, 13.4);
            const tileKey = geo.hereTilingScheme.getTileKey(geoPoint, 3);

            expect(tileKey).is.not.undefined;

            geobox = geo.hereTilingScheme.getGeoBox(tileKey!);
            const { south, north, east, west } = geobox;

            geometry = new THREE.BufferGeometry();
            posAttr = new THREE.BufferAttribute(
                new Float32Array([
                    ...geo.normalizedEquirectangularProjection
                        .projectPoint(new geo.GeoCoordinates(south, west), new THREE.Vector3())
                        .toArray(),
                    ...geo.normalizedEquirectangularProjection
                        .projectPoint(new geo.GeoCoordinates(south, east), new THREE.Vector3())
                        .toArray(),
                    ...geo.normalizedEquirectangularProjection
                        .projectPoint(new geo.GeoCoordinates(north, west), new THREE.Vector3())
                        .toArray(),
                    ...geo.normalizedEquirectangularProjection
                        .projectPoint(new geo.GeoCoordinates(north, east), new THREE.Vector3())
                        .toArray()
                ]),
                3
            );
            geometry.setAttribute("position", posAttr);
            geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
        });

        it("subdivides tile bounds plane", function () {
            const modifier = new EdgeLengthGeometrySubdivisionModifier(
                2,
                geobox,
                SubdivisionMode.All,
                geo.normalizedEquirectangularProjection
            );
            modifier.modify(geometry);

            expect(posAttr.count).to.equal(9);

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

        it("subdivides only horizontal and vertical lines", function () {
            const modifier = new EdgeLengthGeometrySubdivisionModifier(
                2,
                geobox,
                SubdivisionMode.NoDiagonals,
                geo.normalizedEquirectangularProjection
            );
            modifier.modify(geometry);

            expect(posAttr.count).to.equal(8);

            const { maxLengthX, maxLengthY } = modifier;
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

                if (a.x === b.x) {
                    expect(a.x - b.x).to.be.lte(maxLengthY);
                } else if (a.y === b.y) {
                    expect(Math.abs(a.x - b.x)).to.be.lte(maxLengthX);
                }
                checkVerticalAndHorizontalLines(a, b, maxLengthX, maxLengthY);
                checkVerticalAndHorizontalLines(b, c, maxLengthX, maxLengthY);
                checkVerticalAndHorizontalLines(c, a, maxLengthX, maxLengthY);

                expect(a.distanceTo(b)).to.be.greaterThan(0);
                expect(b.distanceTo(c)).to.be.greaterThan(0);
                expect(c.distanceTo(a)).to.be.greaterThan(0);
            }
        });
    });
});
