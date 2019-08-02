/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, MathUtils, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";

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
     * @note Camera clipping planes should be not automatically updated via #evaluateClipPlanes()
     * call, user should do it manually if needed.
     */
    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): { near: number; far: number };
}

/**
 * Simple camera clip planes evaluator, interpolates near and far planes based on ground distance.
 *
 * This evaluator supports both planar and spherical projections, although it behaviour is
 * slightly different in each case. General algorithm setups near plane in between camera and
 * ground level, while far plane is just calculated using scale and bias approach with far offset
 * and multiplier.
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
            // Acquire forward vector based on Z axis reversed (keep it in tmpVectors[2]).
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
 * slightly different in each case. General algorithm setups near plane and far plane close
 * to ground level, but taking into account some predefined margins.
 * @note This simple evaluator does behave correctly when camera is always pointing downwards the
 * ground surface (top view) along surface normal, but does not preserve correct planes when using
 * modifying camera pitch (tilt) angle.
 */
export class AltitudeBasedClipPlanesEvaluator implements ClipPlanesEvaluator {
    protected static readonly GROUND_NORMAL_INV_PLANAR_PROJ = new THREE.Vector3(0, 0, -1);

    protected m_tmpVectors: THREE.Vector3[] = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ];
    protected m_tmpQuaternion: THREE.Quaternion = new THREE.Quaternion();

    /**
     * Allows to setup near/far offsets (margins) from the ground as also minimum near value.
     * All c-tor parameters should take positive numbers or zeros (with exception of [[nearMin]]).
     * It is stronlgy recommended to set some reasonable margins/offset for near and far planes
     * from ground surface to avoid flickering. Keep in mind that sum of the margins:
     * [[nearMargin]] + [[farMargin]] can not be bigger then maximum offset between a planes
     * assumed - [[planesMaxDistance]].
     * @note [[planesMaxDistance]] does not limit far plane when spherical projection is in use,
     * the algorithm used estimates distance to point on tangent where line from camera touches
     * the sphere horizont.
     * @param nearMargin defines near plane offset from the ground in the surface normal direction.
     * @param farMargin defines far plane offset from the ground surface, looking downwards.
     * @param nearMin minimum allowable near plance distance from camera.
     * @param planesMaxDistance maximum offset between near/far planes, allows to limit viewing
     * distance at overall.
     */
    constructor(
        public nearMargin: number = 200,
        public farMargin: number = 50,
        readonly nearMin: number = 0.1,
        readonly planesMaxDistance = 100000.0
    ) {
        assert(nearMargin >= 0);
        assert(farMargin >= 0);
        assert(nearMin > 0);
        assert(planesMaxDistance >= 0);
        assert(nearMargin + farMargin <= planesMaxDistance);
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
     * Calculate camera altitute (closest distance) to ground level in world units.
     * @param camera
     * @param projection
     */
    protected getCameraAltitude(camera: THREE.Camera, projection: Projection) {
        return projection.groundDistance(camera.position);
    }

    private evaluateDistancePlanarProj(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        assert(projection.type !== ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin + this.planesMaxDistance;

        // Calculate distance to closest point on the ground.
        const groundDistance = this.getCameraAltitude(camera, projection);
        // Acquire camera forward (look at) vector (store in tmpVectors[0]).
        const lookAt = camera.getWorldDirection(this.m_tmpVectors[0]);
        const tiltCos = Math.cos(
            lookAt.angleTo(AltitudeBasedClipPlanesEvaluator.GROUND_NORMAL_INV_PLANAR_PROJ)
        );
        // At least try to keep margins along the eye vector (center of the view) in tact with
        // pitch angle changes - this does not solve all tilt change problems, rather use
        // more sophisticated evaluator.
        nearPlane = groundDistance - this.nearMargin / tiltCos;
        farPlane = groundDistance + this.farMargin / tiltCos;

        // Apply the constraints.
        nearPlane = Math.max(nearPlane, this.nearMin);
        farPlane = Math.min(farPlane, nearPlane + this.planesMaxDistance);

        return { near: nearPlane, far: farPlane };
    }

    private evaluateDistanceSphericalProj(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        assert(projection.type === ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin + this.planesMaxDistance;

        // This solution computes near and far plane for a set up where
        // the camera is looking at the center of the scene.

        //         , - ~ ~ ~ - ,
        //     , '               ' ,
        //   ,                       ,
        //  ,                         ,
        // ,                           ,
        // ,             . O           ,
        // ,             | .           ,
        //  ,            |   .  r     ,
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
        nearPlane = this.getCameraAltitude(camera, projection) - this.nearMargin;

        // The far plane distace calculus requires finding the sphere tangent line that is
        // co-linear with (goes thru) camera position, such tangent creates right angle
        // with sphere diameter where it touches its surface (point T). Given that sphere is
        // always at world orgin and camera orbits around it we have:
        // angle(OTC) = 90
        // sin(OCT) = sin(alpha) = r / d
        // alpha = asin(r / d)
        const r = EarthConstants.EQUATORIAL_RADIUS;
        const d = camera.position.length();
        const alpha = Math.asin(r / d);
        // The distance to tangent point may be descibed as:
        // t = sqrt(d^2 - r^2)
        const t = Math.sqrt(d * d - r * r);
        // Next step is to project CT vector onto camera eye (forward) vector to get maximum
        // camera far plane distance. Point on sphere beyond that point won't be visible anyway
        // unless they are above the ground surface. For such cases [[this.farMargin]] applies.

        // Extract camera X, Y, Z orientation axes into tmp vectors array.
        camera.matrixWorld.extractBasis(
            this.m_tmpVectors[0],
            this.m_tmpVectors[1],
            this.m_tmpVectors[2]
        );
        // Setup quaternion (based on X axis) for angle between tangent and camera eye.
        this.m_tmpQuaternion.setFromAxisAngle(this.m_tmpVectors[0], alpha);
        // Acquire camera (eye) forward vector from Z axis reversed (keep it in tmpVectors[2]).
        const cameraFwdVec = this.m_tmpVectors[2].negate();
        // Apply quaternion to forward vector, creating tangent vector (store in tmpVectors[1]).
        const tangentVec = this.m_tmpVectors[1]
            .copy(cameraFwdVec)
            .applyQuaternion(this.m_tmpQuaternion);
        // Give it a proper length
        tangentVec.multiplyScalar(t);
        // Calculate tanget projection onto camera eye vector, giving far plane distance.
        farPlane = tangentVec.dot(cameraFwdVec) + this.farMargin;

        // Apply the constraints.
        nearPlane = Math.max(nearPlane, this.nearMin);

        return { near: nearPlane, far: farPlane };
    }
}

/**
 * Evaluates camera clipping planes based on the eye vector angle with surface of the ground.
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
            // margins are applied. Here margins are meant to be defined as distance
            // along the ground normal vector thus during camera tilt they need to
            // be projected on the eye vector:
            // actualMargin = margin / groundNormal.dot(eyeVec)
            // Assuming that tilt angle defined relative to actual ground normal, we have:
            const cameraEyeDotGround = Math.cos(cameraTilt);
            clipPlanes.near = lookAtDist - this.nearMargin / cameraEyeDotGround;
            clipPlanes.far = lookAtDist + this.farMargin / cameraEyeDotGround;

            // Correct cliping planse distace for the top/bottom frustum planes (edges).
            // If we deal with perspective camera type, this step would not be required
            // for orthografic projections.
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
            clipPlanes.far = Math.min(clipPlanes.far, clipPlanes.near + this.planesMaxDistance);
            return clipPlanes;
        } else {
            // Fallback to base implemenation case we don't yet have support for camera
            // tilting when using spherical projections.
            return super.evaluateClipPlanes(camera, projection);
        }
    }

    /**
     * Note/consider it may deepend on the projection type (in extended version).
     * @param camera
     * @param projection
     * @returns angle in radians.
     */
    protected getCameraTiltAngle(camera: THREE.Camera, projection: Projection) {
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
    protected getCameraLookAtDistance(camera: THREE.Camera, projection: Projection) {
        assert(projection.type !== ProjectionType.Spherical);
        // Using simple trygonometry we may approximate the distance of camera eye vector
        // intersection with theoretical ground, knowing camera altitude and tilt angle:
        // cos(tiltAngle) = altitude / groundDistance
        // groundDistance = altitude / cos(tiltAngle)
        // where:
        // cos(tiltAngle) = dot(lookAt, eyeInverse)
        const lookAt: THREE.Vector3 = new THREE.Vector3();
        camera.getWorldDirection(lookAt).normalize();
        const cosTiltAngle = lookAt.dot(TiltBasedClipPlanesEvaluator.GROUND_NORMAL_INV_PLANAR_PROJ);
        return this.getCameraAltitude(camera, projection) / cosTiltAngle;
    }

    /**
     * Return normal to the ground surface directly above camera position.
     * @param projection
     */
    protected getGroundNormalInv(camera: THREE.Camera, projection: Projection) {
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
        // This algorithm computes the number of offsets we need to test. The following diagram may
        // help explain the algorithm below.
        //   ð¥
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
