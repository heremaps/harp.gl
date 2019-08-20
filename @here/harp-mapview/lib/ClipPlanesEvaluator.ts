/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, MathUtils, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";

const epsilon = 0.000001;

export interface ClipPlanesEvaluator {
    /**
     * Compute near and far clipping planes distance.
     *
     * Evaluation method should be called on every frame  and camera clip planes updated.
     * This is related to evaluator implementation and its input data, that may suddenly change
     * such as camera position or angle, projection type or so.
     * Some evaluators may not depend on all or even any of input objects, but to preserve
     * compatibility with any evaluator type it is strongly reccomended to update on every frame.
     * @param camera The [[THREE.Camera]] object used in scene which clipping planes are evaluated.
     * @param projection The current [[Projection]] method.
     * @note Camera clipping planes aren't automatically updated via #evaluateClipPlanes()
     * call, user should do it manually if needed.
     */
    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): { near: number; far: number };
}

/**
 * Simplest camera clip planes evaluator, interpolates near and far planes based on ground distance.
 *
 * At general ground distance to camera along the surface normal is used as reference point for
 * planes evaluation, where near plane distance is set as fraction of this distance refered as
 * [[nearMultiplier]]. Far plane equation has its own multiplier - [[nearFarMultiplier]],
 * which is applied to near plane and offset finally applied.
 * This evaluator supports both planar and spherical projections, although it's behaviour is
 * slightly different in each case. General algorithm sets near plane between camera and
 * ground level, while far plane is just calculated using scale and bias approach with far offset
 * and multiplier.
 * @deprecated Class contains the legacy (first and original) clip planes evaluation method, which
 * is widelly used in examples.
 */
export class InterpolatedClipPlanesEvaluator implements ClipPlanesEvaluator {
    readonly farMin: number;

    protected m_tmpVectors: THREE.Vector3[] = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ];
    protected m_tmpQuaternion: THREE.Quaternion = new THREE.Quaternion();

    constructor(
        readonly nearMin: number = 0.1,
        readonly nearMultiplier: number = 0.1,
        readonly nearFarMultiplier = 50.0,
        readonly farOffset = 200.0
    ) {
        assert(nearMin > 0);
        assert(nearFarMultiplier >= 0);
        assert(farOffset >= 0);
        this.farMin = nearMin * nearFarMultiplier + farOffset;
    }

    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        let nearPlane: number = this.nearMin;
        let farPlane: number = this.farMin;
        if (projection.type === ProjectionType.Spherical) {
            // near and far plane for a set up where
            // the camera is looking at the center of the scene.
            const r = EarthConstants.EQUATORIAL_RADIUS;
            const d = camera.position.length();
            const alpha = Math.asin(r / d);
            // Extract X, Y, Z axes into tmp vectors array.
            camera.matrixWorld.extractBasis(
                this.m_tmpVectors[0],
                this.m_tmpVectors[1],
                this.m_tmpVectors[2]
            );
            // Setup quaternion based on X axis.
            this.m_tmpQuaternion.setFromAxisAngle(this.m_tmpVectors[0], alpha);
            // Aquire forward vector based on Z axis reversed (keep it in tmpVectors[2]).
            const fwd = this.m_tmpVectors[2].negate();
            // Apply quaternion rotation to forward vector, store it in tmpVectors[1].
            const fwdRot = this.m_tmpVectors[1].copy(fwd).applyQuaternion(this.m_tmpQuaternion);
            // Store camera position tmpVectors[0] and reference it with p.
            const p = this.m_tmpVectors[0].copy(camera.position);
            p.addScaledVector(fwdRot, Math.sqrt(d * d - r * r));
            farPlane = p.sub(camera.position).dot(fwd);
            const bias = 2000; // TODO: generalize.
            nearPlane = Math.max(this.nearMin, projection.groundDistance(camera.position) - bias);
        } else {
            const groundDistance = projection.groundDistance(camera.position);
            nearPlane = Math.max(this.nearMin, groundDistance * this.nearMultiplier);
            // Will be already clamped to minFar due to clamping above.
            farPlane = nearPlane * this.nearFarMultiplier + this.farOffset;
        }
        return { near: nearPlane, far: farPlane };
    }
}

/**
 * Simple camera clip planes evaluator that computes near plance based on camera to ground distance.
 *
 * This evaluator supports both planar and spherical projections, although it behaviour is
 * slightly different in each case. General algorithm sets near plane and far plane close
 * to ground level, but taking into account some predefined margins.
 * @note This simple evaluator does behave correctly when camera is always pointing downwards the
 * ground surface (top view) along surface normal, but does not preserve correct planes when using
 * modifying camera pitch (tilt) angle. Suitable only top view camera modes.
 */
export class AltitudeBasedClipPlanesEvaluator implements ClipPlanesEvaluator {
    /**
     * Gives fast look up for ground normal in case of planar projections.
     */
    protected static readonly GROUND_NORMAL_INV_PLANAR_PROJ = new THREE.Vector3(0, 0, -1);

    /**
     * Helper for reducing number of objects created at runtime.
     */
    protected m_tmpVectors: THREE.Vector3[] = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ];
    /**
     * Helper object for reducing performance impact.
     */
    protected m_tmpQuaternion: THREE.Quaternion = new THREE.Quaternion();

    /**
     * Allows to setup near/far offsets (margins) from the ground as also minimum near value.
     * All c-tor parameters should take positive numbers or zeros (with exception of [[nearMin]]
     * which can not be zero).
     * It is stronlgy recommended to set some reasonable margins/offset for near and far planes
     * from ground surface to avoid flickering.
     * @note [[nearFarMaxRatio]] does not limit far plane when spherical projection is in use,
     * the algorithm used there estimates distance to point on tangent where line from camera
     * touches the sphere horizont and there is no reason to clamp it.
     * @note Keep in mind that this evaluator does not take terrain (or building) elevation into
     * account, to keep such features rendered (between frustum planes) use [[nearMargin]],
     * [[farMargin]].
     * @param nearMargin defines near plane offset from the ground in the surface normal direction.
     * @param farMargin defines far plane offset from the ground surface, looking downwards.
     * @param nearMin minimum allowable near plance distance from camera.
     * @param farMaxRatio maximum ratio between ground and far plane distance, allows to limit
     * viewing distance at overall.
     * @note You may treat [[nearMargin]] and [[farMargin]] parameters as the maximum and minimum
     * renderable elevation respectivelly along the surface normal, when camera is constantly
     * looking downwards (top-down view). If you need [[ClipPlanesEvaluator]] for cameras that
     * support tilt or yaw please use [[TiltBasedClipPlanesEvaluator]].
     */
    constructor(
        protected nearMargin: number = 200,
        protected farMargin: number = 50,
        readonly nearMin: number = 0.1,
        readonly farMaxRatio = 8.0
    ) {
        assert(nearMargin >= 0);
        assert(farMargin >= 0);
        assert(nearMin > 0);
        assert(farMaxRatio > 1.0);
    }

    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        const clipPlanes =
            projection.type !== ProjectionType.Spherical
                ? this.evaluateDistancePlanarProj(camera, projection)
                : this.evaluateDistanceSphericalProj(camera, projection);

        return clipPlanes;
    }

    /**
     * Set maximum elevation to be rendered (intersects frustum) above the sea level.
     * @param elevation the elevation (altitude) value in world units (meters).
     * @note Reasonable values are in between (0, MtEverestHeight>, where the second is
     * defined in [[EarthConstant.MAX_ELEVATION]]
     */
    set maxElevation(elevation: number) {
        assert(elevation >= 0);
        this.nearMargin = elevation;
    }

    /**
     * Get maximum elevation to be covered by camera frustum.
     */
    get maxElevation(): number {
        return this.nearMargin;
    }

    /**
     * Set minimum elevation beneth the sea level to be rendered.
     * @param elevation the minimum elevation in world units (meters), should be greater then 0.
     * @note If you set this parameter to zero you may not see any features rendered if they are
     * just at or below the sea level. Reasonable values are between (0, DeadSeaLevel>, where the
     * second is the lowest depression on the earth defined in [[EarthConstants.MIN_ELEVATION]]
     */
    set minElevation(elevation: number) {
        assert(elevation >= 0);
        this.farMargin = elevation;
    }

    /**
     * Get minimum elevation to be covered by camera frustum.
     */
    get minElevation(): number {
        return this.farMargin;
    }

    /**
     * Calculate camera altitute (closest distance) to ground level in world units.
     * @param camera
     * @param projection
     */
    protected getCameraAltitude(camera: THREE.Camera, projection: Projection): number {
        return projection.groundDistance(camera.position);
    }

    private evaluateDistancePlanarProj(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        assert(projection.type !== ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin * this.farMaxRatio;

        // Calculate distance to closest point on the ground.
        const groundDistance = this.getCameraAltitude(camera, projection);
        // We could at least try to keep margins along the eye vector (center of the view) in
        // tact with pitch angle changes, but this does not solve all tilt angle problems,
        // rather use more sophisticated evaluator.
        nearPlane = groundDistance - this.maxElevation;
        farPlane = groundDistance + this.minElevation;

        // Apply the constraints.
        nearPlane = Math.max(nearPlane, this.nearMin);
        farPlane = Math.min(farPlane, groundDistance * this.farMaxRatio);

        return { near: nearPlane, far: farPlane };
    }

    private evaluateDistanceSphericalProj(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        assert(projection.type === ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin * this.farMaxRatio;

        // This solution computes near and far plane for a set up where
        // the camera is looking at the center of the scene.

        //         , - ~ ~ ~ - ,
        //     , '               ' ,        E
        //   ,           .           ,    . ' far + elev
        //  ,            .   r + e   , '   /
        // ,             .     ,  '    ,  /
        // ,             . O '         , / te
        // ,             | .           ,/
        //  ,            |   .  r     ,/
        //   ,           |      .    ,
        //     ,         |        , '_____ far
        //       ' -_, _ | _ ,  ' / T
        //     near      |      /
        //               |    / t
        //             d |  /
        //               |/
        //               C

        // The near plane calculus is quite straight forward and works the same as for planar
        // projections. We simply search for the closest point of the ground just above
        // the camera, then we apply margin to it along the sphere surface normal:
        const cameraAltitude = this.getCameraAltitude(camera, projection);
        nearPlane = cameraAltitude - this.maxElevation;

        // The far plane distance calculus requires finding the sphere tangent line that is
        // co-linear with (goes thru) camera position, such tangent creates right angle
        // with sphere diameter where it touches its surface (point T). Given that sphere is
        // always at world orgin and camera orbits around it we have:
        // angle(OTC) = 90
        // sin(OCT) = sin(alpha) = r / d
        // alpha = asin(r / d)
        const r = EarthConstants.EQUATORIAL_RADIUS;
        let d = camera.position.length();
        d = d === 0 ? epsilon : d;
        const alpha = Math.asin(r / d);
        // The distance to tangent point may be described as:
        // t = sqrt(d^2 - r^2)
        const t = Math.sqrt(d * d - r * r);
        // Because we would like to see elevated geometry that may be visible beyond the tangent
        // point on ground surface, we need to extend viewing distance along the tangent line
        // by te (see graph above). Knowing that OTE forms right angle, we have:
        // (r+e)^2 = r^2 + te^2
        // te = sqrt((r+e)^2 - r^2)
        // This reduces to:
        // te = sqrt(r^2 + 2*r*e + e^2 - r^2)
        // te = sqrt(2*r*e + e^2)
        const te = Math.sqrt(2 * r * this.maxElevation + this.maxElevation * this.maxElevation);

        // Next step is to project CT vector onto camera eye (forward) vector to get maximum
        // camera far plane distance. Point on sphere beyond that point won't be visible anyway
        // unless they are above the ground surface. For such cases [[this.maxElevation]] applies,
        // thus we project entire CE vector, of lenght: t + te.

        // Extract camera X, Y, Z orientation axes into tmp vectors array.
        camera.matrixWorld.extractBasis(
            this.m_tmpVectors[0],
            this.m_tmpVectors[1],
            this.m_tmpVectors[2]
        );
        // Setup quaternion (based on X axis) for angle between tangent and camera eye.
        this.m_tmpQuaternion.setFromAxisAngle(this.m_tmpVectors[0], alpha);
        // Aquire camera (eye) forward vector from Z axis reversed (keep it in tmpVectors[2]).
        const cameraFwdVec = this.m_tmpVectors[2].negate();
        // Apply quaternion to forward vector, creating tangent vector (store in tmpVectors[1]).
        const tangentVec = this.m_tmpVectors[1]
            .copy(cameraFwdVec)
            .applyQuaternion(this.m_tmpQuaternion);
        // Give it a proper length
        tangentVec.multiplyScalar(t + te);
        // Calculate tanget projection onto camera eye vector, giving far plane distance.
        farPlane = tangentVec.dot(cameraFwdVec);

        // Apply the constraints.
        nearPlane = Math.max(nearPlane, this.nearMin);
        // In extreme cases the largest depression assumed may be further then tangent
        // based far plane distance, take it into account
        farPlane = Math.max(farPlane, cameraAltitude + this.minElevation);

        return { near: nearPlane, far: farPlane };
    }
}

/**
 * Evaluates camera clipping planes taking into account ground distance and camera angles.
 *
 * This evaluator provides support for camera with varying tilt (pitch) angle, the angle
 * between camera __look at__ vector and the ground surface normal.
 */
export class TiltBasedClipPlanesEvaluator extends AltitudeBasedClipPlanesEvaluator {
    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        // Tilt angle and frustum volume will be taken into consideration only for non-spherical
        // projections, otherwise take super class values.
        if (projection.type !== ProjectionType.Spherical) {
            const clipPlanes = { near: 0.0, far: 0.0 };
            const cameraTilt = this.getCameraTiltAngle(camera, projection);
            const lookAtDist = this.getCameraLookAtDistance(camera, projection);
            // Generally near/far planes are set to keep look at distance, then
            // margins are applied. Here margins (min/max elevations) are meant to be
            // defined as distance along the ground normal vector thus during camera
            // tilt they need to be projected on the eye vector:
            // actualMargin = margin / groundNormal.dot(eyeVec)
            // Assuming that tilt angle defined relative to actual ground normal, we have:
            let cameraEyeDotGround = Math.cos(cameraTilt);
            cameraEyeDotGround = cameraEyeDotGround === 0 ? epsilon : cameraEyeDotGround;
            clipPlanes.near = lookAtDist - this.maxElevation / cameraEyeDotGround;
            clipPlanes.far = lookAtDist + this.minElevation / cameraEyeDotGround;

            // Correct cliping planse distance for the top/bottom frustum planes (edges).
            // If we deal with perspective camera type, this step would not be required
            // for orthographic projections.
            if (camera.type === "PerspectiveCamera") {
                const frustumGroundProj = this.getFrustumGroundIntersectionDist(
                    camera as THREE.PerspectiveCamera,
                    projection
                );
                // Looking on the graph presented in getFrustumGroundIntersectionDist() method
                // we may, calculate far plane extension required in order to preserve look at
                // based distance at any tilt angle for frustum edges, the formulas are
                // presented below:
                // cos(90 - tilt) = farPlaneExt / frustumIntersectTop
                // farPlaneExt = cos(90 - tilt) * frustumIntersectTop
                const tiltAngleRestCos = Math.cos(Math.PI / 2 - cameraTilt);
                clipPlanes.far += frustumGroundProj.top * tiltAngleRestCos;
                // Similar formulas may be derived for near plane distance:
                // cos(90 - tilt) = nearPlaneExt / frustumIntersectBottom
                // nearPlaneExt = frustumIntersectBottom * cos(90 - tilt)
                clipPlanes.near -= frustumGroundProj.bottom * tiltAngleRestCos;
            }
            // Clamp values to constraints.
            clipPlanes.near = Math.max(clipPlanes.near, this.nearMin);
            clipPlanes.far = Math.min(clipPlanes.far, lookAtDist * this.farMaxRatio);
            return clipPlanes;
        } else {
            const clipPlanes = { near: 0.0, far: 0.0 };

            // Near plance calculus is pretty straightforward and does not depent on camera tilt:
            const cameraAltitude = this.getCameraAltitude(camera, projection);
            clipPlanes.near = cameraAltitude - this.maxElevation;
            // For far plane we need to find tangent to sphere which gives the maximum
            // visible distance with regards to sphere curvature and camera position.
            const worldOrigin = new THREE.Vector3(0, 0, 0);
            // Acquire camera to origin vector.
            const cameraToOrigin = worldOrigin.sub(camera.position);
            // Extract camera X, Y, Z orientation axes into tmp vectors array.
            camera.matrixWorld.extractBasis(
                this.m_tmpVectors[0],
                this.m_tmpVectors[1],
                this.m_tmpVectors[2]
            );
            const xaxis = this.m_tmpVectors[0];
            const yaxis = this.m_tmpVectors[1];
            // Extend the far plane by the margin along the shpere normal (radius).
            // In order to calculate far plane distance we need to find sphere tangent
            // line that passes thru camera position, method explanation may be found in
            // AltitudeBasedClipPlanesEvaluator.evaluateDistanceSphericalProj() method.
            const r = EarthConstants.EQUATORIAL_RADIUS;
            const d = cameraToOrigin.length();
            const dNorm = this.m_tmpVectors[2].copy(cameraToOrigin).multiplyScalar(1 / d);

            const sinAlpha = r / d;
            const alpha = Math.asin(sinAlpha);
            const cosAlpha = Math.sqrt(1 - sinAlpha * sinAlpha);

            // Apply tangent vector length onto camera to origin direction.
            let td: THREE.Vector3;
            // First case when elevation is negligible.
            if (this.maxElevation < epsilon) {
                // This may be calculated by several methods, firstly:
                // t_d = d_norm * |t|,
                // where:
                // |t| = sqrt(|d|^2 - |r|^2), or
                // |t| = cos(alpha) * |d|
                // By simplifying t_d equation with the second condition, we get:
                // t_d = d_norm * cos(alpha) * |d|, where d = d_norm * |d|
                // t_d = d * cos(alpha)
                // Cause cameraToOrigin is no longer needed re-use it to calulate td.
                td = cameraToOrigin.multiplyScalar(cosAlpha);
            }
            // Second case takes into account the elevation above the ground.
            else {
                // Here the length of the tangent is extended with 'te' vector that allows to see
                // elevated geometry beyond the tangent (horizon line), see
                // AltitudeBasedClipPlanesEvaluator for explanations.
                // t_d = d_norm * |t + te|,
                // where:
                // |t| = cos(alpha) * |d|
                // |te| = sqrt((r+e)^2 - r^2)
                // Which reduces to:
                // |te| = sqrt(2*r*e + e^2)
                const t = cosAlpha * d;
                const te = Math.sqrt(
                    2 * r * this.maxElevation - this.maxElevation * this.maxElevation
                );
                // Re-use prealocated vector.
                td = cameraToOrigin.copy(dNorm).multiplyScalar(t + te);
            }
            // For tangent, oriented in the direction to origin, we then apply
            // rotation to it on every rotation axes using already known tangent angle,
            // the angle that defines maximum visibility along the sphere surface.
            // This gives us the tangent rays in all major directions.
            const ry = this.m_tmpQuaternion.setFromAxisAngle(yaxis.cross(dNorm), alpha);
            const tdry = td.clone().applyQuaternion(ry);

            const rx = this.m_tmpQuaternion.setFromAxisAngle(xaxis.cross(dNorm), alpha);
            const tdrx = td.clone().applyQuaternion(rx);

            const rx2 = this.m_tmpQuaternion.copy(rx).inverse();
            // Cause td vector in no longer needed, reuse it applying quaternion to it.
            const tdrx2 = td.applyQuaternion(rx2);

            // Rotated tangents are then added to camera position thus defining far plane
            // position and orientation - it is enough to have three cooplanar points to
            // define the plane.
            // p1 = camera.position + tdrx
            // p2 = camera.position + tdry
            // p3 = camera.position + tdrx2
            // const farPlane = new THREE.Plane().setFromCoplanarPoints(p1, p2, p3);
            // clipPlanes.far = farPlane.distanceToPoint(camera.position);

            // This of course may be simplified by moving calculus entirelly to camera space,
            // because far plane is indeed defined in that space anyway:
            const farPlane = new THREE.Plane().setFromCoplanarPoints(tdrx, tdry, tdrx2);
            clipPlanes.far = farPlane.constant;

            // Finally apply the constraints.
            clipPlanes.near = Math.max(clipPlanes.near, this.nearMin);
            // Take into account largest depression assumed, that may be further then
            // tangent based far plane distance.
            clipPlanes.far = Math.max(clipPlanes.far, cameraAltitude + this.minElevation);
            return clipPlanes;
        }
    }

    /**
     * Return camera tilt angle (in degrees).
     *
     * Tilt is the angle between camera __look at__ (forward) vector and ground normal.
     * @note It may depend on the projection type (in extended version).
     * @param camera
     * @param projection
     * @returns angle in radians.
     */
    protected getCameraTiltAngle(camera: THREE.Camera, projection: Projection): number {
        const lookAt: THREE.Vector3 = new THREE.Vector3();
        camera.getWorldDirection(lookAt);
        return lookAt.angleTo(this.getGroundNormalInv(camera, projection));
    }

    /**
     * Calculate the camera distance to the ground in direction of look at vector.
     * This is not equivalent to camera altitute cause value will change according to look at
     * direction. It simply measures the distance of intersection point between ray from
     * camera and ground level, yet without taking into account terrain elevation nor buildings.
     * @param camera
     * @param projection
     */
    protected getCameraLookAtDistance(camera: THREE.Camera, projection: Projection): number {
        assert(projection.type !== ProjectionType.Spherical);
        // Using simple trigonometry we may approximate the distance of camera eye vector
        // intersection with theoretical ground, knowing camera altitude and tilt angle:
        // cos(tiltAngle) = altitude / groundDistance
        // groundDistance = altitude / cos(tiltAngle)
        // where:
        // cos(tiltAngle) = dot(lookAt, eyeInverse)
        const lookAt: THREE.Vector3 = new THREE.Vector3();
        camera.getWorldDirection(lookAt).normalize();
        let cosTiltAngle = lookAt.dot(TiltBasedClipPlanesEvaluator.GROUND_NORMAL_INV_PLANAR_PROJ);
        cosTiltAngle = cosTiltAngle === 0 ? epsilon : cosTiltAngle;
        return this.getCameraAltitude(camera, projection) / cosTiltAngle;
    }

    /**
     * Return normal to the ground surface directly above camera position.
     * @param projection
     */
    protected getGroundNormalInv(camera: THREE.Camera, projection: Projection): THREE.Vector3 {
        // Position on the ground for surface normal calculation does not matter for
        // any planar projections, so we may simplify calculus by returning const vector:
        if (projection.type !== ProjectionType.Spherical) {
            return TiltBasedClipPlanesEvaluator.GROUND_NORMAL_INV_PLANAR_PROJ;
        } else {
            const normal = new THREE.Vector3();
            projection.surfaceNormal(camera.position, normal);
            return normal.negate();
        }
    }

    /**
     * Calculate the lengths of frustum intersection with the ground plane.
     * This evaluates (vertical in camera space) distances between eye vector
     * ground intersection and bottom/top frustum planes.
     * @note This method assumes the world surface (ground) to be flat and
     * works only with planar projections.
     */
    protected getFrustumGroundIntersectionDist(
        camera: THREE.PerspectiveCamera,
        projection: Projection
    ): { top: number; bottom: number } {
        assert(projection.type !== ProjectionType.Spherical);
        // This algorithm computes the length of frustum intersection with a flat ground surface,
        // splitting the entire intersection into two sections, one for part above eye vector and
        // another below.
        // The following diagram may help explain the algorithm below.
        //   🎥
        //   C
        //   |\
        //   |.\ .
        //   | . \  .
        // z |  .  \   .c2
        //   |  c1.  \e    .
        //   |     .   \      .
        //___|a___D1.____\E1_____.D2______ g
        //   C1      .     \   .
        //            .      \.E2
        //             .    .
        //              . .
        //               .
        // Where:
        // - C gives the camera position.
        // - z is the height of the camera above the ground.
        // - a is a right angle.
        // - e is the look at vector of the camera.
        // - c1 and c2 are the frustum planes of the camera.
        // - angle between c1 to c2 is the fov.
        // - angles between c1 and e or e and c2 splits fov on equal halfs.
        // - d1 and d2 are the intersection points of the frustum with the world/ground plane.
        // - angle between z and e is the tilt/pitch of the camera.
        // - g is the ground/world surface
        //
        // The goal is to find planar intersections of frustum with ground plane.
        // This are the distances from E1->D2 and D1->E1, and thoose are a longitude values,
        // that describes the length of frustum intersection with a ground (world) plane.
        // Please note that: E1>D2 >= E1->D1 (because we can't have a negative tilt).
        // To find E1->D2, we use the right triangle C, C1, D2 and subtract distance from C1->D2
        // with C1->E1.
        // C1->D2 is found using the angle between z and c2 edges from the camera, this angle
        // (between C1, C and E1) equals the tilt + half of the fov angle and thus using simple
        // trigonometry, we may say:
        // tan(tilt + fov/2) = C1->D2 / z,
        // C1->D2 = tan(tilt + fov/2) * z.
        // C1->E1 just need the tilt and trigonometry to compute, result is:
        // C1->E1 = tan(tilt) * z.
        // then E1->D2 is expressed with:
        // E1->D2 = C1->D2 - C1->E1
        // For computing D1->E1, we may use similar formulas, firstly calculate C1->D1:
        // C1->D1 = tan(tilt - fov/2) * z
        // and then D1->E1:
        // D1->E1 = C1->E1 - C1->D1

        const cameraAltitude = this.getCameraAltitude(camera, projection);
        const cameraPitch = this.getCameraTiltAngle(camera, projection);
        // Angle between z and c2, note, the fov is vertical, otherwise we would need to
        // translate it using aspect ratio:
        // let aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
        const aspect = 1;
        // Half fov angle in radians
        const halfFovAngleRad = MathUtils.degToRad((camera.fov * aspect) / 2);
        // Angle between z and c2
        const biggerAngleRad = cameraPitch + halfFovAngleRad;
        // Angle between z and c1
        const smallerAngleRad = cameraPitch - halfFovAngleRad;
        // Length C1->E1
        const projectionEyeVector = Math.tan(cameraPitch) * cameraAltitude;

        // Length C1->D2
        const projectionHighEdge = Math.tan(biggerAngleRad) * cameraAltitude;
        // Length E1->D2
        const projectionRightSide = projectionHighEdge - projectionEyeVector;

        // Length of C1->D1
        const projectionLowEdge = Math.tan(smallerAngleRad) * cameraAltitude;
        // Length D1->E1
        const projectionLeftSide = projectionEyeVector - projectionLowEdge;
        return {
            top: projectionRightSide,
            bottom: projectionLeftSide
        };
    }
}

/**
 * Provides the most basic evaluation concept giving fixed values with some constraints.
 */
export class FixedClipPlanesEvaluator implements ClipPlanesEvaluator {
    readonly minFar: number;
    private m_nearPlane: number;
    private m_farPlane: number;

    constructor(readonly minNear: number = 1, readonly minFarOffset: number = 10) {
        this.minFar = minNear + minFarOffset;
        this.m_nearPlane = minNear;
        this.m_farPlane = this.minFar;
    }

    get nearPlane(): number {
        return this.m_nearPlane;
    }

    set nearPlane(fixedNear: number) {
        this.invalidatePlanes(fixedNear, this.m_farPlane);
    }

    get farPlane(): number {
        return this.m_farPlane;
    }

    set farPlane(fixedFar: number) {
        this.invalidatePlanes(this.m_nearPlane, fixedFar);
    }

    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        // We do not need to perform actual evaluation cause results are precomputed and
        // kept stable until somebody changes the properties.
        return { near: this.m_nearPlane, far: this.m_farPlane };
    }

    private invalidatePlanes(near: number, far: number) {
        // When clamping prefer to extend far plane at about minimum distance, giving
        // near distance setup priority over far.
        const nearDist: number = Math.max(this.minNear, near);
        const farDist: number = Math.max(this.minFar, far, nearDist + this.minFarOffset);
        this.m_nearPlane = nearDist;
        this.m_farPlane = farDist;
    }
}

/**
 * Default [[ClipPlanesEvaluator]] calculates near plane based on ground distance.
 */
// tslint:disable-next-line: max-line-length
export const defaultClipPlanesEvaluator: ClipPlanesEvaluator = new InterpolatedClipPlanesEvaluator();
