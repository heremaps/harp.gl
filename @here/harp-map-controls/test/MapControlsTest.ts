/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    GeoBox,
    GeoCoordinates,
    mercatorProjection,
    Projection,
    sphereProjection
} from "@here/harp-geoutils";
import { ElevationProvider, MapView, MapViewUtils } from "@here/harp-mapview";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { MapControls } from "../lib/MapControls";

declare const global: any;

const inNodeContext = typeof window === "undefined";

describe("MapControls", function() {
    const DEFAULT_CANVAS_WIDTH = 800;
    const DEFAULT_CANVAS_HEIGHT = 600;
    let sandbox: sinon.SinonSandbox;
    let domElement: any;
    let mapView: MapView;
    let mapControls: MapControls;
    let camera: THREE.Camera;
    let updateStub: sinon.SinonStub<any>;
    let lookAtStub: sinon.SinonStub<any>;

    const eventMap: Map<string, EventListener> = new Map();

    function wheel(delta: number) {
        const mouseWheelHandler = eventMap.get("wheel")!;
        mouseWheelHandler({
            offsetX: 0,
            offsetY: 0,
            delta,
            preventDefault: () => {
                /*noop*/
            },
            stopPropagation: () => {
                /*noop*/
            }
        } as any);
    }

    function dblClick() {
        const mouseDblClickHandler = eventMap.get("dblclick")!;
        mouseDblClickHandler({ clientX: 0, clientY: 0 } as any);
    }

    function dblTap() {
        const touchStartHandler = eventMap.get("touchstart")!;
        const touchEndHandler = eventMap.get("touchend")!;
        const fakeTouchEvent = {
            touches: [],
            preventDefault: () => {
                /*noop*/
            },
            stopPropagation: () => {
                /*noop*/
            }
        } as any;
        touchStartHandler(fakeTouchEvent);
        touchEndHandler(fakeTouchEvent);
    }

    function mouseMove(button: number, x: number, y: number) {
        eventMap.get("mousedown")!({
            clientX: 0,
            clientY: 0,
            button,
            preventDefault: () => {
                /*noop*/
            },
            stopPropagation: () => {
                /*noop*/
            }
        } as any);

        if (inNodeContext) {
            const moveHandler = eventMap.get("mousemove");
            // If interaction is disabled, move handler may not even be installed.
            if (!moveHandler) {
                return;
            }

            moveHandler({
                clientX: x,
                clientY: y,
                preventDefault: () => {
                    /*noop*/
                },
                stopPropagation: () => {
                    /*noop*/
                }
            } as any);

            eventMap.get("mouseup")!({
                clientX: x,
                clientY: y,
                button,
                preventDefault: () => {
                    /*noop*/
                },
                stopPropagation: () => {
                    /*noop*/
                }
            } as any);
        } else {
            window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
            window.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y, button }));
        }
    }

    function touchMove(touchCount: number, x: number, y: number) {
        const initTouches = new Array();
        initTouches.length = touchCount;
        initTouches.fill({ clientX: 0, clientY: 0 });

        const endTouches = new Array();
        endTouches.length = touchCount;
        endTouches.fill({ clientX: x, clientY: y });

        eventMap.get("touchstart")!({
            touches: initTouches,
            preventDefault: () => {
                /*noop*/
            },
            stopPropagation: () => {
                /*noop*/
            }
        } as any);
        eventMap.get("touchmove")!({
            touches: endTouches,
            preventDefault: () => {
                /*noop*/
            },
            stopPropagation: () => {
                /*noop*/
            }
        } as any);
        eventMap.get("touchend")!({
            touches: endTouches,
            preventDefault: () => {
                /*noop*/
            },
            stopPropagation: () => {
                /*noop*/
            }
        } as any);
    }

    before(function() {
        if (inNodeContext) {
            const theGlobal: any = global;
            // tslint:disable-next-line:no-empty
            theGlobal.requestAnimationFrame = () => {};
            theGlobal.performance = {
                // tslint:disable-next-line:no-empty
                now: () => {}
            };
            (global as any).window = {
                addEventListener: (eventName: string, func: EventListener) => {
                    eventMap.set(eventName, func);
                },
                removeEventListener: () => {
                    /* noop */
                }
            };
        }
    });

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        domElement = {
            addEventListener: (eventName: string, func: EventListener) => {
                eventMap.set(eventName, func);
            },
            getBoundingClientRect: sandbox.stub().callsFake(() => {
                return {
                    left: 0,
                    top: 0,
                    width: DEFAULT_CANVAS_WIDTH,
                    height: DEFAULT_CANVAS_HEIGHT
                };
            }),
            style: { width: `${DEFAULT_CANVAS_WIDTH}`, height: `${DEFAULT_CANVAS_HEIGHT}` },
            clientWidth: DEFAULT_CANVAS_WIDTH,
            clientHeight: DEFAULT_CANVAS_HEIGHT
        } as any;
        mapView = sandbox.createStubInstance(MapView) as any;
        sandbox.stub(mapView, "renderer").get(() => ({ domElement }));
        updateStub = mapView.update as any;
        // tslint:disable-next-line: deprecation
        lookAtStub = mapView.lookAt as any;

        sandbox.stub(mapView, "projection").get(() => {
            return mercatorProjection;
        });
        sandbox.stub(mapView, "target").get(() => {
            return GeoCoordinates.fromDegrees(0, 0);
        });
        mapView.minZoomLevel = 0;
        mapView.maxZoomLevel = 20;
        camera = new THREE.PerspectiveCamera(40);
        sandbox.stub(mapView, "camera").get(() => camera);
        updateStub.resetHistory();
    });

    afterEach(function() {
        sandbox.restore();
        eventMap.clear();
    });

    after(function() {
        if (inNodeContext) {
            delete global.requestAnimationFrame;
            delete global.performance;
            delete global.window;
        }
    });

    describe("on object creation", function() {
        let maxZoom: number;
        let minZoom: number;
        let minCameraHeight: number;

        beforeEach(function() {
            maxZoom = 10;
            minZoom = 5;
            minCameraHeight = 100;

            sandbox.stub(mapView, "maxZoomLevel").get(() => maxZoom);
            sandbox.stub(mapView, "minZoomLevel").get(() => minZoom);
            sandbox.stub(mapView, "minCameraHeight").get(() => minCameraHeight);
            sandbox.stub(mapView, "projection").get(() => mercatorProjection);
            mapControls = new MapControls(mapView);
        });

        it("initializes camera property using value from constructor param", function() {
            expect(mapControls.camera).to.be.equals(camera);
        });

        it("initializes domElement property using value from constructor param", function() {
            expect(mapControls.domElement).to.be.equals(domElement);
        });

        it("initializes minZoomLevel property using value from constructor param", function() {
            expect(mapControls.minZoomLevel).to.be.equals(minZoom);
        });

        it("initializes maxZoomLevel property using value from constructor param", function() {
            expect(mapControls.maxZoomLevel).to.be.equals(maxZoom);
        });

        it("initializes minCameraHeight property using value from constructor param", function() {
            expect(mapControls.minCameraHeight).to.be.equals(minCameraHeight);
        });
    });

    it("correctly updates mapView on mouse move", function() {
        const controls = new MapControls(mapView);
        sandbox.stub(controls, "dispatchEvent");
        sandbox.stub(controls as any, "getPointerPosition").returns({ x: 0, y: 0 });

        expect(updateStub.callCount).to.be.equal(0);
        (controls as any).mouseMove({
            preventDefault: sandbox.stub(),
            stopPropagation: sandbox.stub()
        });
        expect(updateStub.callCount).to.be.equal(1);
    });

    it("correctly updates mapView on touch move", function() {
        const controls = new MapControls(mapView);
        (controls as any).m_touchState.touches = { length: 5 };
        sandbox.stub(controls as any, "updateTouches");
        sandbox.stub(controls, "dispatchEvent");
        sandbox.stub(controls as any, "getPointerPosition").returns({ x: 0, y: 0 });

        expect(updateStub.callCount).to.be.equal(0);
        (controls as any).touchMove({
            touches: [],
            preventDefault: sandbox.stub(),
            stopPropagation: sandbox.stub()
        });
        expect(updateStub.callCount).to.be.equal(1);
    });

    describe("zoomOnTargetPosition", function() {
        const elevationProvider = ({} as any) as ElevationProvider;

        function resetCamera(pitch: number, zoomLevel?: number) {
            const target = GeoCoordinates.fromDegrees(0, 0);
            const heading = 0;
            const distance = zoomLevel
                ? MapViewUtils.calculateDistanceFromZoomLevel(mapView, zoomLevel)
                : 1e6;
            MapViewUtils.getCameraRotationAtTarget(
                mapView.projection,
                target,
                -heading,
                pitch,
                camera.quaternion
            );
            MapViewUtils.getCameraPositionFromTargetCoordinates(
                target,
                distance,
                -heading,
                pitch,
                mapView.projection,
                camera.position
            );
            camera.updateMatrixWorld(true);
        }

        function computeZoomLevel(projection: Projection) {
            const distance =
                projection.unprojectAltitude(camera.position) /
                Math.cos(MapViewUtils.extractAttitude(mapView, camera).pitch);
            return MapViewUtils.calculateZoomLevelFromDistance(mapView, distance);
        }

        for (const { projName, projection } of [
            { projName: "mercator", projection: mercatorProjection },
            { projName: "sphere", projection: sphereProjection }
        ]) {
            describe(`${projName} projection`, function() {
                beforeEach(function() {
                    sandbox.stub(mapView, "projection").get(() => projection);
                    sandbox.stub(mapView, "focalLength").get(() => 2000);
                    sandbox.stub(mapView, "minZoomLevel").get(() => 1);
                    sandbox.stub(mapView, "maxZoomLevel").get(() => 20);
                    mapControls = new MapControls(mapView);
                });
                for (const pitch of [0, 45]) {
                    it(`camera distance is offset by elevation (pitch ${pitch})`, function() {
                        resetCamera(pitch);

                        elevationProvider.getHeight = sandbox.stub().returns(0);
                        sandbox.stub(mapView, "elevationProvider").get(() => elevationProvider);

                        mapControls.zoomOnTargetPosition(0, 0, 10);
                        const altitudeWithoutElevation = projection.unprojectAltitude(
                            camera.position
                        );

                        resetCamera(pitch);
                        const elevation = 333;
                        elevationProvider.getHeight = sandbox.stub().returns(elevation);
                        mapControls.zoomOnTargetPosition(0, 0, 10);
                        const altitudeWithElevation = projection.unprojectAltitude(camera.position);

                        const eps = 1e-5;
                        expect(altitudeWithElevation).closeTo(
                            altitudeWithoutElevation + elevation,
                            eps
                        );
                    });

                    it(`zl is applied even if target is not valid (pitch ${pitch})`, function() {
                        const eps = 1e-5;

                        resetCamera(pitch, 3);
                        mapControls.maxTiltAngle = 90;

                        {
                            const expectedZl = 2;
                            mapControls.zoomOnTargetPosition(1, 1, expectedZl);
                            const actualZl = computeZoomLevel(projection);
                            expect(actualZl).closeTo(expectedZl, eps);
                        }
                        resetCamera(pitch, 3);
                        {
                            const expectedZl = 4;
                            mapControls.zoomOnTargetPosition(1, 1, expectedZl);
                            const actualZl = computeZoomLevel(projection);
                            expect(actualZl).closeTo(expectedZl, eps);
                        }
                    });
                }

                it("Applies zoom if final camera position is within bounds", function() {
                    const eps = 1e-5;
                    const expectedZl = 11;

                    resetCamera(0, 10);

                    mapControls.bounds = new GeoBox(
                        new GeoCoordinates(-10, -10),
                        new GeoCoordinates(10, 10)
                    );
                    mapControls.zoomOnTargetPosition(0, 0, expectedZl);
                    const actualZl = computeZoomLevel(projection);
                    expect(actualZl).closeTo(expectedZl, eps);
                });

                it("Skips zoom if final camera position is not within bounds", function() {
                    const eps = 1e-5;
                    const expectedZl = 11;

                    resetCamera(0, 10);
                    const oldCameraPos = camera.position.clone();

                    mapControls.bounds = new GeoBox(
                        new GeoCoordinates(50, 50),
                        new GeoCoordinates(50.1, 50.1)
                    );
                    mapControls.zoomOnTargetPosition(0, 0, expectedZl);
                    const actualZl = computeZoomLevel(projection);
                    expect(actualZl).not.closeTo(expectedZl, eps);
                    expect(camera.position).to.deep.equal(oldCameraPos);
                });
            });
        }
    });

    describe("enable/disable interactions", function() {
        const initialZoomLevel = 15;

        beforeEach(function() {
            const cameraPosition = new THREE.Vector3(0, 0, 10);
            camera.position.set(0, 0, 10);
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            camera.updateMatrixWorld(true);
            (camera as THREE.PerspectiveCamera).far = cameraPosition.length();
            (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
            mapControls = new MapControls(mapView);
            mapControls.inertiaEnabled = false;
            sandbox.stub(mapView, "zoomLevel").get(() => {
                return initialZoomLevel;
            });
            // needed to get the initial zoom level from MapView.
            (mapControls as any).assignZoomAfterTouchZoomRender();
            expect(mapControls.zoomLevelTargeted).to.equal(initialZoomLevel);
        });

        for (const { enabled, allEnabled, suffix } of [
            { enabled: true, allEnabled: true, suffix: "enabled" },
            { enabled: false, allEnabled: true, suffix: "disabled with specific flag" },
            { enabled: true, allEnabled: false, suffix: "disabled with general flag" }
        ]) {
            it(`zoom interactions can be ${suffix}`, function() {
                mapControls.zoomEnabled = enabled;
                mapControls.enabled = allEnabled;
                const isEnabled = allEnabled && enabled;

                mapControls.setZoomLevel(initialZoomLevel + 1);
                expect(mapControls.zoomLevelTargeted - initialZoomLevel !== 0).to.equal(isEnabled);
                mapControls.setZoomLevel(initialZoomLevel - 1);
                expect(mapControls.zoomLevelTargeted - initialZoomLevel !== 0).to.equal(isEnabled);

                wheel(1);
                expect(mapControls.zoomLevelTargeted - initialZoomLevel !== 0).to.equal(isEnabled);
                wheel(-1);
                expect(mapControls.zoomLevelTargeted - initialZoomLevel !== 0).to.equal(isEnabled);

                dblClick();
                expect(mapControls.zoomLevelTargeted - initialZoomLevel !== 0).to.equal(isEnabled);

                dblTap();
                expect(mapControls.zoomLevelTargeted - initialZoomLevel !== 0).to.equal(isEnabled);
            });

            it(`pan interactions can be ${suffix}`, function() {
                const initX = camera.position.x;
                const initY = camera.position.y;
                mapControls.panEnabled = enabled;
                mapControls.enabled = allEnabled;
                const isEnabled = allEnabled && enabled;

                mouseMove(0, domElement.clientWidth / 3, domElement.clientHeight / 3);
                expect(camera.position.x - initX !== 0).equals(isEnabled);
                expect(camera.position.y - initY !== 0).equals(isEnabled);

                touchMove(1, domElement.clientWidth / 3, domElement.clientHeight / 3);
                expect(camera.position.x - initX !== 0).equals(isEnabled);
                expect(camera.position.y - initY !== 0).equals(isEnabled);
            });

            it(`tilt interactions can be ${suffix}`, function() {
                lookAtStub.resetHistory();
                mapControls.tiltEnabled = enabled;
                mapControls.enabled = allEnabled;
                const isEnabled = allEnabled && enabled;

                mapControls.toggleTilt();
                expect(lookAtStub.called).to.equal(isEnabled);

                mouseMove(2, domElement.clientWidth / 3, domElement.clientHeight / 3);
                expect(lookAtStub.called).to.equal(isEnabled);

                touchMove(3, domElement.clientWidth / 3, domElement.clientHeight / 3);
                expect(lookAtStub.called).to.equal(isEnabled);
            });
        }
    });
});
