/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Style, Theme } from "@here/harp-datasource-protocol";
import {
    GeoCoordinates,
    MercatorConstants,
    sphereProjection,
    TileKey,
    Vector3Like
} from "@here/harp-geoutils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { MapView } from "../lib/MapView";
import { PolarTileDataSource } from "../lib/PolarTileDataSource";
import { Tile } from "../lib/Tile";

const MAXIMUM_LATITUDE = THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE);

describe("PolarTileDataSource", function () {
    let dataSource: PolarTileDataSource;
    let mapViewStub: sinon.SinonStubbedInstance<MapView>;

    const north_style: Style = {
        when: ["==", ["get", "kind"], "north_pole"],
        technique: "fill",
        attr: { color: "#dac0de" },
        styleSet: "polar"
    };
    const south_style: Style = {
        when: ["==", ["get", "kind"], "south_pole"],
        technique: "fill",
        attr: { color: "#bada55" },
        styleSet: "polar"
    };

    const theme_both: Theme = {
        styles: {
            polar: [north_style, south_style]
        }
    };
    const theme_south: Theme = {
        styles: {
            polar: [south_style]
        }
    };
    const renderer = { capabilities: { isWebGL2: false } };

    describe("should", function () {
        it("#canGetTile()", function () {
            dataSource = new PolarTileDataSource({
                storageLevelOffset: 0,
                styleSetName: "polar"
            });

            const msgLess = "should not render tileKey of level less than current";
            const msgMore = "should not render tileKey of level more than current";
            const msgCurr = "should render tileKey of level equal to current zoomLevel";
            const msgOut = "should not render tileKey completely out of pole radius";

            const keyIn1 = TileKey.fromRowColumnLevel(0, 0, 1);
            const keyIn2 = TileKey.fromRowColumnLevel(2, 1, 2);
            const keyOut3 = TileKey.fromRowColumnLevel(3, 4, 3);

            assert.isFalse(dataSource.canGetTile(0, keyIn1), msgMore);
            assert.isFalse(dataSource.canGetTile(2, keyIn1), msgLess);
            assert.isTrue(dataSource.canGetTile(1, keyIn1), msgCurr);

            assert.isFalse(dataSource.canGetTile(1, keyIn2), msgMore);
            assert.isFalse(dataSource.canGetTile(3, keyIn2), msgLess);
            assert.isTrue(dataSource.canGetTile(2, keyIn2), msgCurr);

            assert.isFalse(dataSource.canGetTile(2, keyOut3), msgOut);
            assert.isFalse(dataSource.canGetTile(3, keyOut3), msgOut);
            assert.isFalse(dataSource.canGetTile(4, keyOut3), msgOut);
        });

        it("#shouldSubdivide()", function () {
            dataSource = new PolarTileDataSource({
                storageLevelOffset: 0
            });

            const msgLess = "should subdivide tileKey of level less than current";
            const msgMore = "should not subdivide tileKey of level more than current";
            const msgCurr = "should not subdivide tileKey of level equal to current zoomLevel";
            const msgOut = "should not subdivide tileKey completely out of pole radius";

            const keyIn1 = TileKey.fromRowColumnLevel(0, 0, 1);
            const keyIn2 = TileKey.fromRowColumnLevel(2, 1, 2);
            const keyOut3 = TileKey.fromRowColumnLevel(3, 4, 3);

            assert.isFalse(dataSource.shouldSubdivide(0, keyIn1), msgMore);
            assert.isFalse(dataSource.shouldSubdivide(1, keyIn1), msgCurr);
            assert.isTrue(dataSource.shouldSubdivide(2, keyIn1), msgLess);

            assert.isFalse(dataSource.shouldSubdivide(1, keyIn2), msgMore);
            assert.isFalse(dataSource.shouldSubdivide(2, keyIn2), msgCurr);
            assert.isTrue(dataSource.shouldSubdivide(3, keyIn2), msgLess);

            assert.isFalse(dataSource.shouldSubdivide(2, keyOut3), msgOut);
            assert.isFalse(dataSource.shouldSubdivide(3, keyOut3), msgOut);
            assert.isFalse(dataSource.shouldSubdivide(4, keyOut3), msgOut);
        });
    });

    describe("styles", function () {
        function checkObjectsMaterial(
            object: THREE.Object3D,
            callback: (material: THREE.Material) => void
        ) {
            const mesh = object as THREE.Mesh;
            if (mesh.material !== undefined) {
                if (mesh.material instanceof Array) {
                    mesh.material.forEach(callback);
                } else {
                    callback(mesh.material);
                }
            }

            for (const child of object.children) {
                checkObjectsMaterial(child, callback);
            }
        }

        function checkMaterialColor(material: THREE.Material, color: string) {
            if (material === undefined) {
                return;
            }
            const mat = material as any;
            if (mat.color !== undefined) {
                assert.equal("#" + mat.color.getHexString(), color);
            }
        }

        beforeEach(function () {
            dataSource = new PolarTileDataSource({});
            mapViewStub = sinon.createStubInstance(MapView);
            sinon.stub(mapViewStub, "projection").get(function () {
                return sphereProjection;
            });
            sinon.stub(mapViewStub, "renderer").get(function () {
                return renderer;
            });
            dataSource.attach((mapViewStub as unknown) as MapView);
        });

        it("Creates empty tile if no pole styles set", function () {
            const north = dataSource.getTile(TileKey.fromRowColumnLevel(2, 1, 2));
            const south = dataSource.getTile(TileKey.fromRowColumnLevel(0, 1, 2));

            assert.equal(north.objects.length, 0);
            assert.equal(south.objects.length, 0);
        });

        it("Creates tile with objects if has pole styles", async function () {
            await dataSource.setTheme(theme_south);
            const north = dataSource.getTile(TileKey.fromRowColumnLevel(2, 1, 2));
            const south = dataSource.getTile(TileKey.fromRowColumnLevel(0, 1, 2));

            assert.equal(north.objects.length, 0);
            assert.equal(south.objects.length, 1);
        });

        it("Creates meshes with proper materials", async function () {
            await dataSource.setTheme(theme_both);
            const north = dataSource.getTile(TileKey.fromRowColumnLevel(2, 1, 2));
            const south = dataSource.getTile(TileKey.fromRowColumnLevel(0, 1, 2));

            assert.equal(north.objects.length, 1);
            assert.equal(south.objects.length, 1);

            checkObjectsMaterial(north.objects[0] as THREE.Object3D, material => {
                checkMaterialColor(material, north_style.attr!.color as string);
            });
            checkObjectsMaterial(south.objects[0] as THREE.Object3D, material => {
                checkMaterialColor(material, south_style.attr!.color as string);
            });
        });

        it("Don't create geometries if disposed", async function () {
            await dataSource.setTheme(theme_both);
            dataSource.dispose();

            const north = dataSource.getTile(TileKey.fromRowColumnLevel(2, 1, 2));
            const south = dataSource.getTile(TileKey.fromRowColumnLevel(0, 1, 2));

            assert.equal(north.objects.length, 0);
            assert.equal(south.objects.length, 0);
        });
    });

    describe("geometry", function () {
        const v1 = new THREE.Vector3();
        function getTilePoints(tile: Tile): THREE.Vector3[] {
            const points = [];

            for (const tileObject of tile.objects) {
                const mesh = tileObject as THREE.Mesh;

                const positionBufferAttribute = mesh.geometry.getAttribute("position");
                for (let i = 0; i < positionBufferAttribute.itemSize; i++) {
                    const point = new THREE.Vector3(
                        positionBufferAttribute.getX(i),
                        positionBufferAttribute.getY(i),
                        positionBufferAttribute.getZ(i)
                    );
                    points.push(v1.addVectors(point, tile.center).clone());
                }
            }
            return points;
        }

        beforeEach(async function () {
            dataSource = new PolarTileDataSource({});

            mapViewStub = sinon.createStubInstance(MapView);
            sinon.stub(mapViewStub, "projection").get(function () {
                return sphereProjection;
            });
            sinon.stub(mapViewStub, "renderer").get(function () {
                return renderer;
            });
            dataSource.attach((mapViewStub as unknown) as MapView);
            await dataSource.setTheme(theme_both);
        });

        it("Creates empty tile if outside of pole radius", function () {
            const tile1 = dataSource.getTile(TileKey.fromRowColumnLevel(1, 0, 2));
            const tile2 = dataSource.getTile(TileKey.fromRowColumnLevel(0, 0, 5));

            assert.equal(tile1.objects.length, 0);
            assert.equal(tile2.objects.length, 0);
        });

        it("Geometry should not exceed pole radius", function () {
            this.timeout(5000);
            const EPSILON = 1e-5;
            const minLevel = 1; // at zoomLevel 0 there's no hole at the poles
            const maxLevel = 8;
            for (let level = minLevel; level <= maxLevel; level++) {
                const size = 1 << level;

                let tilesHit = 0;
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const tileKey = TileKey.fromRowColumnLevel(y, x, level);
                        if (dataSource.canGetTile(level, tileKey) === false) {
                            continue;
                        }
                        const tile = dataSource.getTile(tileKey);

                        const points = getTilePoints(tile);
                        for (const point of points) {
                            const geoPos = sphereProjection.unprojectPoint(point);
                            if (geoPos.latitude > 0) {
                                assert.isAbove(
                                    geoPos.latitude,
                                    MAXIMUM_LATITUDE - EPSILON,
                                    "Point should fit north pole"
                                );
                            } else {
                                assert.isBelow(
                                    geoPos.latitude,
                                    -MAXIMUM_LATITUDE + EPSILON,
                                    "Point should fit south pole"
                                );
                            }
                        }
                        tilesHit++;
                    }
                }

                assert.isAbove(
                    tilesHit,
                    1,
                    "zoomLevel should have at least 2 tile geometries for south and north pole"
                );
            }
        });

        /**
         * Take all the points around the pole for given zoomLevel.
         * Then take the tiles from polar datasource, get the points and check they intersect.
         */
        function checkFitAtOffset(offset: number, minLevel: number, maxLevel: number) {
            // there's significant precision drop on levels 1 to 6, with maximum at about 0.12
            // from level 7 and deeper, precision stays less than 0.01
            // note: the values is in meters here
            const EPSILON = 1;
            const EPSILON_SQ = EPSILON * EPSILON;
            const EPSILON_LAT = 1e-5;

            // const offset = dataSource.geometryLevelOffset;
            dataSource.geometryLevelOffset = offset;

            for (let level = minLevel; level <= maxLevel; level++) {
                const displayLevel = dataSource.getDataZoomLevel(level);
                const displaySize = 1 << displayLevel;
                const offsetLevel = level + offset;
                const offsetSize = 1 << offsetLevel;

                const northPolePoints = [];
                const southPolePoints = [];

                const northPointHits = [];
                const southPointHits = [];

                for (let i = 0; i < offsetSize; i++) {
                    const longitude = (i / offsetSize) * 360 - 180;

                    const geoNorth = new GeoCoordinates(MAXIMUM_LATITUDE, longitude, 0);
                    const geoSouth = new GeoCoordinates(-MAXIMUM_LATITUDE, longitude, 0);

                    const worldNorth = sphereProjection.projectPoint(geoNorth);
                    const worldSouth = sphereProjection.projectPoint(geoSouth);

                    northPolePoints.push(worldNorth);
                    southPolePoints.push(worldSouth);

                    northPointHits.push(false);
                    southPointHits.push(false);
                }

                if (northPolePoints.length === 0) {
                    continue;
                }

                function checkAndRemove(
                    point: THREE.Vector3,
                    list: Vector3Like[],
                    hits: boolean[]
                ) {
                    for (let i = 0; i < list.length; i++) {
                        if (point.distanceToSquared(list[i] as THREE.Vector3) < EPSILON_SQ) {
                            hits[i] = true;
                        }
                    }
                }

                for (let y = 0; y < displaySize; y++) {
                    for (let x = 0; x < displaySize; x++) {
                        const tileKey = TileKey.fromRowColumnLevel(y, x, displayLevel);

                        const tile = dataSource.getTile(tileKey);
                        if (tile.objects.length === 0) {
                            continue;
                        }

                        const points = getTilePoints(tile);

                        for (const point of points) {
                            const geoPos = sphereProjection.unprojectPoint(point);

                            if (Math.abs(geoPos.latitude - MAXIMUM_LATITUDE) < EPSILON_LAT) {
                                checkAndRemove(point, northPolePoints, northPointHits);
                            }
                            if (Math.abs(geoPos.latitude - -MAXIMUM_LATITUDE) < EPSILON_LAT) {
                                checkAndRemove(point, southPolePoints, southPointHits);
                            }
                        }
                    }
                }

                assert.equal(
                    northPointHits.filter(n => !n).length,
                    0,
                    `Geometry at level ${level} and offset ${offset} doesn't match north longitues`
                );
                assert.equal(
                    southPointHits.filter(n => !n).length,
                    0,
                    `Geometry at level ${level} and offset ${offset} doesn't match south longitues`
                );
            }
        }

        //TODO: Check what this does exactly, it seems to rely on some more or less random precision
        it.skip("Match Web Mercator tiles at different storageLevelOffset values", function () {
            checkFitAtOffset(-1, 2, 7);
            checkFitAtOffset(2, 0, 7);
        });
    });
});
