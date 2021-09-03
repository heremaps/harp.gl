/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    GeoBox,
    GeoCoordinates,
    GeoCoordinatesLike,
    MathUtils,
    OrientedBox3,
    Projection,
    ProjectionType,
    sphereProjection,
    TileKeyUtils,
    Vector2Like,
    Vector3Like
} from "@here/harp-geoutils";
import { GeoCoordLike } from "@here/harp-geoutils/lib/coordinates/GeoCoordLike";
import { EarthConstants } from "@here/harp-geoutils/lib/projection/EarthConstants";
import { assert, DOMUtils, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { CameraUtils } from "./CameraUtils";
import { ElevationProvider } from "./ElevationProvider";
import { Object3DUtils } from "./geometry/Object3DUtils";
import { MapView } from "./MapView";

const logger = LoggerManager.instance.create("MapViewUtils");

/**
 * Zoom level to request terrain tiles for getting the height of the camera above terrain.
 */
const TERRAIN_ZOOM_LEVEL = 4;

// Caching those for performance reasons.
const groundNormalPlanarProj = new THREE.Vector3(0, 0, 1);
const groundPlane = new THREE.Plane(groundNormalPlanarProj.clone());
const groundSphere = new THREE.Sphere(undefined, EarthConstants.EQUATORIAL_RADIUS);
const rayCaster = new THREE.Raycaster();
const epsilon = 1e-5;

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
const cache = {
    box3: [new THREE.Box3()],
    obox3: [new OrientedBox3()],
    quaternions: [new THREE.Quaternion(), new THREE.Quaternion()],
    vector2: [new THREE.Vector2(), new THREE.Vector2()],
    vector3: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    matrix4: [new THREE.Matrix4(), new THREE.Matrix4()],
    transforms: [
        {
            xAxis: new THREE.Vector3(),
            yAxis: new THREE.Vector3(),
            zAxis: new THREE.Vector3(),
            position: new THREE.Vector3()
        }
    ]
};

const tmpCamera = new THREE.PerspectiveCamera();

/**
 * Rounds a given zoom level up to the nearest integer value if it's close enough.
 *
 * The zoom level set in {@link MapView} after a zoom level
 * target is given to {@link (MapView.lookAt:WITH_PARAMS)} or
 * {@link @here/harp-map-controls#MapControls} never matches
 * exactly the target due to the precision loss caused by the
 * conversion from zoom level to camera distance (done in
 * {@link (MapView.lookAt:WITH_PARAMS)} and {@link @here/harp-map-controls#MapControls})
 * and from distance back to zoom level (done at every frame on camera update).
 * As a result, given a fixed integer zoom level input, the final zoom level computed at every frame
 * may fall sometimes below the integer value and others above. This causes flickering since each
 * frame will use different tile levels and different style evaluations for object visibility.
 * See HARP-9673 and HARP-8523.
 * @param zoomLevel - Input zoom level
 * @return The ceiling zoom level if input zoom level is close enough, otherwise the unmodified
 * input zoom level.
 */
function snapToCeilingZoomLevel(zoomLevel: number) {
    const eps = 1e-6;
    const ceiling = Math.ceil(zoomLevel);
    return ceiling - zoomLevel < eps ? ceiling : zoomLevel;
}

/**
 * MapView utilities: View transformations, camera setup, view bounds computation...
 */
export namespace MapViewUtils {
    export const MAX_TILT_DEG = 89;
    export const MAX_TILT_RAD = MAX_TILT_DEG * THREE.MathUtils.DEG2RAD;

    /**
     * The anti clockwise rotation of an object along the axes of its tangent space, with itself
     * as origin.
     */
    export interface Attitude {
        /**
         * Rotation of the object along its vertical axis.
         */
        yaw: number;

        /**
         * Rotation of the object along its horizontal axis.
         */
        pitch: number;

        /**
         * Rotation of the object along its forward axis.
         */
        roll: number;
    }

    /**
     * @deprecated
     */
    export interface MemoryUsage extends Object3DUtils.MemoryUsage {}

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param mapView - Instance of MapView.
     * @param targetNDCx - Target x position in NDC space.
     * @param targetNDCy - Target y position in NDC space.
     * @param zoomLevel - The desired zoom level.
     * @param maxTiltAngle - The maximum tilt angle to comply by, in globe projection, in radian.
     * @returns `false` if requested zoom cannot be achieved due to the map view's maximum bounds
     * {@link MapView.geoMaxBounds},`true` otherwise.
     */
    export function zoomOnTargetPosition(
        mapView: MapView,
        targetNDCx: number,
        targetNDCy: number,
        zoomLevel: number,
        maxTiltAngle: number = MAX_TILT_RAD
    ): boolean {
        const { elevationProvider, camera, projection } = mapView;

        // Use for now elevation at camera position. See getTargetAndDistance.
        const elevation = elevationProvider
            ? elevationProvider.getHeight(
                  projection.unprojectPoint(camera.position),
                  TERRAIN_ZOOM_LEVEL
              )
            : undefined;

        // Get current target position in world space before we zoom.
        const zoomTarget = rayCastWorldCoordinates(mapView, targetNDCx, targetNDCy, elevation);

        // Compute current camera target, it may not be the one set in MapView, e.g. when this
        // function is called multiple times between frames.
        const cameraTarget = MapViewUtils.getTargetAndDistance(
            projection,
            camera,
            elevationProvider
        ).target;
        const newCameraDistance = calculateDistanceFromZoomLevel(mapView, zoomLevel);

        if (mapView.geoMaxBounds) {
            // If map view has maximum bounds set, constrain camera target and distance to ensure
            // they remain within bounds.
            const constrained = constrainTargetAndDistanceToViewBounds(
                cameraTarget,
                newCameraDistance,
                mapView
            );
            if (constrained.distance !== newCameraDistance) {
                // Only indicate failure when zooming out. This avoids zoom in cancellations when
                // camera is already at the maximum distance allowed by the view bounds.
                return zoomLevel >= mapView.zoomLevel;
            }
        }
        // Set the camera distance according to the given zoom level.
        camera
            .getWorldDirection(camera.position)
            .multiplyScalar(-newCameraDistance)
            .add(cameraTarget);

        // In sphere, we may have to also orbit the camera around the target, in order to limit the
        // the tilt to `maxTiltAngle`, as we change this tilt by changing the camera's height above.
        if (projection.type === ProjectionType.Spherical) {
            // FIXME: We cannot use mapView.tilt here b/c it does not reflect the latest camera
            // changes.
            const tilt = extractCameraTilt(camera, projection);
            const deltaTilt = tilt - maxTiltAngle;
            if (deltaTilt > 0) {
                orbitAroundScreenPoint(mapView, { deltaTilt, maxTiltAngle });
            }
        }

        // Get new target position after the zoom
        const newZoomTarget = rayCastWorldCoordinates(mapView, targetNDCx, targetNDCy, elevation);
        if (!zoomTarget || !newZoomTarget) {
            return true;
        }

        if (projection.type === ProjectionType.Planar) {
            // Calculate the difference and pan the map to maintain the map relative to the target
            // position.
            zoomTarget.sub(newZoomTarget);
            panCameraAboveFlatMap(mapView, zoomTarget.x, zoomTarget.y);
        } else if (projection.type === ProjectionType.Spherical) {
            panCameraAroundGlobe(mapView, zoomTarget, newZoomTarget);
        }
        return true;
    }

    /**
     * Parameters for {@link orbitAroundScreenPoint}.
     */
    export interface OrbitParams {
        /**
         * Delta azimuth in radians (default 0).
         */
        deltaAzimuth?: number;
        /**
         * Delta tilt in radians (default 0);
         */
        deltaTilt?: number;
        /**
         * Maximum tilt between the camera and its target in radians.
         */
        maxTiltAngle: number;
        /**
         * Orbiting center in NDC coordinates, defaults to camera's principal point.
         * @see {@link CameraUtils.getPrincipalPoint}.
         */
        center?: Vector2Like;
    }

    /**
     * Orbits the camera around a given point on the screen.
     *
     * @param mapView - The {@link MapView} instance to manipulate.
     * @param offsetX - Orbit point in NDC space.
     * @param offsetY - Orbit point in NDC space.
     * @param deltaAzimuth - Delta azimuth in radians.
     * @param deltaTilt - Delta tilt in radians.
     * @param maxTiltAngle - The maximum tilt between the camera and its target in radian.
     * @deprecated Use overload with {@link OrbitParams} object parameter.
     */
    export function orbitAroundScreenPoint(
        mapView: MapView,
        offsetX: number,
        offsetY: number,
        deltaAzimuth: number,
        deltaTilt: number,
        maxTiltAngle: number
    ): void;

    /**
     * Orbits the camera around a given point on the screen.
     *
     * @param mapView - The {@link MapView} instance to manipulate.
     * @param orbitParams - {@link OrbitParams}.
     */
    export function orbitAroundScreenPoint(mapView: MapView, orbitParams: OrbitParams): void;

    export function orbitAroundScreenPoint(
        mapView: MapView,
        offsetXOrOrbitParams: number | OrbitParams,
        offsetY?: number,
        deltaAzimuth?: number,
        deltaTilt?: number,
        maxTiltAngle?: number
    ): void {
        const ppalPoint = CameraUtils.getPrincipalPoint(mapView.camera, cache.vector2[0]);
        const mapTargetWorld = MapViewUtils.rayCastWorldCoordinates(
            mapView,
            ppalPoint.x,
            ppalPoint.y
        );
        if (mapTargetWorld === null) {
            return;
        }

        let orbitCenter: Vector2Like | undefined;
        if (typeof offsetXOrOrbitParams === "number") {
            orbitCenter = cache.vector2[1].set(offsetXOrOrbitParams, offsetY!);
        } else {
            const params = offsetXOrOrbitParams;
            orbitCenter = params.center ?? ppalPoint;
            deltaAzimuth = params.deltaAzimuth ?? 0;
            deltaTilt = params.deltaTilt ?? 0;
            maxTiltAngle = params.maxTiltAngle;
        }
        const orbitAroundPpalPoint = orbitCenter.x === ppalPoint.x && orbitCenter.y === ppalPoint.y;
        const rotationTargetWorld = orbitAroundPpalPoint
            ? mapTargetWorld
            : MapViewUtils.rayCastWorldCoordinates(mapView, orbitCenter.x, orbitCenter.y);
        if (rotationTargetWorld === null) {
            return;
        }

        applyAzimuthAroundTarget(mapView, rotationTargetWorld, -deltaAzimuth!);

        const tiltAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(mapView.camera.quaternion);
        const clampedDeltaTilt = computeClampedDeltaTilt(
            mapView,
            orbitCenter.y - ppalPoint.y,
            deltaTilt!,
            maxTiltAngle!,
            mapTargetWorld,
            rotationTargetWorld,
            tiltAxis
        );

        applyTiltAroundTarget(mapView, rotationTargetWorld, clampedDeltaTilt, tiltAxis);
    }

    /**
     * @hidden
     * @internal
     *
     * Applies the given Azimith to the camera around the supplied target.
     */
    function applyAzimuthAroundTarget(
        mapView: MapView,
        rotationTargetWorld: THREE.Vector3,
        deltaAzimuth: number
    ) {
        const camera = mapView.camera;
        const projection = mapView.projection;

        const headingAxis = projection.surfaceNormal(rotationTargetWorld, cache.vector3[0]);
        const headingQuat = cache.quaternions[0].setFromAxisAngle(headingAxis, deltaAzimuth);
        camera.quaternion.premultiply(headingQuat);
        camera.position.sub(rotationTargetWorld);
        camera.position.applyQuaternion(headingQuat);
        camera.position.add(rotationTargetWorld);
    }

    /**
     * @hidden
     * @internal
     *
     * Clamps the supplied `deltaTilt` to the `maxTiltAngle` supplied. Note, when a non-zero offset
     * is applied, we apply another max angle of 89 degrees to the rotation center to prevent some
     * corner cases where the angle at the rotation center is 90 degrees and therefore intersects
     * the geometry with the near plane.
     */
    function computeClampedDeltaTilt(
        mapView: MapView,
        offsetY: number,
        deltaTilt: number,
        maxTiltAngle: number,
        mapTargetWorld: THREE.Vector3,
        rotationTargetWorld: THREE.Vector3,
        tiltAxis: THREE.Vector3
    ): number {
        const camera = mapView.camera;
        const projection = mapView.projection;

        const tilt = extractTiltAngleFromLocation(projection, camera, mapTargetWorld, tiltAxis);
        if (tilt + deltaTilt < 0) {
            // Clamp the final tilt to 0
            return -tilt;
        } else if (deltaTilt <= 0) {
            // Reducing the tilt isn't clamped (apart from above).
            return deltaTilt;
        } else if (mapTargetWorld.equals(rotationTargetWorld) || offsetY < 0) {
            // When the rotation target is the center, or the offsetY is < 0, i.e. the angle at the
            // `mapTargetWorld` is always bigger, then we have a simple formula
            return MathUtils.clamp(deltaTilt + tilt, 0, maxTiltAngle) - tilt;
        }

        const rotationCenterTilt = extractTiltAngleFromLocation(
            projection,
            camera,
            rotationTargetWorld!,
            tiltAxis
        );

        const maxRotationTiltAngle = THREE.MathUtils.degToRad(89);

        // The rotationCenterTilt may exceed 89 degrees when for example the user has tilted to 89
        // at the mapTargetWorld, then choose a rotation center target above the mapTargetWorld,
        // i.e. offsetY > 0. In such case, we just return 0, i.e. we don't let the user increase
        // the tilt (but it can decrease, see check above for "deltaTilt <= 0").
        if (rotationCenterTilt > maxRotationTiltAngle) {
            return 0;
        }

        // This is used to find the max tilt angle, because the difference in normals is needed
        // to correct the triangle used to find the max tilt angle at the rotation center.
        let angleBetweenNormals = 0;
        if (projection === sphereProjection) {
            const projectedRotationTargetNormal = projection
                .surfaceNormal(rotationTargetWorld, cache.vector3[0])
                .projectOnPlane(tiltAxis)
                .normalize();
            const mapTargetNormal = projection.surfaceNormal(mapTargetWorld, cache.vector3[1]);
            angleBetweenNormals = projectedRotationTargetNormal.angleTo(mapTargetNormal);
        }

        const ninetyRad = THREE.MathUtils.degToRad(90);

        // The following terminology will be used:
        // Ta = Tilt axis, tilting is achieved by rotating the camera around this direction.
        // R = rotation target, i.e. the point about which we are rotating: `rotationTargetWorld`
        // Rp = rotation target projected on to Ta
        // C = camera position
        // M = map target, i.e. the point which the camera is looking at at the NDC coordinates 0,0

        // Note, the points Rp, C, and M create a plane that is perpendicular to the earths surface,
        // because the tilt axis is perpendicular to the up vector. The following variable `RpCM` is
        // the angle between the two rays C->Rp and C->M. This angle remains constant when tilting
        // with a fixed `offsetX` and `offsetY`. It is calculated by using the intersection of the
        // two rays with the earth.

        // Note the use of `angleBetweenNormals` to ensure this works for spherical projections.
        // Note, this calculation only works when the tilt at M is less than the tilt
        // at Rp, otherwise the above formula won't work. We however don't need to worry about this
        // case because this happens only when offsetY is less than zero, and this is handled above.
        const MRpC = ninetyRad + angleBetweenNormals - rotationCenterTilt;
        const CMRp = ninetyRad + tilt;
        const RpCM = ninetyRad * 2 - (MRpC + CMRp);

        // We want to find the greatest angle at the rotation target that gives us the max
        // angle at the map center target.
        const CMRpMaxTilt = ninetyRad * 2 - RpCM - ninetyRad - maxTiltAngle;

        // Converting the `MRpC` back to a tilt is as easy as subtracting it from 90 and the
        // `angleBetweenNormals`, i.e. this gives us the maximum allowed tilt at R that satisfies
        // the `maxTiltAngle` constraint. Note, for globe projection, this is just an approximation,
        // because once we move the camera by delta, the map target changes, and therefore the
        // normal also changes, this would need to be applied iteratively until the difference in
        // normals is reduced to some epsilon. I don't apply this because it is computationally
        // expensive and the user would never notice this in practice.
        const maxTilt = ninetyRad + angleBetweenNormals - CMRpMaxTilt;

        // Here we clamp to the min of `maxTilt` and 89 degrees. The check for 89 is to prevent it
        // intersecting with the world at 90. This is possible for example when the R position is
        // near the horizon. If the angle RCM is say 5 degrees, then an angle of say 89 degrees at
        // R, plus 5 degrees means the tilt at M would be 84 degrees, so the camera can reach 90
        // from the point R whilst the tilt to M never reaches the `maxTiltAngle`
        const clampedDeltaTilt =
            MathUtils.clamp(
                deltaTilt + rotationCenterTilt,
                0,
                Math.min(maxTilt, maxRotationTiltAngle)
            ) - rotationCenterTilt;

        return clampedDeltaTilt;
    }

    /**
     * @hidden
     * @internal
     *
     * Applies the given tilt to the camera around the supplied target.
     */
    function applyTiltAroundTarget(
        mapView: MapView,
        rotationTargetWorld: THREE.Vector3,
        deltaTilt: number,
        tiltAxis: THREE.Vector3
    ) {
        const camera = mapView.camera;
        // Consider to use the cache if necessary, but beware, because the `rayCastWorldCoordinates`
        // also uses this cache.
        const posBackup = camera.position.clone();
        const quatBackup = camera.quaternion.clone();

        const tiltQuat = cache.quaternions[0].setFromAxisAngle(tiltAxis, deltaTilt);
        camera.quaternion.premultiply(tiltQuat);
        camera.position.sub(rotationTargetWorld);
        camera.position.applyQuaternion(tiltQuat);
        camera.position.add(rotationTargetWorld);

        if (MapViewUtils.rayCastWorldCoordinates(mapView, 0, 0) === null) {
            logger.warn("Target got invalidated during rotation.");
            camera.position.copy(posBackup);
            camera.quaternion.copy(quatBackup);
        }
    }

    /**
     * Calculate target (focus) point geo-coordinates for given camera.
     * @see getTargetPositionFromCamera
     *
     * @param camera - The camera looking on target point.
     * @param projection - The geo-projection used.
     * @param elevation - Optional elevation above (or below) sea level measured in world units.
     *
     * @deprecated This function is for internal use only and will be removed in the future. Use
     * MapView.worldTarget instead.
     */
    export function getGeoTargetFromCamera(
        camera: THREE.Camera,
        projection: Projection,
        elevation?: number
    ): GeoCoordinates | null {
        // This function does almost the same as:
        // rayCastGeoCoordinates(mapView, 0, 0)
        // but in more gentle and performance wise manner
        const targetWorldPos = getWorldTargetFromCamera(camera, projection, elevation);
        if (targetWorldPos !== null) {
            return projection.unprojectPoint(targetWorldPos);
        }
        return null;
    }

    /**
     * Calculate target (focus) point world coordinates for given camera position and orientation.
     * @param camera - The camera looking on target point.
     * @param projection - The geo-projection used.
     * @param elevation - Optional elevation above (or below) sea level in world units.
     *
     * @deprecated This function is for internal use only and will be removed in the future.
     */
    export function getWorldTargetFromCamera(
        camera: THREE.Camera,
        projection: Projection,
        elevation?: number
    ): THREE.Vector3 | null {
        const cameraPos = cache.vector3[0].copy(camera.position);
        const cameraLookAt = camera.getWorldDirection(cache.vector3[1]);
        rayCaster.set(cameraPos, cameraLookAt);
        if (elevation !== undefined) {
            groundPlane.constant -= elevation;
            groundSphere.radius += elevation;
        }
        const targetWorldPos = new THREE.Vector3();
        const result =
            projection.type === ProjectionType.Planar
                ? rayCaster.ray.intersectPlane(groundPlane, targetWorldPos)
                : rayCaster.ray.intersectSphere(groundSphere, targetWorldPos);
        if (elevation !== undefined) {
            groundPlane.constant = 0;
            groundSphere.radius = EarthConstants.EQUATORIAL_RADIUS;
        }
        return result;
    }

    /**
     * Constrains given camera target and distance to {@link MapView.maxBounds}.
     *
     * @remarks
     * The resulting
     * target and distance will keep the view within the maximum bounds for a camera with tilt and
     * yaw set to 0.
     * @param target - The camera target.
     * @param distance - The camera distance.
     * @param mapView - The map view whose maximum bounds will be used as constraints.
     * @returns constrained target and distance, or the unchanged input arguments if the view
     * does not have maximum bounds set.
     */
    export function constrainTargetAndDistanceToViewBounds(
        target: THREE.Vector3,
        distance: number,
        mapView: MapView
    ): { target: THREE.Vector3; distance: number } {
        const unconstrained = { target, distance };
        const worldMaxBounds = mapView.worldMaxBounds;
        const camera = mapView.camera;
        const projection = mapView.projection;

        if (!worldMaxBounds) {
            return unconstrained;
        }

        /**
         * Constraints are checked similarly for planar and sphere. The extents of a top down view
         * (even if camera isn't top down) using the given camera distance are compared with those
         * of the maximum bounds to compute a scale. There are two options:
         * a) scale > 1. The view covers a larger area than the maximum bounds. The distance is
         * is reduced to match the bounds extents and the target is set at the bounds center.
         * b) scale <= 1. The view may fit within the bounds without changing the distance, only the
         * target is moved to fit the whole view within the bounds.
         **/

        const boundsSize = worldMaxBounds.getSize(cache.vector3[1]);
        const screenSize = mapView.renderer.getSize(cache.vector2[0]);
        const viewHeight = CameraUtils.convertScreenToWorldSize(
            mapView.focalLength,
            unconstrained.distance,
            screenSize.height
        );
        const viewWidth = viewHeight * camera.aspect;
        const scale = Math.max(viewWidth / boundsSize.x, viewHeight / boundsSize.y);
        const viewHalfSize = new THREE.Vector3(viewWidth / 2, viewHeight / 2, 0);

        const constrained = {
            target: unconstrained.target.clone(),
            distance: unconstrained.distance
        };

        if (projection.type === ProjectionType.Planar) {
            if (scale > 1) {
                constrained.distance /= scale;
                camera
                    .getWorldDirection(camera.position)
                    .multiplyScalar(-constrained.distance)
                    .add(worldMaxBounds.getCenter(constrained.target));
            } else {
                const targetBounds = cache.box3[0]
                    .copy(worldMaxBounds as THREE.Box3)
                    .expandByVector(viewHalfSize.multiplyScalar(-1));
                targetBounds
                    .clampPoint(unconstrained.target, constrained.target)
                    .setZ(unconstrained.target.z);
                if (constrained.target.equals(unconstrained.target)) {
                    return unconstrained;
                }

                camera.position.x += constrained.target.x - unconstrained.target.x;
                camera.position.y += constrained.target.y - unconstrained.target.y;
            }
            return constrained;
        }

        // Spherical projection
        if (scale > 1) {
            // Set target to center of max bounds but keeping same height as unconstrained target.
            worldMaxBounds.getCenter(constrained.target);
            constrained.target.setLength(unconstrained.target.length());
            constrained.distance /= scale;
        } else {
            // Compute the bounds where the target must be to ensure a top down view remains within
            // the maximum bounds.
            const targetMaxBounds = cache.obox3[0];
            targetMaxBounds.copy(worldMaxBounds as OrientedBox3);
            targetMaxBounds.position.setLength(unconstrained.target.length());
            targetMaxBounds.extents.sub(viewHalfSize);

            // Project unconstrained target to local tangent plane at the max bounds center.
            const rotMatrix = targetMaxBounds.getRotationMatrix(cache.matrix4[0]);
            const localTarget = cache.vector3[1]
                .copy(constrained.target)
                .sub(targetMaxBounds.position)
                .applyMatrix4(cache.matrix4[1].copy(rotMatrix).transpose())
                .setZ(0);

            // Clamp the projected target with the target bounds and check if it changes.
            const constrainedLocalTarget = cache.vector3[2]
                .copy(localTarget)
                .clamp(
                    cache.vector3[3].copy(targetMaxBounds.extents).multiplyScalar(-1),
                    targetMaxBounds.extents
                );
            if (constrainedLocalTarget.equals(localTarget)) {
                return unconstrained;
            }

            // Project the local constrained target back into the sphere.
            constrained.target
                .copy(constrainedLocalTarget)
                .applyMatrix4(rotMatrix)
                .add(targetMaxBounds.position);
            const targetHeightSq = targetMaxBounds.position.lengthSq();
            const constTargetDistSq = constrained.target.distanceToSquared(
                targetMaxBounds.position
            );
            const constTargetDistToGround =
                Math.sqrt(targetHeightSq) - Math.sqrt(targetHeightSq - constTargetDistSq);
            constrained.target.addScaledVector(targetMaxBounds.zAxis, -constTargetDistToGround);

            // Set the constrained target to the same height as the unconstrained one.
            constrained.target.setLength(unconstrained.target.length());
        }

        // Pan camera to constrained target and set constrained distance.
        MapViewUtils.panCameraAroundGlobe(
            mapView,
            cache.vector3[1].copy(constrained.target),
            cache.vector3[2].copy(unconstrained.target)
        );
        camera
            .getWorldDirection(camera.position)
            .multiplyScalar(-constrained.distance)
            .add(constrained.target);
        return constrained;
    }
    /**
     * @internal
     * Computes the target for a given camera and the distance between them.
     * @param projection - The world space projection.
     * @param camera - The camera whose target will be computed.
     * @param elevationProvider - If provided, elevation at the camera position will be used.
     * @returns The target, the distance to it and a boolean flag set to false in case an elevation
     * provider was passed but the elevation was not available yet.
     */
    export function getTargetAndDistance(
        projection: Projection,
        camera: THREE.Camera,
        elevationProvider?: ElevationProvider
    ): { target: THREE.Vector3; distance: number; final: boolean } {
        const cameraPitch = extractAttitude({ projection }, camera).pitch;

        //FIXME: For now we keep the old behaviour when terrain is enabled (i.e. use the camera
        //       height above terrain to deduce the target distance).
        //       This leads to zoomlevel changes while panning. We have to find a proper solution
        //       for terrain (e.g. raycast with the ground surfcae that is elevated by the average
        //       elevation in the scene)
        const elevation = elevationProvider
            ? elevationProvider.getHeight(
                  projection.unprojectPoint(camera.position),
                  TERRAIN_ZOOM_LEVEL
              )
            : undefined;
        const final = !elevationProvider || elevation !== undefined;

        // Even for a tilt of 90° raycastTargetFromCamera is returning some point almost at
        // infinity.
        const target =
            cameraPitch < MAX_TILT_RAD
                ? getWorldTargetFromCamera(camera, projection, elevation)
                : null;
        if (target !== null) {
            const distance = camera.position.distanceTo(target);
            return { target, distance, final };
        } else {
            // We either reached the [[PITCH_LIMIT]] or we did not hit the ground surface.
            // In this case we do the reverse, i.e. compute some fallback distance and
            // use it to compute the tagret point by using the camera direction.
            const groundDistance = projection.groundDistance(camera.position);
            const heightAboveTerrain = Math.max(groundDistance - (elevation ?? 0), 0);

            //For flat projection we fallback to the target distance at 89 degree pitch.
            //For spherical projection we fallback to the tangent line distance
            const distance =
                projection.type === ProjectionType.Planar
                    ? heightAboveTerrain / Math.cos(Math.min(cameraPitch, MAX_TILT_RAD))
                    : Math.sqrt(
                          Math.pow(heightAboveTerrain + EarthConstants.EQUATORIAL_RADIUS, 2) -
                              Math.pow(EarthConstants.EQUATORIAL_RADIUS, 2)
                      );
            const cameraDir = camera.getWorldDirection(cache.vector3[0]);
            cameraDir.multiplyScalar(distance);
            const fallbackTarget = cache.vector3[1];
            fallbackTarget.copy(camera.position).add(cameraDir);
            return { target: fallbackTarget, distance, final };
        }
    }

    /**
     * Returns the {@link @here/harp-geoutils#GeoCoordinates} of the camera,
     * given its target coordinates on the map and its
     * zoom, yaw and pitch.
     *
     * @param targetCoordinates - Coordinates of the center of the view.
     * @param distance - Distance to the target in meters.
     * @param yawDeg - Camera yaw in degrees.
     * @param pitchDeg - Camera pitch in degrees.
     * @param projection - Active MapView, needed to get the camera fov and map projection.
     * @param result - Optional output vector.
     * @returns Camera position in world space.
     */
    export function getCameraPositionFromTargetCoordinates(
        targetCoordinates: GeoCoordinates,
        distance: number,
        yawDeg: number,
        pitchDeg: number,
        projection: Projection,
        result: THREE.Vector3 = new THREE.Vector3()
    ): THREE.Vector3 {
        const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
        const altitude = Math.cos(pitchRad) * distance;
        const yawRad = THREE.MathUtils.degToRad(yawDeg);
        projection.projectPoint(targetCoordinates, result);
        const groundDistance = distance * Math.sin(pitchRad);
        if (projection.type === ProjectionType.Planar) {
            result.x = result.x + Math.sin(yawRad) * groundDistance;
            result.y = result.y - Math.cos(yawRad) * groundDistance;
            result.z = result.z + altitude;
        } else if (projection.type === ProjectionType.Spherical) {
            // In globe yaw and pitch are understood to be in tangent space. The approach below is
            // to find the Z and Y tangent space axes, then rotate Y around Z by the given yaw, and
            // set its new length (groundDistance). Finally the up vector's length is set to the
            // camera height and added to the transformed Y above.

            // Get the Z axis in tangent space: it is the normalized position vector of the target.
            tangentSpace.z.copy(result).normalize();

            // Get the Y axis (north axis in tangent space):
            tangentSpace.y.set(0, 0, 1).projectOnPlane(tangentSpace.z).normalize();

            // Rotate this north axis by the given yaw, giving the camera direction relative to
            // the target.
            cache.quaternions[0].setFromAxisAngle(tangentSpace.z, yawRad - Math.PI);
            tangentSpace.y.applyQuaternion(cache.quaternions[0]);

            // Push the camera to the specified distance.
            tangentSpace.y.setLength(groundDistance);

            // Now get the actual camera position vector: from the target position, add the
            // previous computation to get the projection of the camera on the ground, then add
            // the height of the camera in the tangent space.
            const height = distance * Math.cos(pitchRad);
            result.add(tangentSpace.y).add(tangentSpace.z.setLength(height));

            const a = EarthConstants.EQUATORIAL_RADIUS + altitude;
            const b = Math.sin(pitchRad) * distance;
            const cameraHeight = Math.sqrt(a * a + b * b);
            result.setLength(cameraHeight);
        }

        return result;
    }

    /**
     * @hidden
     * @internal
     *
     * Add offset to geo points for minimal view box in flat projection with tile wrapping.
     *
     * @remarks
     * In flat projection, with wrap around enabled, we should detect clusters of points around that
     * wrap antimeridian.
     *
     * Here, we fit points into minimal geo box taking world wrapping into account.
     */
    export function wrapGeoPointsToScreen(
        points: GeoCoordLike[],
        startPosition?: GeoCoordinates
    ): GeoCoordinates[] {
        let startIndex = 0;
        if (startPosition === undefined) {
            startPosition = GeoCoordinates.fromObject(points[0]);
            startIndex = 1;
        }
        let north = startPosition.latitude;
        let south = startPosition.latitude;
        let lonCenter = MathUtils.normalizeLongitudeDeg(startPosition.longitude);
        let lonSpan = 0;
        let east = startPosition.longitude;
        let west = startPosition.longitude;

        const result: GeoCoordinates[] = [];
        result.push(new GeoCoordinates(north, lonCenter));
        for (let i = startIndex; i < points.length; i++) {
            const p = GeoCoordinates.fromObject(points[i]);
            if (p.latitude > north) {
                north = p.latitude;
            } else if (p.latitude < south) {
                south = p.latitude;
            }

            let longitude = MathUtils.normalizeLongitudeDeg(p.longitude);

            const relToCenter = MathUtils.angleDistanceDeg(lonCenter, longitude);
            longitude = lonCenter - relToCenter;
            if (relToCenter < 0 && -relToCenter > lonSpan / 2) {
                east = Math.max(east, lonCenter - relToCenter);
                lonSpan = east - west;
                lonCenter = (east + west) / 2;
            } else if (relToCenter > 0 && relToCenter > lonSpan / 2) {
                west = Math.min(west, longitude);
                lonSpan = east - west;
                lonCenter = (east + west) / 2;
            }
            result.push(new GeoCoordinates(p.latitude, longitude));
        }
        return result;
    }

    /**
     * @hidden
     * @internal
     *
     * Given `cameraPos`, force all points that lie on non-visible sphere half to be "near" max
     * possible viewable circle from given camera position.
     *
     * @remarks
     * Assumes that shpere projection with world center is in `(0, 0, 0)`.
     */
    export function wrapWorldPointsToView(points: THREE.Vector3[], cameraPos: THREE.Vector3) {
        const cameraPosNormalized = cameraPos.clone().normalize();
        for (const point of points) {
            if (point.angleTo(cameraPos) > Math.PI / 2) {
                // Point is on other side of sphere, we "clamp it to" max possible viewable circle
                // from given camera position

                const pointLen = point.length();

                point.projectOnPlane(cameraPosNormalized).setLength(pointLen);
            }
        }
    }

    /**
     * @hidden
     * @internal
     *
     * Return `GeoPoints` bounding {@link @here/harp-geoutils#GeoBox}
     * applicable for {@link getFitBoundsDistance}.
     *
     * @returns {@link @here/harp-geoutils#GeoCoordinates} set that covers `box`
     */
    export function geoBoxToGeoPoints(box: GeoBox): GeoCoordinates[] {
        const center = box.center;
        return [
            new GeoCoordinates(box.north, box.west),
            new GeoCoordinates(box.north, box.east),
            new GeoCoordinates(center.latitude, box.west),
            new GeoCoordinates(center.latitude, box.east),
            new GeoCoordinates(box.south, box.west),
            new GeoCoordinates(box.south, box.east),
            new GeoCoordinates(box.north, center.longitude),
            new GeoCoordinates(box.south, center.longitude)
        ];
    }

    /**
     * @hidden
     * @internal
     *
     * Get minimal distance required for `camera` looking at `worldTarget` to cover `points`.
     *
     * All dimensions belong to world space.
     *
     * @param points - points which must be in view.
     * @param worldTarget - readonly, world target of {@link MapView}
     * @param camera - readonly, camera with proper `position` and rotation set
     * @returns new distance to camera to be used with {@link (MapView.lookAt:WITH_PARAMS)}
     */
    export function getFitBoundsDistance(
        points: THREE.Vector3[],
        worldTarget: THREE.Vector3,
        camera: THREE.PerspectiveCamera
    ): number {
        // Diagram of the camera space YZ plane with the initial situation. Camera is at C0 and may
        // need to be moved to make point P visible.
        //
        //                camY
        //       targetDist^
        //      |<-------->|     Ps
        //     constD pEyeZ|    /|  ^
        //      |<-->|<--->|   / |  |
        //      |    |     |  /  |  | |ndcY-O.y|*h/2
        //      |    |     | /   |  |
        //  <---T----P'----C0----O  v
        // camZ      |_|  /|     |                              C0  - Initial camera position
        //           |   / |<--->|                              T   - Camera target
        //      PcamY|  /     f                                 P   - Bounds point (world space)
        //           | / (focal length)                         O   - Principal point.
        //           |/                                         h   - viewport height.
        //           P
        //
        // Diagram of camera space YZ plane with the final camera position C1 that leaves P at the
        // edge of the viewport. The new camera distance is the sum of a constant term (constD) and
        // the new distance to P (newPEyeZ), which is the initial distance (pEyeZ) multiplied by a
        // factor that needs to be found.
        //
        //                            camY
        //     constD      newPEyeZ    ^          Ps
        //      |<-->|<--------------->|       _-`|  ^
        //      |    |                 |    _-`   |  | |sign(ndcY)-O.y|h/2
        //      |    |                 | _-`      |  |
        //  <---T----P'----C0----------C1---------O  v
        // camZ      |_|            _-`|          |              C0  - Initial camera position
        //           |           _-`   |<-------->|              C1  - New camera position
        //      PcamY|        _-`           f                    T   - Camera target
        //           |     _-`        (focal length)             P   - Bounds point (world space)
        //           |  _-`                                      Ps  - P projected on screen.
        //           P-`                                         O   - Principal point.
        //                                                       h   - viewport height.
        //
        // P is between target and initial camera position, but calculations are equivalent for
        // points beyond the target (pEyeZ negative) or behind the camera (constD negative).
        // Right triangles PP'C0 and PsOC0 are equivalent, as well as PP'C1 and Ps0C1, that means:
        // |ndcY-O.y|*h/(2*f) = PcamY / |pEyeZ| (1) (ndcY-O.y,pEyeZ may be negative, take abs vals).
        // |sign(ndcY)-O.y|h/(2*f) = PcamY / newPEyeZ (2)
        // Dividing (1) by (2) and solving for newPEyeZ we get:
        // newPEyeZ = | pEyeZ || ndcY - O.y | / |sign(ndcY)-O.y|
        // The target distance to project P at the top/bottom border of the viewport is then:
        // constD + newPEyeZ = targetDist - pEyeZ + |pEyeZ||ndcY-O.y| / |sign(ndcY)-O.y|
        // The target distance to project P at the left/right border of the viewport is similarly:
        // targetDist - pEyeZ + |pEyeZ||ndcX-O.x| / |sign(ndcX)-O.x|
        // Take the largest of both distances to ensure the point is inside the viewport:
        // newDistance = targetDist - pEyeZ +
        // max(| ndcX - O.x | /|sign(ndcX)-O.x|, |ndcY-O.y|/sign(ndcY) - O.y |) *| pEyeZ |

        const targetDist = cache.vector3[0].copy(worldTarget).sub(camera.position).length();
        const ppalPoint = CameraUtils.getPrincipalPoint(camera);
        let newDistance = targetDist;

        const getDistanceFactor = (pointNDC: number, ppNDC: number) => {
            // Use as maximum NDC a value slightly smaller than 1 to ensure the point is visible
            // with the final camera distance. Otherwise any precision loss might leave it just
            // outside of the viewport.
            const maxNDC = 0.99;
            return Math.abs(pointNDC) > 1
                ? Math.abs((pointNDC - ppNDC) / (maxNDC * Math.sign(pointNDC) - ppNDC))
                : 1;
        };
        for (const point of points) {
            const pEyeZ = -cache.vector3[0].copy(point).applyMatrix4(camera.matrixWorldInverse).z;
            const pointNDC = cache.vector3[0].applyMatrix4(camera.projectionMatrix);
            const maxFactor = Math.max(
                getDistanceFactor(pointNDC.x, ppalPoint.x),
                getDistanceFactor(pointNDC.y, ppalPoint.y)
            );
            if (maxFactor > 1) {
                const constDist = targetDist - pEyeZ;
                const newPEyeZ = Math.abs(pEyeZ) * maxFactor + constDist;
                newDistance = Math.max(newDistance, newPEyeZ);
            }
        }
        return newDistance;
    }

    /**
     * @hidden
     * @internal
     *
     * Paremeters for [[getFitBoundsLookAtParams]] function.
     */
    export interface FitPointParams {
        tilt: number;
        heading: number;
        projection: Projection;
        minDistance: number;
        camera: THREE.PerspectiveCamera;
    }

    /**
     * @hidden
     * @internal
     *
     * Get {@link LookAtParams} that fit all `worldPoints`
     * giving that {@link MapView} will target at
     * `geoTarget`.
     *
     * @param geoTarget - desired target (see {@link MapView.target}) as geo point
     * @param worldTarget - same as `geoTarget` but in world space
     * @param worldPoints - points we want to see
     * @param params - other params derived from {@link MapView}.
     */
    export function getFitBoundsLookAtParams(
        geoTarget: GeoCoordinates,
        worldTarget: THREE.Vector3,
        worldPoints: THREE.Vector3[],
        params: FitPointParams
    ) {
        const { tilt, heading, projection } = params;
        const startDistance = params.minDistance;
        const tmpCamera = params.camera.clone() as THREE.PerspectiveCamera;

        getCameraRotationAtTarget(projection, geoTarget, -heading, tilt, tmpCamera.quaternion);
        getCameraPositionFromTargetCoordinates(
            geoTarget,
            startDistance,
            -heading,
            tilt,
            projection,
            tmpCamera.position
        );
        tmpCamera.updateMatrixWorld(true);

        if (projection.type === ProjectionType.Spherical) {
            wrapWorldPointsToView(worldPoints, tmpCamera.position);
        }
        const distance = getFitBoundsDistance(worldPoints, worldTarget, tmpCamera);
        return {
            target: geoTarget,
            distance,
            heading,
            tilt
        };
    }

    /**
     * @deprecated use getCameraPositionFromTargetCoordinates instead
     */
    export function getCameraCoordinatesFromTargetCoordinates(
        targetCoordinates: GeoCoordinates,
        distance: number,
        yawDeg: number,
        pitchDeg: number,
        mapView: MapView
    ): GeoCoordinates {
        return mapView.projection.unprojectPoint(
            getCameraPositionFromTargetCoordinates(
                targetCoordinates,
                distance,
                yawDeg,
                pitchDeg,
                mapView.projection,
                cache.vector3[1]
            )
        );
    }

    /**
     * Casts a ray in NDC space from the current map view and returns the intersection point of that
     * ray wih the map in world space.
     *
     * @param mapView - Instance of MapView.
     * @param pointOnScreenXinNDC - X coordinate in NDC space.
     * @param pointOnScreenYinNDC - Y coordinate in NDC space.
     * @param elevation - Optional param used to offset the ground plane. Used when wanting to pan
     * based on a plane at some altitude. Necessary for example when panning with terrain.
     *
     * @returns Intersection coordinates, or `null` if raycast failed.
     */
    export function rayCastWorldCoordinates(
        mapView: MapView | { camera: THREE.Camera; projection: Projection },
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number,
        elevation?: number
    ): THREE.Vector3 | null {
        const pointInNDCPosition = cache.vector3[0].set(
            pointOnScreenXinNDC,
            pointOnScreenYinNDC,
            0
        );

        mapView.camera.updateMatrixWorld();
        const cameraPos = cache.vector3[1].copy(mapView.camera.position);

        cache.matrix4[0].extractRotation(mapView.camera.matrixWorld);

        // Prepare the unprojection matrix which projects from NDC space to camera space
        // and takes the current rotation of the camera into account.
        cache.matrix4[1].multiplyMatrices(
            cache.matrix4[0],
            cache.matrix4[1].copy(mapView.camera.projectionMatrix).invert()
        );
        // Unproject the point via the unprojection matrix.
        const pointInCameraSpace = pointInNDCPosition.applyMatrix4(cache.matrix4[1]);
        // Use the point in camera space as the vector towards this point.
        rayCaster.set(cameraPos, pointInCameraSpace.normalize());
        if (elevation !== undefined) {
            groundPlane.constant -= elevation;
            groundSphere.radius += elevation;
        }

        const worldPosition = new THREE.Vector3();
        const result =
            mapView.projection.type === ProjectionType.Planar
                ? rayCaster.ray.intersectPlane(groundPlane, worldPosition)
                : rayCaster.ray.intersectSphere(groundSphere, worldPosition);

        if (elevation !== undefined) {
            groundPlane.constant = 0;
            groundSphere.radius = EarthConstants.EQUATORIAL_RADIUS;
        }
        return result;
    }

    /**
     * Pans the camera according to the projection.
     *
     * @param mapView - Instance of MapView.
     * @param xOffset - In world space. Value > 0 will pan the map to the right, value < 0 will pan
     *                  the map to the left in default camera orientation.
     * @param yOffset - In world space. Value > 0 will pan the map upwards, value < 0 will pan the
     *                  map downwards in default camera orientation.
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
     * The function doing a pan in the spherical space
     * when {@link MapView}'s active [[ProjectionType]]
     * is spherical. In other words, the function that rotates the camera around the globe.
     *
     * @param mapView - MapView instance.
     * @param fromWorld - Start vector representing the scene position of a geolocation.
     * @param toWorld - End vector representing the scene position of a geolocation.
     */
    export function panCameraAroundGlobe(
        mapView: MapView,
        fromWorld: THREE.Vector3,
        toWorld: THREE.Vector3
    ) {
        cache.quaternions[0]
            .setFromUnitVectors(fromWorld.normalize(), toWorld.normalize())
            .invert();
        cache.matrix4[0].makeRotationFromQuaternion(cache.quaternions[0]);
        mapView.camera.applyMatrix4(cache.matrix4[0]);
        mapView.camera.updateMatrixWorld();
    }

    /**
     * Rotates the camera by the given delta yaw and delta pitch. The pitch will be clamped to the
     * maximum possible tilt to the new target, and under the horizon in sphere projection.
     *
     * @param mapView - The {@link MapView} instance in use.
     * @param deltaYawDeg - Delta yaw in degrees.
     * @param deltaPitchDeg - Delta pitch in degrees.
     * @param maxTiltAngleRad - Max tilt angle in radians.
     */
    export function rotate(
        mapView: { projection: Projection; camera: THREE.PerspectiveCamera },
        deltaYawDeg: number,
        deltaPitchDeg: number = 0,
        maxTiltAngleRad = Math.PI / 4
    ) {
        // 1. Apply yaw: rotate around the vertical axis.
        mapView.camera.rotateOnWorldAxis(
            mapView.projection.type === ProjectionType.Spherical
                ? cache.vector3[0].copy(mapView.camera.position).normalize()
                : cache.vector3[0].set(0, 0, 1),
            THREE.MathUtils.degToRad(-deltaYawDeg)
        );
        mapView.camera.updateMatrixWorld();

        // 2. Apply pitch: rotate around the camera's local X axis.
        if (deltaPitchDeg === 0) {
            return;
        }
        const pitch = MapViewUtils.extractAttitude(mapView, mapView.camera).pitch;
        // `maxTiltAngle` is equivalent to a `maxPitchAngle` in flat projections.
        let newPitch = THREE.MathUtils.clamp(
            pitch + THREE.MathUtils.degToRad(deltaPitchDeg),
            0,
            maxTiltAngleRad
        );
        // In sphere projection, the value of a maximum pitch is smaller than the value of the
        // maximum tilt, as the curvature of the surface adds up to it.
        if (mapView.projection.type === ProjectionType.Spherical) {
            // Deduce max pitch from max tilt. To this end the sine law of triangles is used below.
            const maxPitch = Math.asin(
                (EarthConstants.EQUATORIAL_RADIUS * Math.sin(Math.PI - maxTiltAngleRad)) /
                    mapView.camera.position.length()
            );
            newPitch = Math.min(newPitch, maxPitch);
        }
        mapView.camera.rotateX(newPitch - pitch);
    }

    /**
     * Computes the rotation of the camera according to yaw and pitch in degrees. The computations
     * hinge on the current `projection` and `target`, because yaw and pitch are defined in
     * tangent space of the target point.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param projection - Current projection.
     * @param target - The camera target.
     * @param yawDeg - Yaw in degrees, counter-clockwise (as opposed to azimuth), starting north.
     * @param pitchDeg - Pitch in degrees.
     */
    export function getCameraRotationAtTarget(
        projection: Projection,
        target: GeoCoordinates,
        yawDeg: number,
        pitchDeg: number,
        result: THREE.Quaternion = new THREE.Quaternion()
    ): THREE.Quaternion {
        const transform = cache.transforms[0];
        projection.localTangentSpace(target, transform);

        cache.matrix4[0].makeBasis(transform.xAxis, transform.yAxis, transform.zAxis);
        result.setFromRotationMatrix(cache.matrix4[0]);

        cache.quaternions[0].setFromAxisAngle(
            cache.vector3[1].set(0, 0, 1),
            THREE.MathUtils.degToRad(yawDeg)
        );
        cache.quaternions[1].setFromAxisAngle(
            cache.vector3[1].set(1, 0, 0),
            THREE.MathUtils.degToRad(pitchDeg)
        );

        result.multiply(cache.quaternions[0]);
        result.multiply(cache.quaternions[1]);
        return result;
    }

    /**
     * Sets the rotation of the camera according to yaw and pitch in degrees. The computations hinge
     * on the current projection and `geoCenter`, because yaw and pitch are defined in tangent
     * space. In particular, `MapView#geoCenter` needs to be set before calling `setRotation`.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param mapView - Instance of MapView.
     * @param yawDeg - Yaw in degrees, counter-clockwise (as opposed to azimuth), starting north.
     * @param pitchDeg - Pitch in degrees.
     */
    export function setRotation(mapView: MapView, yawDeg: number, pitchDeg: number) {
        getCameraRotationAtTarget(
            mapView.projection,
            mapView.geoCenter,
            yawDeg,
            pitchDeg,
            mapView.camera.quaternion
        );
    }

    /**
     * Extracts current camera tilt angle in radians.
     *
     * @param camera - The [[Camera]] in use.
     * @param projection - The {@link @here/harp-geoutils#Projection} used to
     *                     convert between geo and world coordinates.
     *
     * @deprecated Use MapView.tilt
     */
    export function extractCameraTilt(camera: THREE.Camera, projection: Projection): number {
        // For planar projections the camera target point local tangent is the same
        // at every point on the ground (ignoring terrain fluctuations), so we may
        // simply use inverted ground normal for tilt calculation. This simplifies
        // the more generic calculus used for spherical projections.
        if (projection.type === ProjectionType.Planar) {
            const lookAt: THREE.Vector3 = camera.getWorldDirection(cache.vector3[0]).normalize();
            const normal: THREE.Vector3 = projection
                .surfaceNormal(camera.position, cache.vector3[1])
                .negate();
            const cosTheta = lookAt.dot(normal);
            return Math.acos(THREE.MathUtils.clamp(cosTheta, -1, 1));
        } else {
            // Sanity check if new projection type is introduced.
            assert(projection.type === ProjectionType.Spherical);
            const targetGeoCoords = MapViewUtils.getGeoTargetFromCamera(camera, projection);
            // If focus point is lost we then expose maximum allowable tilt value.
            if (targetGeoCoords !== null) {
                return MapViewUtils.extractTiltAngleFromLocation(
                    projection,
                    camera,
                    targetGeoCoords
                );
            } else {
                logger.warn(
                    "MapView camera is pointing in the void, using maxTilt: ",
                    MAX_TILT_RAD
                );
                return MAX_TILT_RAD;
            }
        }
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
     * @param options - Subset of necessary {@link MapView} properties.
     * @param object - The [[THREE.Object3D]] instance to extract the rotations from.
     */
    export function extractAttitude(
        mapView: { projection: Projection },
        object: THREE.Object3D
    ): Attitude {
        // 1. Build the matrix of the tangent space of the object.
        cache.vector3[1].setFromMatrixPosition(object.matrixWorld); // Ensure using world position.
        mapView.projection.localTangentSpace(cache.vector3[1], {
            xAxis: tangentSpace.x,
            yAxis: tangentSpace.y,
            zAxis: tangentSpace.z,
            position: cache.vector3[0]
        });
        cache.matrix4[1].makeBasis(tangentSpace.x, tangentSpace.y, tangentSpace.z);

        // 2. Change the basis of matrixWorld to the tangent space to get the new base axes.
        cache.matrix4[0].copy(cache.matrix4[1]).invert().multiply(object.matrixWorld);
        space.x.setFromMatrixColumn(cache.matrix4[0], 0);
        space.y.setFromMatrixColumn(cache.matrix4[0], 1);
        space.z.setFromMatrixColumn(cache.matrix4[0], 2);

        // 3. Deduce orientation from the base axes.
        let yaw = 0;
        let pitch = 0;
        let roll = 0;

        // Decompose rotation matrix into Z0 X Z1 Euler angles.
        const d = space.z.dot(cache.vector3[1].set(0, 0, 1));
        if (d < 1.0 - Number.EPSILON) {
            if (d > -1.0 + Number.EPSILON) {
                yaw = Math.atan2(space.z.x, -space.z.y);
                pitch = Math.acos(space.z.z);
                roll = Math.atan2(space.x.z, space.y.z);
            } else {
                // Looking bottom-up with space.z.z == -1.0
                yaw = -Math.atan2(-space.y.x, space.x.x);
                pitch = 180;
                roll = 0;
            }
        } else {
            // Looking top-down with space.z.z == 1.0
            yaw = Math.atan2(-space.y.x, space.x.x);
            pitch = 0.0;
            roll = 0.0;
        }

        return {
            yaw,
            pitch,
            roll
        };
    }

    /**
     * Gets the spherical coordinates in radian of the object to the coordinates of `point`.
     *
     * Note: this method can be used to get the direction that an object points to, when `location`
     * is the target of that object, by adding PI to it. Otherwise it only returns the spherical
     * coordinates of `object` in the tangent space of `location`.
     *
     * @param mapView - The {@link MapView} instance to consider.
     * @param object - The object to get the coordinates from.
     * @param location - The reference point.
     */
    export function extractSphericalCoordinatesFromLocation(
        mapView: { projection: Projection },
        object: THREE.Object3D,
        location: GeoCoordinatesLike | Vector3Like
    ): { azimuth: number; tilt: number } {
        // if (projection instanceof MapView) {
        //     logger.warn("Passing MapView to extractSphericalCoordinatesFromLocation is deprecated");
        //     projection = projection.projection;
        // }
        mapView.projection.localTangentSpace(location, {
            xAxis: tangentSpace.x,
            yAxis: tangentSpace.y,
            zAxis: tangentSpace.z,
            position: cache.vector3[0]
        });

        let tilt = 0;
        let azimuth = 0;

        // Get point to object vector in `cache.vector3[1]` and deduce `tilt` from the angle with
        // tangent Z.
        cache.vector3[1].copy(object.position).sub(cache.vector3[0]).normalize();
        if (cache.vector3[1].dot(tangentSpace.z) > 1 - Number.EPSILON) {
            // Top down view: the azimuth of the object would be opposite the yaw, and clockwise.
            azimuth = Math.PI - extractAttitude(mapView, object).yaw;
            // Wrap between -PI and PI.
            azimuth = Math.atan2(Math.sin(azimuth), Math.cos(azimuth));
            tilt = 0;
            return { tilt, azimuth };
        }
        tilt = cache.vector3[1].angleTo(tangentSpace.z);
        // Tilted view: the azimuth is the direction of the object from the origin.
        cache.vector3[1]
            .copy(object.position)
            .sub(cache.vector3[0])
            .projectOnPlane(tangentSpace.z)
            .normalize();
        azimuth = cache.vector3[1].angleTo(tangentSpace.y);
        if (cache.vector3[1].cross(tangentSpace.y).dot(tangentSpace.z) < 0) {
            azimuth = -azimuth;
        }
        return { tilt, azimuth };
    }

    /**
     * Gets the tilt angle (in radians) of the object relative to the coordinates of `location`.
     *
     * Note: this method can be used to get the direction that an object points to, when `location`
     * is the target of that object, by adding PI to it. Otherwise it only returns the tilt angle
     * (in radians) of `object` in the tangent space of `location`.
     *
     * @param projection - The {@link @here/harp-geoutils#Projection} used when
     *                     converting from geo to world coordinates.
     * @param object - The object to get the coordinates from.
     * @param location - The reference point.
     * @param tiltAxis - Optional axis used to define the rotation about which the object's tilt
     * occurs, the direction vector to the location from the camera is projected on the plane with
     * the given angle.
     */
    export function extractTiltAngleFromLocation(
        projection: Projection,
        object: THREE.Object3D,
        location: GeoCoordinates | Vector3Like,
        tiltAxis?: THREE.Vector3
    ): number {
        projection.localTangentSpace(location, {
            xAxis: tangentSpace.x,
            yAxis: tangentSpace.y,
            zAxis: tangentSpace.z,
            position: cache.vector3[0]
        });
        // Get point to object vector (dirVec) and compute the `tilt` as the angle with tangent Z.
        const dirVec = cache.vector3[2].copy(object.position).sub(cache.vector3[0]);
        if (tiltAxis) {
            dirVec.projectOnPlane(tiltAxis);
            tangentSpace.z.projectOnPlane(tiltAxis).normalize();
        }
        const dirLen = dirVec.length();
        if (dirLen < epsilon) {
            logger.error("Can not calculate tilt for the zero length vector!");
            return 0;
        }
        dirVec.divideScalar(dirLen);

        const cosTheta = dirVec.dot(tangentSpace.z);
        if (cosTheta >= 1 - Number.EPSILON) {
            // Top down view.
            return 0;
        }
        return Math.acos(THREE.MathUtils.clamp(cosTheta, -1, 1));
    }

    /**
     * Get perspective camera frustum planes distances.
     * @deprecated
     * @return all plane distances in helper object.
     */
    export function getCameraFrustumPlanes(
        camera: THREE.PerspectiveCamera
    ): { left: number; right: number; top: number; bottom: number; near: number; far: number } {
        const near = camera.near;
        const far = camera.far;
        let top = (near * Math.tan(THREE.MathUtils.degToRad(0.5 * camera.fov))) / camera.zoom;
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
     * Casts a ray in NDC space from the current view of the camera and returns the intersection
     * point of that ray against the map in geo coordinates. The return value can be `null` when
     * the raycast is above the horizon.
     *
     * @param mapView - Instance of MapView.
     * @param pointOnScreenXNDC -  Abscissa in NDC space.
     * @param pointOnScreenYNDC -  Ordinate in NDC space.
     * @returns Intersection geo coordinates, or `null` if raycast is above the horizon.
     */
    export function rayCastGeoCoordinates(
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number
    ): GeoCoordinates | null {
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
     * Calculates and returns the distance from the ground, which is needed to put the camera to
     * this height, to see the size of the area that would be covered by one tile for the given zoom
     * level.
     *
     * @param mapView - Instance of MapView.
     * @param options - Subset of necessary {@link MapView} properties.
     */
    export function calculateDistanceToGroundFromZoomLevel(
        mapView: { projection: Projection; focalLength: number; camera: THREE.PerspectiveCamera },
        zoomLevel: number
    ): number {
        const cameraPitch = extractAttitude(mapView, mapView.camera).pitch;
        const tileSize = EarthConstants.EQUATORIAL_CIRCUMFERENCE / Math.pow(2, zoomLevel);
        return ((mapView.focalLength * tileSize) / 256) * Math.cos(cameraPitch);
    }

    /**
     * Calculates and returns the distance to the target point.
     *
     * @param options - Necessary subset of MapView properties to compute the distance.
     * @param zoomLevel - The zoom level to get the equivalent height to.
     */
    export function calculateDistanceFromZoomLevel(
        options: { focalLength: number },
        zoomLevel: number
    ): number {
        const tileSize = EarthConstants.EQUATORIAL_CIRCUMFERENCE / Math.pow(2, zoomLevel);
        return (options.focalLength * tileSize) / 256;
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
     * @param options - Subset of necessary {@link MapView} properties.
     * @param distance - The distance in meters, which are scene units in {@link MapView}.
     */
    export function calculateZoomLevelFromDistance(
        options: { focalLength: number; minZoomLevel: number; maxZoomLevel: number },
        distance: number
    ): number {
        const tileSize = (256 * distance) / options.focalLength;
        const zoomLevel = THREE.MathUtils.clamp(
            Math.log2(EarthConstants.EQUATORIAL_CIRCUMFERENCE / tileSize),
            options.minZoomLevel,
            options.maxZoomLevel
        );
        return snapToCeilingZoomLevel(zoomLevel);
    }

    /**
     * @deprecated
     * Translates a linear clip-space distance value to the actual value stored in the depth buffer.
     * This is useful as the depth values are not stored in the depth buffer linearly, and this can
     * lead into confusing behavior when not taken into account.
     *
     * @param clipDistance - Distance from the camera in clip space (range: [0, 1]).
     * @param camera - Camera applying the perspective projection.
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
     * @deprecated
     * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
     * [0..cameraFar].
     *
     * @param distance - Distance from the camera (range: [0, 1]).
     * @param camera - Camera applying the perspective projection.
     */
    export function cameraToWorldDistance(distance: number, camera: THREE.Camera): number {
        const perspCam = camera as THREE.PerspectiveCamera;
        return distance * perspCam.far;
    }

    /**
     * @deprecated
     */
    export function calculateVerticalFovByHorizontalFov(hFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(hFov / 2) / aspect);
    }

    /**
     * @deprecated Use {@link CameraUtils.getHorizontalFov}.
     */
    export function calculateHorizontalFovByVerticalFov(vFov: number, aspect: number): number {
        tmpCamera.fov = THREE.MathUtils.radToDeg(vFov);
        tmpCamera.aspect = aspect;
        return CameraUtils.getHorizontalFov(tmpCamera);
    }

    /**
     * @deprecated Use {@link CameraUtils.setVerticalFov}.
     */
    export function calculateFocalLengthByVerticalFov(vFov: number, height: number): number {
        // setVerticalFov takes into account the principal point position to support
        // off-center projections. Keep previous behaviour by passing a camera with centered
        // principal point.
        CameraUtils.setPrincipalPoint(tmpCamera, new THREE.Vector2());
        CameraUtils.setVerticalFov(tmpCamera, vFov, height);
        return CameraUtils.getFocalLength(tmpCamera)!;
    }

    /**
     * @deprecated Use {@link CameraUtils.setFocalLength}.
     */
    export function calculateFovByFocalLength(focalLength: number, height: number): number {
        // setFocalLength takes into account the principal point position to support
        // off-center projections. Keep previous behaviour by passing a camera with centered
        // principal point.
        CameraUtils.setPrincipalPoint(tmpCamera, new THREE.Vector2());
        CameraUtils.setFocalLength(tmpCamera, focalLength, height);
        return tmpCamera.fov;
    }

    /**
     * @deprecated Use {@link CameraUtils.convertWorldToScreenSize}.
     */
    export const calculateScreenSizeByFocalLength = CameraUtils.convertWorldToScreenSize;

    /**
     * @deprecated Use {@link CameraUtils.convertScreenToWorldSize}.
     */
    export const calculateWorldSizeByFocalLength = CameraUtils.convertScreenToWorldSize;

    /**
     * @deprecated
     */
    export const estimateObject3dSize = Object3DUtils.estimateSize;

    /**
     * Check if tiles or other content is currently being loaded.
     *
     * This method can be removed once HARP-7932 is implemented.
     *
     * @returns `true` if MapView has visible tiles or other content that is being loaded.
     */
    export function mapViewIsLoading(mapView: MapView) {
        let numTilesLoading = 0;

        for (const tileList of mapView.visibleTileSet.dataSourceTileList) {
            numTilesLoading += tileList.numTilesLoading;

            for (const tile of tileList.visibleTiles) {
                if (!tile.allGeometryLoaded) {
                    numTilesLoading++;
                }
            }
        }
        let isLoading = numTilesLoading > 0;

        if (mapView.textElementsRenderer !== undefined) {
            isLoading = isLoading || mapView.textElementsRenderer.loading;
        }

        isLoading =
            isLoading ||
            !mapView.poiTableManager.finishedLoading ||
            !mapView.visibleTileSet.allVisibleTilesLoaded;

        return isLoading;
    }

    export function closeToFrustum(
        point: THREE.Vector3,
        camera: THREE.Camera,
        eps: number = 1e-13
    ): boolean {
        const ndcPoint = new THREE.Vector3().copy(point).project(camera);
        if (
            Math.abs(ndcPoint.x) - eps < 1 &&
            Math.abs(ndcPoint.y) - eps < 1 &&
            Math.abs(ndcPoint.z) - eps < 1
        ) {
            return true;
        }
        return false;
    }

    /**
     * @deprecated Use {@link @here/harp-utils#DOMUtils.getBrowserLanguages}
     */
    export const getBrowserLanguages = DOMUtils.getBrowserLanguages;
}

export namespace TileOffsetUtils {
    /**
     * @deprecated Use {@link @here/harp-geoutils#TileKeyUtils.getKeyForTileKeyAndOffset}.
     */
    export const getKeyForTileKeyAndOffset = TileKeyUtils.getKeyForTileKeyAndOffset;

    /**
     * @deprecated Use {@link @here/harp-geoutils#TileKeyUtils.getKeyForTileKeyAndOffset}.
     */
    export const extractOffsetAndMortonKeyFromKey = TileKeyUtils.extractOffsetAndMortonKeyFromKey;

    /**
     * @deprecated Use {@link @here/harp-geoutils#TileKeyUtils.getParentKeyFromKey}.
     */
    export const getParentKeyFromKey = TileKeyUtils.getParentKeyFromKey;
}
