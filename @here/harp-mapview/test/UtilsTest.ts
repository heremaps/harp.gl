/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { getProjectionName } from "@here/harp-datasource-protocol";
import {
    EarthConstants,
    GeoBox,
    GeoCoordinates,
    mercatorProjection,
    OrientedBox3,
    Projection,
    ProjectionType,
    sphereProjection,
    TileKey
} from "@here/harp-geoutils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { ElevationProvider } from "../lib/ElevationProvider";
import { MapView } from "../lib/MapView";
import { MapViewUtils, TileOffsetUtils } from "../lib/Utils";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

function setCamera(
    camera: THREE.Camera,
    projection: Projection,
    geoTarget: GeoCoordinates,
    heading: number,
    tilt: number,
    distance: number
) {
    MapViewUtils.getCameraRotationAtTarget(
        projection,
        geoTarget,
        -heading,
        tilt,
        camera.quaternion
    );
    MapViewUtils.getCameraPositionFromTargetCoordinates(
        geoTarget,
        distance,
        -heading,
        tilt,
        projection,
        camera.position
    );
    camera.updateMatrixWorld(true);
}

describe("MapViewUtils", function () {
    const EPS = 1e-8;
    describe("zoomOnTargetPosition", function () {
        const mapViewMock = {
            maxZoomLevel: 20,
            minZoomLevel: 1,
            camera: new THREE.PerspectiveCamera(40),
            projection: mercatorProjection,
            focalLength: 256,
            pixelRatio: 1.0
        };
        const mapView = (mapViewMock as any) as MapView;

        it("only changes zoom on center", () => {
            const geoTarget = new GeoCoordinates(52.5, 13.5);
            const worldTarget = mapView.projection.projectPoint(geoTarget, new THREE.Vector3());
            const distance = MapViewUtils.calculateDistanceFromZoomLevel(mapView, 10);
            setCamera(mapView.camera, mapView.projection, geoTarget, 0, 45, distance);

            MapViewUtils.zoomOnTargetPosition(mapView, 0, 0, 11);

            const {
                target: newWorldTarget,
                distance: newDistance
            } = MapViewUtils.getTargetAndDistance(mapView.projection, mapView.camera);

            const newZoomLevel = MapViewUtils.calculateZoomLevelFromDistance(mapView, newDistance);
            expect(newZoomLevel).to.be.closeTo(11, 1e-13);

            // Make sure the target did not move.
            expect(worldTarget.distanceTo(newWorldTarget)).to.be.closeTo(0, Number.EPSILON);
        });
        it("only changes zoom on center even when tiltig", () => {
            const geoTarget = new GeoCoordinates(52.5, 13.5);
            const worldTarget = mapView.projection.projectPoint(geoTarget, new THREE.Vector3());
            const distance = MapViewUtils.calculateDistanceFromZoomLevel(mapView, 10);
            const tilt = 45;
            setCamera(mapView.camera, mapView.projection, geoTarget, 0, tilt, distance);

            // Change tilt first
            const newTilt = 50;
            MapViewUtils.getCameraRotationAtTarget(
                mapView.projection,
                geoTarget,
                0,
                newTilt,
                mapView.camera.quaternion
            );
            MapViewUtils.getCameraPositionFromTargetCoordinates(
                geoTarget,
                distance,
                0,
                newTilt,
                mapView.projection,
                mapView.camera.position
            );

            // Now zoom in
            MapViewUtils.zoomOnTargetPosition(mapView, 0, 0, 11);

            const {
                target: newWorldTarget,
                distance: newDistance
            } = MapViewUtils.getTargetAndDistance(mapView.projection, mapView.camera);

            const newZoomLevel = MapViewUtils.calculateZoomLevelFromDistance(mapView, newDistance);
            expect(newZoomLevel).to.be.closeTo(11, Number.EPSILON);

            // Make sure the target did not move.
            expect(worldTarget.distanceTo(newWorldTarget)).to.be.closeTo(0, Number.EPSILON);
        });
    });
    [mercatorProjection, sphereProjection].forEach(projection => {
        describe(`orbitAroundScreenPoint ${getProjectionName(projection)}`, function () {
            const mapViewMock = {
                maxZoomLevel: 20,
                minZoomLevel: 1,
                camera: new THREE.PerspectiveCamera(40),
                projection,
                focalLength: 256,
                pixelRatio: 1.0
            };
            const mapView = (mapViewMock as any) as MapView;
            const target = new GeoCoordinates(52.5, 13.5);
            const tiltLimit = THREE.MathUtils.degToRad(45);

            it("keeps look at target when orbiting around center", function () {
                const target = new GeoCoordinates(52.5, 13.5);
                setCamera(
                    mapView.camera,
                    mapView.projection,
                    target,
                    0, //heading
                    0, //tilt
                    MapViewUtils.calculateDistanceFromZoomLevel(mapView, 10)
                );

                const {
                    target: oldWorldTarget,
                    distance: oldDistance
                } = MapViewUtils.getTargetAndDistance(mapView.projection, mapView.camera);

                const deltaTilt = THREE.MathUtils.degToRad(45);
                const deltaHeading = THREE.MathUtils.degToRad(42);
                MapViewUtils.orbitAroundScreenPoint(
                    mapView,
                    0,
                    0,
                    deltaHeading,
                    deltaTilt,
                    tiltLimit
                );

                const {
                    target: newWorldTarget,
                    distance: newDistance
                } = MapViewUtils.getTargetAndDistance(mapView.projection, mapView.camera);

                expect(oldWorldTarget.distanceTo(newWorldTarget)).to.be.closeTo(
                    0,
                    projection === sphereProjection ? 1e-9 : Number.EPSILON
                );
                expect(oldDistance).to.be.closeTo(newDistance, 1e-9);

                // Also check that we did not introduce any roll
                const { roll } = MapViewUtils.extractAttitude(mapView, mapView.camera);
                expect(roll).to.be.closeTo(0, 1e-15);
            });
            it("limits tilt when orbiting around center", function () {
                setCamera(
                    mapView.camera,
                    mapView.projection,
                    target,
                    0, // heading
                    0, // tilt
                    MapViewUtils.calculateDistanceFromZoomLevel(mapView, 4)
                );

                const deltaTilt = THREE.MathUtils.degToRad(80);
                const deltaHeading = 0;
                MapViewUtils.orbitAroundScreenPoint(
                    mapView,
                    0,
                    0,
                    deltaHeading,
                    deltaTilt,
                    tiltLimit
                );

                const mapTargetWorld = MapViewUtils.rayCastWorldCoordinates(mapView, 0, 0);
                expect(mapTargetWorld).to.not.be.null;

                const { tilt } = MapViewUtils.extractSphericalCoordinatesFromLocation(
                    mapView,
                    mapView.camera,
                    mapTargetWorld!
                );
                expect(tilt).to.be.closeTo(
                    tiltLimit,
                    projection === sphereProjection
                        ? 1e-7 // FIXME: Is this huge error expected?
                        : Number.EPSILON
                );
            });
            it("limits tilt when orbiting around screen point", function () {
                for (const startTilt of [0, 20, 45]) {
                    setCamera(
                        mapView.camera,
                        mapView.projection,
                        target,
                        0, // heading
                        startTilt, // tilt
                        MapViewUtils.calculateDistanceFromZoomLevel(mapView, 4)
                    );

                    const deltaTilt = THREE.MathUtils.degToRad(46);
                    const deltaHeading = 0;
                    // OffsetX must be 0 for this to work for Sphere & Mercator, when this is non-zero,
                    // it works for planar, but not sphere.
                    const offsetX = 0.1;
                    const offsetY = 0.1;

                    MapViewUtils.orbitAroundScreenPoint(
                        mapView,
                        offsetX,
                        offsetY,
                        deltaHeading,
                        // Delta is past the tilt limit.
                        deltaTilt,
                        tiltLimit
                    );
                    const mapTargetWorldNew = MapViewUtils.rayCastWorldCoordinates(mapView, 0, 0);

                    const afterTilt = MapViewUtils.extractTiltAngleFromLocation(
                        mapView.projection,
                        mapView.camera,
                        mapTargetWorldNew!
                    );
                    if (projection === sphereProjection) {
                        if (afterTilt > tiltLimit) {
                            // If greater, then only within EPS, otherwise it should be less.
                            expect(afterTilt).to.be.closeTo(tiltLimit, EPS);
                        }
                    } else {
                        // Use a custom EPS, Number.Epsilon is too strict for such maths
                        expect(afterTilt).to.be.closeTo(tiltLimit, EPS);
                    }
                }
            });
            it("keeps rotation target when orbiting around screen point", function () {
                const offsetX = 0.2;
                const offsetY = 0.2;
                setCamera(
                    mapView.camera,
                    mapView.projection,
                    target,
                    0, //heading
                    0, //tilt
                    MapViewUtils.calculateDistanceFromZoomLevel(mapView, 10)
                );

                const oldRotationTarget = MapViewUtils.rayCastWorldCoordinates(
                    mapView,
                    offsetX,
                    offsetY
                );
                expect(oldRotationTarget).to.be.not.null;

                const deltaTilt = THREE.MathUtils.degToRad(45);
                const deltaHeading = THREE.MathUtils.degToRad(42);
                MapViewUtils.orbitAroundScreenPoint(
                    mapView,
                    offsetX,
                    offsetY,
                    deltaHeading,
                    deltaTilt,
                    tiltLimit
                );

                const newRotationTarget = MapViewUtils.rayCastWorldCoordinates(
                    mapView,
                    offsetX,
                    offsetY
                );
                expect(newRotationTarget).to.be.not.null;

                const distance = oldRotationTarget!.distanceTo(newRotationTarget!);
                expect(distance).to.be.closeTo(0, EPS);

                // Also check that we did not introduce any roll
                const { roll } = MapViewUtils.extractAttitude(mapView, mapView.camera);
                expect(roll).to.be.closeTo(0, EPS);
            });
        });
    });
    describe("calculateZoomLevelFromDistance", function () {
        const mapViewMock = {
            maxZoomLevel: 20,
            minZoomLevel: 1,
            camera: new THREE.PerspectiveCamera(40),
            projection: mercatorProjection,
            focalLength: 256,
            pixelRatio: 1.0
        };
        const mapView = (mapViewMock as any) as MapView;
        it("calculates zoom level", function () {
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

        it("snaps zoom level to ceiling integer if close enough to it", function () {
            const eps = 1e-10;
            const result = MapViewUtils.calculateZoomLevelFromDistance(
                mapView,
                EarthConstants.EQUATORIAL_CIRCUMFERENCE * (0.25 + eps)
            );
            expect(result).equals(2);
        });
    });

    it("converts target coordinates from XYZ to camera coordinates", function () {
        const xyzView = {
            zoom: 5,
            yaw: 3,
            pitch: 15,
            center: [10, -10]
        };
        const mapViewMock = {
            camera: new THREE.PerspectiveCamera(40),
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

    describe("converts zoom level to distance and distance to zoom level", function () {
        let mapViewMock: any;

        beforeEach(function () {
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

        it("ensures that both functions are inverse", function () {
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

    describe("wrapGeoPointsToScreen", function () {
        const epsilon = 1e-10;
        it("works across antimeridian #1 - west based box", function () {
            const fitted = MapViewUtils.wrapGeoPointsToScreen([
                new GeoCoordinates(10, -170),
                new GeoCoordinates(10, 170),
                new GeoCoordinates(-10, -170)
            ]);
            assert.closeTo(fitted[0].longitude, -170, epsilon);
            assert.closeTo(fitted[1].longitude, -190, epsilon);
            assert.closeTo(fitted[2].longitude, -170, epsilon);
        });
        it("works across antimeridian #2 - east based box", function () {
            const fitted = MapViewUtils.wrapGeoPointsToScreen([
                new GeoCoordinates(10, 170),
                new GeoCoordinates(10, -170),
                new GeoCoordinates(-10, 170)
            ]);
            assert.closeTo(fitted[0].longitude, 170, epsilon);
            assert.closeTo(fitted[1].longitude, 190, epsilon);
            assert.closeTo(fitted[2].longitude, 170, epsilon);
        });
        it("works across antimeridian #3 - east based box v2", function () {
            const fitted = MapViewUtils.wrapGeoPointsToScreen([
                new GeoCoordinates(10, 170),
                new GeoCoordinates(10, -170),
                new GeoCoordinates(-10, 170),
                new GeoCoordinates(0, -179)
            ]);
            assert.closeTo(fitted[0].longitude, 170, epsilon);
            assert.closeTo(fitted[1].longitude, 190, epsilon);
            assert.closeTo(fitted[2].longitude, 170, epsilon);
            assert.closeTo(fitted[3].longitude, 181, epsilon);
        });
        it("works across antimeridian #4 - bering sea", function () {
            // sample shape - polygons enclosing bering sea
            // naive GeoBox would have center lon~=0, we need to center around _real_ center
            // which is in bering sea center which has lon ~=180 (or -180)
            const fitted = MapViewUtils.wrapGeoPointsToScreen([
                new GeoCoordinates(50.95019, -179.1428493376325),
                new GeoCoordinates(52.91106, 159.02544759162745),
                new GeoCoordinates(69.90354, 179.15147738391926),
                new GeoCoordinates(70.25714, -161.597647174786),
                new GeoCoordinates(55.76049, -157.31410465785078)
            ]);
            // 2nd and 3rd point should be offsetted
            assert.closeTo(fitted[0].longitude, -179.1428493376325, 0.0001);
            assert.closeTo(fitted[1].longitude, 159.02544759162745 - 360, 0.0001);
            assert.closeTo(fitted[2].longitude, 179.15147738391926 - 360, 0.0001);
            assert.closeTo(fitted[3].longitude, -161.597647174786, 0.0001);
            assert.closeTo(fitted[4].longitude, -157.31410465785078, 0.0001);
        });
    });

    it("calculates horizontal and vertical fov", function () {
        const vFov = 60;
        const hFov = THREE.MathUtils.radToDeg(
            MapViewUtils.calculateHorizontalFovByVerticalFov(THREE.MathUtils.degToRad(vFov), 0.9)
        );
        const calculatedVFov = THREE.MathUtils.radToDeg(
            MapViewUtils.calculateVerticalFovByHorizontalFov(THREE.MathUtils.degToRad(hFov), 0.9)
        );
        expect(vFov).to.be.closeTo(calculatedVFov, 0.00000000001);
    });

    it("estimate size of world with one cube", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(2064);
        expect(objSize.gpuSize).to.be.equal(840);
    });

    it("estimate size of world with two cubes that share the geometry", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube0 = new THREE.Mesh(geometry, material);
        scene.add(cube0);
        const cube1 = new THREE.Mesh(geometry, material);
        scene.add(cube1);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(3064); // see previous test: 2064 + 1000 = 3808
        expect(objSize.gpuSize).to.be.equal(840); // see previous test
    });

    it("estimate size of world with 1000 cubes", async function (this: Mocha.Context) {
        this.timeout(4000);
        const scene: THREE.Scene = new THREE.Scene();
        for (let i = 0; i < 1000; i++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
        }

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(2064000); // see previous test: 2064 * 1000
        expect(objSize.gpuSize).to.be.equal(840000); // see previous test: 1584 * 1000
    });

    it("estimate size of world with single point", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [new THREE.Vector3(0, 1, 0)];
        const geometry = new THREE.BufferGeometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1068); // 1*vector3 + object3d overhead
        expect(objSize.gpuSize).to.be.equal(12);
    });

    it("estimate size of world with 6 points", async function () {
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

    it("estimate size of world with 6 points making circle", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.CircleGeometry(1, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = MapViewUtils.estimateObject3dSize(scene);
        expect(objSize.heapSize).to.be.equal(1516); // 7*vector3 + 6*face + object3d overhead
        expect(objSize.gpuSize).to.be.equal(292);
    });

    it("estimate size of world with line between 2 points", async function () {
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

    for (const { projName, projection } of [
        { projName: "mercator", projection: mercatorProjection },
        { projName: "sphere", projection: sphereProjection }
    ]) {
        describe(`${projName} projection`, function () {
            describe("getTargetAndDistance", function () {
                const elevationProvider = ({} as any) as ElevationProvider;
                let sandbox: sinon.SinonSandbox;
                let camera: THREE.Camera;
                const geoTarget = GeoCoordinates.fromDegrees(0, 0);

                function resetCamera() {
                    setCamera(camera, projection, geoTarget, 0, 0, 1e6);
                }

                beforeEach(function () {
                    sandbox = sinon.createSandbox();
                    camera = new THREE.PerspectiveCamera();
                    resetCamera();
                });

                it("camera target and distance are offset by elevation", function () {
                    elevationProvider.getHeight = sandbox.stub().returns(0);

                    const resultNoElevation = MapViewUtils.getTargetAndDistance(
                        projection,
                        camera,
                        elevationProvider
                    );
                    const geoTargetNoElevation = projection.unprojectPoint(
                        resultNoElevation.target
                    );
                    expect(geoTargetNoElevation).deep.equals(
                        GeoCoordinates.fromDegrees(geoTarget.lat, geoTarget.lng, 0)
                    );

                    const elevation = 42;
                    elevationProvider.getHeight = sandbox.stub().returns(elevation);

                    const resultElevation = MapViewUtils.getTargetAndDistance(
                        projection,
                        camera,
                        elevationProvider
                    );

                    expect(resultElevation.distance).equals(resultNoElevation.distance - elevation);
                    const geoTargetElevation = projection.unprojectPoint(resultElevation.target);
                    expect(geoTargetElevation).deep.equals(
                        GeoCoordinates.fromDegrees(geoTarget.lat, geoTarget.lng, elevation)
                    );
                });

                it("indicates whether the computation was final or not", function () {
                    elevationProvider.getHeight = sandbox.stub().returns(undefined);

                    const res1 = MapViewUtils.getTargetAndDistance(
                        projection,
                        camera,
                        elevationProvider
                    );

                    expect(res1.final).to.be.false;

                    elevationProvider.getHeight = sandbox.stub().returns(0);

                    const res2 = MapViewUtils.getTargetAndDistance(
                        projection,
                        camera,
                        elevationProvider
                    );

                    expect(res2.final).to.be.true;

                    const res3 = MapViewUtils.getTargetAndDistance(projection, camera);

                    expect(res3.final).to.be.true;
                });
            });

            describe("constrainTargetAndDistanceToViewBounds", function () {
                const camera: THREE.Camera = new THREE.PerspectiveCamera(undefined, 1);
                const mapViewMock = {
                    maxZoomLevel: 20,
                    minZoomLevel: 1,
                    camera,
                    projection,
                    focalLength: 256,
                    worldMaxBounds: undefined as THREE.Box3 | OrientedBox3 | undefined,
                    renderer: {
                        getSize() {
                            return new THREE.Vector2(300, 300);
                        }
                    }
                };
                const mapView = (mapViewMock as any) as MapView;

                it("target and distance are unchanged when no bounds set", function () {
                    const geoTarget = GeoCoordinates.fromDegrees(0, 0);
                    const worldTarget = mapView.projection.projectPoint(
                        geoTarget,
                        new THREE.Vector3()
                    );
                    const distance = 1e7;
                    setCamera(camera, mapView.projection, geoTarget, 0, 0, distance);

                    const constrained = MapViewUtils.constrainTargetAndDistanceToViewBounds(
                        worldTarget,
                        distance,
                        mapView
                    );
                    expect(constrained.target).deep.equals(worldTarget);
                    expect(constrained.distance).equals(distance);
                });

                it("target and distance are unchanged when view within bounds", function () {
                    const geoTarget = GeoCoordinates.fromDegrees(0, 0);
                    const geoBounds = new GeoBox(
                        GeoCoordinates.fromDegrees(-50, -50),
                        GeoCoordinates.fromDegrees(50, 50)
                    );
                    const worldTarget = mapView.projection.projectPoint(
                        geoTarget,
                        new THREE.Vector3()
                    );
                    mapViewMock.worldMaxBounds = mapView.projection.projectBox(
                        geoBounds,
                        mapView.projection.type === ProjectionType.Planar
                            ? new THREE.Box3()
                            : new OrientedBox3()
                    );
                    const distance = 100;
                    setCamera(camera, mapView.projection, geoTarget, 0, 0, distance);

                    const constrained = MapViewUtils.constrainTargetAndDistanceToViewBounds(
                        worldTarget,
                        distance,
                        mapView
                    );

                    expect(constrained.target).deep.equals(worldTarget);
                    expect(constrained.distance).equals(distance);
                });

                it("target and distance are constrained when camera is too far", function () {
                    const tilt = 0;
                    const heading = 0;
                    const geoTarget = GeoCoordinates.fromDegrees(0, 0);
                    const geoBounds = new GeoBox(
                        GeoCoordinates.fromDegrees(-1, -1),
                        GeoCoordinates.fromDegrees(1, 1)
                    );
                    const worldTarget = mapView.projection.projectPoint(
                        geoTarget,
                        new THREE.Vector3()
                    );
                    mapViewMock.worldMaxBounds = mapView.projection.projectBox(
                        geoBounds,
                        mapView.projection.type === ProjectionType.Planar
                            ? new THREE.Box3()
                            : new OrientedBox3()
                    );
                    const distance = 1e6;
                    setCamera(camera, mapView.projection, geoTarget, heading, tilt, distance);

                    const constrained = MapViewUtils.constrainTargetAndDistanceToViewBounds(
                        worldTarget,
                        distance,
                        mapView
                    );

                    const boundsCenter = (mapViewMock.worldMaxBounds as THREE.Box3).getCenter(
                        new THREE.Vector3()
                    );
                    if (mapView.projection.type === ProjectionType.Planar) {
                        boundsCenter.setZ(worldTarget.z);
                    } else {
                        boundsCenter.setLength(worldTarget.length());
                    }
                    expect(constrained.target).deep.equals(boundsCenter);
                    expect(constrained.distance).to.be.lessThan(distance);

                    const constrainedGeoTarget = mapView.projection.unprojectPoint(
                        constrained.target
                    );
                    const newTilt = MapViewUtils.extractTiltAngleFromLocation(
                        mapView.projection,
                        camera,
                        constrainedGeoTarget
                    );
                    expect(THREE.MathUtils.radToDeg(newTilt)).to.be.closeTo(tilt, 1e-3);
                });

                it("target and distance are constrained if target is out of bounds", function () {
                    const tilt = 50;
                    const heading = 10;
                    const geoTarget = GeoCoordinates.fromDegrees(10.1, 10);
                    const geoBounds = new GeoBox(
                        GeoCoordinates.fromDegrees(-10, -10),
                        GeoCoordinates.fromDegrees(10, 10)
                    );
                    const worldTarget = mapView.projection.projectPoint(
                        geoTarget,
                        new THREE.Vector3()
                    );
                    mapViewMock.worldMaxBounds = mapView.projection.projectBox(
                        geoBounds,
                        mapView.projection.type === ProjectionType.Planar
                            ? new THREE.Box3()
                            : new OrientedBox3()
                    );
                    const distance = 100;
                    setCamera(camera, mapView.projection, geoTarget, heading, tilt, distance);

                    const constrained = MapViewUtils.constrainTargetAndDistanceToViewBounds(
                        worldTarget,
                        distance,
                        mapView
                    );

                    const constrainedGeoTarget = mapView.projection.unprojectPoint(
                        constrained.target
                    );
                    expect(geoBounds.contains(constrainedGeoTarget)).to.equal(true);
                    expect(constrained.distance).equals(distance);

                    const newTilt = MapViewUtils.extractTiltAngleFromLocation(
                        mapView.projection,
                        camera,
                        constrainedGeoTarget
                    );
                    expect(THREE.MathUtils.radToDeg(newTilt)).to.be.closeTo(tilt, 1e-3);
                });
            });
        });
    }
});

describe("tile-offset#Utils", function () {
    it("test getKeyForTileKeyAndOffset and extractOffsetAndMortonKeyFromKey", async function () {
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
