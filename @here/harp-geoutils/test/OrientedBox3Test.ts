/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import * as THREE from "three";

import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { OrientedBox3 } from "../lib/math/OrientedBox3";
import { EarthConstants } from "../lib/projection/EarthConstants";
import { sphereProjection } from "../lib/projection/SphereProjection";
import { TileKey } from "../lib/tiling/TileKey";
import { TilingScheme } from "../lib/tiling/TilingScheme";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

/**
 * Visits the tile tree.
 *
 * @param accept - The accepting function. The function must return false to stop the visit.
 * @param tilingScheme - The tiling scheme.
 * @param tileKey - The root tile key.
 */
function visit(
    tilingScheme: TilingScheme,
    accept: (tileKey: TileKey) => boolean,
    tileKey: TileKey = new TileKey(0, 0, 0)
) {
    if (!accept(tileKey)) {
        // stop visiting te subtree
        return;
    }

    // visit the sub tree.
    for (const childTileKey of tilingScheme.getSubTileKeys(tileKey)) {
        visit(tilingScheme, accept, childTileKey);
    }
}

class GlobeControls {
    readonly camera = new THREE.PerspectiveCamera();
    readonly projectionViewMatrix = new THREE.Matrix4();
    readonly frustum = new THREE.Frustum();

    constructor() {
        this.camera.up.set(0, 0, 1); // set the up vector
    }

    /**
     * Place the camera at the given position.
     *
     * @param geoPoint - The position of the camera in geo coordinates.
     */
    set(geoPoint: GeoCoordinates) {
        if (geoPoint.altitude === undefined || geoPoint.altitude === 0) {
            throw new Error("invalid camera position.");
        }

        const pointOnSurface = new THREE.Vector3();

        sphereProjection.projectPoint(
            new GeoCoordinates(geoPoint.latitude, geoPoint.longitude),
            pointOnSurface
        );

        const normal = pointOnSurface.clone().normalize();

        // compute the camera position by adding a properly scaled
        // vector to the surface position.
        const cameraPosition = pointOnSurface.clone().addScaledVector(normal, geoPoint.altitude);

        // set the camera position.
        this.camera.position.copy(cameraPosition);

        // look at the center of the globe.
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        this.camera.updateMatrixWorld(true);

        const bias = 100;

        // set the near and far plane.
        this.camera.far = cameraPosition.length();
        this.camera.near = this.camera.far - (EarthConstants.EQUATORIAL_RADIUS + bias);
        this.camera.updateProjectionMatrix();

        // compute the projectionView matrix.
        this.projectionViewMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );

        // update the view frustum.
        this.frustum.setFromProjectionMatrix(this.projectionViewMatrix);
    }

    /**
     * Computes the list of the tiles interesting the view frustum.
     *
     * @param tilingScheme - The tiling scheme.
     * @param level - The storage level.
     */
    getVisibleTiles(tilingScheme: TilingScheme, level: number) {
        const visibleTiles: TileKey[] = [];

        const visitTile = (tileKey: TileKey) => {
            // get the geobox of the current tile.
            const geoBox = tilingScheme.getGeoBox(tileKey);

            // compute the world oriented bounding box of the tile.
            const obb = new OrientedBox3();
            sphereProjection.projectBox(geoBox, obb);

            // check for intersections with the view frustum.
            if (!obb.intersects(this.frustum)) {
                return false;
            }

            if (tileKey.level === level) {
                // add the tile to the list of the visible tiles.
                visibleTiles.push(tileKey);
            }

            // continue visiting the subtree if the tile's level is less than the requested level.
            return tileKey.level < level;
        };

        visit(tilingScheme, visitTile);

        return visibleTiles;
    }
}

describe("OrientedBox3", function () {
    it("visible tile obbs are correct", function () {
        const controls = new GlobeControls();

        controls.set(new GeoCoordinates(53.3, 13.4, 1000));

        const visibleTiles = controls.getVisibleTiles(webMercatorTilingScheme, 14);

        assert.equal(visibleTiles.length, 2);
    });
    describe("distance", function () {
        it("point inside has zero distance", function () {
            const box = new OrientedBox3(
                new THREE.Vector3(),
                new THREE.Matrix4(),
                new THREE.Vector3(10, 10, 10)
            );

            assert.equal(box.distanceToPoint(new THREE.Vector3()), 0);
        });
        it("points on each side", function () {
            const box = new OrientedBox3(
                new THREE.Vector3(),
                new THREE.Matrix4(),
                new THREE.Vector3(10, 10, 10)
            );

            assert.equal(box.distanceToPoint(new THREE.Vector3(20, 0, 0)), 10);
            assert.equal(box.distanceToPoint(new THREE.Vector3(-20, 0, 0)), 10);
            assert.equal(box.distanceToPoint(new THREE.Vector3(0, 20, 0)), 10);
            assert.equal(box.distanceToPoint(new THREE.Vector3(0, -20, 0)), 10);
            assert.equal(box.distanceToPoint(new THREE.Vector3(0, 0, 20)), 10);
            assert.equal(box.distanceToPoint(new THREE.Vector3(0, 0, -20)), 10);
        });
        it("arbitrary points", function () {
            const box = new OrientedBox3(
                new THREE.Vector3(),
                new THREE.Matrix4(),
                new THREE.Vector3(10, 10, 10)
            );

            assert.equal(box.distanceToPoint(new THREE.Vector3(20, 20, 20)), Math.sqrt(300));
            assert.equal(box.distanceToPoint(new THREE.Vector3(-20, -20, -20)), Math.sqrt(300));
        });
    });

    describe("intersectsRay", function () {
        interface RayIntersectionTestCase {
            name: string;
            // a test case will be created for each box in the list.
            boxes: Array<{
                name: string; // appended to testcase name.
                basis: THREE.Matrix4;
            }>;
            // this ray will be rotated to the basis of the box.
            ray: { o: number[]; dir: number[] };
            result?: number; // Expected intersect distance if given, no intersect otherwise.
        }

        const defaultAABB = { name: "aabb", basis: new THREE.Matrix4() };

        const OBB45degRot = {
            name: "obb",
            basis: new THREE.Matrix4().makeBasis(
                new THREE.Vector3(2, 2, -2 * Math.SQRT2).normalize(),
                new THREE.Vector3(Math.SQRT2 - 2, Math.SQRT2 + 2, 2).normalize(),
                new THREE.Vector3(Math.SQRT2 + 2, Math.SQRT2 - 2, 2).normalize()
            )
        };

        const testCases: RayIntersectionTestCase[] = [
            {
                name: "ray on x axis towards origin hits box at origin",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [20, 0, 0], dir: [-1, 0, 0] },
                result: 10
            },
            {
                name: "ray on y axis towards infinity misses box at origin",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [0, 20, 0], dir: [0, 1, 0] }
            },
            {
                name: "ray collinear to box edge hits",
                boxes: [defaultAABB],
                ray: { o: [20, 10, 10], dir: [-1, 0, 0] },
                result: 10
            },
            {
                name: "ray tangent to box face hits",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [20, 3, 3], dir: [-1, 0, 0] },
                result: 10
            },
            {
                name: "ray parallel to box face outside of box misses",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [20, -10.001, 1], dir: [-1, 0, 0] }
            },
            {
                name: "ray over box misses",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [11, 11, 11], dir: [-21, -21, -0.9] }
            },
            {
                name: "ray from inside of box hits",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [-9, -9, -9], dir: [-1, -1, -1] },
                result: Math.sqrt(3)
            },
            {
                name: "ray from +++ octant towards origin hits box at origin",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [20, 20, 20], dir: [-1, -1, -1] },
                result: Math.sqrt(300)
            },
            {
                name: "ray from -+- octant towards origin hits box at origin",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [-20, 20, -20], dir: [1, -1, 1] },
                result: Math.sqrt(300)
            },
            {
                name: "ray on box +++ corner pointing outwards hits",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [10, 10, 10], dir: [1, 1, 1] },
                result: 0
            },
            {
                name: "ray on box --- corner pointing inwards hits",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [-10.000001, -10.000001, -10.000001], dir: [1, 1, 1] },
                result: 0
            },
            {
                name: "ray on box --- corner pointing outwards hits",
                boxes: [defaultAABB, OBB45degRot],
                ray: { o: [-10, -10, -10], dir: [-1, -1, -1] },
                result: 0
            }
        ];

        for (const testCase of testCases) {
            for (const boxParams of testCase.boxes) {
                it(boxParams.name + ": " + testCase.name, function () {
                    const box = new OrientedBox3(
                        new THREE.Vector3(),
                        boxParams.basis,
                        new THREE.Vector3(10, 10, 10)
                    );

                    // Transform ray to box local space.
                    const ray = new THREE.Ray(
                        new THREE.Vector3().fromArray(testCase.ray.o),
                        new THREE.Vector3().fromArray(testCase.ray.dir).normalize()
                    ).applyMatrix4(box.getRotationMatrix());

                    const actualDistance = box.intersectsRay(ray);
                    if (testCase.result === undefined) {
                        assert.isUndefined(actualDistance);
                    } else {
                        expect(box.intersectsRay(ray)).to.be.closeTo(testCase.result, 1e-5);
                    }
                });
            }
        }
    });
});
