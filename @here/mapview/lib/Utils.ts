/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import * as geoUtils from "@here/geoutils";
import { EarthConstants } from "@here/geoutils/lib/projection/EarthConstants";
import { Matrix4, Plane, Quaternion, Raycaster, Vector3 } from "three";
import { MapView } from "./MapView";

export namespace MapViewUtils {
    //Caching those for performance reasons.
    const groundPlane = new Plane(new Vector3(0, 0, 1));
    const cameraZPosition = new Vector3(0, 0, 0);
    const rotationMatrix = new Matrix4();
    const unprojectionMatrix = new Matrix4();
    const rayCaster = new Raycaster();

    /**
     * Yaw rotation as quaternion. Declared as a const to avoid object re-creation in certain
     * functions.
     */
    const yawQuaternion = new Quaternion();

    /**
     * Pitch rotation as quaternion. Declared as a const to avoid object re-creation in certain
     *  functions.
     */
    const pitchQuaternion = new Quaternion();

    /**
     * The yaw axis around we rotate when we change the yaw.
     * This axis is fix and is the -Z axis `(0,0,1)`.
     */
    const yawAxis = new Vector3(0, 0, 1);

    /**
     * The pitch axis which we use to rotate around when we change the pitch.
     * The axis is fix and is the +X axis `(1,0,0)`.
     */
    const pitchAxis = new Vector3(1, 0, 0);

    /**
     * Missing Typedoc
     */
    export interface YawPitchRoll {
        /**
         * Missing Typedoc
         */
        yaw: number;

        /**
         * Missing Typedoc
         */
        pitch: number;

        /**
         * Missing Typedoc
         */
        roll: number;
    }

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param mapView Instance of MapView
     * @param targetPositionOnScreenXinNDC Target x position in NDC space.
     * @param targetPositionOnScreenYinNDC Target y position in NDC space.
     */
    export function zoomOnTargetPosition(
        mapView: MapView,
        targetPositionOnScreenXinNDC: number,
        targetPositionOnScreenYinNDC: number,
        zoomLevel: number
    ): void {
        //Get current target position in world space before we zoom.
        const targetPosition = rayCastWorldCoordinates(
            mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC
        );

        //Set the cameras height according to the given zoom level.
        mapView.camera.position.setZ(calculateDistanceToGroundFromZoomLevel(mapView, zoomLevel));
        mapView.camera.matrixWorldNeedsUpdate = true;

        //Get new target position after the zoom
        const newTargetPosition = rayCastWorldCoordinates(
            mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC
        );

        if (!targetPosition || !newTargetPosition) {
            return;
        }

        //Calculate the difference and pan the map to maintain
        //the map relative to the target position.
        const diff = targetPosition.sub(newTargetPosition);
        pan(mapView, diff.x, diff.y);
    }

    /**
     * Raycasts a point in NDC space from the current map view
     * and returns the intersection point of that
     * ray against the map in world space or `null` in case the raycast failed.
     *
     * @param mapView Instance of MapView.
     * @param pointOnScreenXinNDC X coordinate in NDC space.
     * @param pointOnScreenYinNDC Y coordinate in NDC space.
     * @returns Intersection coordinates, or `null` if raycast failed.
     */
    export function rayCastWorldCoordinates(
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number
    ): Vector3 | null {
        const pointInNDCPosition = new Vector3(pointOnScreenXinNDC, pointOnScreenYinNDC, 0.5);
        const worldPosition = mapView.worldCenter;

        cameraZPosition.copy(mapView.camera.position);

        rotationMatrix.extractRotation(mapView.camera.matrixWorld);

        //Prepare the unprojection matrix which projects from NDC space to camera space
        //and takes the current rotation of the camera into account.
        unprojectionMatrix.multiplyMatrices(
            rotationMatrix,
            unprojectionMatrix.getInverse(mapView.camera.projectionMatrix)
        );
        //Unproject the point via the the unprojection matrix.
        const pointInCameraSpace = pointInNDCPosition.applyMatrix4(unprojectionMatrix);
        //Use the point in camera space as the vector towards this point.
        rayCaster.set(cameraZPosition, pointInCameraSpace.normalize());

        const vec3 = new Vector3();
        const rayGroundPlaneIntersectionPosition = rayCaster.ray.intersectPlane(groundPlane, vec3);

        if (!rayGroundPlaneIntersectionPosition) {
            return null;
        }
        //Because our camera does not really move, besides going up and down,
        //the intersection point is relative to the camera.
        //To get them in into world space, we add the cameras world space position.
        rayGroundPlaneIntersectionPosition.setX(
            rayGroundPlaneIntersectionPosition.x + worldPosition.x
        );
        rayGroundPlaneIntersectionPosition.setY(
            rayGroundPlaneIntersectionPosition.y + worldPosition.y
        );
        return rayGroundPlaneIntersectionPosition;
    }

    /**
     * Calculates and returns the distance from the ground,
     * which is needed to put the camera to this
     * height, to see the size of the area, which would be covered
     * by one tile for the given zoom level.
     *
     * @param mapView Instance of MapView.
     * @param zoomLevel
     */
    export function calculateDistanceToGroundFromZoomLevel(
        mapView: MapView,
        zoomLevel: number
    ): number {
        //TODO: Power to the base of 2 is hardcoded and should be dependent on the tiling schema.
        const amountOfTilesOnZoomLevel = Math.pow(2, zoomLevel);
        const tileSize = EarthConstants.EQUATORIAL_CIRCUMFERENCE / amountOfTilesOnZoomLevel;
        const visibleGroundUnit =
            2.0 * Math.tan(geoUtils.MathUtils.degToRad(mapView.camera.fov) * 0.5);

        return tileSize / (visibleGroundUnit * mapView.zoomLevelBias);
    }

    /**
     * Pans the map underneath camera according to the given offset in world space coordinates.
     *
     * @param mapView Instance of MapView.
     * @param xOffset In world space. Value > 0 will pan the map to the right, value < 0 will pan
     * the map to the left in default camera orientation.
     * @param yOffset In world space. Value > 0 will pan the map upwards, value < 0 will pan the map
     * downwards in default camera orientation.
     */
    export function pan(mapView: MapView, offsetX: number, offsetY: number): void {
        const currentWorldPosition = mapView.worldCenter;
        currentWorldPosition.setX(currentWorldPosition.x + offsetX);
        currentWorldPosition.setY(currentWorldPosition.y + offsetY);
        mapView.update();
    }

    /**
     * Sets the rotation of the camera according to yaw and pitch in degrees.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param mapView Instance of MapView.
     * @param yaw Yaw in degrees.
     * @param pitch Pitch in degrees.
     */
    export function setRotation(mapView: MapView, yaw: number, pitch: number) {
        yawQuaternion.setFromAxisAngle(yawAxis, geoUtils.MathUtils.degToRad(yaw));
        pitchQuaternion.setFromAxisAngle(pitchAxis, geoUtils.MathUtils.degToRad(pitch));

        yawQuaternion.multiply(pitchQuaternion);
        mapView.camera.quaternion.copy(yawQuaternion);
        mapView.camera.matrixWorldNeedsUpdate = true;
    }

    /**
     * Extracts yaw, pitch, and roll rotation in radians.
     * - Yaw : Rotation around the Z axis `(0,0,1)`.
     * - Pitch :Rotation around the X axis `(1,0,0)`.
     * - Roll : Rotation around the Y axis `(0,1,0)`.
     *
     * @see https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
     *
     * @param q : Quaternion that represents the given rotation
     * from which to extract the yaw, roll, and pitch.
     */
    export function extractYawPitchRoll(q: Quaternion): YawPitchRoll {
        const ysqr = q.y * q.y;

        // pitch (x-axis rotation)
        const t0 = +2.0 * (q.w * q.x + q.y * q.z);
        const t1 = +1.0 - 2.0 * (q.x * q.x + ysqr);
        const pitch = Math.atan2(t0, t1);

        // roll (y-axis rotation)
        let t2 = +2.0 * (q.w * q.y - q.z * q.x);
        t2 = t2 > 1.0 ? 1.0 : t2;
        t2 = t2 < -1.0 ? -1.0 : t2;
        const roll = Math.asin(t2);

        // yaw (z-axis rotation)
        const t3 = +2.0 * (q.w * q.z + q.x * q.y);
        const t4 = +1.0 - 2.0 * (ysqr + q.z * q.z);
        const yaw = Math.atan2(t3, t4);

        return { yaw, pitch, roll };
    }

    /**
     * Raycasts a point in NDC space from the current view of the camera and returns the
     * intersection point of that ray against the map in geo coordinates. The return
     * value can be `null` when the raycast is above the horizon.
     *
     * @param mapView Instance of MapView.
     * @param pointOnScreenNDC  Point in NDC space.
     * @returns Intersection geo coordinates, or `null` if raycast is above the horizon.
     */
    export function rayCastGeoCoordinates(
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number
    ): geoUtils.GeoCoordinates | null {
        const worldCoordinates = rayCastWorldCoordinates(
            mapView,
            pointOnScreenXinNDC,
            pointOnScreenYinNDC
        );

        if (!worldCoordinates) {
            return null;
        }

        return mapView.projection.unprojectPoint(worldCoordinates);
    }

    /**
     * Calculates the zoom level, which corresponds to the current height position of the camera.
     * Therefore the zoom level is a `float` and not an `int`. The height of the camera can be in
     * between zoom levels. By setting the zoom level, you change the height position of the camera
     * in away that the field of view of the camera should be able to cover one tile for the given
     * zoom level.
     *
     * As an example for this, when you have a tile of zoom level 14 in front of the camera and you
     * set the zoom level of the camera to 14, then you are able to see the whole tile in front of
     * you.
     */
    export function calculateZoomLevelFromHeight(height: number, mapView: MapView): number {
        const targetSubdivisions = 2;
        const biasedHeight = height * mapView.zoomLevelBias;
        const visibleHeight =
            2 * biasedHeight * Math.tan(geoUtils.MathUtils.degToRad(mapView.camera.fov / 2));

        /**
         * Use half the circumference as a reference point. This makes a few assumptions:
         * 1. That the equitorial circumference is close enough to the vertical circumference to
         *    not matter.
         * 2. That distance is consistent throughout the globe. This isn't necessarily the case for
         *    mercator projections, but shouldn't be a huge problem since the geometry is distorted
         *    anyway.
         * 3. That in most cases the curvature of the earth won't have a large impact. In the case
         *    of zooming out to view the whole globe with a sphere projection, it will subdivide a
         *    bit more than it would otherwise, but it shouldn't be much of an issue.
         */
        const halfCircumference = EarthConstants.EQUATORIAL_CIRCUMFERENCE / 2;
        const targetSize = visibleHeight / targetSubdivisions;

        const zoomLevel = Math.log2(halfCircumference / targetSize);
        return geoUtils.MathUtils.clamp(zoomLevel, mapView.minZoomLevel, mapView.maxZoomLevel);
    }

    /**
     * Translates a linear clip-space distance value to the actual value stored in the depth buffer.
     * This is useful as the depth values are not stored in the depth buffer linearly, and this can
     * lead into confusing behaviour when not taken into account.
     *
     * @param clipDistance Distance from the camera in clip space (range: [0, 1]).
     * @param camera Camera applying the perspective projection.
     */
    export function calculateDepthFromClipDistance(
        clipDistance: number,
        camera: THREE.Camera
    ): number {
        const perspCam = camera as THREE.PerspectiveCamera;
        const cameraRange = perspCam.far - perspCam.near;
        const viewSpaceDistance = clipDistance * perspCam.far;

        return (1.0 - perspCam.near / viewSpaceDistance) * (perspCam.far / cameraRange);
    }

    /**
     * Calculates vertical field of view for given horizontal field of vision and aspect ratio.
     *
     * @param hFov Horizontal field of view in rad.
     * @param aspect Aspect ratio.
     */
    export function calculateVerticalFovByHorizontalFov(hFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(hFov / 2) / aspect);
    }

    /**
     * Calculates horizontal field of view for given vertical field of vision and aspect ratio.
     *
     * @param hFov Vertical field of view in rad.
     * @param aspect Aspect ratio.
     */
    export function calculateHorizontalFovByVerticalFov(vFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    }

    /**
     * Computes estimate of size in memory for given object.
     *
     * @param object
     * @returns Estimate of object size in bytes.
     */
    export function estimateObjectSize(object: object): number {
        if (typeof object === "function") {
            return 0;
        }

        const objects = new Map();
        const stack = [object];
        let bytes = 0;

        while (stack.length > 0) {
            const value = stack.pop() as any;
            if (Array.isArray(value) && value.length > 0 && typeof value[0] !== "object") {
                if (typeof value[0] === "boolean") {
                    bytes += 4 * value.length;
                } else if (typeof value[0] === "string") {
                    value.forEach((item: string) => {
                        if (item.length !== undefined) {
                            bytes += item.length * 2;
                        }
                    });
                } else if (typeof value[0] === "number") {
                    bytes += 8 * value.length;
                }
                continue;
            } else if (typeof value === "boolean") {
                bytes += 4;
            } else if (typeof value === "string") {
                const a = value as string;
                bytes += a.length * 2;
            } else if (typeof value === "number") {
                bytes += 8;
            } else if (value !== undefined && value !== null && value.byteLength !== undefined) {
                bytes += value.byteLength;
            } else if (
                typeof value === "object" &&
                value !== null &&
                objects.has(value) === false
            ) {
                objects.set(value, "");
                const element = value as any;
                for (const key in element) {
                    if (element[key] !== undefined && typeof element[key] !== "function") {
                        stack.push(element[key]);
                    }
                }
            }
        }
        return bytes;
    }

    /**
     * Gets language list used by the browser
     *
     * @returns Array of iso language codes
     */
    export function getBrowserLanguages(): string[] | undefined {
        if (navigator.languages !== undefined && navigator.languages.length > 0) {
            const languageList = [];
            for (const lang of navigator.languages) {
                languageList.push(getIsoLanguageCode(lang));
            }
            return languageList;
        }
        if (navigator.language !== undefined) {
            return [getIsoLanguageCode(navigator.language)];
        }
        return undefined;
    }

    /**
     * Gets ISO-639-1 language code from browser's code (ex. en for en-US)
     */
    function getIsoLanguageCode(language: string) {
        return language.substring(0,2);
    }
}
