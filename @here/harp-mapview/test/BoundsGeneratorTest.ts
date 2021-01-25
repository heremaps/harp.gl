/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    GeoCoordinates,
    GeoCoordinatesLike,
    GeoPolygonCoordinates,
    mercatorTilingScheme,
    Projection,
    sphereProjection,
    TileKey
} from "@here/harp-geoutils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { BoundsGenerator } from "../lib/BoundsGenerator";
import { projectTilePlaneCorners } from "../lib/geometry/ProjectTilePlaneCorners";
import { LookAtParams, MapView, MapViewOptions } from "../lib/MapView";
import { Tile } from "../lib/Tile";
import { MapViewUtils } from "../lib/Utils";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

declare const global: any;

describe("BoundsGenerator", function () {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    let mapView: MapView | undefined;
    let boundsGenerator: BoundsGenerator;
    let lookAtParams: Partial<LookAtParams>;
    let mapViewOptions: MapViewOptions;

    beforeEach(function () {
        //Setup a stubbed mapview to emulate the camera behaviour
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        sandbox
            .stub(THREE, "WebGL1Renderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = (callback: (time: DOMHighResTimeStamp) => void) => {
                setTimeout(callback, 0);
            };
            theGlobal.performance = { now: Date.now };
        }
        addEventListenerSpy = sinon.stub();
        removeEventListenerSpy = sinon.stub();
        canvas = ({
            clientWidth: 1200,
            clientHeight: 800,
            addEventListener: addEventListenerSpy,
            removeEventListener: removeEventListenerSpy
        } as unknown) as HTMLCanvasElement;
        mapViewOptions = {
            canvas,
            // Both options cause the `addDataSource` method to be called, which we can't `await` on
            // because it is called in the constructor, but we can disable them being added.
            addBackgroundDatasource: false,
            enablePolarDataSource: false
        };
        lookAtParams = {
            target: new GeoCoordinates(0, 0),
            zoomLevel: 5,
            tilt: 0,
            heading: 0
        };
        mapView = new MapView({ ...mapViewOptions, tileWrappingEnabled: false });
        mapView.lookAt(lookAtParams);
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );
    });

    afterEach(async function () {
        if (mapView !== undefined) {
            await mapView.getTheme(); // Needed otherwise the dispose will cause log messages
            mapView.dispose();
            mapView = undefined;
        }
        sandbox.restore();
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.cancelAnimationFrame;
            delete global.navigator;
        }
    });

    enum CanvasSides {
        Bottom,
        Right,
        Top,
        Left,
        None,
        All
    }

    function countVerticesOnCanvasSide(
        coordinates: GeoPolygonCoordinates,
        side: CanvasSides
    ): number {
        const eps = 1e-5;
        let expectedNdcX: number | undefined;
        let expectedNdcY: number | undefined;

        switch (side) {
            case CanvasSides.Bottom:
                expectedNdcY = -1;
                break;
            case CanvasSides.Right:
                expectedNdcX = 1;
                break;
            case CanvasSides.Top:
                expectedNdcY = 1;
                break;
            case CanvasSides.Left:
                expectedNdcX = -1;
                break;
            default:
                assert.fail("Canvas side option not supported");
        }
        return coordinates.filter(vertex => {
            const ndcPoint = mapView!.projection
                .projectPoint(GeoCoordinates.fromObject(vertex), new THREE.Vector3())
                .project(mapView!.camera);
            if (expectedNdcX !== undefined) {
                return Math.abs(ndcPoint.x - expectedNdcX) < eps;
            } else if (expectedNdcY !== undefined) {
                return Math.abs(ndcPoint.y - expectedNdcY) < eps;
            } else {
                assert.fail("Canvas side option not supported");
            }
        }).length;
    }

    function checkCanvasCorners(coordinates: GeoPolygonCoordinates, included = CanvasSides.All) {
        const bottomCorners = [
            [-1, -1],
            [1, -1]
        ];
        const topCorners = [
            [-1, 1],
            [1, 1]
        ];
        const includedCorners: number[][] = [];
        const excludedCorners: number[][] = [];

        switch (included) {
            case CanvasSides.None:
                excludedCorners.concat(bottomCorners, topCorners);
                break;
            case CanvasSides.Bottom:
                includedCorners.push(...bottomCorners);
                excludedCorners.push(...topCorners);
                break;
            case CanvasSides.All:
                includedCorners.concat(bottomCorners, topCorners);
                break;
            default:
                assert(false);
        }

        for (const cornerNdc of includedCorners) {
            const corner = MapViewUtils.rayCastGeoCoordinates(mapView!, cornerNdc[0], cornerNdc[1]);
            assert.deepInclude(coordinates, corner as GeoCoordinates);
        }

        for (const cornerNdc of excludedCorners) {
            const corner = MapViewUtils.rayCastGeoCoordinates(mapView!, cornerNdc[0], cornerNdc[1]);
            assert.notDeepInclude(coordinates, corner as GeoCoordinates);
        }
    }

    describe("Sphere Projection", function () {
        beforeEach(function () {
            mapView = new MapView({ ...mapViewOptions, projection: sphereProjection });
            mapView.lookAt({
                target: new GeoCoordinates(0, 0),
                zoomLevel: 12,
                tilt: 0,
                heading: 0
            });
            mapView.renderSync(); // render once to update camera parameter
            boundsGenerator = new BoundsGenerator(
                mapView.camera,
                mapView.projection,
                mapView.tileWrappingEnabled
            );
        });

        it("generates polygon of canvas corners for canvas filled with map", function () {
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            checkCanvasCorners(coordinates!);
        });

        it("generates polygon with wrapped around coords if it crosses antimeridian", function () {
            mapView!.lookAt({
                target: new GeoCoordinates(0, 180)
            });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            checkCanvasCorners(coordinates!);

            assert.isAbove(coordinates![1].longitude, 180);
            assert.isAbove(coordinates![2].longitude, 180);
        });

        it("generates polygon with subdivided top/bottom for large longitude spans", function () {
            mapView!.lookAt({
                target: new GeoCoordinates(75, 0),
                zoomLevel: 10,
                tilt: 0,
                heading: 0
            });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 6);

            checkCanvasCorners(coordinates!);

            coordinates!.findIndex((val: GeoCoordinatesLike) => {
                val.latitude;
            });
        });

        it("generates polygon with subdivided lateral sides for large latitude spans", function () {
            mapView!.resize(100, 1000);
            mapView!.lookAt({
                target: new GeoCoordinates(0, 0),
                zoomLevel: 7,
                tilt: 0,
                heading: 0
            });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 6);

            checkCanvasCorners(coordinates!);
        });

        // Horizon cases
        it("horizon cuts once each lateral canvas side", function () {
            mapView!.lookAt({ tilt: 80 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 5);

            checkCanvasCorners(coordinates!, CanvasSides.Bottom);
            // 2 vertices on right side (including bottom right corner)
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 2);
            // 2 vertices on left side (including bottom left corner)
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 2);
        });

        it("horizon cuts once each lateral canvas side and twice at the top", function () {
            mapView!.lookAt({ tilt: 30, zoomLevel: 6 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 6);

            checkCanvasCorners(coordinates!, CanvasSides.Bottom);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 2);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Top), 2);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 2);
        });

        it("horizon cuts twice each canvas side", function () {
            mapView!.lookAt({ zoomLevel: 5.5 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 8);

            checkCanvasCorners(coordinates!, CanvasSides.None);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Bottom), 2);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 2);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Top), 2);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 2);
        });

        it("horizon cuts twice each lateral canvas side", function () {
            mapView!.resize(800, 1200);
            mapView!.lookAt({ zoomLevel: 4 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 4);

            checkCanvasCorners(coordinates!, CanvasSides.None);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Bottom), 0);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 2);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Top), 0);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 2);
        });

        it("horizon cuts twice top and bottom canvas sides", function () {
            mapView!.lookAt({ zoomLevel: 4 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 6);

            checkCanvasCorners(coordinates!, CanvasSides.None);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Bottom), 2);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 0);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Top), 2);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 0);
        });

        it("horizon cuts twice the bottom canvas side", function () {
            mapView!.lookAt({ tilt: 45, zoomLevel: 4 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 3);

            checkCanvasCorners(coordinates!, CanvasSides.None);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Bottom), 2);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 0);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Top), 0);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 0);
        });

        it("horizon is fully visible (no cuts on canvas sides)", function () {
            mapView!.lookAt({ zoomLevel: 3 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isDefined(coordinates);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 4);

            checkCanvasCorners(coordinates!, CanvasSides.None);
            assert.isAtLeast(countVerticesOnCanvasSide(coordinates!, CanvasSides.Bottom), 0);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Right), 0);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Top), 0);
            assert.equal(countVerticesOnCanvasSide(coordinates!, CanvasSides.Left), 0);

            // check every polygon vertex is a point in the horizon.
            for (const vertex of coordinates!) {
                const worldPoint = mapView!.projection.projectPoint(
                    GeoCoordinates.fromObject(vertex),
                    new THREE.Vector3()
                );
                const cameraRay = new THREE.Vector3().subVectors(
                    mapView!.camera.position,
                    worldPoint
                );
                assert.closeTo(Math.abs(cameraRay.angleTo(worldPoint)), Math.PI / 2, 1e-5);
            }
        });

        // Pole wrapping
        it("bounds wrap around the north pole", function () {
            mapView!.lookAt({ zoomLevel: 6, target: new GeoCoordinates(90, 0) });
            mapView!.renderSync(); // render once to update camera parameter
            const polygon = (boundsGenerator as BoundsGenerator).generate();
            const coordinates = polygon?.coordinates;
            assert.isDefined(polygon);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 4);

            checkCanvasCorners(coordinates!, CanvasSides.All);

            // centroid should be above all polygon vertices (except those added at lat 90 to wrap
            // the polygon around the pole)
            const centroid = polygon!.getCentroid();
            assert.isDefined(centroid);
            for (const coords of coordinates!.filter(value => {
                return value.latitude !== 90;
            })) {
                assert.isBelow(coords.latitude, centroid!.latitude);
            }
        });

        it("bounds wrap around the south pole", function () {
            mapView!.lookAt({ zoomLevel: 6, target: new GeoCoordinates(-90, 0) });
            mapView!.renderSync(); // render once to update camera parameter
            const polygon = (boundsGenerator as BoundsGenerator).generate();
            const coordinates = polygon?.coordinates;
            assert.isDefined(polygon);
            assert.isNotEmpty(coordinates);
            assert.isAtLeast(coordinates!.length, 4);

            checkCanvasCorners(coordinates!, CanvasSides.All);

            // centroid should be above all polygon vertices (except those added at lat -90 to wrap
            // the polygon around the pole)
            const centroid = polygon!.getCentroid();
            assert.isDefined(centroid);
            for (const coords of coordinates!.filter(value => {
                return value.latitude !== -90;
            })) {
                assert.isAbove(coords.latitude, centroid!.latitude);
            }
        });
    });

    describe("Mercator Projection", function () {
        beforeEach(function () {
            mapView = new MapView({ ...mapViewOptions, tileWrappingEnabled: false });
            mapView.lookAt(lookAtParams);
            boundsGenerator = new BoundsGenerator(
                mapView.camera,
                mapView.projection,
                mapView.tileWrappingEnabled
            );
        });

        it("generates polygon of canvas corners for canvas filled with map", function () {
            mapView!.lookAt(lookAtParams);
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            checkCanvasCorners(coordinates!);
        });

        it("generates polygon for canvas filled with map, w/ tileWrapping", function () {
            //Setup mapView with tileWrapping Enabled
            mapView = new MapView({ ...mapViewOptions, tileWrappingEnabled: true });
            //create new instance of boundsGenerator with the new mapView instance parameters
            boundsGenerator = new BoundsGenerator(
                mapView.camera,
                mapView.projection,
                mapView.tileWrappingEnabled
            );

            mapView.lookAt({
                zoomLevel: 10,
                target: {
                    latitude: 0,
                    longitude: 180,
                    altitude: 0
                }
            });
            mapView.renderSync(); // render once to update camera parameter

            const coordinates = boundsGenerator.generate()?.coordinates;

            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            if (coordinates === undefined) {
                return;
            }

            checkCanvasCorners(coordinates);
        });

        it("generates polygon of world Corners, if whole world plane is visible", function () {
            mapView!.lookAt({ zoomLevel: 0 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            const geoBox = mercatorTilingScheme.getGeoBox(TileKey.fromRowColumnLevel(0, 0, 0));
            const worldCorners = projectTilePlaneCorners(
                { geoBox } as Tile,
                mapView!.projection as Projection
            );
            if (coordinates === undefined) {
                return;
            }

            assert.deepInclude(coordinates, mapView!.projection.unprojectPoint(worldCorners.se));
            assert.deepInclude(coordinates, mapView!.projection.unprojectPoint(worldCorners.sw));
            assert.deepInclude(coordinates, mapView!.projection.unprojectPoint(worldCorners.ne));
            assert.deepInclude(coordinates, mapView!.projection.unprojectPoint(worldCorners.nw));
        });

        it("generates polygon of world vertically clipped by frustum , w/ tileWrapping", function () {
            //Setup mapView with tileWrapping Enabled
            mapView = new MapView({ ...mapViewOptions, tileWrappingEnabled: true });
            //create new instance of boundsGenerator with the new mapView instance parameters
            boundsGenerator = new BoundsGenerator(
                mapView.camera,
                mapView.projection,
                mapView.tileWrappingEnabled
            );

            mapView.lookAt({
                zoomLevel: 1,
                tilt: 70,
                target: {
                    latitude: 0,
                    longitude: 180,
                    altitude: 0
                }
            });
            mapView.renderSync(); // render once to update camera parameter

            const coordinates = boundsGenerator.generate()?.coordinates;

            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            const delta = 0.0000001;
            coordinates?.forEach(point => {
                const worldPoint = mapView!.projection.projectPoint(
                    GeoCoordinates.fromObject(point)
                );
                if (worldPoint) {
                    const ndcPoint = new THREE.Vector3()
                        .copy(worldPoint as THREE.Vector3)
                        .project(mapView!.camera as THREE.Camera);
                    //point should be on right or left edge of the screen
                    assert.closeTo(
                        1,
                        Math.abs(ndcPoint.x),
                        delta,
                        "point on right or left edge of screen"
                    );
                }
            });
        });

        it("generates polygon of world horizontally clipped by frustum , w/ tileWrapping", function () {
            //Setup mapView with tileWrapping Enabled
            mapView = new MapView({ ...mapViewOptions, tileWrappingEnabled: true });
            //create new instance of boundsGenerator with the new mapView instance parameters
            boundsGenerator = new BoundsGenerator(
                mapView.camera,
                mapView.projection,
                mapView.tileWrappingEnabled
            );

            mapView.lookAt({
                zoomLevel: 1,
                tilt: 0,
                heading: 90,
                target: {
                    latitude: 0,
                    longitude: 180,
                    altitude: 0
                }
            });
            mapView.renderSync(); // render once to update camera parameter

            const coordinates = boundsGenerator.generate()?.coordinates;

            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            const delta = 0.0000001;
            coordinates?.forEach(point => {
                const worldPoint = mapView!.projection.projectPoint(
                    GeoCoordinates.fromObject(point)
                );
                if (worldPoint) {
                    const ndcPoint = new THREE.Vector3()
                        .copy(worldPoint as THREE.Vector3)
                        .project(mapView!.camera as THREE.Camera);
                    //point should be on right or left edge of the screen
                    assert.closeTo(
                        1,
                        Math.abs(ndcPoint.y),
                        delta,
                        "point on upper or lower edge of screen"
                    );
                }
            });
        });

        it("generates polygon for tilted map, cut by horizon", function () {
            mapView!.lookAt({ tilt: 80 });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            checkCanvasCorners(coordinates!, CanvasSides.Bottom);
        });

        it("generates polygon for tilted map, cut by horizon, w/ tileWrapping", function () {
            //Setup mapView with tileWrapping Enabled
            mapView = new MapView({ ...mapViewOptions, tileWrappingEnabled: true });
            //create new instance of boundsGenerator with the new mapView instance parameters
            boundsGenerator = new BoundsGenerator(
                mapView.camera,
                mapView.projection,
                mapView.tileWrappingEnabled
            );
            mapView.lookAt({
                tilt: 88,
                heading: 90,
                zoomLevel: 6
            });
            mapView.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(coordinates?.length, 4);

            if (coordinates === undefined) {
                return;
            }
            checkCanvasCorners(coordinates, CanvasSides.Bottom);
        });

        it("generates polygon for tilted and heading rotated map, one worldCorner in view", function () {
            //mapView.setCameraGeolocationAndZoom(new GeoCoordinates(0, 0), 2, 0, 0);
            mapView!.lookAt({
                target: {
                    latitude: 50.08345695126102,
                    longitude: 4.077785404634487,
                    altitude: 0
                },
                tilt: 80,
                heading: 45,
                zoomLevel: 3
            });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(
                coordinates?.length,
                5,
                "polygon contains 5 points and one worldcorner is in view"
            );

            if (coordinates === undefined) {
                return;
            }
            checkCanvasCorners(coordinates, CanvasSides.Bottom);
        });

        it("generates polygon for tilted  and heading rotated map, plane cut 2 times", function () {
            //mapView.setCameraGeolocationAndZoom(new GeoCoordinates(0, 0), 2, 0, 0);
            mapView!.lookAt({
                target: {
                    latitude: 0,
                    longitude: 0,
                    altitude: 0
                },
                tilt: 45,
                heading: 45,
                zoomLevel: 3
            });
            mapView!.renderSync(); // render once to update camera parameter
            const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
            assert.isNotEmpty(coordinates);
            assert.equal(
                coordinates?.length,
                6,
                "polygon contains 6 points and two worldcorners are in view, and 2 corners are clipped"
            );
        });
    });
});
