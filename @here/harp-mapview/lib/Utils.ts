/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as geoUtils from "@here/harp-geoutils";
import { EarthConstants } from "@here/harp-geoutils/lib/projection/EarthConstants";
import { MapMeshBasicMaterial, MapMeshStandardMaterial } from "@here/harp-materials";
import { assert, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { MapView } from "./MapView";
import { getFeatureDataSize, TileFeatureData } from "./Tile";

const logger = LoggerManager.instance.create("MapViewUtils");

// Estimation of the size of an Object3D with all the simple properties, like matrices and flags.
// There may be cases where it is possible to construct Object3Ds with considerable less memory
// consumption, but this value is used to simplify the estimation.
const MINIMUM_OBJECT3D_SIZE_ESTIMATION = 1000;

const MINIMUM_ATTRIBUTE_SIZE_ESTIMATION = 56;

// Caching those for performance reasons.
const groundNormalPlanarProj = new THREE.Vector3(0, 0, 1);
const groundPlane = new THREE.Plane(groundNormalPlanarProj.clone());
const groundSphere = new THREE.Sphere(undefined, EarthConstants.EQUATORIAL_RADIUS);
const rayCaster = new THREE.Raycaster();
const tmpVectors: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/**
 * Cached ThreeJS instances for realtime maths.
 */
const space = {
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3()
};
const tangentSpace = {
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3()
};
const quaternion1 = new THREE.Quaternion();
const quaternion2 = new THREE.Quaternion();
const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const euler = new THREE.Euler();
const matrix1 = new THREE.Matrix4();
const matrix2 = new THREE.Matrix4();

export namespace MapViewUtils {
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
     * Describes estimated usage of memory on heap and GPU.
     */
    export interface MemoryUsage {
        heapSize: number;
        gpuSize: number;
    }

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param mapView Instance of MapView.
     * @param targetPositionOnScreenXinNDC Target x position in NDC space.
     * @param targetPositionOnScreenYinNDC Target y position in NDC space.
     * @param zoomLevel The desired zoom level.
     * @param maxTiltAngle The maximum tilt angle to comply by, in globe projection, in radian.
     */
    export function zoomOnTargetPosition(
        mapView: MapView,
        targetPositionOnScreenXinNDC: number,
        targetPositionOnScreenYinNDC: number,
        zoomLevel: number,
        maxTiltAngle: number = Math.PI / 2
    ): void {
        // Get current target position in world space before we zoom.
        const targetPosition = rayCastWorldCoordinates(
            mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC
        );
        const zoomDistance = calculateDistanceToGroundFromZoomLevel(mapView, zoomLevel);

        // Set the cameras height according to the given zoom level.
        if (mapView.projection.type === geoUtils.ProjectionType.Planar) {
            mapView.camera.position.setZ(zoomDistance);
        } else if (mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            mapView.camera.position.setLength(EarthConstants.EQUATORIAL_RADIUS + zoomDistance);
        }

        // In sphere, we may have to also orbit the camera around the position located at the
        // center of the screen, in order to limit the tilt to `maxTiltAngle`, as we change
        // this tilt by changing the camera's height above.
        if (mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            const centerScreenTarget = rayCastWorldCoordinates(mapView, 0, 0);
            if (centerScreenTarget !== null) {
                vector1.copy(mapView.camera.position).sub(centerScreenTarget);
                const tilt = centerScreenTarget.angleTo(vector1);
                const deltaTilt = tilt - maxTiltAngle;
                if (deltaTilt > 0) {
                    orbitFocusPoint(mapView, 0, deltaTilt, maxTiltAngle);
                }
            }
        }

        // Get new target position after the zoom
        const newTargetPosition = rayCastWorldCoordinates(
            mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC
        );

        if (!targetPosition || !newTargetPosition) {
            return;
        }

        if (mapView.projection.type === geoUtils.ProjectionType.Planar) {
            // Calculate the difference and pan the map to maintain the map relative to the target
            // position.
            targetPosition.sub(newTargetPosition);
            panCameraAboveFlatMap(mapView, targetPosition.x, targetPosition.y);
        } else if (mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            panCameraAroundGlobe(mapView, targetPosition, newTargetPosition);
        }
    }

    /**
     * Orbits the camera around the focus point of the camera. The `deltaAzimuth` and
     * `deltaTilt` are offsets in degrees to the current azimuth and altitude of the current
     * orbit. An important notion associated to this method, or to `MapView#lookAt`, is that the
     * interaction maintains a focus or target point on the screen, and so the angle changes happen
     * in the tangent space of the target, that we name "tilt". Tilt then describes a different
     * notion than "pitch", which is the inclination of an object in its own tangent space. In
     * practice, both tangent spaces will be identical in flat projections. But in the spherical
     * projection, all the transformations will occur in the tangent space of the target. That is
     * also why these `MapControls` choose a paradigm where the center of the screen, where the
     * target is found, should never point in the void (especially for the sphere projection).
     *
     * @param mapView The [[MapView]] instance to manipulate.
     * @param deltaAzimuth Delta azimuth in degrees.
     * @param deltaTilt Delta tilt in degrees.
     * @param maxTiltAngle The maximum tilt between the camera and its target in radian.
     */
    export function orbitFocusPoint(
        mapView: MapView,
        deltaAzimuth: number,
        deltaTilt: number,
        maxTiltAngle = Math.PI / 2
    ) {
        const target = rayCastWorldCoordinates(mapView, 0, 0);
        if (target === null) {
            throw new Error("MapView does not support a view pointing in the void");
        }

        const distance = target.distanceTo(mapView.camera.position);

        // Find the Z axis of the tangent space and store it in `vector2`.
        mapView.projection.type === geoUtils.ProjectionType.Spherical
            ? vector2.copy(target).normalize()
            : vector2.set(0, 0, 1);

        // Store the projected camera position on the tangent "ground" of the target, and from that
        // target, in `vector1`.
        vector1.copy(mapView.camera.position).projectOnPlane(vector2);
        if (mapView.projection.type === geoUtils.ProjectionType.Planar) {
            vector1.sub(target);
        }

        const cameraIsTilted = vector1.length() > 0.001;

        // In case the camera looks down and a deltaAzimuth is passed, this value will be applied
        // to the up axis. So first, determine the initial azimuth, including if there is no tilt.
        const localNorth = new THREE.Vector3(0, 1, 0);
        if (mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            localNorth
                .set(0, 0, 1)
                .projectOnPlane(vector2)
                .normalize();
        }
        const referenceVector = vector1.clone();
        if (!cameraIsTilted) {
            referenceVector
                .setFromMatrixColumn(mapView.camera.matrix, 0)
                .applyAxisAngle(vector2, -Math.PI / 2)
                .projectOnPlane(vector2);
        }
        let azimuth = referenceVector.angleTo(localNorth);
        // `angleTo` only holds values between 0 and PI. To have the missing half, we check the
        // cosine of the angle between the cross vector of referenceVector x north and the up
        // vector (the two should always be colinear, i.e. the cosine is always -1 or 1). If it is
        // -1, we negate the azimuth, to obtain a [-PI; PI] range.
        azimuth *= -referenceVector
            .clone()
            .cross(localNorth)
            .normalize()
            .dot(vector2);
        if (isNaN(azimuth)) {
            azimuth = 0;
        }
        // We add PI as this is used for the up vector, opposite the camera's standing point on the
        // trigonometric circle.
        azimuth += Math.PI;
        const newUpAxisIfNoTilt = localNorth.applyAxisAngle(
            vector2,
            azimuth - THREE.Math.degToRad(deltaAzimuth)
        );

        // Compute camera altitude in tangent space.
        vector1.add(target);
        const cameraAltitude = mapView.camera.position.distanceTo(vector1);
        vector1.sub(target);

        // Compute new altitude and tilt.
        const tilt = Math.acos(Math.min(1, cameraAltitude / distance));
        const newTilt = Math.max(0, Math.min(maxTiltAngle, tilt + THREE.Math.degToRad(deltaTilt)));
        const newAltitude = Math.cos(newTilt) * distance;

        // Now change the azimuth of `vector1` in the tangent space (rotate around the tangent Z)
        // and change the length given the new tilt.
        if (!cameraIsTilted) {
            vector1.copy(newUpAxisIfNoTilt).negate();
        }
        quaternion1.setFromAxisAngle(vector2, -THREE.Math.degToRad(deltaAzimuth));
        vector1.applyQuaternion(quaternion1);

        vector2.setLength(newAltitude);

        // Compute new ground distance to target.
        vector1.setLength(Math.sin(newTilt) * distance);

        // Then, from the focus point: add the new projected position of the camera on the tangent
        // "ground", elevate it from its new altitude in tangent space, and make it look at the
        // focus point.
        mapView.camera.position
            .copy(target)
            .add(vector1) // Add ground position.
            .add(vector2); // Add altitude.

        mapView.camera.lookAt(target);

        if (newTilt > 0) {
            mapView.camera.up.copy(vector2).normalize();
        } else {
            mapView.camera.up.copy(newUpAxisIfNoTilt);
        }

        mapView.camera.lookAt(target);
        mapView.camera.updateMatrixWorld(true);
    }

    /**
     * Returns the [[GeoCoordinates]] of the camera, given its target coordinates on the map and its
     * zoom, yaw and pitch.
     *
     * @param targetCoordinates Coordinates of the center of the view.
     * @param distance Distance to the target in meters.
     * @param yawDeg Camera yaw in degrees.
     * @param pitchDeg Camera pitch in degrees.
     * @param mapView Active MapView, needed to get the camera fov and map projection.
     */
    export function getCameraCoordinatesFromTargetCoordinates(
        targetCoordinates: geoUtils.GeoCoordinates,
        distance: number,
        yawDeg: number,
        pitchDeg: number,
        mapView: MapView
    ): geoUtils.GeoCoordinates {
        const pitchRad = THREE.Math.degToRad(pitchDeg);
        const yawRad = THREE.Math.degToRad(yawDeg);
        mapView.projection.projectPoint(targetCoordinates, vector2);
        const groundDistance = distance * Math.sin(pitchRad);
        if (mapView.projection.type === geoUtils.ProjectionType.Planar) {
            vector2.set(
                vector2.x + Math.sin(yawRad) * groundDistance,
                vector2.y - Math.cos(yawRad) * groundDistance,
                0
            );
        } else if (mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            // In globe yaw and pitch are understood to be in tangent space. The approach below is
            // to find the Z and Y tangent space axes, then rotate Y around Z by the given yaw, and
            // set its new length (groundDistance). Finally the up vector's length is set to the
            // camera height and added to the transformed Y above.

            // Get the Z axis in tangent space: it is the normalized position vector of the target.
            tangentSpace.z.copy(vector2).normalize();

            // Get the Y axis (north axis in tangent space):
            tangentSpace.y
                .set(0, 0, 1)
                .projectOnPlane(tangentSpace.z)
                .normalize();

            // Rotate this north axis by the given yaw, giving the camera direction relative to
            // the target.
            quaternion1.setFromAxisAngle(tangentSpace.z, yawRad - Math.PI);
            tangentSpace.y.applyQuaternion(quaternion1);

            // Push the camera to the specified distance.
            tangentSpace.y.setLength(groundDistance);

            // Now get the actual camera position vector: from the target position, add the
            // previous computation to get the projection of the camera on the ground, then add
            // the height of the camera in the tangent space.
            const height = distance * Math.cos(pitchRad);
            vector2.add(tangentSpace.y).add(tangentSpace.z.setLength(height));
        }

        // Convert back to GeoCoordinates and return result.
        return mapView.projection.unprojectPoint(vector2);
    }

    /**
     * Casts a ray in NDC space from the current map view and returns the intersection point of that
     * ray wih the map in world space.
     *
     * @param mapView Instance of MapView.
     * @param pointOnScreenXinNDC X coordinate in NDC space.
     * @param pointOnScreenYinNDC Y coordinate in NDC space.
     * @param elevation Optional param used to offset the ground plane. Used when wanting to pan
     * based on a plane at some altitude. Necessary for example when panning with terrain.
     *
     * @returns Intersection coordinates, or `null` if raycast failed.
     */
    export function rayCastWorldCoordinates(
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number,
        elevation?: number
    ): THREE.Vector3 | null {
        const pointInNDCPosition = new THREE.Vector3(pointOnScreenXinNDC, pointOnScreenYinNDC, 0);

        vector2.copy(mapView.camera.position);

        matrix1.extractRotation(mapView.camera.matrixWorld);

        // Prepare the unprojection matrix which projects from NDC space to camera space
        // and takes the current rotation of the camera into account.
        matrix2.multiplyMatrices(matrix1, matrix2.getInverse(mapView.camera.projectionMatrix));
        // Unproject the point via the unprojection matrix.
        const pointInCameraSpace = pointInNDCPosition.applyMatrix4(matrix2);
        // Use the point in camera space as the vector towards this point.
        rayCaster.set(vector2, pointInCameraSpace.normalize());
        if (elevation !== undefined) {
            groundPlane.constant = -elevation;
        }

        const worldPosition = new THREE.Vector3();
        const result =
            mapView.projection.type === geoUtils.ProjectionType.Planar
                ? rayCaster.ray.intersectPlane(groundPlane, worldPosition)
                : rayCaster.ray.intersectSphere(groundSphere, worldPosition);
        groundPlane.constant = 0;
        return result;
    }

    /**
     * Calculates and returns the distance from the ground, which is needed to put the camera to
     * this height, to see the size of the area that would be covered by one tile for the given zoom
     * level.
     *
     * @param mapView Instance of MapView.
     * @param zoomLevel The zoom level to get the equivalent height to.
     */
    export function calculateDistanceToGroundFromZoomLevel(
        mapView: MapView,
        zoomLevel: number
    ): number {
        const cameraPitch = extractYawPitchRoll(mapView.camera, mapView.projection.type).pitch;
        const tileSize = EarthConstants.EQUATORIAL_CIRCUMFERENCE / Math.pow(2, zoomLevel);
        return ((mapView.focalLength * tileSize) / 256) * Math.cos(cameraPitch);
    }

    /**
     * Pans the camera according to the projection.
     *
     * @param mapView Instance of MapView.
     * @param xOffset In world space. Value > 0 will pan the map to the right, value < 0 will pan
     * the map to the left in default camera orientation.
     * @param yOffset In world space. Value > 0 will pan the map upwards, value < 0 will pan the map
     * downwards in default camera orientation.
     */
    export function panCameraAboveFlatMap(
        mapView: MapView,
        offsetX: number,
        offsetY: number
    ): void {
        mapView.camera.position.x += offsetX;
        mapView.camera.position.y += offsetY;
    }

    /**
     * The function doing a pan in the spherical space when [[MapView]]'s active [[ProjectionType]]
     * is spherical. In other words, the function that rotates the camera around the globe.
     *
     * @param mapView MapView instance.
     * @param fromWorld Start vector representing the scene position of a geolocation.
     * @param toWorld End vector representing the scene position of a geolocation.
     */
    export function panCameraAroundGlobe(
        mapView: MapView,
        fromWorld: THREE.Vector3,
        toWorld: THREE.Vector3
    ) {
        quaternion1.setFromUnitVectors(fromWorld.normalize(), toWorld.normalize()).inverse();
        matrix1.makeRotationFromQuaternion(quaternion1);
        mapView.camera.applyMatrix(matrix1);
        mapView.camera.updateMatrixWorld();
    }

    /**
     * Sets the rotation of the camera according to yaw and pitch in degrees. The computations hinge
     * on the current projection and `geoCenter`, because yaw and pitch are defined in tangent
     * space. In particular, `MapView#geoCenter` needs to be set before calling `setRotation`.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param mapView Instance of MapView.
     * @param yaw Yaw in degrees, counter-clockwise (as opposed to azimuth), starting north.
     * @param pitch Pitch in degrees.
     */
    export function setRotation(mapView: MapView, yaw: number, pitch: number) {
        const transform = {
            xAxis: space.x,
            yAxis: space.y,
            zAxis: space.z,
            position: vector1
        };
        mapView.projection.localTangentSpace(mapView.geoCenter, transform);
        if (
            yaw === 0 &&
            pitch === 0 &&
            mapView.projection.type === geoUtils.ProjectionType.Spherical
        ) {
            mapView.camera.up
                .set(0, 1, 0)
                .projectOnPlane(vector2.copy(vector1).normalize())
                .normalize();
            mapView.camera.lookAt(vector1);
        }

        // `matrix2` thereafter is the transform matrix, `matrix1` the rotation matrix.
        matrix2.makeBasis(transform.xAxis, transform.yAxis, transform.zAxis);
        matrix2.setPosition(transform.position.x, transform.position.y, transform.position.z);
        quaternion1.setFromAxisAngle(vector2.set(0, 0, 1), THREE.Math.degToRad(yaw));
        quaternion2.setFromAxisAngle(vector2.set(1, 0, 0), THREE.Math.degToRad(pitch));
        quaternion1.multiply(quaternion2);
        matrix1.makeRotationFromQuaternion(quaternion1);
        matrix2.multiply(matrix1);
        mapView.camera.setRotationFromMatrix(matrix2);
        mapView.camera.position.setFromMatrixPosition(matrix2);
        mapView.camera.updateMatrixWorld(true);
    }

    /**
     * Extracts yaw, pitch, and roll rotation in radians.
     * - Yaw : Rotation around the vertical axis, counter-clockwise (as opposed to azimuth),
     * starting north.
     * - Pitch :Rotation around the horizontal axis.
     * - Roll : Rotation around the view axis.
     *
     * @see https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
     *
     * @param object Object to extract rotation relatively to the projection type.
     * @param projectionType The active type of map projection used to deduce the yaw, pitch and
     * roll values, relative to this coordinate system.
     */
    export function extractYawPitchRoll(
        object: THREE.Object3D,
        projectionType: geoUtils.ProjectionType
    ): YawPitchRoll {
        switch (projectionType) {
            case geoUtils.ProjectionType.Spherical:
                object.matrixWorld.extractBasis(space.x, space.y, space.z);

                // 1. The pitch is the angle between the camera's view vector (Z axis) and the
                // vertical axis (=the normal on the surface, =the normalized camera position
                // vector).
                vector2.copy(object.position).normalize();
                const pitch =
                    space.z.angleTo(vector2) * (space.y.angleTo(vector2) > Math.PI / 2 ? -1 : 1);

                // 2. The roll is the angle between the vertical axis and the X axis of the camera,
                // minus 90 degrees. (PROBLEM: needs to support negative values. Using euler.y
                // below gives erratic values... investigate. Do we actually support roll? Many
                // functions should have it but don't. What does it mean compared to yaw / azimuth
                // when the view is top down ?).
                const roll = space.x.angleTo(vector2) - Math.PI / 2;

                // 3. The yaw is the angle between the tangent space's Y axis (tangent vector
                // pointing north) and the camera's view vector projected on the tangent plane.
                const geoPoint = geoUtils.sphereProjection.unprojectPoint(object.position);
                geoUtils.sphereProjection.localTangentSpace(geoPoint, {
                    xAxis: tangentSpace.x,
                    yAxis: tangentSpace.y,
                    zAxis: tangentSpace.z,
                    position: vector2
                });
                const transform = new THREE.Matrix4();
                transform.makeBasis(tangentSpace.x, tangentSpace.y, tangentSpace.z);
                quaternion1.setFromRotationMatrix(transform);
                quaternion2.copy(object.quaternion).multiply(quaternion1.inverse());
                euler.setFromQuaternion(quaternion2, "ZXY");
                const yaw = -euler.z;

                return { yaw, pitch, roll };
            case geoUtils.ProjectionType.Planar:
                euler.setFromQuaternion(object.quaternion, "ZXY");
                return {
                    yaw: euler.z,
                    pitch: euler.x,
                    roll: euler.y
                };
        }
    }

    /**
     * Return camera tilt angle (in radians).
     *
     * Tilt is the angle between camera __look at__ (forward) vector and ground normal.
     *
     * @note It may depend on the projection type.
     *
     * @param camera The camera used for tilt angle calculation.
     * @param projection The projection used to convert geo coordinated to world coordinates.
     * @returns angle in radians.
     */
    export function getCameraTiltAngle(
        camera: THREE.Camera,
        projection: geoUtils.Projection
    ): number {
        // Note using different temporary vectors.
        const lookAt: THREE.Vector3 = tmpVectors[0];
        camera.getWorldDirection(lookAt);
        return lookAt.angleTo(getGroundNormalInv(camera.position, projection, tmpVectors[1]));
    }

    /**
     * Get perspective camera frustum planes distances.
     * @return all plane distances in helper object.
     */
    export function getCameraFrustumPlanes(
        camera: THREE.PerspectiveCamera
    ): { left: number; right: number; top: number; bottom: number; near: number; far: number } {
        const near = camera.near;
        const far = camera.far;
        let top = (near * Math.tan(THREE.Math.degToRad(0.5 * camera.fov))) / camera.zoom;
        let height = 2 * top;
        let width = camera.aspect * height;
        let left = -0.5 * width;

        const view = camera.view;
        if (view !== null && view.enabled) {
            const fullWidth = view.fullWidth;
            const fullHeight = view.fullHeight;

            left += (view.offsetX * width) / fullWidth;
            top -= (view.offsetY * height) / fullHeight;
            width *= view.width / fullWidth;
            height *= view.height / fullHeight;
        }

        // Correct by skew factor
        left += camera.filmOffset !== 0 ? (near * camera.filmOffset) / camera.getFilmWidth() : 0;

        return {
            left,
            right: left + width,
            top,
            bottom: top - height,
            near,
            far
        };
    }

    /**
     * Return normal to the ground surface (looking down) directly above camera position.
     *
     * @param position The position above the ground for which normal is calculated.
     * @param projection The projection used to transform geo coordinates to world space.
     * @param result The pre-allocated vector for storing result value, if it is
     * undefined function will allocate new vector and return it as result.
     * @returns inverted ground normal copied to [[result]] vector or newly allocated
     * if result is undefined.
     */
    function getGroundNormalInv(
        position: THREE.Vector3,
        projection: geoUtils.Projection,
        result?: THREE.Vector3
    ): THREE.Vector3 {
        // We can't simply return [0,0,1] for planar projections because WebMercatorProjection
        // has ground normal inverted - as opposed to other planar projections, so use of
        // the projection interface is encouraged to acquire ground normal.
        if (result === undefined) {
            result = new THREE.Vector3();
        }
        projection.surfaceNormal(position, result);
        return result.negate();
    }

    /**
     * Casts a ray in NDC space from the current view of the camera and returns the intersection
     * point of that ray against the map in geo coordinates. The return value can be `null` when
     * the raycast is above the horizon.
     *
     * @param mapView Instance of MapView.
     * @param pointOnScreenXNDC  Abscissa in NDC space.
     * @param pointOnScreenYNDC  Ordinate in NDC space.
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
     * Calculates the zoom level, which corresponds to the current distance from
     * camera to lookAt point.
     * Therefore the zoom level is a `float` and not an `int`. The height of the camera can be in
     * between zoom levels. By setting the zoom level, you change the height position of the camera
     * in away that the field of view of the camera should be able to cover one tile for the given
     * zoom level.
     *
     * As an example for this, when you have a tile of zoom level 14 in front of the camera and you
     * set the zoom level of the camera to 14, then you are able to see the whole tile in front of
     * you.
     *
     * @param distance The distance in meters, which are scene units in [[MapView]].
     * @param mapView [[MapView]] instance.
     */
    export function calculateZoomLevelFromDistance(distance: number, mapView: MapView): number {
        const tileSize = (256 * distance) / mapView.focalLength;
        const zoomLevel = THREE.Math.clamp(
            Math.log2(EarthConstants.EQUATORIAL_CIRCUMFERENCE / tileSize),
            mapView.minZoomLevel,
            mapView.maxZoomLevel
        );
        // Round to avoid modify the zoom level without distance change, with the imprecision
        // introduced by raycasting.
        return Math.round(zoomLevel * 10e15) / 10e15;
    }

    /**
     * Translates a linear clip-space distance value to the actual value stored in the depth buffer.
     * This is useful as the depth values are not stored in the depth buffer linearly, and this can
     * lead into confusing behavior when not taken into account.
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
     * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
     * [0..cameraFar].
     *
     * @param distance Distance from the camera (range: [0, 1]).
     * @param camera Camera applying the perspective projection.
     */
    export function cameraToWorldDistance(distance: number, camera: THREE.Camera): number {
        const perspCam = camera as THREE.PerspectiveCamera;
        return distance * perspCam.far;
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
     * Calculates the focal length based on the vertical FOV and height.
     *
     * @param vFov Vertical field of view in rad.
     * @param height Height of canvas in pixels.
     */
    export function calculateFocalLengthByVerticalFov(vFov: number, height: number): number {
        return height / 2 / Math.tan(vFov / 2);
    }

    /**
     * Calculates the vertical field of view based on the focal length and the height.
     *
     * @param focalLength Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param height Height of canvas in pixels.
     */
    export function calculateFovByFocalLength(focalLength: number, height: number): number {
        return THREE.Math.radToDeg(2 * Math.atan(height / 2 / focalLength));
    }

    /**
     * Calculates object's screen size based on the focal length and it's camera distance.
     *
     * @param focalLength Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param distance Object distance in world space.
     * @param worldSize Object size in world space.
     * @return object size in screen space.
     */
    export function calculateScreenSizeByFocalLength(
        focalLength: number,
        distance: number,
        worldSize: number
    ): number {
        return (focalLength * worldSize) / distance;
    }

    /**
     * Calculates object's world size based on the focal length and it's camera distance.
     *
     * @param focalLength Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param distance Object distance in world space.
     * @param screenSize Object size in screen space.
     * @return object size in world space.
     */
    export function calculateWorldSizeByFocalLength(
        focalLength: number,
        distance: number,
        screenSize: number
    ): number {
        return (distance * screenSize) / focalLength;
    }

    /**
     * Computes estimate for size of a THREE.Object3D object and its children. Shared materials
     * and/or attributes will be counted multiple times.
     *
     * @param object The mesh object to evaluate
     * @param size The [[MemoryUsage]] to update.
     * @param visitedObjects Optional map to store large objects that could be shared.
     *
     * @returns Estimate of object size in bytes for heap and GPU.
     */
    export function estimateObject3dSize(
        object: THREE.Object3D,
        parentSize?: MemoryUsage,
        visitedObjects?: Map<string, boolean>
    ): MemoryUsage {
        const size =
            parentSize !== undefined
                ? parentSize
                : {
                      heapSize: 0,
                      gpuSize: 0
                  };

        if (visitedObjects === undefined) {
            visitedObjects = new Map();
        }

        estimateMeshSize(object, size, visitedObjects);

        if (object.children.length > 0) {
            for (const child of object.children) {
                estimateObject3dSize(child, size, visitedObjects);
            }
        }
        return size;
    }

    function estimateTextureSize(
        texture: THREE.Texture | null,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (texture === null || texture.image === undefined) {
            return;
        }

        if (texture.uuid !== undefined && visitedObjects.get(texture.uuid) === true) {
            return;
        }
        visitedObjects.set(texture.uuid, true);

        // May be HTMLImage or ImageData
        const image = texture.image;
        // Assuming RGBA
        const imageBytes = 4 * image.width * image.height;
        objectSize.heapSize += imageBytes;
        objectSize.gpuSize += imageBytes;
    }

    function estimateMaterialSize(
        material: THREE.Material,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (material.uuid !== undefined && visitedObjects.get(material.uuid) === true) {
            return;
        }
        visitedObjects.set(material.uuid, true);

        if (
            material instanceof THREE.RawShaderMaterial ||
            material instanceof THREE.ShaderMaterial
        ) {
            const rawMaterial = material;
            for (const name in rawMaterial.uniforms) {
                if (rawMaterial.uniforms[name] !== undefined) {
                    const uniform = rawMaterial.uniforms[name];
                    if (uniform instanceof THREE.Texture) {
                        estimateTextureSize(uniform, objectSize, visitedObjects);
                    }
                }
            }
        } else if (
            material instanceof THREE.MeshBasicMaterial ||
            material instanceof MapMeshBasicMaterial
        ) {
            const meshMaterial = material;
            estimateTextureSize(meshMaterial.map, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.aoMap, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.specularMap, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.alphaMap, objectSize, visitedObjects);
            estimateTextureSize(meshMaterial.envMap, objectSize, visitedObjects);
        } else if (material instanceof MapMeshStandardMaterial) {
            const standardMaterial = material;

            estimateTextureSize(standardMaterial.map, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.lightMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.aoMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.emissiveMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.bumpMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.normalMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.displacementMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.roughnessMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.metalnessMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.alphaMap, objectSize, visitedObjects);
            estimateTextureSize(standardMaterial.envMap, objectSize, visitedObjects);
        } else if (
            material instanceof THREE.LineBasicMaterial ||
            material instanceof THREE.LineDashedMaterial
        ) {
            // Nothing to be done here
        } else {
            logger.warn("estimateMeshSize: unidentified material: ", material);
        }
    }

    function estimateAttributeSize(
        attribute: any,
        attrName: string,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        // Attributes (apparently) do not have their uuid set up.
        if (attribute.uuid === undefined) {
            attribute.uuid = THREE.Math.generateUUID();
        }

        if (visitedObjects.get(attribute.uuid) === true) {
            return;
        }
        visitedObjects.set(attribute.uuid, true);

        let attrBytes = 0;
        let bytesPerElement = 4;
        if (attribute.array.BYTES_PER_ELEMENT !== undefined) {
            bytesPerElement = attribute.array.BYTES_PER_ELEMENT;
        }
        if (
            attribute instanceof THREE.InterleavedBufferAttribute ||
            attribute instanceof THREE.BufferAttribute
        ) {
            attrBytes = bytesPerElement * attribute.count * attribute.itemSize;
        } else {
            logger.warn("estimateMeshSize: unidentified attribute: ", attrName);
        }

        objectSize.heapSize += attrBytes + MINIMUM_ATTRIBUTE_SIZE_ESTIMATION;
        objectSize.gpuSize += attrBytes;
    }

    function estimateGeometrySize(
        geometry: THREE.Geometry | THREE.BufferGeometry,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        const isNewObject =
            geometry.uuid === undefined || visitedObjects.get(geometry.uuid) !== true;

        if (!isNewObject) {
            return;
        }
        visitedObjects.set(geometry.uuid, true);

        let bufferGeometry: THREE.BufferGeometry | undefined;

        if (geometry instanceof THREE.Geometry) {
            // Each vertex is represented as 3 floats vector (24 bytes).
            objectSize.heapSize += geometry.vertices.length * 24;
            // Face: 3 indices (24 byte), 1 normal (3 floats = 24). Vertex normals and
            // colors are not counted here.
            objectSize.heapSize += geometry.faces.length * (24 + 24);
            // Additionally, the internal _bufferGeometry is also counted:
            bufferGeometry = (geometry as any)._bufferGeometry;
        } else if (geometry instanceof THREE.BufferGeometry) {
            bufferGeometry = geometry;
        }

        if (bufferGeometry === undefined) {
            // Nothing more to calculate.
            return;
        }

        const attributes = bufferGeometry.attributes;
        if (attributes === undefined) {
            logger.warn("estimateGeometrySize: unidentified geometry: ", geometry);
            return;
        }

        for (const property in attributes) {
            if (attributes[property] !== undefined) {
                estimateAttributeSize(attributes[property], property, objectSize, visitedObjects);
            }
        }
        if (bufferGeometry.index !== null) {
            estimateAttributeSize(bufferGeometry.index, "index", objectSize, visitedObjects);
        }
    }

    function estimateMeshSize(
        object: THREE.Object3D,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (!object.isObject3D || object instanceof THREE.Scene) {
            return;
        }

        if (object.uuid !== undefined && visitedObjects.get(object.uuid) === true) {
            return;
        }
        visitedObjects.set(object.uuid, true);

        if ((object as any).isMesh || (object as any).isLine || (object as any).isPoints) {
            // Estimated minimum impact on heap.
            let heapSize = MINIMUM_OBJECT3D_SIZE_ESTIMATION;
            const gpuSize = 0;

            // Cast to Points class which contains the minimal required properties sub-set.
            const mesh = object as THREE.Points;

            // Calculate material(s) impact.
            if (mesh.material !== undefined) {
                if (Array.isArray(mesh.material)) {
                    const materials = mesh.material as THREE.Material[];
                    for (const material of materials) {
                        estimateMaterialSize(material, objectSize, visitedObjects);
                    }
                } else {
                    const material = mesh.material as THREE.Material;
                    estimateMaterialSize(material, objectSize, visitedObjects);
                }
            }

            // Calculate cost of geometry.
            if (mesh.geometry !== undefined) {
                estimateGeometrySize(mesh.geometry, objectSize, visitedObjects);
            }

            // Add info that is required for picking (parts of) objects and match them to
            // the featureID in the map data.
            const featureData: TileFeatureData | undefined =
                object.userData !== undefined
                    ? (object.userData.feature as TileFeatureData)
                    : undefined;

            if (featureData !== undefined) {
                heapSize += getFeatureDataSize(featureData);
            }

            objectSize.heapSize += heapSize;
            objectSize.gpuSize += gpuSize;
        } else {
            logger.warn("estimateMeshSize: unidentified object", object);
        }
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
        return language.substring(0, 2);
    }
}

/** @hidden */
const powerOfTwo = [
    0x1,
    0x2,
    0x4,
    0x8,
    0x10,
    0x20,
    0x40,
    0x80,
    0x100,
    0x200,
    0x400,
    0x800,
    0x1000,
    0x2000,
    0x4000,
    0x8000,
    0x10000,
    0x20000,
    0x40000,
    0x80000,
    0x100000,
    0x200000,
    0x400000,
    0x800000,
    0x1000000,
    0x2000000,
    0x4000000,
    0x8000000,
    0x10000000,
    0x20000000,
    0x40000000,
    0x80000000,
    0x100000000,
    0x200000000,
    0x400000000,
    0x800000000,
    0x1000000000,
    0x2000000000,
    0x4000000000,
    0x8000000000,
    0x10000000000,
    0x20000000000,
    0x40000000000,
    0x80000000000,
    0x100000000000,
    0x200000000000,
    0x400000000000,
    0x800000000000,
    0x1000000000000,
    0x2000000000000,
    0x4000000000000,
    0x8000000000000,
    0x10000000000000
];

export namespace TileOffsetUtils {
    /**
     * Creates a unique key based on the supplied parameters. Note, the uniqueness is bounded by the
     * bitshift. The [[TileKey.mortonCode()]] supports currently up to 26 levels (this is because
     * 26*2 equals 52, and 2^52 is the highest bit that can be set in an integer in Javascript), the
     * bitshift reduces this accordingly, so given the default bitshift of four, we support up to 24
     * levels. Given the current support up to level 19 this should be fine.
     *
     * @param tileKey The unique [[TileKey]] from which to compute the unique key.
     * @param offset How much the given [[TileKey]] is offset
     * @param bitshift How much space we have to store the offset. The default of 4 means we have
     *      enough space to store 16 unique tiles in a single view.
     */
    export function getKeyForTileKeyAndOffset(
        tileKey: geoUtils.TileKey,
        offset: number,
        bitshift: number = 4
    ) {
        const shiftedOffset = getShiftedOffset(offset, bitshift);
        return tileKey.mortonCode() + shiftedOffset;
    }

    /**
     * Extracts the offset and morton key from the given key (must be created by:
     * [[getKeyForTileKeyAndOffset]])
     *
     * Note, we can't use bitshift operators in Javascript because they work on 32-bit integers, and
     * would truncate the numbers, hence using powers of two.
     *
     * @param key Key to extract offset and morton key.
     * @param bitshift How many bits to shift by, must be the same as was used when creating the
     * key.
     */
    export function extractOffsetAndMortonKeyFromKey(key: number, bitshift: number = 4) {
        let offset = 0;
        let mortonCode = key;
        let i = 0;
        // Compute the offset
        for (; i < bitshift; i++) {
            // Note, we use 52, because 2^53-1 is the biggest value, the highest value
            // that can be set is the bit in the 52th position.
            const num = powerOfTwo[52 - i];
            if (mortonCode >= num) {
                mortonCode -= num;
                offset += powerOfTwo[bitshift - 1 - i];
            }
        }
        // We subtract half of the total amount, this undoes what is computed in getShiftedOffset
        offset -= powerOfTwo[bitshift - 1];
        return { offset, mortonCode };
    }

    /**
     * Returns the key of the parent. Key must have been computed using the function
     * [[getKeyForTileKeyAndOffset]].
     *
     * @param calculatedKey Key to decompose
     * @param bitshift Bit shift used to create the key
     */
    export function getParentKeyFromKey(calculatedKey: number, bitshift: number = 4) {
        const { offset, mortonCode } = extractOffsetAndMortonKeyFromKey(calculatedKey, bitshift);
        const parentTileKey = geoUtils.TileKey.fromMortonCode(
            geoUtils.TileKey.parentMortonCode(mortonCode)
        );
        return getKeyForTileKeyAndOffset(parentTileKey, offset, bitshift);
    }

    /**
     * Packs the supplied offset into the high bits, where the highbits are between 2^52 and
     * 2^(52-bitshift).
     *
     * Offsets are wrapped around, to fit in the offsetBits. In practice, this doesn't really
     * matter, this is primarily used to find a unique id, if there is an offset 10, which is
     * wrapped to 2, it doesn't matter, because the offset of 10 is still stored in the tile.
     * What can be a problem though is that the cache gets filled up and isn't emptied.
     *
     * Note, because bit shifting in JavaScript works on 32 bit integers, we use powers of 2 to set
     * the high bits instead.
     *
     * @param offset Offset to pack into the high bits.
     * @param offsetBits How many bits to use to pack the offset.
     */
    function getShiftedOffset(offset: number, offsetBits: number = 4) {
        let result = 0;
        const totalOffsetsToStore = powerOfTwo[offsetBits];
        //Offsets are stored by adding half 2 ^ (bitshift - 1), i.e.half of the max amount stored,
        //and then wrapped based on this value.For example, given a bitshift of 3, and an offset -
        //3, it would have 4 added(half of 2 ^ 3), and be stored as 1, 3 would have 4 added and be
        //stored as 7, 4 would be added with 4 and be stored as 0 (it wraps around).
        offset += totalOffsetsToStore / 2;
        while (offset < 0) {
            offset += totalOffsetsToStore;
        }
        while (offset >= totalOffsetsToStore) {
            offset -= totalOffsetsToStore;
        }
        // Offset is now a number between >= 0 and < totalOffsetsToStore
        for (let i = 0; i < offsetBits && offset > 0; i++) {
            // tslint:disable: no-bitwise
            // 53 is used because 2^53-1 is the biggest number that Javascript can represent as an
            // integer safely.
            if (offset & 0x1) {
                result += powerOfTwo[53 - offsetBits + i];
            }
            offset >>>= 1;
            // tslint:enable: no-bitwise
        }
        assert(offset === 0);
        return result;
    }
}
