/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapView } from "@here/harp-mapview";

import * as THREE from "three";

export class GlobeControls {
    private readonly m_mouseDownListener = this.mouseDown.bind(this);
    private readonly m_mouseWheelListener = this.mouseWheel.bind(this);
    private readonly m_mouseUpListener = this.mouseUp.bind(this);
    private readonly m_mouseMoveListener = this.mouseMove.bind(this);
    private readonly m_cameraMatrix = new THREE.Matrix4();
    private readonly m_transform = new THREE.Matrix4();
    private readonly m_quaternion = new THREE.Quaternion();

    private m_enabled = false;

    constructor(readonly mapView: MapView) {
        this.enabled = true;
    }

    get camera() {
        return this.mapView.camera;
    }

    get domElement() {
        return this.mapView.canvas;
    }

    get projection() {
        return this.mapView.projection;
    }

    get enabled() {
        return this.m_enabled;
    }

    set enabled(enabled: boolean) {
        if (this.m_enabled === enabled) {
            return;
        }

        this.m_enabled = enabled;

        if (enabled) {
            this.domElement.addEventListener("mousedown", this.m_mouseDownListener, false);
            this.domElement.addEventListener("wheel", this.m_mouseWheelListener, false);
        } else {
            this.domElement.removeEventListener("mousedown", this.m_mouseDownListener, false);
            this.domElement.removeEventListener("wheel", this.m_mouseWheelListener, false);
        }
    }

    private updateCameraMatrix() {
        this.camera.updateMatrixWorld(true);

        this.m_cameraMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
    }

    private mouseDown(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.domElement.addEventListener("mouseup", this.m_mouseUpListener, false);
        this.domElement.addEventListener("mousemove", this.m_mouseMoveListener, false);
        this.mapView.beginAnimation();
        this.updateCameraMatrix();
    }

    private mouseUp(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.domElement.removeEventListener("mouseup", this.m_mouseUpListener, false);
        this.domElement.removeEventListener("mousemove", this.m_mouseMoveListener, false);
        this.mapView.endAnimation();
    }

    private mouseMove(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        const current = this.mapView.getWorldPositionAt(event.clientX, event.clientY);
        const previous = this.mapView.getWorldPositionAt(
            event.clientX - event.movementX / window.devicePixelRatio,
            event.clientY - event.movementY / window.devicePixelRatio
        );
        if (current && previous) {
            this.m_quaternion.setFromUnitVectors(previous.normalize(), current.normalize());
            this.m_transform.copyPosition(this.camera.matrix);
            this.m_quaternion.inverse();
            this.m_transform.makeRotationFromQuaternion(this.m_quaternion);
            this.camera.applyMatrix(this.m_transform);
            this.updateCameraMatrix();
        }
    }

    private mouseWheel(event: WheelEvent) {
        event.preventDefault();
        event.stopPropagation();

        const L = this.projection.groundDistance(this.camera.position);

        const surfaceNormal = this.projection.surfaceNormal(
            this.camera.position,
            new THREE.Vector3()
        );

        this.camera.position.addScaledVector(surfaceNormal, event.deltaY * L * 0.001);

        if (this.projection.groundDistance(this.camera.position) < 500) {
            this.projection.scalePointToSurface(this.camera.position);
            this.camera.position.addScaledVector(surfaceNormal, 500);
        }

        this.updateCameraMatrix();
        this.mapView.update();
    }
}
