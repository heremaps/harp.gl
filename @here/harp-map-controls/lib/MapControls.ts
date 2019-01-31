/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as geoUtils from "@here/harp-geoutils";
import { MapView, MapViewEventNames, MapViewUtils } from "@here/harp-mapview";
import * as THREE from "three";
import * as utils from "./Utils";

enum State {
    NONE,
    PAN,
    ROTATE,
    ORBIT,
    TOUCH
}

interface TouchState {
    currentTouchPoint: THREE.Vector2;
    lastTouchPoint: THREE.Vector2;
    currentWorldPosition: THREE.Vector3;
    initialWorldPosition: THREE.Vector3;
}

/**
 * Map interaction events' names.
 */
export enum EventNames {
    Update = "update",
    BeginInteraction = "begin-interaction",
    EndInteraction = "end-interaction"
}

// cast needed to workaround wrong three.js typings.
const MAPCONTROL_EVENT: THREE.Event = { type: EventNames.Update } as any;
const MAPCONTROL_EVENT_BEGIN_INTERACTION: THREE.Event = {
    type: EventNames.BeginInteraction
} as any;
const MAPCONTROL_EVENT_END_INTERACTION: THREE.Event = {
    type: EventNames.EndInteraction
} as any;

/**
 * Yaw rotation as quaternion. Declared as a const to avoid object re-creation in certain
 * functions.
 */
const yawQuaternion = new THREE.Quaternion();
/**
 * Pitch rotation as quaternion. Declared as a const to avoid object re-creation in certain
 * functions.
 */
const pitchQuaternion = new THREE.Quaternion();
/**
 * The yaw axis around we rotate when we change the yaw.
 * This axis is fix and is the -Z axis `(0,0,1)`.
 */
const yawAxis = new THREE.Vector3(0, 0, 1);
/**
 * The pitch axis which we use to rotate around when we change the pitch.
 * The axis is fix and is the +X axis `(1,0,0)`.
 */
const pitchAxis = new THREE.Vector3(1, 0, 0);

/**
 * The number of the steps for which, when pitching the camera, the delta altitude is scaled until
 * it reaches the minimum camera height.
 */
const MAX_DELTA_ALTITUDE_STEPS = 10;

/**
 * The number of user's inputs to consider for panning inertia, to reduce erratic inputs.
 */
const USER_INPUTS_TO_CONSIDER = 5;

/**
 * This map control provides basic map-related building blocks to interact with the map. It also
 * provides a default way of handling user input. Currently we support basic mouse interaction and
 * touch input interaction.
 *
 * Mouse interaction:
 *  - Left mouse button + move = Panning the map.
 *  - Right mouse button + move = Rotating the view. Up down movement changes the pitch. Left/right
 *    movement changes the yaw.
 *  - Middle mouse button + move = Orbits the camera around the focus point.
 *  - Mouse wheel = Zooms up and down by one zoom level, zooms on target.
 *
 * Touch interaction:
 *  - One finger = Panning the map.
 *  - Two fingers = Scale, rotate and panning the map.
 *  - Three fingers = Orbiting the map. Up down movements influences the current orbit altitude.
 *    Left/right changes the azimuth.
 */
export class MapControls extends THREE.EventDispatcher {
    /**
     * Creates MapControls object and attaches it specified [[MapView]].
     *
     * @param mapView - [[MapView]] object to which MapControls should be attached to.
     */
    static create(mapView: MapView) {
        return new MapControls(mapView);
    }

    /**
     * This factor will be applied to the delta of the current mouse pointer position and the last
     * mouse pointer position: The result then will be used as an offset for the rotation then.
     * Default value is `0.1`.
     */
    rotationMouseDeltaFactor = 0.1;

    /**
     * This factor will be applied to the delta of the current mouse pointer position and the last
     * mouse pointer position: The result then will be used as an offset to orbit the camera.
     * Default value is `0.1`.
     */
    orbitingMouseDeltaFactor = 0.1;

    /**
     * This factor will be applied to the delta of the current touch pointer position and the last
     * touch pointer position: The result then will be used as an offset to orbit the camera.
     * Default value is `0.1`.
     */
    orbitingTouchDeltaFactor = 0.1;

    /**
     * Set to `true` to enable input handling through this map control, `false` to disable input
     * handling. Even when disabling input handling, you can manually use the public functions to
     * change the view to the current map.
     */
    enabled = true;

    /**
     * Set to `true` to enable orbiting and Pitch axis rotation through this map control, `false` to
     * disable orbiting and Pitch axis rotation.
     */
    tiltEnabled = true;

    /**
     * Set to `true` to enable rotation through this map control, `false` to disable rotation.
     */
    rotateEnabled = true;

    /**
     * Set to `true` to enable an inertia dampening on zooming and panning. `false` cancels inertia.
     */
    inertiaEnabled = true;

    /**
     * Inertia damping duration for the zoom, in seconds.
     */
    zoomInertiaDampingDuration = 0.5;

    /**
     * Inertia damping duration for the panning, in seconds.
     */
    panInertiaDampingDuration = 1.0;

    /**
     * Determines the zoom level delta for single mouse wheel movement. So after each mouse wheel
     * movement the current zoom level will be added or subtracted by this value. The default value
     * is `0.2` - this means that every 5th mouse wheel movement you will cross a zoom level.
     *
     * **Note**: To reverse the zoom direction, you can provide a negative value.
     */
    zoomLevelDeltaOnMouseWheel = 0.2;

    /**
     * Determines the minimum zoom level we can zoom to.
     */
    minZoomLevel = 0;

    /**
     * Determines the maximum zoom level we can zoom to.
     */
    maxZoomLevel = 20;

    /**
     * Determines the minimum camera height in meter.
     */
    minCameraHeight = 3;

    /**
     * Three.js camera that this controller affects.
     */
    readonly camera: THREE.Camera;

    /**
     * Map's HTML DOM element.
     */
    readonly domElement: HTMLCanvasElement;

    private readonly m_currentViewDirection = new THREE.Vector3();

    private readonly m_lastMousePosition = new THREE.Vector2(0, 0);

    private m_needsRenderLastFrame: boolean = true;

    private m_panIsAnimated: boolean = false;
    private m_panDistanceFrameDelta: THREE.Vector3 = new THREE.Vector3();
    private m_panAnimationTime: number = 0;
    private m_panAnimationStartTime: number = 0;
    private m_lastAveragedPanDistance: number = 0;
    private m_currentInertialPanningSpeed: number = 0;
    private m_lastPanVector: THREE.Vector3 = new THREE.Vector3();
    private m_recentPanDistances: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    private m_currentPanDistanceIndex: number = 0;

    private m_zoomIsAnimated: boolean = false;
    private m_zoomDeltaRequested: number = 0;
    private m_zoomTargetNormalizedCoordinates: THREE.Vector2 = new THREE.Vector2();
    private m_zoomAnimationTime: number = 0;
    private m_zoomAnimationStartTime: number = 0;
    private m_startZoom: number = 0;
    private m_targettedZoom?: number;
    private m_currentZoom?: number;

    private m_state: State = State.NONE;

    /**
     * Determines the minimum angle the camera can pitch to. It is defined in radians.
     */
    private m_minPitchAngle = 0;

    /**
     * Determines the maximum angle the camera can pitch to. It is defined in radians.
     */
    private m_maxPitchAngle = Math.PI;

    private m_cleanupMouseEventListeners?: () => void;

    private m_touchState: {
        touches: TouchState[];
        currentRotation: number;
        initialRotation: number;
    } = {
        touches: [],
        currentRotation: 0,
        initialRotation: 0
    };

    /**
     * Constructs a new `MapControls` object.
     *
     * @param mapView [[MapView]] this controller modifies.ZZ
     */
    constructor(readonly mapView: MapView) {
        super();
        this.camera = mapView.camera;
        this.domElement = mapView.renderer.domElement;
        this.maxZoomLevel = mapView.maxZoomLevel;
        this.minZoomLevel = mapView.minZoomLevel;
        this.minCameraHeight = mapView.minCameraHeight;
        this.bindInputEvents(this.domElement);
        this.zoom = this.zoom.bind(this);
        this.pan = this.pan.bind(this);
    }

    /**
     * Destroy this `MapControls` instance.
     *
     * Unregisters all grobal event handlers used. This is method should be called when you stop
     * using `MapControls`.
     */
    dispose = () => {
        // replaced with real code in bindInputEvents
    };

    /**
     * Rotates the camera by the given delta yaw and delta pitch.
     *
     * @param deltaYaw Delta yaw in degrees.
     * @param deltaPitch Delta pitch in degrees.
     */
    rotate(deltaYaw: number, deltaPitch: number) {
        const yawPitchRoll = MapViewUtils.extractYawPitchRoll(this.camera.quaternion);

        //yaw
        let yawAngle = yawPitchRoll.yaw;
        if (this.rotateEnabled) {
            yawAngle -= geoUtils.MathUtils.degToRad(deltaYaw);
        }
        yawQuaternion.setFromAxisAngle(yawAxis, yawAngle);

        //pitch
        const deltaPitchRadians = geoUtils.MathUtils.degToRad(deltaPitch);
        const pitchAngle = this.constrainPitchAngle(yawPitchRoll.pitch, deltaPitchRadians);
        pitchQuaternion.setFromAxisAngle(pitchAxis, pitchAngle);

        yawQuaternion.multiply(pitchQuaternion);
        this.mapView.camera.quaternion.copy(yawQuaternion);
        this.mapView.camera.matrixWorldNeedsUpdate = true;
    }

    /**
     * Current viewing angles yaw/pitch/roll in degrees.
     */
    get yawPitchRoll(): MapViewUtils.YawPitchRoll {
        const ypr = MapViewUtils.extractYawPitchRoll(this.camera.quaternion);
        return {
            yaw: geoUtils.MathUtils.radToDeg(ypr.yaw),
            pitch: geoUtils.MathUtils.radToDeg(ypr.pitch),
            roll: geoUtils.MathUtils.radToDeg(ypr.roll)
        };
    }

    /*
     * Orbits the camera around the focus point of the camera. The `deltaAzimuth` and
     * `deltaAltitude` are offsets in degrees to the current azimuth and altitude of the current
     * orbit.
     *
     * @param deltaAzimuth Delta azimuth in degrees.
     * @param deltaAltitude Delta altitude in degrees.
     */
    orbitFocusPoint(deltaAzimuth: number, deltaAltitude: number) {
        this.stopZoom();

        this.mapView.camera.getWorldDirection(this.m_currentViewDirection);
        const currentAzimuthAltitude = utils.directionToAzimuthAltitude(
            this.m_currentViewDirection
        );

        const topElevation =
            (1.0 / Math.sin(currentAzimuthAltitude.altitude)) * this.mapView.camera.position.z;
        const focusPointInWorldPosition = MapViewUtils.rayCastWorldCoordinates(this.mapView, 0, 0);

        const deltaAltitudeConstrained = this.getMinDelta(deltaAltitude);

        this.rotate(deltaAzimuth, deltaAltitudeConstrained);

        this.mapView.camera.getWorldDirection(this.m_currentViewDirection);
        const newAzimuthAltitude = utils.directionToAzimuthAltitude(this.m_currentViewDirection);

        const newElevation = Math.sin(newAzimuthAltitude.altitude) * topElevation;
        this.mapView.camera.position.z = newElevation;
        const newFocusPointInWorldPosition = MapViewUtils.rayCastWorldCoordinates(
            this.mapView,
            0,
            0
        );

        if (!focusPointInWorldPosition || !newFocusPointInWorldPosition) {
            // We do this to trigger an update in all cases.
            this.updateMapView();
            return;
        }

        const diff = focusPointInWorldPosition.sub(newFocusPointInWorldPosition);
        MapViewUtils.pan(this.mapView, diff.x, diff.y);
    }

    /**
     * Moves the camera along the view direction in meters.
     * A positive value will move the camera further away from the point where the camera looks at.
     * A negative value will move the camera near to the point where the camera looks at.
     *
     * @param amount Amount to move along the view direction in meters.
     */
    moveAlongTheViewDirection(amount: number) {
        this.mapView.camera.getWorldDirection(this.m_currentViewDirection);
        this.m_currentViewDirection.multiplyScalar(amount);

        this.mapView.camera.position.z += this.m_currentViewDirection.z;
        this.mapView.worldCenter.x += this.m_currentViewDirection.x;
        this.mapView.worldCenter.y += this.m_currentViewDirection.y;
        this.updateMapView();
    }

    /**
     * Sets the rotation of the camera according to yaw and pitch in degrees.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param yaw Yaw in degrees.
     * @param pitch Pitch in degrees.
     */
    setRotation(yaw: number, pitch: number): void {
        MapViewUtils.setRotation(this.mapView, yaw, pitch);
    }

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param targetPositionOnScreenXinNDC Target x position in NDC space.
     * @param targetPositionOnScreenYinNDC Target y position in NDC space.
     */
    zoomOnTargetPosition(
        targetPositionOnScreenXinNDC: number,
        targetPositionOnScreenYinNDC: number,
        zoomLevel: number
    ) {
        MapViewUtils.zoomOnTargetPosition(
            this.mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC,
            zoomLevel
        );
    }

    /**
     * Set the camera height.
     */
    set cameraHeight(height: number) {
        //Set the cameras height according to the given zoom level.
        this.camera.position.setZ(height);
        this.camera.matrixWorldNeedsUpdate = true;
    }

    /**
     * Get the current camera height.
     */
    get cameraHeight(): number {
        // ### Sync with the way geoviz is computing the zoom level.
        return this.mapView.camera.position.z;
    }

    /**
     * Set camera max pitch angle.
     *
     * @param angle Angle in degrees.
     */
    set maxPitchAngle(angle: number) {
        this.m_maxPitchAngle = geoUtils.MathUtils.degToRad(angle);
    }

    /**
     * Get the camera max pitch angle in degrees.
     */
    get maxPitchAngle(): number {
        return geoUtils.MathUtils.radToDeg(this.m_maxPitchAngle);
    }

    /**
     * Set camera min pitch angle.
     *
     * @param angle Angle in degrees.
     */
    set minPitchAngle(angle: number) {
        this.m_minPitchAngle = geoUtils.MathUtils.degToRad(angle);
    }

    /**
     * Get the camera min pitch angle in degrees.
     */
    get minPitchAngle(): number {
        return geoUtils.MathUtils.radToDeg(this.m_minPitchAngle);
    }

    private set currentZoom(zoom: number) {
        this.m_currentZoom = zoom;
    }

    private get currentZoom(): number {
        return this.m_currentZoom !== undefined
            ? this.m_currentZoom
            : MapViewUtils.calculateZoomLevelFromHeight(
                  this.mapView.camera.position.z,
                  this.mapView
              );
    }

    private get zoomLevelTargetted(): number {
        return this.m_targettedZoom === undefined ? this.currentZoom : this.m_targettedZoom;
    }

    private easeOutCubic(startValue: number, endValue: number, time: number): number {
        return startValue + (endValue - startValue) * (--time * time * time + 1);
    }

    private zoom() {
        if (this.m_zoomDeltaRequested !== 0) {
            this.m_targettedZoom = Math.max(
                Math.min(this.zoomLevelTargetted + this.m_zoomDeltaRequested, this.maxZoomLevel),
                this.minZoomLevel
            );
            this.m_zoomDeltaRequested = 0;
        }
        if (this.inertiaEnabled) {
            if (!this.m_zoomIsAnimated) {
                this.m_zoomIsAnimated = true;
                this.mapView.addEventListener(MapViewEventNames.AfterRender, this.zoom);
            }
            const currentTime = performance.now();
            this.m_zoomAnimationTime = (currentTime - this.m_zoomAnimationStartTime) / 1000;
            const zoomFinished = this.m_zoomAnimationTime > this.zoomInertiaDampingDuration;
            if (zoomFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_zoomAnimationTime = this.zoomInertiaDampingDuration;
                    this.stopZoom();
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }
        }

        this.currentZoom = !this.inertiaEnabled
            ? this.zoomLevelTargetted
            : this.easeOutCubic(
                  this.m_startZoom,
                  this.zoomLevelTargetted,
                  Math.min(1, this.m_zoomAnimationTime / this.zoomInertiaDampingDuration)
              );

        MapViewUtils.zoomOnTargetPosition(
            this.mapView,
            this.m_zoomTargetNormalizedCoordinates.x,
            this.m_zoomTargetNormalizedCoordinates.y,
            this.currentZoom
        );

        this.updateMapView();
    }

    private stopZoom() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.zoom);
        this.m_zoomIsAnimated = false;
        this.m_targettedZoom = this.m_currentZoom = undefined;
    }

    private pan() {
        if (this.m_state === State.NONE && this.m_lastAveragedPanDistance === 0) {
            return;
        }

        if (this.inertiaEnabled && !this.m_panIsAnimated) {
            this.m_panIsAnimated = true;
            this.mapView.addEventListener(MapViewEventNames.AfterRender, this.pan);
        }

        const applyInertia =
            this.inertiaEnabled &&
            this.m_state === State.NONE &&
            this.m_lastAveragedPanDistance > 0;

        if (applyInertia) {
            const currentTime = performance.now();
            this.m_panAnimationTime = (currentTime - this.m_panAnimationStartTime) / 1000;
            const panFinished = this.m_panAnimationTime > this.panInertiaDampingDuration;

            if (panFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_panAnimationTime = this.panInertiaDampingDuration;
                    this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.pan);
                    this.m_panIsAnimated = false;
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }

            const animationTime = this.m_panAnimationTime / this.panInertiaDampingDuration;
            this.m_currentInertialPanningSpeed = this.easeOutCubic(
                this.m_lastAveragedPanDistance,
                0,
                Math.min(1, animationTime)
            );
            if (this.m_currentInertialPanningSpeed === 0) {
                this.m_lastAveragedPanDistance = 0;
            }
            this.m_panDistanceFrameDelta
                .copy(this.m_lastPanVector)
                .setLength(this.m_currentInertialPanningSpeed);
        } else {
            this.m_lastPanVector.copy(this.m_panDistanceFrameDelta);
            const panDistance = this.m_lastPanVector.length();
            this.m_currentPanDistanceIndex =
                (this.m_currentPanDistanceIndex + 1) % USER_INPUTS_TO_CONSIDER;
            this.m_recentPanDistances[this.m_currentPanDistanceIndex] = panDistance;
            this.m_lastAveragedPanDistance =
                this.m_recentPanDistances.reduce((a, b) => a + b) / USER_INPUTS_TO_CONSIDER;
        }

        MapViewUtils.pan(
            this.mapView,
            this.m_panDistanceFrameDelta.x,
            this.m_panDistanceFrameDelta.y
        );
        if (!applyInertia) {
            this.m_panDistanceFrameDelta.set(0, 0, 0);
        }

        this.updateMapView();
    }

    private bindInputEvents(domElement: HTMLCanvasElement) {
        const onContextMenu = this.contextMenu.bind(this);
        const onMouseDown = this.mouseDown.bind(this);
        const onMouseWheel = this.mouseWheel.bind(this);
        const onTouchStart = this.touchStart.bind(this);
        const onTouchEnd = this.touchEnd.bind(this);
        const onTouchMove = this.touchMove.bind(this);

        domElement.addEventListener("contextmenu", onContextMenu, false);
        domElement.addEventListener("mousedown", onMouseDown, false);
        domElement.addEventListener("wheel", onMouseWheel, false);
        domElement.addEventListener("touchstart", onTouchStart, false);
        domElement.addEventListener("touchend", onTouchEnd, false);
        domElement.addEventListener("touchmove", onTouchMove, false);

        this.dispose = () => {
            domElement.removeEventListener("contextmenu", onContextMenu, false);
            domElement.removeEventListener("mousedown", onMouseDown, false);
            domElement.removeEventListener("wheel", onMouseWheel, false);
            domElement.removeEventListener("touchstart", onTouchStart, false);
            domElement.removeEventListener("touchend", onTouchEnd, false);
            domElement.removeEventListener("touchmove", onTouchMove, false);
        };
    }

    private updateMapView() {
        this.dispatchEvent(MAPCONTROL_EVENT);
        this.mapView.update();
    }

    private mouseDown(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        if (event.shiftKey || event.ctrlKey) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (this.m_state !== State.NONE) {
            return;
        }

        if (event.button === 0) {
            this.m_state = State.PAN;
        } else if (event.button === 1 && this.tiltEnabled) {
            this.m_state = State.ORBIT;
        } else if (event.button === 2) {
            this.m_state = State.ROTATE;
        } else {
            return;
        }

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);

        this.m_lastMousePosition.setX(event.offsetX);
        this.m_lastMousePosition.setY(event.offsetY);

        const onMouseMove = this.mouseMove.bind(this);
        const onMouseUp = this.mouseUp.bind(this);

        document.addEventListener("mousemove", onMouseMove, false);
        document.addEventListener("mouseup", onMouseUp, false);

        this.m_cleanupMouseEventListeners = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
    }

    private mouseMove(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        if (this.m_state === State.PAN) {
            this.panFromTo(
                this.m_lastMousePosition.x,
                this.m_lastMousePosition.y,
                this.m_lastMousePosition.x + event.movementX,
                this.m_lastMousePosition.y + event.movementY
            );
        } else if (this.m_state === State.ROTATE) {
            this.rotate(
                -this.rotationMouseDeltaFactor * event.movementX,
                this.rotationMouseDeltaFactor * event.movementY
            );
        } else if (this.m_state === State.ORBIT) {
            this.orbitFocusPoint(
                this.orbitingMouseDeltaFactor * event.movementX,
                -this.orbitingMouseDeltaFactor * event.movementY
            );
        }

        this.m_lastMousePosition.setX(this.m_lastMousePosition.x + event.movementX);
        this.m_lastMousePosition.setY(this.m_lastMousePosition.y + event.movementY);
        this.m_zoomAnimationStartTime = performance.now();

        this.updateMapView();
        event.preventDefault();
        event.stopPropagation();
    }

    private mouseUp(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        this.updateMapView();

        event.preventDefault();
        event.stopPropagation();

        this.m_state = State.NONE;

        if (this.m_cleanupMouseEventListeners) {
            this.m_cleanupMouseEventListeners();
        }

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
    }

    private mouseWheel(event: WheelEvent) {
        if (this.enabled === false) {
            return;
        }

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);

        // Register the zoom request
        this.m_startZoom = this.currentZoom;
        this.m_zoomDeltaRequested =
            event.deltaY > 0 ? -this.zoomLevelDeltaOnMouseWheel : this.zoomLevelDeltaOnMouseWheel;

        // Cancel panning so the point of origin of the zoom is maintained.
        this.m_panDistanceFrameDelta.set(0, 0, 0);
        this.m_lastAveragedPanDistance = 0;

        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);

        this.m_zoomTargetNormalizedCoordinates = utils.calculateNormalizedDeviceCoordinates(
            event.offsetX,
            event.offsetY,
            width,
            height
        );

        // Assign the new animation start time.
        this.m_zoomAnimationStartTime = performance.now();

        this.zoom();

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
    }

    /**
     * Calculates the angle of the vector, which is formed by two touch points in world space
     * against the X axis in world space on the map. The resulting angle is in radians and between
     * `-PI` and `PI`.
     */
    private calculateAngleFromTouchPointsInWorldspace(): number {
        if (this.m_touchState.touches.length < 2) {
            return 0;
        }

        const x =
            this.m_touchState.touches[1].currentWorldPosition.x -
            this.m_touchState.touches[0].currentWorldPosition.x;

        const y =
            this.m_touchState.touches[1].currentWorldPosition.y -
            this.m_touchState.touches[0].currentWorldPosition.y;

        return Math.atan2(y, x);
    }

    /**
     * Calculates the difference of the current distance of two touch points against their initial
     * distance in world space.
     */
    private calculatePinchDistanceInWorldSpace(): number {
        if (this.m_touchState.touches.length < 2) {
            return 0;
        }

        const initialDistance = this.m_touchState.touches[0].initialWorldPosition
            .clone()
            .sub(this.m_touchState.touches[1].initialWorldPosition)
            .length();

        const currentDistance = this.m_touchState.touches[0].currentWorldPosition
            .clone()
            .sub(this.m_touchState.touches[1].currentWorldPosition)
            .length();

        return currentDistance - initialDistance;
    }

    private convertTouchPoint(touch: Touch): TouchState | null {
        const newTouchPoint = new THREE.Vector2(touch.pageX, touch.pageY);

        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);

        const touchPointInNDC = utils.calculateNormalizedDeviceCoordinates(
            newTouchPoint.x,
            newTouchPoint.y,
            width,
            height
        );
        const newWorldPosition = MapViewUtils.rayCastWorldCoordinates(
            this.mapView,
            touchPointInNDC.x,
            touchPointInNDC.y
        );

        if (!newWorldPosition) {
            return null;
        }

        return {
            currentTouchPoint: newTouchPoint.clone(),
            lastTouchPoint: newTouchPoint.clone(),
            currentWorldPosition: newWorldPosition.clone(),
            initialWorldPosition: newWorldPosition.clone()
        };
    }

    private setTouchState(touches: TouchList) {
        this.m_touchState.touches = [];

        // TouchList doesn't conform to iterator interface so we cannot use 'for of'
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < touches.length; ++i) {
            const touchState = this.convertTouchPoint(touches[i]);
            if (touchState) {
                this.m_touchState.touches.push(touchState);
            }
        }

        if (this.m_touchState.touches.length !== 0) {
            this.updateTouchState();
            this.m_touchState.initialRotation = this.m_touchState.currentRotation;
        }
    }

    private updateTouchState() {
        this.m_touchState.currentRotation = this.calculateAngleFromTouchPointsInWorldspace();
    }

    private updateTouches(touches: TouchList) {
        const length = Math.min(touches.length, this.m_touchState.touches.length);
        for (let i = 0; i < length; ++i) {
            const oldTouchState = this.m_touchState.touches[i];
            const newTouchState = this.convertTouchPoint(touches[i]);
            if (newTouchState) {
                newTouchState.initialWorldPosition = oldTouchState.initialWorldPosition;
                newTouchState.lastTouchPoint = oldTouchState.currentTouchPoint;
                this.m_touchState.touches[i] = newTouchState;
            }
        }
    }

    private touchStart(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }

        this.m_state = State.TOUCH;

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);
        this.setTouchState(event.touches);

        event.preventDefault();
        event.stopPropagation();
    }

    private touchMove(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }

        this.updateTouches(event.touches);
        this.updateTouchState();

        if (this.m_touchState.touches.length <= 2) {
            const to = this.m_touchState.touches[0].currentWorldPosition.clone();
            const from = this.m_touchState.touches[0].initialWorldPosition.clone();
            this.m_panDistanceFrameDelta = from.sub(to);

            // Cancel zoom inertia if a panning is triggered, so that the mouse location is kept.
            this.m_startZoom = this.m_targettedZoom = this.currentZoom;

            // Assign the new animation start time.
            this.m_panAnimationStartTime = performance.now();

            this.pan();
        }

        if (this.m_touchState.touches.length === 2) {
            const deltaRotation =
                this.m_touchState.currentRotation - this.m_touchState.initialRotation;
            this.rotate(geoUtils.MathUtils.radToDeg(deltaRotation), 0);
            this.moveAlongTheViewDirection(this.calculatePinchDistanceInWorldSpace());
        }

        if (this.m_touchState.touches.length === 3 && this.tiltEnabled) {
            const firstTouch = this.m_touchState.touches[0];
            const diff = firstTouch.lastTouchPoint.clone().sub(firstTouch.currentTouchPoint);

            this.orbitFocusPoint(
                this.orbitingTouchDeltaFactor * diff.x,
                this.orbitingTouchDeltaFactor * diff.y
            );
        }

        this.m_zoomAnimationStartTime = performance.now();

        this.updateMapView();
        event.preventDefault();
        event.stopPropagation();
    }

    private touchEnd(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }
        this.m_state = State.NONE;

        this.setTouchState(event.touches);

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
        this.updateMapView();

        event.preventDefault();
        event.stopPropagation();
    }

    private contextMenu(event: Event) {
        event.preventDefault();
    }

    private panFromTo(fromX: number, fromY: number, toX: number, toY: number): void {
        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);

        const from = utils.calculateNormalizedDeviceCoordinates(fromX, fromY, width, height);
        const to = utils.calculateNormalizedDeviceCoordinates(toX, toY, width, height);

        const toWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, to.x, to.y);
        const fromWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, from.x, from.y);

        if (!toWorld || !fromWorld) {
            return;
        }

        this.m_panDistanceFrameDelta = fromWorld.sub(toWorld);

        // Cancel zoom inertia if a panning is triggered, so that the mouse location is kept.
        this.stopZoom();

        // Assign the new animation start time.
        this.m_panAnimationStartTime = performance.now();

        this.pan();
    }

    private constrainPitchAngle(pitchAngle: number, deltaPitch: number): number {
        const tmpPitchAngle = geoUtils.MathUtils.clamp(
            pitchAngle + deltaPitch,
            this.m_minPitchAngle,
            this.m_maxPitchAngle
        );
        if (
            this.tiltEnabled &&
            tmpPitchAngle <= this.m_maxPitchAngle &&
            tmpPitchAngle >= this.m_minPitchAngle
        ) {
            pitchAngle = tmpPitchAngle;
        }
        return pitchAngle;
    }

    /**
     * This method approximates the minimum delta altitude by attempts. It has been preferred over a
     * solution where the minimum delta is calculated adding the new delta to the current delta,
     * because that solution would not have worked with terrains.
     */
    private getMinDelta(deltaAltitude: number): number {
        // Do not even start to calculate a delta if the camera is already under the minimum height.
        if (this.mapView.camera.position.z < this.minCameraHeight && deltaAltitude > 0) {
            return 0;
        }

        const checkMinCamHeight = (deltaAlt: number, camera: THREE.PerspectiveCamera) => {
            const cameraPos = camera.position;
            const cameraQuat = camera.quaternion;
            const newPitchQuaternion = new THREE.Quaternion();
            const viewDirection = new THREE.Vector3();
            const mockCamera = new THREE.Object3D();
            mockCamera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
            mockCamera.quaternion.set(cameraQuat.x, cameraQuat.y, cameraQuat.z, cameraQuat.w);

            // save the current direction of the camera in viewDirection
            mockCamera.getWorldDirection(viewDirection);

            //calculate the new azimuth and altitude
            const currentAzimuthAltitude = utils.directionToAzimuthAltitude(viewDirection);
            const topElevation =
                (1.0 / Math.sin(currentAzimuthAltitude.altitude)) * mockCamera.position.z;

            // get the current quaternion from the camera
            const yawPitchRoll = MapViewUtils.extractYawPitchRoll(mockCamera.quaternion);

            //calculate the pitch
            const deltaPitchRadians = geoUtils.MathUtils.degToRad(deltaAlt);
            const pitchAngle = this.constrainPitchAngle(yawPitchRoll.pitch, deltaPitchRadians);
            newPitchQuaternion.setFromAxisAngle(pitchAxis, pitchAngle);

            // update the camera and the viewDirection vector
            mockCamera.quaternion.copy(newPitchQuaternion);
            mockCamera.matrixWorldNeedsUpdate = true;
            mockCamera.getWorldDirection(viewDirection);

            // use the viewDirection to get the height
            const newAzimuthAltitude = utils.directionToAzimuthAltitude(viewDirection);
            const newElevation = Math.sin(newAzimuthAltitude.altitude) * topElevation;
            return newElevation;
        };

        let constrainedDeltaAltitude = deltaAltitude;
        for (let i = 0; i < MAX_DELTA_ALTITUDE_STEPS; i++) {
            const cameraHeight = checkMinCamHeight(constrainedDeltaAltitude, this.mapView.camera);
            if (cameraHeight < this.minCameraHeight) {
                constrainedDeltaAltitude *= 0.5;
            } else {
                return constrainedDeltaAltitude;
            }
        }
        return constrainedDeltaAltitude;
    }
}
