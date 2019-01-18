/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3 } from "three";

import { MapView } from "./MapView";
import { MapViewUtils } from "./Utils";

/**
 * The default value for camera movement throttling, in milliseconds.
 */
const DEFAULT_THROTTLING_TIMEOUT = 300;

/**
 * The `CameraMovementDetector` class checks for changes in camera position and orientation, to
 * detect continuous movements without the animation mode activated in [[MapView]]. If the
 * interaction is not continuous enough, you can use a throttling timer to reduce the number of
 * callbacks.
 */
export class CameraMovementDetector {
    private m_lastYawPitchRoll?: MapViewUtils.YawPitchRoll;
    private m_lastCameraPos = new Vector3();
    private m_newCameraPos = new Vector3();
    private m_lastWorldCenter = new Vector3();
    private m_cameraMovedLastFrame: boolean | undefined;
    private m_throttlingTimerId?: number = undefined;

    /**
     * Initializes the detector with timeout value and callbacks. [[MapView]] also provides
     * events for client code to be notified when these cues occur.
     *
     * @param m_throttlingTimeout The delay, in milliseconds, between the last user interaction
     * detected and the call to `m_movementFinishedFunc`; the default is `300`.
     * @param m_movementStartedFunc Callback function, called when the user starts interacting.
     * @param m_movementFinishedFunc Callback function, called when the user stops interacting.
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
     * Checks if the camera has moved since the last time it was checked. The
     * `m_movementStartedFunc` is called when a movement starts. If no movement
     * is detected, a timer for `m_movementFinishedFunc` starts.
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
     * Reset the saved camera position. Next time checkCameraMoved is called, it will return
     * `false`.
     */
    clear(mapView: MapView) {
        const newCameraPos = mapView.camera.getWorldPosition(this.m_newCameraPos);
        this.m_lastCameraPos.set(newCameraPos.x, newCameraPos.y, newCameraPos.z);
    }

    /**
     * Force change of camera position. Next time checkCameraMoved is called, it will return `true`.
     */
    forceMoved() {
        this.m_lastCameraPos.set(Number.NaN, Number.NaN, Number.NaN);
    }

    /**
     * Returns `true` if the camera of this [[MapView]] is currently moving. In this case the
     * `m_movementFinishedFunc` is waiting to be called after the throttling timer runs out.
     */
    get cameraIsMoving() {
        return this.m_throttlingTimerId !== undefined;
    }

    /**
     * Disposes resources and kills the throttling timer.
     */
    dispose() {
        this.removeMovementFinishedTimer();
        this.m_movementStartedFunc = undefined;
        this.m_movementFinishedFunc = undefined;
    }

    /**
     * Returns `true` if the camera has moved in the last frame.
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
