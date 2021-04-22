/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as geoUtils from "@here/harp-geoutils";
import { EventDispatcher, MapView, MapViewEventNames, MapViewUtils } from "@here/harp-mapview";
import * as THREE from "three";

import * as utils from "./Utils";

enum State {
    NONE,
    PAN,
    ROTATE,
    ORBIT,
    TOUCH
}

export enum TiltState {
    Tilted,
    Down
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
 * The number of user's inputs to consider for panning inertia, to reduce erratic inputs.
 */
const USER_INPUTS_TO_CONSIDER = 5;

/**
 * The default maximum for the camera tilt. This value avoids seeing the horizon.
 */
const DEFAULT_MAX_TILT_ANGLE = THREE.MathUtils.degToRad(89);

/**
 * Epsilon value to rule out when a number can be considered 0.
 */
const EPSILON = 0.01;

/**
 * Maximum duration between start and end touch events to define a finger tap.
 */
const MAX_TAP_DURATION = 120;

/**
 * This map control provides basic map-related building blocks to interact with the map. It also
 * provides a default way of handling user input. Currently we support basic mouse interaction and
 * touch input interaction.
 *
 * Mouse interaction:
 *  - Left mouse button + move = Panning the map.
 *  - Right mouse button + move = Orbits the camera around the focus point.
 *  - Middle mouse button + move = Rotating the view. Up down movement changes the pitch. Left/right
 *    movement changes the yaw.
 *  - Mouse wheel = Zooms up and down by one zoom level, zooms on target.
 *
 * Touch interaction:
 *  - One finger = Panning the map.
 *  - Two fingers = Scale, rotate and panning the map.
 *  - Three fingers = Orbiting the map. Up down movements influences the current orbit altitude.
 *    Left/right changes the azimuth.
 */
export class MapControls extends EventDispatcher {
    /**
     * Creates MapControls object and attaches it specified [[MapView]].
     *
     * @param mapView - [[MapView]] object to which MapControls should be attached to.
     * @param disposeWithMapView - If `true`, an event with MapView is registered to dispose of
     * `MapControls` if MapView itself is disposed.
     */
    static create(mapView: MapView, disposeWithMapView = true) {
        return new MapControls(mapView, disposeWithMapView);
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
    orbitingMouseDeltaFactor = 0.1 * THREE.MathUtils.DEG2RAD;

    /**
     * This factor will be applied to the delta of the current touch pointer position and the last
     * touch pointer position: The result then will be used as an offset to orbit the camera.
     * Default value is `0.1`.
     */
    orbitingTouchDeltaFactor = 0.1 * THREE.MathUtils.DEG2RAD;

    /**
     * Set to `true` to enable input handling through this map control, `false` to disable input
     * handling. Even when disabling input handling, you can manually use the public functions to
     * change the view to the current map.
     */
    enabled = true;

    /**
     * Set to `true` to enable zooming through these controls, `false` otherwise.
     */
    zoomEnabled = true;

    /**
     * Set to `true` to enable panning through these controls, `false` otherwise.
     */
    panEnabled = true;

    /**
     * Set to `true` to enable tilting through these controls, `false` otherwise.
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
    zoomInertiaDampingDuration = 0.6;

    /**
     * Inertia damping duration for the panning, in seconds.
     */
    panInertiaDampingDuration = 1.0;

    /**
     * Duration in seconds of the camera animation when the tilt button is clicked. Independent of
     * inertia.
     */
    tiltToggleDuration = 0.5;

    /**
     * Camera tilt to the target when tilting from the `toggleTilt` public method.
     */
    tiltAngle = Math.PI / 4;

    /**
     * Duration of the animation to reset the camera to looking north, in seconds. Independent of
     * inertia.
     */
    northResetAnimationDuration = 1.5;

    /**
     * Determines the zoom level delta for single mouse wheel movement. So after each mouse wheel
     * movement the current zoom level will be added or subtracted by this value.
     *
     * The default values are:
     * - `0.2` when `inertiaEnabled` is `false` - this means that every 5th mouse wheel movement
     * you will cross a zoom level.
     * - `0.8`, otherwise.
     */
    get zoomLevelDeltaOnMouseWheel(): number {
        return this.m_zoomLevelDeltaOnMouseWheel !== undefined
            ? this.m_zoomLevelDeltaOnMouseWheel
            : this.inertiaEnabled
            ? 0.8
            : 0.2;
    }

    /**
     * Set the zoom level delta for a single mouse wheel movement.
     *
     * **Note**: To reverse the zoom direction, you can provide a negative value.
     */
    set zoomLevelDeltaOnMouseWheel(delta: number) {
        this.m_zoomLevelDeltaOnMouseWheel = delta;
    }

    /**
     * @private
     */
    private m_zoomLevelDeltaOnMouseWheel?: number;

    /**
     * Zoom level delta when using the UI controls.
     */
    zoomLevelDeltaOnControl = 1.0;

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
     * Zoom level delta to apply when double clicking or double tapping. `0` disables the feature.
     */
    zoomLevelDeltaOnDoubleClick = 1.0;

    /**
     * Double click uses the OS delay through the double click event. Tapping is implemented locally
     * here in `MapControls` with this duration setting the maximum delay to define a double tap.
     * The value is in seconds. `300ms` is picked as the default value as jQuery does.
     */
    doubleTapTime = 0.3;

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
    private readonly m_initialMousePosition = new THREE.Vector2(0, 0);
    private readonly m_mouseDelta = new THREE.Vector2(0, 0);

    private m_needsRenderLastFrame: boolean = true;

    // Internal variables for animating panning (planar + spherical panning).
    private m_panIsAnimated: boolean = false;
    private readonly m_panDistanceFrameDelta: THREE.Vector3 = new THREE.Vector3();
    private m_panAnimationTime: number = 0;
    private m_panAnimationStartTime: number = 0;
    private m_lastAveragedPanDistanceOrAngle: number = 0;
    private m_currentInertialPanningSpeed: number = 0;
    private readonly m_lastPanVector: THREE.Vector3 = new THREE.Vector3();
    private readonly m_rotateGlobeQuaternion: THREE.Quaternion = new THREE.Quaternion();
    private readonly m_lastRotateGlobeAxis: THREE.Vector3 = new THREE.Vector3();
    private m_lastRotateGlobeAngle: number = 0;
    private readonly m_lastRotateGlobeFromVector: THREE.Vector3 = new THREE.Vector3();
    private m_recentPanDistancesOrAngles: [number, number, number, number, number] = [
        0,
        0,
        0,
        0,
        0
    ];

    private m_currentPanDistanceOrAngleIndex: number = 0;

    // Internal variables for animating zoom.
    private m_zoomIsAnimated: boolean = false;
    private m_zoomDeltaRequested: number = 0;
    private readonly m_zoomTargetNormalizedCoordinates: THREE.Vector2 = new THREE.Vector2();
    private m_zoomAnimationTime: number = 0;
    private m_zoomAnimationStartTime: number = 0;
    private m_startZoom: number = 0;
    private m_targetedZoom?: number;
    private m_currentZoom?: number;

    // Internal variables for animating tilt.
    private m_tiltIsAnimated: boolean = false;
    private m_tiltRequested?: number = undefined;
    private m_tiltAnimationTime: number = 0;
    private m_tiltAnimationStartTime: number = 0;
    private m_startTilt: number = 0;
    private m_targetedTilt?: number;
    private m_currentTilt?: number;

    private m_tiltState?: TiltState;
    private m_state: State = State.NONE;

    private readonly m_tmpVector2: THREE.Vector2 = new THREE.Vector2();
    private readonly m_tmpVector3: THREE.Vector3 = new THREE.Vector3();

    // Internal variables for animating double tap.
    private m_tapStartTime: number = 0;
    private m_lastSingleTapTime: number = 0;
    private m_fingerMoved: boolean = false;
    private m_isDoubleTap: boolean = false;

    // Internal variables for animating the movement resetting the north.
    private m_resetNorthStartTime: number = 0;
    private m_resetNorthIsAnimated: boolean = false;
    private m_resetNorthAnimationDuration: number = 0;
    private m_currentAzimuth: number = 0;
    private m_lastAzimuth: number = 0;
    private m_startAzimuth: number = 0;

    /**
     * Determines the maximum angle the camera can tilt to. It is defined in radians.
     */
    private m_maxTiltAngle = DEFAULT_MAX_TILT_ANGLE;

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
     * @param mapView - [[MapView]] this controller modifies.
     * @param disposeWithMapView - If `true`, an event with MapView is registered to dispose of
     * `MapControls` if MapView itself is disposed.
     */
    constructor(readonly mapView: MapView, disposeWithMapView = true) {
        super();

        this.camera = mapView.camera;
        this.domElement = mapView.renderer.domElement;
        this.maxZoomLevel = mapView.maxZoomLevel;
        this.minZoomLevel = mapView.minZoomLevel;
        this.minCameraHeight = mapView.minCameraHeight;
        this.bindInputEvents(this.domElement);
        this.handleZoom = this.handleZoom.bind(this);
        this.handlePan = this.handlePan.bind(this);
        this.tilt = this.tilt.bind(this);
        this.resetNorth = this.resetNorth.bind(this);
        this.assignZoomAfterTouchZoomRender = this.assignZoomAfterTouchZoomRender.bind(this);

        if (disposeWithMapView) {
            // Catch the disposal of `MapView`.
            mapView.addEventListener(MapViewEventNames.Dispose, () => {
                this.dispose();
            });
        }
    }

    /**
     * Destroy this `MapControls` instance.
     *
     * Unregisters all global event handlers used. This is method should be called when you stop
     * using `MapControls`.
     * @override
     */
    dispose = () => {
        // replaced with real code in bindInputEvents
    };

    /**
     * Current viewing angles yaw/pitch/roll in degrees.
     */
    get attitude(): MapViewUtils.Attitude {
        const attitude = MapViewUtils.extractAttitude(this.mapView, this.camera);
        return {
            yaw: THREE.MathUtils.radToDeg(attitude.yaw),
            pitch: THREE.MathUtils.radToDeg(attitude.pitch),
            roll: THREE.MathUtils.radToDeg(attitude.roll)
        };
    }

    /**
     * Reset the camera to looking north, in an orbiting movement around the target point instead
     * of changing the yaw (which would be the camera rotating on itself).
     */
    pointToNorth() {
        // Use pre-calculated target coordinates, otherwise we could call utility method to evaluate
        // geo-coordinates here:
        // targetGeoCoords = MapViewUtils.getTargetCoordinatesFromCamera(camera, projection)
        this.m_startAzimuth =
            Math.PI +
            MapViewUtils.extractSphericalCoordinatesFromLocation(
                this.mapView,
                this.camera,
                this.mapView.target
            ).azimuth;
        // Wrap between -PI and PI.
        this.m_startAzimuth = Math.atan2(
            Math.sin(this.m_startAzimuth),
            Math.cos(this.m_startAzimuth)
        );
        if (this.m_startAzimuth === 0) {
            return;
        }
        this.stopExistingAnimations();
        this.m_resetNorthAnimationDuration = this.northResetAnimationDuration;
        this.m_currentAzimuth = this.m_startAzimuth;
        this.m_resetNorthStartTime = performance.now();
        this.resetNorth();
    }

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param targetPositionOnScreenXinNDC - Target x position in NDC space.
     * @param targetPositionOnScreenYinNDC - Target y position in NDC space.
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
            zoomLevel,
            this.m_maxTiltAngle
        );
    }

    /**
     * Zooms to the desired location by the provided value.
     *
     * @param zoomLevel - Zoom level.
     * @param screenTarget - Zoom target on screen.
     */
    setZoomLevel(
        zoomLevel: number,
        screenTarget: { x: number; y: number } | THREE.Vector2 = { x: 0, y: 0 }
    ) {
        if (!this.enabled || !this.zoomEnabled) {
            return;
        }

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);

        // Register the zoom request
        this.m_startZoom = this.currentZoom;
        this.m_zoomDeltaRequested = zoomLevel - this.zoomLevelTargeted;

        this.stopExistingAnimations();

        // Assign the new animation start time.
        this.m_zoomAnimationStartTime = performance.now();

        this.m_zoomTargetNormalizedCoordinates.set(screenTarget.x, screenTarget.y);

        this.handleZoom();

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
    }

    /**
     * Toggles the camera tilt between 0 (looking down) and the value at `this.tiltAngle`.
     */
    toggleTilt(): void {
        if (!this.enabled || !this.tiltEnabled) {
            return;
        }

        this.stopExistingAnimations();
        this.m_startTilt = this.currentTilt;
        const aimTilt = this.m_startTilt < EPSILON;
        this.m_tiltRequested = aimTilt ? this.tiltAngle : 0;
        this.m_tiltState = aimTilt ? TiltState.Tilted : TiltState.Down;
        this.m_tiltAnimationStartTime = performance.now();
        this.tilt();
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
     * Set camera max tilt angle. The value is clamped between 0 and 89 degrees. In sphere
     * projection, at runtime, the value is also clamped so that the camera does not look above the
     * horizon.
     *
     * @param angle - Angle in degrees.
     */
    set maxTiltAngle(angle: number) {
        this.m_maxTiltAngle = Math.max(
            0,
            Math.min(DEFAULT_MAX_TILT_ANGLE, THREE.MathUtils.degToRad(angle))
        );
    }

    /**
     * Get the camera max tilt angle in degrees.
     */
    get maxTiltAngle(): number {
        return THREE.MathUtils.radToDeg(this.m_maxTiltAngle);
    }

    /**
     * Get the zoom level targeted by `MapControls`. Useful when inertia is on, to add incremented
     * values to the target instead of getting the random zoomLevel value during the interpolation.
     */
    get zoomLevelTargeted(): number {
        return this.m_targetedZoom === undefined ? this.currentZoom : this.m_targetedZoom;
    }

    /**
     * Handy getter to know if the view is in the process of looking down or not.
     */
    get tiltState(): TiltState {
        if (this.m_tiltState === undefined) {
            this.m_tiltState =
                this.currentTilt < EPSILON || this.m_tiltState === TiltState.Down
                    ? TiltState.Tilted
                    : TiltState.Down;
        }
        return this.m_tiltState;
    }

    private set currentZoom(zoom: number) {
        this.m_currentZoom = zoom;
    }

    private get currentZoom(): number {
        return this.m_currentZoom !== undefined ? this.m_currentZoom : this.mapView.zoomLevel;
    }

    private set currentTilt(tilt: number) {
        this.m_currentTilt = tilt;
    }

    private get currentTilt(): number {
        return THREE.MathUtils.degToRad(this.mapView.tilt);
    }

    private get targetedTilt(): number {
        return this.m_targetedTilt === undefined
            ? this.m_currentTilt === undefined
                ? this.currentTilt
                : this.m_currentTilt
            : this.m_targetedTilt;
    }

    private assignZoomAfterTouchZoomRender() {
        this.m_currentZoom = this.mapView.zoomLevel;
        this.m_targetedZoom = this.mapView.zoomLevel;
        this.mapView.removeEventListener(
            MapViewEventNames.AfterRender,
            this.assignZoomAfterTouchZoomRender
        );
    }

    private stopExistingAnimations() {
        this.stopResetNorth();
        this.stopZoom();
        this.stopPan();
        this.stopTilt();
    }

    private resetNorth() {
        const currentTime = performance.now();
        const animationTime = (currentTime - this.m_resetNorthStartTime) / 1000;
        if (this.inertiaEnabled) {
            if (!this.m_resetNorthIsAnimated) {
                this.m_resetNorthIsAnimated = true;
                this.mapView.addEventListener(MapViewEventNames.AfterRender, this.resetNorth);
            }
            const resetNorthFinished = animationTime > this.m_resetNorthAnimationDuration;
            if (resetNorthFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.stopResetNorth();
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }
        }
        this.m_lastAzimuth = this.m_currentAzimuth;
        this.m_currentAzimuth = this.inertiaEnabled
            ? this.easeOutCubic(
                  this.m_startAzimuth,
                  0,
                  Math.min(1, animationTime / this.m_resetNorthAnimationDuration)
              )
            : 0;

        const deltaAzimuth = this.m_currentAzimuth - this.m_lastAzimuth;

        MapViewUtils.orbitAroundScreenPoint(
            this.mapView,
            0,
            0,
            deltaAzimuth,
            0,
            this.m_maxTiltAngle
        );
        this.updateMapView();
    }

    private stopResetNorth() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.resetNorth);
        this.m_resetNorthIsAnimated = false;
    }

    private tilt() {
        if (this.m_tiltRequested !== undefined) {
            this.m_targetedTilt = Math.max(Math.min(this.m_tiltRequested, this.maxTiltAngle), 0);
            this.m_tiltRequested = undefined;
        }

        // Whether the tilt animation has reached full duration & a final frame is rendered. We need
        // this to know when to stop the tilt (and hence deregister the methon )
        let tiltAnimationFinished = false;
        if (this.inertiaEnabled) {
            if (!this.m_tiltIsAnimated) {
                this.m_tiltIsAnimated = true;
                this.mapView.addEventListener(MapViewEventNames.AfterRender, this.tilt);
            }
            const currentTime = performance.now();
            this.m_tiltAnimationTime = (currentTime - this.m_tiltAnimationStartTime) / 1000;
            const tiltFinished = this.m_tiltAnimationTime >= this.tiltToggleDuration;
            if (tiltFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_tiltAnimationTime = this.tiltToggleDuration;
                    tiltAnimationFinished = true;
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }
        }

        this.m_currentTilt = this.inertiaEnabled
            ? this.easeOutCubic(
                  this.m_startTilt,
                  this.targetedTilt,
                  Math.min(1, this.m_tiltAnimationTime / this.tiltToggleDuration)
              )
            : this.targetedTilt;

        const initialTilt = this.currentTilt;
        const deltaAngle = this.m_currentTilt - initialTilt;

        MapViewUtils.orbitAroundScreenPoint(this.mapView, 0, 0, 0, deltaAngle, this.m_maxTiltAngle);
        this.updateMapView();

        if (tiltAnimationFinished) {
            this.stopTilt();
        }
    }

    private stopTilt() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.tilt);
        this.m_tiltIsAnimated = false;
        this.m_targetedTilt = this.m_currentTilt = undefined;
    }

    private easeOutCubic(startValue: number, endValue: number, time: number): number {
        // https://easings.net/#easeOutCubic
        return startValue + (endValue - startValue) * (1 - Math.pow(1 - time, 3));
    }

    private easeOutCirc(startValue: number, endValue: number, time: number): number {
        // https://easings.net/#easeOutCirc
        const easing = Math.sqrt(1 - Math.pow(time - 1, 2));
        return startValue + (endValue - startValue) * easing;
    }

    private handleZoom() {
        let resetZoomState = false;
        if (this.m_zoomDeltaRequested !== 0) {
            this.m_targetedZoom = Math.max(
                Math.min(this.zoomLevelTargeted + this.m_zoomDeltaRequested, this.maxZoomLevel),
                this.minZoomLevel
            );
            this.m_zoomDeltaRequested = 0;
        }
        if (this.inertiaEnabled && this.zoomInertiaDampingDuration > 0) {
            if (!this.m_zoomIsAnimated) {
                this.m_zoomIsAnimated = true;
                this.mapView.addEventListener(MapViewEventNames.AfterRender, this.handleZoom);
            }
            const currentTime = performance.now();
            this.m_zoomAnimationTime = (currentTime - this.m_zoomAnimationStartTime) / 1000;
            const zoomFinished = this.m_zoomAnimationTime > this.zoomInertiaDampingDuration;
            if (zoomFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_zoomAnimationTime = this.zoomInertiaDampingDuration;

                    resetZoomState = true;
                    this.stopZoom();
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }
        }

        this.currentZoom =
            !this.inertiaEnabled || Math.abs(this.zoomLevelTargeted - this.m_startZoom) < EPSILON
                ? this.zoomLevelTargeted
                : this.easeOutCirc(
                      this.m_startZoom,
                      this.zoomLevelTargeted,
                      Math.min(1, this.m_zoomAnimationTime / this.zoomInertiaDampingDuration)
                  );

        const success = MapViewUtils.zoomOnTargetPosition(
            this.mapView,
            this.m_zoomTargetNormalizedCoordinates.x,
            this.m_zoomTargetNormalizedCoordinates.y,
            this.currentZoom,
            this.m_maxTiltAngle
        );

        if (resetZoomState || !success) {
            this.m_targetedZoom = undefined;
            this.m_currentZoom = undefined;
        }
        this.updateMapView();
    }

    private stopZoom() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.handleZoom);
        this.m_zoomIsAnimated = false;
    }

    /**
     * Method to flip crêpes.
     */
    private handlePan() {
        if (this.m_state === State.NONE && this.m_lastAveragedPanDistanceOrAngle === 0) {
            return;
        }

        if (this.inertiaEnabled && !this.m_panIsAnimated) {
            this.m_panIsAnimated = true;
            this.mapView.addEventListener(MapViewEventNames.AfterRender, this.handlePan);
        }

        const applyInertia =
            this.inertiaEnabled &&
            this.panInertiaDampingDuration > 0 &&
            this.m_state === State.NONE &&
            this.m_lastAveragedPanDistanceOrAngle > 0;

        if (applyInertia) {
            const currentTime = performance.now();
            this.m_panAnimationTime = (currentTime - this.m_panAnimationStartTime) / 1000;
            const panFinished = this.m_panAnimationTime > this.panInertiaDampingDuration;

            if (panFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_panAnimationTime = this.panInertiaDampingDuration;
                    this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.handlePan);
                    this.m_panIsAnimated = false;
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }

            const animationTime = this.m_panAnimationTime / this.panInertiaDampingDuration;
            this.m_currentInertialPanningSpeed = this.easeOutCubic(
                this.m_lastAveragedPanDistanceOrAngle,
                0,
                Math.min(1, animationTime)
            );
            if (this.m_currentInertialPanningSpeed === 0) {
                this.m_lastAveragedPanDistanceOrAngle = 0;
            }
            if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
                this.m_panDistanceFrameDelta
                    .copy(this.m_lastPanVector)
                    .setLength(this.m_currentInertialPanningSpeed);
            } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
                this.m_rotateGlobeQuaternion
                    .setFromAxisAngle(
                        this.m_lastRotateGlobeAxis,
                        this.m_currentInertialPanningSpeed
                    )
                    .normalize();
            }
        } else {
            let panDistanceOrAngle: number = 0;
            if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
                panDistanceOrAngle = this.m_lastPanVector
                    .copy(this.m_panDistanceFrameDelta)
                    .length();
            } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
                panDistanceOrAngle = this.m_lastRotateGlobeAngle;
                this.m_rotateGlobeQuaternion.setFromAxisAngle(
                    this.m_lastRotateGlobeAxis,
                    this.m_lastRotateGlobeAngle
                );
                this.m_rotateGlobeQuaternion.normalize();
            }
            this.m_currentPanDistanceOrAngleIndex =
                (this.m_currentPanDistanceOrAngleIndex + 1) % USER_INPUTS_TO_CONSIDER;
            this.m_recentPanDistancesOrAngles[
                this.m_currentPanDistanceOrAngleIndex
            ] = panDistanceOrAngle;
            this.m_lastAveragedPanDistanceOrAngle =
                this.m_recentPanDistancesOrAngles.reduce((a, b) => a + b) / USER_INPUTS_TO_CONSIDER;
        }

        if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
            MapViewUtils.panCameraAboveFlatMap(
                this.mapView,
                this.m_panDistanceFrameDelta.x,
                this.m_panDistanceFrameDelta.y
            );
        } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            MapViewUtils.panCameraAroundGlobe(
                this.mapView,
                this.m_lastRotateGlobeFromVector,
                this.m_tmpVector3
                    .copy(this.m_lastRotateGlobeFromVector)
                    .applyQuaternion(this.m_rotateGlobeQuaternion)
            );
        }
        if (!applyInertia) {
            this.m_panDistanceFrameDelta.set(0, 0, 0);
            this.m_lastRotateGlobeAngle = 0;
        }

        this.updateMapView();
    }

    private stopPan() {
        this.m_panDistanceFrameDelta.set(0, 0, 0);
        this.m_lastAveragedPanDistanceOrAngle = 0;
    }

    private bindInputEvents(domElement: HTMLCanvasElement) {
        const onContextMenu = this.contextMenu.bind(this);
        const onMouseDown = this.mouseDown.bind(this);
        const onMouseWheel = this.mouseWheel.bind(this);
        const onTouchStart = this.touchStart.bind(this);
        const onTouchEnd = this.touchEnd.bind(this);
        const onTouchMove = this.touchMove.bind(this);
        const onMouseDoubleClick = this.mouseDoubleClick.bind(this);

        domElement.addEventListener("dblclick", onMouseDoubleClick, false);
        domElement.addEventListener("contextmenu", onContextMenu, false);
        domElement.addEventListener("mousedown", onMouseDown, false);
        domElement.addEventListener("wheel", onMouseWheel, false);
        domElement.addEventListener("touchstart", onTouchStart, false);
        domElement.addEventListener("touchend", onTouchEnd, false);
        domElement.addEventListener("touchmove", onTouchMove, false);

        this.dispose = () => {
            domElement.removeEventListener("dblclick", onMouseDoubleClick, false);
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

    private mouseDoubleClick(event: MouseEvent) {
        if (!this.enabled || !this.zoomEnabled) {
            return;
        }
        const mousePos = this.getPointerPosition(event);
        this.zoomOnDoubleClickOrTap(mousePos.x, mousePos.y);
    }

    private mouseDown(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        if (event.shiftKey) {
            return;
        }

        event.stopPropagation();

        if (this.m_state !== State.NONE) {
            return;
        }

        // Support mac users who press ctrl key when wanting to right click
        if (event.button === 0 && !event.ctrlKey && this.panEnabled) {
            this.m_state = State.PAN;
        } else if (event.button === 1) {
            this.m_state = State.ROTATE;
        } else if ((event.button === 2 || event.ctrlKey) && this.tiltEnabled) {
            this.m_state = State.ORBIT;
        } else {
            return;
        }

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);

        const mousePos = this.getPointerPosition(event);
        this.m_lastMousePosition.copy(mousePos);
        if (event.altKey === true) {
            const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
            this.m_initialMousePosition.copy(
                utils.calculateNormalizedDeviceCoordinates(mousePos.x, mousePos.y, width, height)
            );
        } else {
            this.m_initialMousePosition.set(0, 0);
        }

        const onMouseMove = this.mouseMove.bind(this);
        const onMouseUp = this.mouseUp.bind(this);

        window.addEventListener("mousemove", onMouseMove, false);
        window.addEventListener("mouseup", onMouseUp, false);

        this.m_cleanupMouseEventListeners = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }

    private mouseMove(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        const mousePos = this.getPointerPosition(event);
        this.m_mouseDelta.set(
            mousePos.x - this.m_lastMousePosition.x,
            mousePos.y - this.m_lastMousePosition.y
        );

        if (this.m_state === State.PAN) {
            const vectors = this.getWorldPositionWithElevation(
                this.m_lastMousePosition.x,
                this.m_lastMousePosition.y,
                mousePos.x,
                mousePos.y
            );
            if (vectors === undefined) {
                return;
            }
            const { fromWorld, toWorld } = vectors;
            this.panFromTo(fromWorld, toWorld);
        } else if (this.m_state === State.ROTATE) {
            this.stopExistingAnimations();
            MapViewUtils.rotate(
                this.mapView,
                -this.rotationMouseDeltaFactor * this.m_mouseDelta.x,
                this.rotationMouseDeltaFactor * this.m_mouseDelta.y,
                this.m_maxTiltAngle
            );
        } else if (this.m_state === State.ORBIT) {
            this.stopExistingAnimations();

            MapViewUtils.orbitAroundScreenPoint(
                this.mapView,
                this.m_initialMousePosition.x,
                this.m_initialMousePosition.y,
                this.orbitingMouseDeltaFactor * this.m_mouseDelta.x,
                -this.orbitingMouseDeltaFactor * this.m_mouseDelta.y,
                this.m_maxTiltAngle
            );
        }

        this.m_lastMousePosition.set(mousePos.x, mousePos.y);
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
        if (!this.enabled || !this.zoomEnabled) {
            return;
        }

        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
        const screenTarget = utils.calculateNormalizedDeviceCoordinates(
            event.offsetX,
            event.offsetY,
            width,
            height
        );

        this.setZoomLevel(
            this.mapView.zoomLevel - this.zoomLevelDeltaOnMouseWheel * Math.sign(event.deltaY),
            screenTarget
        );

        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Calculates the angle of the vector, which is formed by two touch points in world space
     * against the X axis in world space on the map. The resulting angle is in radians and between
     * `-PI` and `PI`.
     */
    private updateCurrentRotation() {
        if (
            this.m_touchState.touches.length < 2 ||
            this.m_touchState.touches[1].currentWorldPosition.length() === 0 ||
            this.m_touchState.touches[0].currentWorldPosition.length() === 0
        ) {
            return;
        }
        let x = 0;
        let y = 0;
        if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
            // Planar uses world space coordinates to return the angle of the vector between the two
            // fingers' locations from the north direction.
            x =
                this.m_touchState.touches[1].currentWorldPosition.x -
                this.m_touchState.touches[0].currentWorldPosition.x;
            y =
                this.m_touchState.touches[1].currentWorldPosition.y -
                this.m_touchState.touches[0].currentWorldPosition.y;
        } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            // Globe uses screen space coordinates, as the 3d coordinate system cannot define a
            // reference rotation scalar for the vector between the two fingers' locations.
            x =
                this.m_touchState.touches[1].currentTouchPoint.x -
                this.m_touchState.touches[0].currentTouchPoint.x;
            // Below the subtraction is inverted, because the Y coordinate in screen space in HTML
            // has its origin at the top and increases downwards.
            y =
                this.m_touchState.touches[0].currentTouchPoint.y -
                this.m_touchState.touches[1].currentTouchPoint.y;
            this.m_touchState.initialRotation = this.m_touchState.currentRotation;
        }
        this.m_touchState.currentRotation = Math.atan2(y, x);
    }

    /**
     * Calculates the difference of the current distance of two touch points against their initial
     * distance in world space.
     */
    private calculatePinchDistanceInWorldSpace(): number {
        if (this.m_touchState.touches.length < 2) {
            return 0;
        }
        const previousDistance = this.m_tmpVector3
            .subVectors(
                this.m_touchState.touches[0].initialWorldPosition,
                this.m_touchState.touches[1].initialWorldPosition
            )
            .length();

        const currentDistance = this.m_tmpVector3
            .subVectors(
                this.m_touchState.touches[0].currentWorldPosition,
                this.m_touchState.touches[1].currentWorldPosition
            )
            .length();
        return currentDistance - previousDistance;
    }

    private convertTouchPoint(touch: Touch, oldTouchState?: TouchState): TouchState | undefined {
        // Acquire touch coordinates relative to canvas, this coordinates
        // are then used to calculate NDC values.
        const newTouchPoint = this.getPointerPosition(touch);

        if (oldTouchState !== undefined) {
            const oldTouchPoint = oldTouchState.currentTouchPoint;
            const vectors = this.getWorldPositionWithElevation(
                oldTouchPoint.x,
                oldTouchPoint.y,
                newTouchPoint.x,
                newTouchPoint.y
            );
            const toWorld = vectors === undefined ? new THREE.Vector3() : vectors.toWorld;
            // Unless the user is tilting, considering a finger losing the surface as a touchEnd
            // event. Inertia will get triggered.
            if (
                toWorld.length() === 0 &&
                !(this.m_touchState.touches.length === 3 && this.tiltEnabled)
            ) {
                this.setTouchState([] as any);
                this.m_state = State.NONE;
                this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
                return;
            }
            if (this.m_state !== State.TOUCH) {
                this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);
            }
            this.m_state = State.TOUCH;
            return {
                currentTouchPoint: newTouchPoint,
                lastTouchPoint: newTouchPoint,
                currentWorldPosition: toWorld,
                initialWorldPosition: toWorld
            };
        } else {
            const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
            const to = utils.calculateNormalizedDeviceCoordinates(
                newTouchPoint.x,
                newTouchPoint.y,
                width,
                height
            );
            const result = MapViewUtils.rayCastWorldCoordinates(this.mapView, to.x, to.y);
            const toWorld = result === null ? new THREE.Vector3() : result;
            // Unless the user is tilting, considering a finger losing the surface as a touchEnd
            // event. Inertia will get triggered.
            if (
                toWorld.length() === 0 &&
                !(this.m_touchState.touches.length === 3 && this.tiltEnabled)
            ) {
                this.setTouchState([] as any);
                this.m_state = State.NONE;
                this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
                return;
            }
            if (this.m_state !== State.TOUCH) {
                this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);
            }
            this.m_state = State.TOUCH;
            return {
                currentTouchPoint: newTouchPoint,
                lastTouchPoint: newTouchPoint,
                currentWorldPosition: toWorld,
                initialWorldPosition: toWorld
            };
        }
    }

    private setTouchState(touches: TouchList) {
        this.m_touchState.touches = [];

        // TouchList doesn't conform to iterator interface so we cannot use 'for of'
        for (let i = 0; i < touches.length; ++i) {
            const touchState = this.convertTouchPoint(touches[i]);
            if (touchState !== undefined) {
                this.m_touchState.touches.push(touchState);
            }
        }

        if (this.m_touchState.touches.length !== 0) {
            this.updateCurrentRotation();
            this.m_touchState.initialRotation = this.m_touchState.currentRotation;
        }
    }

    private updateTouches(touches: TouchList) {
        const length = Math.min(touches.length, this.m_touchState.touches.length);
        for (let i = 0; i < length; ++i) {
            const oldTouchState = this.m_touchState.touches[i];
            const newTouchState = this.convertTouchPoint(touches[i], oldTouchState);
            if (newTouchState !== undefined && oldTouchState !== undefined) {
                newTouchState.initialWorldPosition = oldTouchState.initialWorldPosition;
                newTouchState.lastTouchPoint = oldTouchState.currentTouchPoint;
                this.m_touchState.touches[i] = newTouchState;
            }
        }
    }

    private zoomOnDoubleClickOrTap(x: number, y: number) {
        if (this.zoomLevelDeltaOnDoubleClick === 0) {
            return;
        }
        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
        const ndcCoords = utils.calculateNormalizedDeviceCoordinates(x, y, width, height);
        this.setZoomLevel(this.currentZoom + this.zoomLevelDeltaOnDoubleClick, ndcCoords);
    }

    private touchStart(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }

        this.m_tapStartTime = performance.now();
        this.m_fingerMoved = false;

        this.m_state = State.TOUCH;

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);
        this.setTouchState(event.touches);
        this.updateTouches(event.touches);

        event.preventDefault();
        event.stopPropagation();
    }

    private touchMove(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }

        this.m_fingerMoved = true;
        this.updateTouches(event.touches);

        if (
            this.panEnabled &&
            this.m_touchState.touches.length <= 2 &&
            this.m_touchState.touches[0] !== undefined
        ) {
            this.panFromTo(
                this.m_touchState.touches[0].initialWorldPosition,
                this.m_touchState.touches[0].currentWorldPosition
            );
        }

        if (this.m_touchState.touches.length === 2) {
            const touches = this.m_touchState.touches;
            const center = new THREE.Vector2();

            if (this.zoomEnabled === true || this.rotateEnabled === true) {
                const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
                touches.forEach(touch => {
                    const ndcPoint = utils.calculateNormalizedDeviceCoordinates(
                        touch.currentTouchPoint.x,
                        touch.currentTouchPoint.y,
                        width,
                        height
                    );
                    center.add(ndcPoint);
                });
                center.divideScalar(touches.length);
            }
            if (this.zoomEnabled) {
                const pinchDistance = this.calculatePinchDistanceInWorldSpace();
                if (Math.abs(pinchDistance) < EPSILON) {
                    return;
                }
                const newZL = MapViewUtils.calculateZoomLevelFromDistance(
                    this.mapView,
                    this.mapView.targetDistance - pinchDistance
                );

                MapViewUtils.zoomOnTargetPosition(
                    this.mapView,
                    center.x,
                    center.y,
                    newZL,
                    this.m_maxTiltAngle
                );
            }

            if (this.rotateEnabled) {
                this.updateCurrentRotation();
                const deltaRotation =
                    this.m_touchState.currentRotation - this.m_touchState.initialRotation;
                this.stopExistingAnimations();

                MapViewUtils.orbitAroundScreenPoint(
                    this.mapView,
                    center.x,
                    center.y,
                    deltaRotation,
                    0,
                    this.m_maxTiltAngle
                );
            }
        }

        // Tilting
        if (this.m_touchState.touches.length === 3 && this.tiltEnabled) {
            const firstTouch = this.m_touchState.touches[0];
            const diff = this.m_tmpVector2.subVectors(
                firstTouch.currentTouchPoint,
                firstTouch.lastTouchPoint
            );
            this.stopExistingAnimations();
            MapViewUtils.orbitAroundScreenPoint(
                this.mapView,
                0,
                0,
                this.orbitingTouchDeltaFactor * diff.x,
                -this.orbitingTouchDeltaFactor * diff.y,
                this.m_maxTiltAngle
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

        this.handleDoubleTap();

        this.setTouchState(event.touches);

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
        this.updateMapView();

        event.preventDefault();
        event.stopPropagation();
    }

    private handleDoubleTap() {
        // Continue only if no touchmove happened and zoom's enabled.
        if (this.m_fingerMoved || !this.zoomEnabled) {
            return;
        }

        const now = performance.now();
        const tapDuration = now - this.m_tapStartTime;

        // Continue only if proper tap.
        if (tapDuration > MAX_TAP_DURATION) {
            return;
        }

        // Continue only if this is the second valid tap.
        if (!this.m_isDoubleTap) {
            this.m_isDoubleTap = true;
            this.m_lastSingleTapTime = now;
            return;
        }

        // Continue only if the delay between the two taps is short enough.
        if (now - this.m_lastSingleTapTime > this.doubleTapTime * 1000) {
            // If too long, restart double tap validator too.
            this.m_isDoubleTap = false;
            return;
        }

        this.zoomOnDoubleClickOrTap(
            this.m_touchState.touches[0].currentTouchPoint.x,
            this.m_touchState.touches[0].currentTouchPoint.y
        );

        // Prevent a string of X valid taps and only consider pairs.
        this.m_isDoubleTap = false;
    }

    private contextMenu(event: Event) {
        event.preventDefault();
    }

    private getWorldPositionWithElevation(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
    ): { fromWorld: THREE.Vector3; toWorld: THREE.Vector3 } | undefined {
        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);

        const from = utils.calculateNormalizedDeviceCoordinates(fromX, fromY, width, height);
        const to = utils.calculateNormalizedDeviceCoordinates(toX, toY, width, height);

        let toWorld: THREE.Vector3 | null;
        let fromWorld: THREE.Vector3 | null;

        let elevationProviderResult: THREE.Vector3 | undefined;

        if (this.mapView.elevationProvider !== undefined) {
            elevationProviderResult = this.mapView.elevationProvider.rayCast(fromX, fromY);
        }

        if (elevationProviderResult === undefined) {
            fromWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, from.x, from.y);
            toWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, to.x, to.y);
        } else {
            fromWorld = elevationProviderResult;
            const fromGeoAltitude = this.mapView.projection.unprojectAltitude(fromWorld);

            // We can ensure that points under the mouse stay there by projecting the to point onto
            // a plane with the altitude based on the initial point.
            toWorld = MapViewUtils.rayCastWorldCoordinates(
                this.mapView,
                to.x,
                to.y,
                fromGeoAltitude
            );
        }
        if (fromWorld === null || toWorld === null) {
            return;
        }
        return { fromWorld, toWorld };
    }

    private panFromTo(fromWorld: THREE.Vector3, toWorld: THREE.Vector3): void {
        this.stopExistingAnimations();

        // Assign the new animation start time.
        this.m_panAnimationStartTime = performance.now();

        if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
            this.m_panDistanceFrameDelta.subVectors(fromWorld, toWorld);
        } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            this.m_lastRotateGlobeFromVector.copy(fromWorld);
            this.m_lastRotateGlobeAxis.crossVectors(fromWorld, toWorld).normalize();
            this.m_lastRotateGlobeAngle = fromWorld.angleTo(toWorld);
            // When fromWorld and toWorld are too close, there is a risk of getting an NaN
            // value. The following ensures that the controls don't break.
            if (isNaN(this.m_lastRotateGlobeAngle)) {
                this.m_lastRotateGlobeAngle = 0;
            }
        }

        this.handlePan();
    }

    /**
     * Acquire mouse or touch pointer position relative to canvas for `MouseEvent` or `Touch` event.
     *
     * Function takes into account canvas position in client space (including scrolling) as also
     * canvas scaling factor.
     *
     * @param event - The mouse event.
     * @returns [[THREE.Vector2]] containing _x_, _y_ mouse pointer position.
     */
    private getPointerPosition(event: MouseEvent | Touch): THREE.Vector2 {
        const canvasSize = utils.getWidthAndHeightFromCanvas(this.domElement);
        // Absolute size of a canvas
        const rect = this.domElement.getBoundingClientRect();
        // TODO: Test if scaling is needed and works on HiDPI devices.
        const scaleX = Math.round(rect.width) / canvasSize.width;
        const scaleY = Math.round(rect.height) / canvasSize.height;

        // Scale mouse coordinates after they have, been adjusted to be relative to element.
        return new THREE.Vector2(
            (event.clientX - Math.floor(rect.left)) * scaleX,
            (event.clientY - Math.floor(rect.top)) * scaleY
        );
    }
}
