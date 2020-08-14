/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    GeoCoordinates,
    mercatorTilingScheme,
    Projection,
    sphereProjection,
    TileKey
} from "@here/harp-geoutils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { assert } from "chai";
import sinon = require("sinon");
import THREE = require("three");

import { BoundsGenerator } from "../lib/BoundsGenerator";
import { TileGeometryCreator } from "../lib/geometry/TileGeometryCreator";
import { LookAtParams, MapView } from "../lib/MapView";
import { MapViewUtils } from "../lib/Utils";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

declare const global: any;

describe("BoundsGenerator", function() {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    let mapView: MapView | undefined;
    let boundsGenerator: BoundsGenerator;
    let lookAtParams: Partial<LookAtParams>;

    beforeEach(function() {
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
        }
        addEventListenerSpy = sinon.stub();
        removeEventListenerSpy = sinon.stub();
        canvas = ({
            clientWidth: 1200,
            clientHeight: 800,
            addEventListener: addEventListenerSpy,
            removeEventListener: removeEventListenerSpy
        } as unknown) as HTMLCanvasElement;

        lookAtParams = {
            target: new GeoCoordinates(0, 0),
            zoomLevel: 5,
            tilt: 0,
            heading: 0
        };
        mapView = new MapView({ canvas, tileWrappingEnabled: false });
        mapView.lookAt(lookAtParams);
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );
    });

    afterEach(function() {
        if (mapView !== undefined) {
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

    it("generates undefined for spherical projection,  until implemented", function() {
        mapView = new MapView({ canvas, projection: sphereProjection });
        //create new instance of boundsGenerator with the new mapView instance parameters
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );
        mapView?.lookAt(lookAtParams);
        mapView?.renderSync(); // render once to update camera parameter
        const geoPolygon = (boundsGenerator as BoundsGenerator).generate();
        assert.isUndefined(geoPolygon);
    });

    it("generates undefined for spherical projection,  after projection changes", function() {
        mapView?.lookAt(lookAtParams);
        mapView?.renderSync(); // render once to update camera parameter
        let geoPolygon = (boundsGenerator as BoundsGenerator).generate();
        assert.isNotEmpty(geoPolygon?.coordinates);
        assert.equal(geoPolygon?.coordinates?.length, 4);

        boundsGenerator.projection = sphereProjection;
        geoPolygon = (boundsGenerator as BoundsGenerator).generate();
        assert.isUndefined(geoPolygon);
    });

    it("generates polygon of canvas corners for canvas filled with map", function() {
        mapView?.lookAt(lookAtParams);
        mapView?.renderSync(); // render once to update camera parameter
        const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        let corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, -1);
        if (coordinates === undefined) {
            return;
        }
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, 1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, 1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
    });

    it("generates polygon for canvas filled with map, w/ tileWrapping", function() {
        //Setup mapView with tileWrapping Enabled
        mapView = new MapView({ canvas, tileWrappingEnabled: true });
        //create new instance of boundsGenerator with the new mapView instance parameters
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );

        mapView?.lookAt({
            zoomLevel: 10,
            target: {
                latitude: 0,
                longitude: 180,
                altitude: 0
            }
        });
        mapView?.renderSync(); // render once to update camera parameter

        const coordinates = boundsGenerator.generate()?.coordinates;

        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        if (coordinates === undefined) {
            return;
        }

        let corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, 1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, 1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
    });

    it("generates polygon of world Corners, if whole world plane is visible", function() {
        mapView?.lookAt({ zoomLevel: 0 });
        mapView?.renderSync(); // render once to update camera parameter
        const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        const worldCorners = TileGeometryCreator.instance.generateTilePlaneCorners(
            mercatorTilingScheme.getGeoBox(TileKey.fromRowColumnLevel(0, 0, 0)),
            mapView?.projection as Projection
        );
        if (coordinates === undefined) {
            return;
        }

        assert.deepInclude(coordinates, mapView?.projection.unprojectPoint(worldCorners.se));
        assert.deepInclude(coordinates, mapView?.projection.unprojectPoint(worldCorners.sw));
        assert.deepInclude(coordinates, mapView?.projection.unprojectPoint(worldCorners.ne));
        assert.deepInclude(coordinates, mapView?.projection.unprojectPoint(worldCorners.nw));
    });

    it("generates polygon of world vertically clipped by frustum , w/ tileWrapping", function() {
        //Setup mapView with tileWrapping Enabled
        mapView = new MapView({ canvas, tileWrappingEnabled: true });
        //create new instance of boundsGenerator with the new mapView instance parameters
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );

        mapView?.lookAt({
            zoomLevel: 1,
            tilt: 70,
            target: {
                latitude: 0,
                longitude: 180,
                altitude: 0
            }
        });
        mapView?.renderSync(); // render once to update camera parameter

        const coordinates = boundsGenerator.generate()?.coordinates;

        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        const delta = 0.0000001;
        coordinates?.forEach(point => {
            const worldPoint = mapView?.projection.projectPoint(GeoCoordinates.fromObject(point));
            if (worldPoint) {
                const ndcPoint = new THREE.Vector3()
                    .copy(worldPoint as THREE.Vector3)
                    .project(mapView?.camera as THREE.Camera);
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

    it("generates polygon of world horizontally clipped by frustum , w/ tileWrapping", function() {
        //Setup mapView with tileWrapping Enabled
        mapView = new MapView({ canvas, tileWrappingEnabled: true });
        //create new instance of boundsGenerator with the new mapView instance parameters
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );

        mapView?.lookAt({
            zoomLevel: 1,
            tilt: 0,
            heading: 90,
            target: {
                latitude: 0,
                longitude: 180,
                altitude: 0
            }
        });
        mapView?.renderSync(); // render once to update camera parameter

        const coordinates = boundsGenerator.generate()?.coordinates;

        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        const delta = 0.0000001;
        coordinates?.forEach(point => {
            const worldPoint = mapView?.projection.projectPoint(GeoCoordinates.fromObject(point));
            if (worldPoint) {
                const ndcPoint = new THREE.Vector3()
                    .copy(worldPoint as THREE.Vector3)
                    .project(mapView?.camera as THREE.Camera);
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

    it("generates polygon for tilted map, cut by horizon", function() {
        mapView?.lookAt({ tilt: 80 });
        mapView?.renderSync(); // render once to update camera parameter
        const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        let corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, -1);
        if (coordinates === undefined) {
            return;
        }
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);

        //only include lower corners, the upper ones are above horizon
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, 1);
        assert.notDeepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, 1);
        assert.notDeepInclude(coordinates, corner as GeoCoordinates);
    });

    it("generates polygon for tilted map, cut by horizon, w/ tileWrapping", function() {
        //Setup mapView with tileWrapping Enabled
        mapView = new MapView({ canvas, tileWrappingEnabled: true });
        //create new instance of boundsGenerator with the new mapView instance parameters
        boundsGenerator = new BoundsGenerator(
            mapView.camera,
            mapView.projection,
            mapView.tileWrappingEnabled
        );
        mapView?.lookAt({
            tilt: 88,
            heading: 90,
            zoomLevel: 6
        });
        mapView?.renderSync(); // render once to update camera parameter
        const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
        assert.isNotEmpty(coordinates);
        assert.equal(coordinates?.length, 4);

        if (coordinates === undefined) {
            return;
        }
        let corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);

        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);

        //only include lower corners, the upper ones are above horizon
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, 1);
        assert.notDeepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, 1);
        assert.notDeepInclude(coordinates, corner as GeoCoordinates);
    });

    it("generates polygon for tilted and heading rotated map, one worldCorner in view", function() {
        //mapView?.setCameraGeolocationAndZoom(new GeoCoordinates(0, 0), 2, 0, 0);
        mapView?.lookAt({
            target: {
                latitude: 50.08345695126102,
                longitude: 4.077785404634487,
                altitude: 0
            },
            tilt: 80,
            heading: 45,
            zoomLevel: 3
        });
        mapView?.renderSync(); // render once to update camera parameter
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
        let corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, -1);
        assert.deepInclude(coordinates, corner as GeoCoordinates);

        //only include lower corners, the upper ones are above horizon
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, -1, 1);
        assert.notDeepInclude(coordinates, corner as GeoCoordinates);
        corner = MapViewUtils.rayCastGeoCoordinates(mapView as MapView, 1, 1);
        assert.notDeepInclude(coordinates, corner as GeoCoordinates);
    });

    it("generates polygon for tilted  and heading rotated map, plane cut 2 times", function() {
        //mapView?.setCameraGeolocationAndZoom(new GeoCoordinates(0, 0), 2, 0, 0);
        mapView?.lookAt({
            target: {
                latitude: 0,
                longitude: 0,
                altitude: 0
            },
            tilt: 45,
            heading: 45,
            zoomLevel: 3
        });
        mapView?.renderSync(); // render once to update camera parameter
        const coordinates = (boundsGenerator as BoundsGenerator).generate()?.coordinates;
        assert.isNotEmpty(coordinates);
        assert.equal(
            coordinates?.length,
            6,
            "polygon contains 6 points and two worldcorners are in view, and 2 corners are clipped"
        );
    });
});
