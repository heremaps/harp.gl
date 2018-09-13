/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { Vector3 } from "three";

import { MapView } from "./MapView";
import { MapViewUtils } from "./Utils";

/**
 * Default value to be used for camera movement throttling. In milliseconds.
 */
const DEFAULT_THROTTLING_TIMEOUT = 300;

/**
 * The class `CameraMovementDetector` checks for changes in camera position and orientation, to
 * detect continuous movements without activated animation mode in [[MapView]]. A throttling
 * timer allows the reduction of callbacks in case the interaction is not continuous enough.
 */
export class CameraMovementDetector {
    private m_lastYawPitchRoll?: MapViewUtils.YawPitchRoll;
    private m_lastCameraPos = new Vector3();
    private m_newCameraPos = new Vector3();
    private m_lastWorldCenter = new Vector3();
    private m_cameraMovedLastFrame: boolean | undefined;
    private m_throttlingTimerId?: number = undefined;

    /**
     * Initialize the detector with timeout value and callbacks. [[MapView]] is also providing
     * events for client code to get notified of when these cues occur.
     *
     * @param m_throttlingTimeout Delay (in ms) between the last detected interaction from the user
     * and the call to `m_movementFinishedFunc`. Defaults to `300`.
     * @param m_movementStartedFunc Callback function called when the user starts interacting.
     * @param m_movementFinishedFunc Callback function called when the user stops interacting.
     */
    constructor(
        private m_throttlingTimeout: number | undefined,
        private m_movementStartedFunc: (() => void) | undefined,
        private m_movementFinishedFunc: (() => void) | undefined
    ) {
        if (this.m_throttlingTimeout === undefined) {
            this.m_throttlingTimeout = DEFAULT_THROTTLING_TIMEOUT;
        }
    }

    /**
     * Check if the camera has been moved since the last time it was checked. The
     * `m_movementStartedFunc` is called if a movement is started, and a timer for
     * `m_movementFinishedFunc` is started if no movement has been detected.
     *
     * @param mapView [[Mapview]]'s position and camera are checked for modifications.
     */
    checkCameraMoved(mapView: MapView): boolean {
        const newYawPitchRoll = MapViewUtils.extractYawPitchRoll(mapView.camera.quaternion);
        const newCameraPos = mapView.camera.getWorldPosition(this.m_newCameraPos);

        const cameraMoved =
            this.m_lastYawPitchRoll === undefined ||
            !this.m_lastCameraPos.equals(newCameraPos) ||
            !this.m_lastWorldCenter.equals(mapView.worldCenter) ||
            newYawPitchRoll.yaw !== this.m_lastYawPitchRoll.yaw ||
            newYawPitchRoll.pitch !== this.m_lastYawPitchRoll.pitch ||
            newYawPitchRoll.roll !== this.m_lastYawPitchRoll.roll;

        if (cameraMoved) {
            this.m_lastCameraPos.copy(newCameraPos);
            this.m_lastWorldCenter.copy(mapView.worldCenter);
            this.m_lastYawPitchRoll = newYawPitchRoll;
        }

        if (cameraMoved !== this.m_cameraMovedLastFrame) {
            if (cameraMoved) {
                this.movementStarted();
            }
            this.m_cameraMovedLastFrame = cameraMoved;
        }
        if (cameraMoved) {
            // Start timer
            this.startMovementFinishedTimer();
        }

        return this.m_cameraMovedLastFrame;
    }

    /**
     * Returns `true` if the camera of this [[MapView]] is currently moving, in which case the
     * `m_movementFinishedFunc` is waiting to be called after the throttling timer runs out..
     */
    get cameraIsMoving() {
        return this.m_throttlingTimerId !== undefined;
    }

    /**
     * Dispose resources and kill the throttling timer.
     */
    dispose() {
        this.removeMovementFinishedTimer();
        this.m_movementStartedFunc = undefined;
        this.m_movementFinishedFunc = undefined;
    }

    /**
     * Returns `true` if the camera moved in the last frame.
     */
    get cameraMovedLastFrame(): boolean {
        return this.m_cameraMovedLastFrame === true;
    }

    private movementStarted() {
        if (this.m_movementStartedFunc !== undefined) {
            this.m_movementStartedFunc();
        }
    }

    private movementFinished() {
        this.removeMovementFinishedTimer();
        if (this.m_movementFinishedFunc !== undefined) {
            this.m_movementFinishedFunc();
        }
    }

    private startMovementFinishedTimer() {
        this.removeMovementFinishedTimer();

        this.m_throttlingTimerId = setTimeout(
            () => this.movementFinished(),
            this.m_throttlingTimeout
        ) as any;
    }

    private removeMovementFinishedTimer() {
        if (this.m_throttlingTimerId !== undefined) {
            clearTimeout(this.m_throttlingTimerId);
            this.m_throttlingTimerId = undefined;
        }
    }
}
