/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import { MapView, MapViewEventNames, MapViewOptions, MapViewUtils } from "@here/harp-mapview";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import * as THREE from "three";

chai.use(chaiAsPromised);
// Needed for using expect(...).true for example
const { expect } = chai;

import { MapControls } from "../lib/MapControls";

declare const global: any;

describe("MapControls", function () {
    const DEFAULT_CANVAS_WIDTH = 800;
    const DEFAULT_CANVAS_HEIGHT = 600;
    let sandbox: sinon.SinonSandbox;
    let domElement: any;
    const inNodeContext = typeof window === "undefined";
    let canvas: HTMLCanvasElement;
    let mapViewOptions: MapViewOptions;
    let mapView: MapView;
    let mapControls: MapControls;
    let camera: THREE.Camera;
    let updateStub: sinon.SinonStub<any>;
    let lookAtStub: sinon.SinonStub<any>;
    let orbitAroundScreenPointSpy: sinon.SinonSpy<any>;

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

    before(function () {
        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.requestAnimationFrame = (callback: (time: DOMHighResTimeStamp) => void) => {
                setTimeout(callback, 0, 1);
            };
            let time = 0;
            theGlobal.performance = {
                now: () => {
                    // Time in ms, i.e. 20ms gives us a FPS of 50.
                    return (time += 20);
                }
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

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        domElement = {
            addEventListener: (eventName: string, func: EventListener) => {
                eventMap.set(eventName, func);
            },
            removeEventListener: (eventName: string, func: EventListener) => {
                eventMap.delete(eventName);
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
        lookAtStub = mapView.lookAt as any;

        orbitAroundScreenPointSpy = sandbox.spy(MapViewUtils, "orbitAroundScreenPoint");

        sandbox.stub(mapView, "projection").get(() => {
            return mercatorProjection;
        });
        sandbox.stub(mapView, "target").get(() => {
            return GeoCoordinates.fromDegrees(0, 0);
        });
        sandbox.stub(mapView, "tilt").get(() => {
            return 0;
        });
        mapView.minZoomLevel = 0;
        mapView.maxZoomLevel = 20;
        camera = new THREE.PerspectiveCamera(40);
        sandbox.stub(mapView, "camera").get(() => camera);
        updateStub.resetHistory();
    });

    afterEach(function () {
        sandbox.restore();
        eventMap.clear();
    });

    after(function () {
        if (inNodeContext) {
            delete global.requestAnimationFrame;
            delete global.performance;
            delete global.window;
        }
    });

    describe("on object creation", function () {
        let maxZoom: number;
        let minZoom: number;
        let minCameraHeight: number;

        beforeEach(function () {
            maxZoom = 10;
            minZoom = 5;
            minCameraHeight = 100;

            sandbox.stub(mapView, "maxZoomLevel").get(() => maxZoom);
            sandbox.stub(mapView, "minZoomLevel").get(() => minZoom);
            sandbox.stub(mapView, "minCameraHeight").get(() => minCameraHeight);
            sandbox.stub(mapView, "projection").get(() => mercatorProjection);
            mapControls = new MapControls(mapView);
        });

        it("initializes camera property using value from constructor param", function () {
            expect(mapControls.camera).to.be.equals(camera);
        });

        it("initializes domElement property using value from constructor param", function () {
            expect(mapControls.domElement).to.be.equals(domElement);
        });

        it("initializes minZoomLevel property using value from constructor param", function () {
            expect(mapControls.minZoomLevel).to.be.equals(minZoom);
        });

        it("initializes maxZoomLevel property using value from constructor param", function () {
            expect(mapControls.maxZoomLevel).to.be.equals(maxZoom);
        });

        it("initializes minCameraHeight property using value from constructor param", function () {
            expect(mapControls.minCameraHeight).to.be.equals(minCameraHeight);
        });
    });

    it("correctly updates mapView on mouse move", function () {
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

    it("correctly updates mapView on touch move", function () {
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

    it("dispose", function () {
        const controls = new MapControls(mapView);

        controls.dispose();

        expect(controls.eventTypes.length).to.be.equal(0, `events not removed.`);
    });

    describe("zoomOnTargetPosition", function () {
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

        function computeZoomLevel() {
            const distance = MapViewUtils.getTargetAndDistance(mapView.projection, camera).distance;
            return MapViewUtils.calculateZoomLevelFromDistance(mapView, distance);
        }

        for (const { projName, projection } of [
            { projName: "mercator", projection: mercatorProjection },
            { projName: "sphere", projection: sphereProjection }
        ]) {
            describe(`${projName} projection`, function () {
                beforeEach(function () {
                    const worldTarget = projection.projectPoint(
                        GeoCoordinates.fromDegrees(0, 0),
                        new THREE.Vector3()
                    );
                    sandbox.stub(mapView, "projection").get(() => projection);
                    sandbox.stub(mapView, "focalLength").get(() => 2000);
                    sandbox.stub(mapView, "minZoomLevel").get(() => 1);
                    sandbox.stub(mapView, "maxZoomLevel").get(() => 20);
                    sandbox.stub(mapView, "worldTarget").get(() => {
                        return worldTarget;
                    });
                    mapControls = new MapControls(mapView);
                });
                for (const pitch of [0, 45]) {
                    it(`camera is moved along view direction (pitch ${pitch})`, function () {
                        resetCamera(pitch);

                        mapControls.zoomOnTargetPosition(0, 0, 10);
                        const initWorldDir = mapView.worldTarget
                            .clone()
                            .sub(camera.position)
                            .normalize();

                        mapControls.zoomOnTargetPosition(0, 0, 11);
                        const endWorldDir = mapView.worldTarget
                            .clone()
                            .sub(camera.position)
                            .normalize();

                        expect(initWorldDir.dot(endWorldDir)).closeTo(1, 1e-5);
                    });

                    it(`camera target is recomputed (pitch ${pitch})`, function () {
                        resetCamera(pitch, 5);
                        mapControls.maxTiltAngle = 90;

                        mapControls.zoomOnTargetPosition(0, 0.1, 6);
                        const oldTarget = MapViewUtils.getTargetAndDistance(projection, camera)
                            .target;
                        const expAzimuth = MapViewUtils.extractSphericalCoordinatesFromLocation(
                            mapView,
                            camera,
                            projection.unprojectPoint(oldTarget)
                        ).azimuth;
                        mapControls.zoomOnTargetPosition(0, 0.2, 7);
                        const newTarget = MapViewUtils.getTargetAndDistance(projection, camera)
                            .target;
                        const actualAzimuth = MapViewUtils.extractSphericalCoordinatesFromLocation(
                            mapView,
                            camera,
                            projection.unprojectPoint(newTarget)
                        ).azimuth;
                        expect(actualAzimuth).to.be.closeTo(expAzimuth, 1e-5);
                    });

                    it(`zoom target stays at the same screen coords (pitch ${pitch})`, function () {
                        resetCamera(pitch);

                        const initZoomTarget = MapViewUtils.rayCastWorldCoordinates(
                            mapView,
                            0.5,
                            0.5
                        );

                        mapControls.zoomOnTargetPosition(0.5, 0.5, 10);
                        const endZoomTarget = MapViewUtils.rayCastWorldCoordinates(
                            mapView,
                            0.5,
                            0.5
                        );

                        expect(initZoomTarget).to.not.equal(undefined);
                        expect(endZoomTarget).to.not.equal(undefined);

                        expect(initZoomTarget!.distanceTo(endZoomTarget!)).to.be.closeTo(0, 1);
                    });

                    it(`zl is applied even if target is not valid (pitch ${pitch})`, function () {
                        const eps = 1e-5;

                        resetCamera(pitch, 3);
                        mapControls.maxTiltAngle = 90;

                        {
                            const expectedZl = 2;
                            mapControls.zoomOnTargetPosition(1, 1, expectedZl);
                            const actualZl = computeZoomLevel();
                            expect(actualZl).closeTo(expectedZl, eps);
                        }
                        resetCamera(pitch, 3);
                        {
                            const expectedZl = 4;
                            mapControls.zoomOnTargetPosition(1, 1, expectedZl);
                            const actualZl = computeZoomLevel();
                            expect(actualZl).closeTo(expectedZl, eps);
                        }
                    });
                }
            });
        }
    });

    describe("enable/disable interactions", function () {
        const initialZoomLevel = 15;

        beforeEach(function () {
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
            const worldTarget = mapView.projection.projectPoint(
                GeoCoordinates.fromDegrees(0, 0),
                new THREE.Vector3()
            );
            sandbox.stub(mapView, "worldTarget").get(() => {
                return worldTarget;
            });
            // needed to get the initial zoom level from MapView.
            mapControls["assignZoomAfterTouchZoomRender"]();
            expect(mapControls.zoomLevelTargeted).to.equal(initialZoomLevel);
        });

        for (const { enabled, allEnabled, suffix } of [
            { enabled: true, allEnabled: true, suffix: "enabled" },
            { enabled: false, allEnabled: true, suffix: "disabled with specific flag" },
            { enabled: true, allEnabled: false, suffix: "disabled with general flag" }
        ]) {
            it(`zoom interactions can be ${suffix}`, function () {
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

            it(`pan interactions can be ${suffix}`, function () {
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

            it(`tilt interactions can be ${suffix}`, function () {
                lookAtStub.resetHistory();
                orbitAroundScreenPointSpy.resetHistory();
                mapControls.tiltEnabled = enabled;
                mapControls.enabled = allEnabled;
                const isEnabled = allEnabled && enabled;

                mapControls.toggleTilt();
                expect(orbitAroundScreenPointSpy.called).to.equal(isEnabled);

                mouseMove(2, domElement.clientWidth / 3, domElement.clientHeight / 3);
                expect(orbitAroundScreenPointSpy.called).to.equal(isEnabled);

                touchMove(3, domElement.clientWidth / 3, domElement.clientHeight / 3);
                expect(orbitAroundScreenPointSpy.called).to.equal(isEnabled);
            });
        }
    });

    describe("toggletilt with inertia", () => {
        beforeEach(function () {
            // This tests runs a non mocked version of MapView, hence we need to mock some other
            // methods to get it working correctl.
            const clearColorStub: sinon.SinonStub = sandbox.stub();
            sandbox
                .stub(THREE, "WebGLRenderer")
                .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
            sandbox
                .stub(THREE, "WebGL1Renderer")
                .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
            canvas = ({
                clientWidth: 1,
                clientHeight: 1,
                addEventListener: sinon.stub(),
                removeEventListener: sinon.stub()
            } as unknown) as HTMLCanvasElement;
            mapViewOptions = {
                canvas,
                // Both options cause the `addDataSource` method to be called, which we can't
                // `await` on because it is called in the constructor, but we can disable them being
                // added.
                addBackgroundDatasource: false,
                enablePolarDataSource: false
            };
            mapView = new MapView(mapViewOptions);
            mapControls = new MapControls(mapView);
        });

        afterEach(() => {
            // Needed to clear any `setTimeout` calls which might rely on our global stubs.
            mapView.dispose();
        });

        it("toggle tilt reaches configured tilt angle and 0", async () => {
            mapControls.inertiaEnabled = true;

            let resolvePromise: (value: unknown) => void;

            const checkReachedTarget = () => {
                const mapViewTiltRad = THREE.MathUtils.degToRad(mapView.tilt);
                resolvePromise(mapViewTiltRad);
            };
            mapView.addEventListener(MapViewEventNames.MovementFinished, checkReachedTarget);

            const tiltCamera = new Promise(resolve => {
                resolvePromise = resolve;
            });
            // Tilt to `mapControls.tiltAngle`
            mapControls.toggleTilt();
            await expect(tiltCamera).to.eventually.be.closeTo(
                mapControls.tiltAngle,
                Number.EPSILON
            );

            const tiltBackToZero = new Promise(resolve => {
                resolvePromise = resolve;
            });
            // Tilt back to 0
            mapControls.toggleTilt();
            await expect(tiltBackToZero).to.eventually.be.closeTo(0, Number.EPSILON);
        });
    });
});
