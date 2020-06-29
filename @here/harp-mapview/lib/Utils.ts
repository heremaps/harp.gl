/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    GeoBox,
    GeoCoordinates,
    GeoCoordLike,
    MathUtils,
    Projection,
    ProjectionType,
    TileKey
} from "@here/harp-geoutils";
import { EarthConstants } from "@here/harp-geoutils/lib/projection/EarthConstants";
import { MapMeshBasicMaterial, MapMeshStandardMaterial } from "@here/harp-materials";
import { assert, LoggerManager } from "@here/harp-utils";
import { ElevationProvider } from "./ElevationProvider";
import { LodMesh } from "./geometry/LodMesh";
import { MapView } from "./MapView";
import { getFeatureDataSize, TileFeatureData } from "./Tile";

const logger = LoggerManager.instance.create("MapViewUtils");

// Estimation of the size of an Object3D with all the simple properties, like matrices and flags.
// There may be cases where it is possible to construct Object3Ds with considerable less memory
// consumption, but this value is used to simplify the estimation.
const MINIMUM_OBJECT3D_SIZE_ESTIMATION = 1000;

const MINIMUM_ATTRIBUTE_SIZE_ESTIMATION = 56;

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
    quaternions: [new THREE.Quaternion(), new THREE.Quaternion()],
    vector2: [new THREE.Vector2()],
    vector3: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
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
     * @param mapView - Instance of MapView.
     * @param targetNDCx - Target x position in NDC space.
     * @param targetNDCy - Target y position in NDC space.
     * @param zoomLevel - The desired zoom level.
     * @param maxTiltAngle - The maximum tilt angle to comply by, in globe projection, in radian.
     */
    export function zoomOnTargetPosition(
        mapView: MapView,
        targetNDCx: number,
        targetNDCy: number,
        zoomLevel: number,
        maxTiltAngle: number = MAX_TILT_RAD
    ): boolean {
        const { elevationProvider, camera } = mapView;

        // Use for now elevation at camera position. See getTargetAndDistance.
        const elevation = elevationProvider
            ? elevationProvider.getHeight(
                  mapView.projection.unprojectPoint(camera.position),
                  TERRAIN_ZOOM_LEVEL
              )
            : undefined;

        // Get current target position in world space before we zoom.
        const worldTarget = rayCastWorldCoordinates(mapView, targetNDCx, targetNDCy, elevation);
        const groundDistance = calculateDistanceToGroundFromZoomLevel(mapView, zoomLevel);
        const cameraHeight = groundDistance + (elevation ?? 0);

        if (mapView.geoMaxBounds && worldTarget) {
            const { distance } = constrainTargetAndDistanceToViewBounds(
                worldTarget,
                cameraHeight,
                mapView
            );
            if (distance !== cameraHeight) {
                return false;
            }
        }

        // Set the cameras height according to the given zoom level.
        if (mapView.projection.type === ProjectionType.Planar) {
            camera.position.setZ(cameraHeight);
        } else if (mapView.projection.type === ProjectionType.Spherical) {
            camera.position.setLength(EarthConstants.EQUATORIAL_RADIUS + cameraHeight);
        }

        // In sphere, we may have to also orbit the camera around the position located at the
        // center of the screen, in order to limit the tilt to `maxTiltAngle`, as we change
        // this tilt by changing the camera's height above.
        if (mapView.projection.type === ProjectionType.Spherical) {
            // FIXME: We cannot use mapView.tilt here b/c it does not reflect the latest camera
            // changes.
            // tslint:disable-next-line: deprecation
            const tilt = extractCameraTilt(camera, mapView.projection);
            const deltaTilt = tilt - maxTiltAngle;
            if (deltaTilt > 0) {
                orbitFocusPoint(mapView, 0, deltaTilt, maxTiltAngle);
            }
        }

        // Get new target position after the zoom
        const newWorldTarget = rayCastWorldCoordinates(mapView, targetNDCx, targetNDCy, elevation);
        if (!worldTarget || !newWorldTarget) {
            return true;
        }

        if (mapView.projection.type === ProjectionType.Planar) {
            // Calculate the difference and pan the map to maintain the map relative to the target
            // position.
            worldTarget.sub(newWorldTarget);
            panCameraAboveFlatMap(mapView, worldTarget.x, worldTarget.y);
        } else if (mapView.projection.type === ProjectionType.Spherical) {
            panCameraAroundGlobe(mapView, worldTarget, newWorldTarget);
        }
        return true;
    }

    /**
     * Orbits the camera around the focus point of the camera.
     *
     * @param mapView - The {@link MapView} instance to manipulate.
     * @param deltaAzimuthDeg - Delta azimuth in degrees.
     * @param deltaTiltDeg - Delta tilt in degrees.
     * @param maxTiltAngleRad - The maximum tilt between the camera and its target in radian.
     */
    export function orbitFocusPoint(
        mapView: MapView,
        deltaAzimuthDeg: number,
        deltaTiltDeg: number,
        maxTiltAngleRad = MAX_TILT_RAD
    ) {
        const target = mapView.target;
        const sphericalCoordinates = extractSphericalCoordinatesFromLocation(
            mapView,
            mapView.camera,
            target
        );
        const tilt = Math.max(
            Math.min(
                THREE.MathUtils.radToDeg(maxTiltAngleRad),
                deltaTiltDeg + THREE.MathUtils.radToDeg(sphericalCoordinates.tilt)
            ),
            0
        );
        const heading =
            THREE.MathUtils.radToDeg(sphericalCoordinates.azimuth + Math.PI) + deltaAzimuthDeg;
        mapView.lookAt({
            target,
            distance: mapView.targetDistance,
            tilt,
            heading
        });
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
        // tslint:disable-next-line: deprecation
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
     * Returns the height of the camera above the earths surface.
     *
     * If there is an ElevationProvider, this is used. Otherwise the projection is used to determine
     * how high the camera is above the surface.
     *
     * @param level - Which level to request the surface height from.
     * @return Height in world units.
     */
    function getHeightAboveTerrain(
        location: THREE.Vector3,
        projection: Projection,
        elevationProvider?: ElevationProvider,
        level?: number
    ): number {
        if (elevationProvider !== undefined) {
            const geoLocation = projection.unprojectPoint(location);
            const heightAboveTerrain = elevationProvider.getHeight(geoLocation, level);
            if (heightAboveTerrain !== undefined) {
                const height = projection.unprojectAltitude(location) - heightAboveTerrain;
                return Math.max(height, 1);
            }
        }
        return Math.abs(projection.groundDistance(location));
    }

    /**
     * Constrains given camera target and distance to {@link MapView.maxBounds}. The resulting
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
        const worldMaxBounds = mapView.worldMaxBounds as THREE.Box3;
        const camera = mapView.camera;
        const projection = mapView.projection;

        if (!worldMaxBounds || projection.type === ProjectionType.Spherical) {
            return unconstrained;
        }

        const boundsSize = worldMaxBounds.getSize(cache.vector3[0]);
        const screenSize = mapView.renderer.getSize(cache.vector2[0]);
        const viewHeight = calculateWorldSizeByFocalLength(
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

        if (scale > 1) {
            constrained.distance /= scale;
            camera
                .getWorldDirection(camera.position)
                .multiplyScalar(-constrained.distance)
                .add(worldMaxBounds.getCenter(constrained.target));
        } else {
            const targetBounds = cache.box3[0]
                .copy(worldMaxBounds)
                .expandByVector(viewHalfSize.multiplyScalar(-1));
            targetBounds.clampPoint(unconstrained.target, constrained.target);
            if (constrained.target.equals(unconstrained.target)) {
                return unconstrained;
            }
            camera.position.x += constrained.target.x - unconstrained.target.x;
            camera.position.y += constrained.target.y - unconstrained.target.y;
        }
        camera.updateMatrixWorld(true);
        return constrained;
    }
    /**
     * @internal
     * @deprecated This method will be moved to MapView.
     */
    export function getTargetAndDistance(
        projection: Projection,
        camera: THREE.Camera,
        elevationProvider?: ElevationProvider
    ): { target: THREE.Vector3; distance: number } {
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

        // Even for a tilt of 90° raycastTargetFromCamera is returning some point almost at
        // infinity.
        const target =
            cameraPitch < MAX_TILT_RAD
                ? // tslint:disable-next-line: deprecation
                  getWorldTargetFromCamera(camera, projection, elevation)
                : null;
        if (target !== null) {
            const distance = camera.position.distanceTo(target);
            return { target, distance };
        } else {
            // We either reached the [[PITCH_LIMIT]] or we did not hit the ground surface.
            // In this case we do the reverse, i.e. compute some fallback distance and
            // use it to compute the tagret point by using the camera direction.
            const cameraPosZ = getHeightAboveTerrain(
                camera.position,
                projection,
                elevationProvider,
                TERRAIN_ZOOM_LEVEL
            );

            //For flat projection we fallback to the target distance at 89 degree pitch.
            //For spherical projection we fallback to the tangent line distance
            const distance =
                projection.type === ProjectionType.Planar
                    ? cameraPosZ / Math.cos(Math.min(cameraPitch, MAX_TILT_RAD))
                    : Math.sqrt(
                          Math.pow(cameraPosZ + EarthConstants.EQUATORIAL_RADIUS, 2) -
                              Math.pow(EarthConstants.EQUATORIAL_RADIUS, 2)
                      );
            const cameraDir = camera.getWorldDirection(cache.vector3[0]);
            cameraDir.multiplyScalar(distance);
            const fallbackTarget = cache.vector3[1];
            fallbackTarget.copy(camera.position).add(cameraDir);
            return { target: fallbackTarget, distance };
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
            tangentSpace.y
                .set(0, 0, 1)
                .projectOnPlane(tangentSpace.z)
                .normalize();

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
     * Return [[GeoPoints]] bounding {@link @here/harp-geoutils#GeoBox}
     * applicable for [[getFitBoundsDistance]].
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
     * @param points - points which shall are to be covered by view
     *
     * @param worldTarget - readonly, world target of {@link MapView}
     * @param camera - readonly, camera with proper `position` and rotation set
     * @returns new distance to camera to be used with {@link (MapView.lookAt:WITH_PARAMS)}
     */
    export function getFitBoundsDistance(
        points: THREE.Vector3[],
        worldTarget: THREE.Vector3,
        camera: THREE.PerspectiveCamera
    ): number {
        const cameraRotationMatrix = new THREE.Matrix4();
        cameraRotationMatrix.extractRotation(camera.matrixWorld);
        const screenUpVector = new THREE.Vector3(0, 1, 0).applyMatrix4(cameraRotationMatrix);
        const screenSideVector = new THREE.Vector3(1, 0, 0).applyMatrix4(cameraRotationMatrix);
        const screenVertMidPlane = new THREE.Plane().setFromCoplanarPoints(
            camera.position,
            worldTarget,
            worldTarget.clone().add(screenUpVector)
        );
        const screenHorzMidPlane = new THREE.Plane().setFromCoplanarPoints(
            camera.position,
            worldTarget,
            worldTarget.clone().add(screenSideVector)
        );

        const cameraPos = cache.vector3[0];
        cameraPos.copy(camera.position);

        const halfVertFov = THREE.MathUtils.degToRad(camera.fov / 2);
        const halfHorzFov = THREE.MathUtils.degToRad((camera.fov / 2) * camera.aspect);

        // tan(fov/2)
        const halfVertFovTan = 1 / Math.tan(halfVertFov);
        const halfHorzFovTan = 1 / Math.tan(halfHorzFov);

        const cameraToTarget = cache.vector3[1];
        cameraToTarget
            .copy(cameraPos)
            .sub(worldTarget)
            .negate();

        const cameraToTargetNormalized = new THREE.Vector3().copy(cameraToTarget).normalize();

        const offsetVector = new THREE.Vector3();

        const cameraToPointOnRefPlane = new THREE.Vector3();
        const pointOnRefPlane = new THREE.Vector3();

        function checkAngle(
            point: THREE.Vector3,
            referencePlane: THREE.Plane,
            maxAngle: number,
            fovFactor: number
        ) {
            referencePlane.projectPoint(point, pointOnRefPlane);
            cameraToPointOnRefPlane
                .copy(cameraPos)
                .sub(pointOnRefPlane)
                .negate();

            const viewAngle = cameraToTarget.angleTo(cameraToPointOnRefPlane);

            if (viewAngle <= maxAngle) {
                return;
            }

            const cameraToPointLen = cameraToPointOnRefPlane.length();
            const cameraToTargetLen = cameraToTarget.length();

            const newCameraDistance =
                cameraToPointLen * (Math.sin(viewAngle) * fovFactor - Math.cos(viewAngle)) +
                cameraToTargetLen;

            offsetVector
                .copy(cameraToTargetNormalized)
                .multiplyScalar(cameraToTargetLen - newCameraDistance);

            cameraPos.add(offsetVector);
            cameraToTarget.sub(offsetVector);
        }

        for (const point of points) {
            checkAngle(point, screenVertMidPlane, halfVertFov, halfVertFovTan);
            checkAngle(point, screenHorzMidPlane, halfHorzFov, halfHorzFovTan);
        }

        return cameraToTarget.length();
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
        const tmpCamera = params.camera.clone();

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
        mapView: MapView,
        pointOnScreenXinNDC: number,
        pointOnScreenYinNDC: number,
        elevation?: number
    ): THREE.Vector3 | null {
        const pointInNDCPosition = cache.vector3[0].set(
            pointOnScreenXinNDC,
            pointOnScreenYinNDC,
            0
        );
        const cameraPos = cache.vector3[1].copy(mapView.camera.position);

        cache.matrix4[0].extractRotation(mapView.camera.matrixWorld);

        // Prepare the unprojection matrix which projects from NDC space to camera space
        // and takes the current rotation of the camera into account.
        cache.matrix4[1].multiplyMatrices(
            cache.matrix4[0],
            cache.matrix4[1].getInverse(mapView.camera.projectionMatrix)
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
            .inverse();
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
        mapView: MapView,
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
            // tslint:disable-next-line: deprecation
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
        options: { projection: Projection },
        object: THREE.Object3D
    ): Attitude {
        // 1. Build the matrix of the tangent space of the object.
        cache.vector3[1].setFromMatrixPosition(object.matrixWorld); // Ensure using world position.
        options.projection.localTangentSpace(options.projection.unprojectPoint(cache.vector3[1]), {
            xAxis: tangentSpace.x,
            yAxis: tangentSpace.y,
            zAxis: tangentSpace.z,
            position: cache.vector3[0]
        });
        cache.matrix4[1].makeBasis(tangentSpace.x, tangentSpace.y, tangentSpace.z);

        // 2. Change the basis of matrixWorld to the tangent space to get the new base axes.
        cache.matrix4[0].getInverse(cache.matrix4[1]).multiply(object.matrixWorld);
        space.x.setFromMatrixColumn(cache.matrix4[0], 0);
        space.y.setFromMatrixColumn(cache.matrix4[0], 1);
        space.z.setFromMatrixColumn(cache.matrix4[0], 2);

        // 3. Deduce orientation from the base axes.
        let yaw = 0;
        let pitch = 0;
        let roll = 0;

        // Decompose rotation matrix into Z0 X Z1 Euler angles.
        const d = space.z.dot(cache.vector3[1].set(0, 0, 1));
        if (d < 1.0 - epsilon) {
            if (d > -1.0 + epsilon) {
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
        mapView: MapView,
        object: THREE.Object3D,
        location: GeoCoordinates
    ): { azimuth: number; tilt: number } {
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
        cache.vector3[1]
            .copy(object.position)
            .sub(cache.vector3[0])
            .normalize();
        if (cache.vector3[1].dot(tangentSpace.z) > 1 - epsilon) {
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
     */
    export function extractTiltAngleFromLocation(
        projection: Projection,
        object: THREE.Object3D,
        location: GeoCoordinates
    ): number {
        projection.localTangentSpace(location, {
            xAxis: tangentSpace.x,
            yAxis: tangentSpace.y,
            zAxis: tangentSpace.z,
            position: cache.vector3[0]
        });

        // Get point to object vector (dirVec) and compute the `tilt` as the angle with tangent Z.
        const dirVec = cache.vector3[1].copy(object.position).sub(cache.vector3[0]);
        const dirLen = dirVec.length();
        if (dirLen < epsilon) {
            logger.error("Can not calculate tilt for the zero length vector!");
            return 0;
        }
        dirVec.divideScalar(dirLen);

        const cosTheta = dirVec.dot(tangentSpace.z);
        if (cosTheta > 1 - epsilon) {
            // Top down view.
            return 0;
        }
        return Math.acos(THREE.MathUtils.clamp(cosTheta, -1, 1));
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
        options: { projection: Projection; focalLength: number; camera: THREE.Object3D },
        zoomLevel: number
    ): number {
        const cameraPitch = extractAttitude(options, options.camera).pitch;
        const tileSize = EarthConstants.EQUATORIAL_CIRCUMFERENCE / Math.pow(2, zoomLevel);
        return ((options.focalLength * tileSize) / 256) * Math.cos(cameraPitch);
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
     * Calculates vertical field of view for given horizontal field of vision and aspect ratio.
     *
     * @param hFov - Horizontal field of view in rad.
     * @param aspect - Aspect ratio.
     */
    export function calculateVerticalFovByHorizontalFov(hFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(hFov / 2) / aspect);
    }

    /**
     * Calculates horizontal field of view for given vertical field of vision and aspect ratio.
     *
     * @param hFov - Vertical field of view in rad.
     * @param aspect - Aspect ratio.
     */
    export function calculateHorizontalFovByVerticalFov(vFov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    }

    /**
     * Calculates the focal length based on the vertical FOV and height.
     *
     * @param vFov - Vertical field of view in rad.
     * @param height - Height of canvas in pixels.
     */
    export function calculateFocalLengthByVerticalFov(vFov: number, height: number): number {
        return height / 2 / Math.tan(vFov / 2);
    }

    /**
     * Calculates the vertical field of view based on the focal length and the height.
     *
     * @param focalLength - Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param height - Height of canvas in pixels.
     */
    export function calculateFovByFocalLength(focalLength: number, height: number): number {
        return THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / focalLength));
    }

    /**
     * Calculates object's screen size based on the focal length and it's camera distance.
     *
     * @param focalLength - Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param distance - Object distance in world space.
     * @param worldSize - Object size in world space.
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
     * @param focalLength - Focal length in pixels (see [[calculateFocalLengthByVerticalFov]])
     * @param distance - Object distance in world space.
     * @param screenSize - Object size in screen space.
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
     * @param object - The mesh object to evaluate
     * @param size - The {@link MemoryUsage} to update.
     * @param visitedObjects - Optional map to store large objects that could be shared.
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
                if (tile.tileLoader !== undefined && !tile.tileLoader.isFinished) {
                    numTilesLoading++;
                }
                if (tile.tileGeometryLoader !== undefined && !tile.tileGeometryLoader.isFinished) {
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

    function estimateTextureSize(
        texture: THREE.Texture | null,
        objectSize: MemoryUsage,
        visitedObjects: Map<string, boolean>
    ): void {
        if (texture === null || texture === undefined || texture.image === undefined) {
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
            attribute.uuid = THREE.MathUtils.generateUUID();
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

            // Cast to LodMesh class which contains the minimal required properties sub-set.
            const mesh = object as LodMesh;

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
            if (mesh.geometries !== undefined) {
                for (const geometry of mesh.geometries) {
                    estimateGeometrySize(geometry, objectSize, visitedObjects);
                }
            } else if (mesh.geometry !== undefined) {
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
     * @param tileKey - The unique {@link @here/harp-geoutils#TileKey}
     *                  from which to compute the unique key.
     * @param offset - How much the given {@link @here/harp-geoutils#TileKey} is offset
     * @param bitshift - How much space we have to store the offset. The default of 4 means we have
     *      enough space to store 16 unique tiles in a single view.
     */
    export function getKeyForTileKeyAndOffset(
        tileKey: TileKey,
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
     * @param key - Key to extract offset and morton key.
     * @param bitshift - How many bits to shift by, must be the same as was used when creating the
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
     * @param calculatedKey - Key to decompose
     * @param bitshift - Bit shift used to create the key
     */
    export function getParentKeyFromKey(calculatedKey: number, bitshift: number = 4) {
        const { offset, mortonCode } = extractOffsetAndMortonKeyFromKey(calculatedKey, bitshift);
        const parentTileKey = TileKey.fromMortonCode(TileKey.parentMortonCode(mortonCode));
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
     * @param offset - Offset to pack into the high bits.
     * @param offsetBits - How many bits to use to pack the offset.
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
