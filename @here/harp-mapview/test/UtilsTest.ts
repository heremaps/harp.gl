/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { GeoCoordinates, mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";
import { MapView } from "../lib/MapView";
import { MapViewUtils, TileOffsetUtils } from "../lib/Utils";

const cameraMock = {
    fov: 40,
    rotation: {
        z: 0
    },
    quaternion: new THREE.Quaternion(),
    matrixWorld: new THREE.Matrix4()
};

describe("map-view#Utils", function() {
    it("calculates zoom level", function() {
        const mapViewMock = {
            maxZoomLevel: 20,
            minZoomLevel: 1,
            camera: cameraMock,
            projection: mercatorProjection,
            focalLength: 256,
            pixelRatio: 1.0
        };
        const mapView = (mapViewMock as any) as MapView;

        let result = MapViewUtils.calculateZoomLevelFromDistance(mapView, 0);
        expect(result).to.be.equal(20);
        result = MapViewUtils.calculateZoomLevelFromDistance(mapView, 1000000000000);
        expect(result).to.be.equal(1);
        /*
         *   23.04.2018 - Zoom level outputs come from HARP
         */
        result = MapViewUtils.calculateZoomLevelFromDistance(mapView, 1000);
        result = MapViewUtils.calculateZoomLevelFromDistance(mapView, 10000);
        result = MapViewUtils.calculateZoomLevelFromDistance(mapView, 1000000);
        expect(result).to.be.closeTo(5.32, 0.05);
    });

    it("converts target coordinates from XYZ to camera coordinates", function() {
        const xyzView = {
            zoom: 5,
            yaw: 3,
            pitch: 15,
            center: [10, -10]
        };
        const mapViewMock = {
            camera: cameraMock,
            projection: mercatorProjection,
            focalLength: 256,
            pixelRatio: 1.0
        };
        const mapView = (mapViewMock as any) as MapView;
        const cameraHeight =
            MapViewUtils.calculateDistanceToGroundFromZoomLevel(mapView, xyzView.zoom) /
            Math.cos(THREE.MathUtils.degToRad(xyzView.pitch));
        const cameraCoordinates = MapViewUtils.getCameraCoordinatesFromTargetCoordinates(
            new GeoCoordinates(xyzView.center[0], xyzView.center[1]),
            cameraHeight,
            xyzView.yaw,
            xyzView.pitch,
            mapView
        );
        expect(cameraCoordinates.latitude).to.equal(7.023208311781337);
        expect(cameraCoordinates.longitude).to.equal(-9.842237006382904);
    });

    describe("converts zoom level to distance and distance to zoom level", function() {
        let mapViewMock: any;

        beforeEach(function() {
            mapViewMock = {
                maxZoomLevel: 20,
                minZoomLevel: 1,
                camera: {
                    matrixWorld: new THREE.Matrix4()
                },
                projection: mercatorProjection,
                focalLength: 256,
                pixelRatio: 1.0
            };
        });

        it("ensures that both functions are inverse", function() {
            mapViewMock.camera.matrixWorld.makeRotationX(THREE.MathUtils.degToRad(30));

            for (let zoomLevel = 1; zoomLevel <= 20; zoomLevel += 0.1) {
                const distance = MapViewUtils.calculateDistanceFromZoomLevel(
                    mapViewMock,
                    zoomLevel
                );
                const calculatedZoomLevel = MapViewUtils.calculateZoomLevelFromDistance(
                    mapViewMock,
                    distance
                );
                // Expect accuracy till 10-th fractional digit (10-th place after comma).
                expect(zoomLevel).to.be.closeTo(calculatedZoomLevel, 1e-10);
            }
        });
    });

    it("calculates horizontal and vertical fov", function() {
        const vFov = 60;
        const hFov = THREE.MathUtils.radToDeg(
            MapViewUtils.calculateHorizontalFovByVerticalFov(THREE.MathUtils.degToRad(vFov), 0.9)
        );
        const calculatedVFov = THREE.MathUtils.radToDeg(
            MapViewUtils.calculateVerticalFovByHorizontalFov(THREE.MathUtils.degToRad(hFov), 0.9)
        );
        expect(vFov).to.be.closeTo(calculatedVFov, 0.00000000001);
    });

    it("estimate size of world with one cube", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1768);
        expect(objSize.gpuSize).to.be.equal(0);
    });

    it("estimate size of world with one cube (BufferGeometry)", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const bufferGeometry = new THREE.BufferGeometry().fromGeometry(geometry);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(bufferGeometry, material);
        scene.add(cube);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(2808); // see previous test
        expect(objSize.gpuSize).to.be.equal(1584);
    });

    it("estimate size of world with two cubes that share the geometry", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const bufferGeometry = new THREE.BufferGeometry().fromGeometry(geometry);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube0 = new THREE.Mesh(bufferGeometry, material);
        scene.add(cube0);
        const cube1 = new THREE.Mesh(bufferGeometry, material);
        scene.add(cube1);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(3808); // see previous test: 2808 + 1000 = 3808
        expect(objSize.gpuSize).to.be.equal(1584); // see previous test
    });

    // tslint:disable-next-line: max-line-length
    it("estimate size of world with 1000 cubes (BufferGeometry)", async function(this: Mocha.Context) {
        this.timeout(4000);
        const scene: THREE.Scene = new THREE.Scene();
        for (let i = 0; i < 1000; i++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const bufferGeometry = new THREE.BufferGeometry().fromGeometry(geometry);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const cube = new THREE.Mesh(bufferGeometry, material);
            scene.add(cube);
        }

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(2808000); // see previous test: 2808 * 1000
        expect(objSize.gpuSize).to.be.equal(1584000); // see previous test: 1584 * 1000
    });

    it("estimate size of world with single point", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [new THREE.Vector3(0, 1, 0)];
        const geometry = new THREE.Geometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1024); // 1*vector3 + object3d overhead
        expect(objSize.gpuSize).to.be.equal(0);
    });

    it("estimate size of world with 6 points", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(2, 0, 0),
            new THREE.Vector3(2, 1, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(0, 1, 0)
        ];
        const geometry = new THREE.Geometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1144); // 6*vector3 + object3d overhead
        expect(objSize.gpuSize).to.be.equal(0);
    });

    it("estimate size of world with 6 points (BufferedGeometry)", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray = new Array<THREE.Vector3>(6).fill(new THREE.Vector3());
        const bufferGeometry = new THREE.BufferGeometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(bufferGeometry, material);
        scene.add(points);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1128); // see previous test
        expect(objSize.gpuSize).to.be.equal(72); // 6*3*4 bytes - buffered data
    });

    it("estimate size of world with 6 points making circle", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.CircleGeometry(1, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1456); // 7*vector3 + 6*face + object3d overhead
        expect(objSize.gpuSize).to.be.equal(0);
    });

    it("estimate size of world with line between 2 points", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 5, 0)
        ];
        const geometry = new THREE.Geometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1048); // 2*vector3 + object3d overhead
        expect(objSize.gpuSize).to.be.equal(0);
    });

    it("estimate size of world with line between 2 points (BufferedGeometry)", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 5, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1080);
        expect(objSize.gpuSize).to.be.equal(24);
    });
});

describe("tile-offset#Utils", function() {
    it("test getKeyForTileKeyAndOffset and extractOffsetAndMortonKeyFromKey", async function() {
        // This allows 8 offsets to be stored, -4 -> 3, we test also outside this range
        const bitshift = 3;
        const offsets = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
        // Binary is the easist to read, here you can see the -4 -> 3 is mapped to 0 -> 7
        // in the 3 highest bits.
        const results = [
            0b11100000000000000000000000000000000000000000000000111,
            0b00000000000000000000000000000000000000000000000000111,
            0b00100000000000000000000000000000000000000000000000111,
            0b01000000000000000000000000000000000000000000000000111,
            0b01100000000000000000000000000000000000000000000000111,
            0b10000000000000000000000000000000000000000000000000111,
            0b10100000000000000000000000000000000000000000000000111,
            0b11000000000000000000000000000000000000000000000000111,
            0b11100000000000000000000000000000000000000000000000111,
            // Check that we wrap back around to 0
            0b00000000000000000000000000000000000000000000000000111,
            0b00100000000000000000000000000000000000000000000000111
        ];
        const offsetResults = [3, -4, -3, -2, -1, 0, 1, 2, 3, -4, -3];
        const tileKey = TileKey.fromRowColumnLevel(1, 1, 1);
        for (let i = 0; i < offsets.length; i++) {
            const keyByTileKeyAndOffset = TileOffsetUtils.getKeyForTileKeyAndOffset(
                tileKey,
                offsets[i],
                bitshift
            );
            expect(keyByTileKeyAndOffset).to.be.equal(results[i]);

            const { offset, mortonCode } = TileOffsetUtils.extractOffsetAndMortonKeyFromKey(
                keyByTileKeyAndOffset,
                bitshift
            );
            expect(offset).to.be.equal(offsetResults[i]);
            expect(mortonCode).to.be.equal(tileKey.mortonCode());
        }
    });
});
