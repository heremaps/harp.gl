/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, MathUtils, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { MapViewUtils } from "./Utils";

const epsilon = 0.000001;

/**
 * Structure that holds near, far planes distances and maximum visibility range.
 */
export interface ViewRanges {
    /**
     * Distance from camera to near clipping plane along camera eye vector.
     * @note This value is always positive and in camera space, should be bigger then zero.
     */
    near: number;
    /**
     * Far clipping plane distance in camera space, along its eye vector.
     * @note Should be always positive and bigger then [[near]] plane distance.
     */
    far: number;
    /**
     * Maximum possible visibility range in camera space, regardless of camera orientation.
     * @note Holds the maximum value that may be returned for [[far]] plane distance at
     * certain camera position and orientation. You may use this value to calculate
     * fog or other depth effects that are related to frustum (visibility), but should not
     * change as dynamically as near/far plane distances on certain evaluators.
     */
    maximum: number;
}

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
    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): ViewRanges;
}

/**
 * Simplest camera clip planes evaluator, interpolates near/far planes based on ground distance.
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

    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): ViewRanges {
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
        } else if (projection.type === ProjectionType.Planar) {
            const groundDistance = projection.groundDistance(camera.position);
            nearPlane = Math.max(this.nearMin, groundDistance * this.nearMultiplier);
            // Will be already clamped to minFar due to clamping above.
            farPlane = nearPlane * this.nearFarMultiplier + this.farOffset;
        } else {
            assert(false, "Unsuported projection type");
        }

        const viewRanges: ViewRanges = { near: nearPlane, far: farPlane, maximum: farPlane };
        return viewRanges;
    }
}

/**
 * Simple camera clip planes evaluator that computes near plane based on camera to ground distance.
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
    private m_maxElevation: number;
    private m_minElevation: number;
    private m_minimumViewRange: ViewRanges;

    /**
     * Allows to setup near/far offsets (margins), rendered geometry elevation relative to sea
     * level as also minimum near plane and maximum far plane distance constraints.
     * It is strongly recommended to set some reasonable [[nearFarMargin]] (offset) between near
     * and far planes to avoid flickering.
     * @param maxElevation defines near plane offset from the ground in the surface normal
     * direction, positive values allows to render elevated terrain features (mountains,
     * buildings).
     * @param minElevation defines far plane offset from the ground surface, negative values moves
     * far plane below the ground level (use it to render depressions).
     * @param nearMin minimum allowable near plane distance from camera, must be bigger then zero.
     * @param nearFarMargin minimum distance between near and far plane, have to be significantly
     * bigger then zero (especially if [[maxElevation]], [[minElevation]] are equal), otherwise you
     * may notice flickering during rendering, or even render empty scene if frustum planes are
     * almost equal.
     * @param farMaxRatio maximum ratio between ground and far plane distance, allows to limit
     * viewing distance at overall. Have to be bigger then 1.0.
     * @note Keep in mind that this evaluator does not evaluate terrain (or building) elevation
     * automatically, to keep such features rendered (between frustum planes) use [[minElevation]],
     * [[maxElevation]] constraints. You may change this parameters at any time, but it requires
     * repeating [[evaluatePlanes]] step, if your camera is moving you need to evaluate planes
     * anyway.
     * @note You may treat [[minElevation]] and [[maxElevation]] parameters as the maximum and
     * minimum renderable elevation respectivelly along the surface normal, when camera is
     * constantly looking downwards (top-down view). If you need [[ClipPlanesEvaluator]] for
     * cameras that support tilt or yaw please use [[TiltBasedClipPlanesEvaluator]].
     * @note [[nearFarMaxRatio]] does not limit far plane when spherical projection is in use,
     * the algorithm used there estimates distance to point on tangent where line from camera
     * touches the sphere horizont and there is no reason to clamp it.
     */
    constructor(
        maxElevation: number = 200,
        minElevation: number = -50,
        readonly nearMin: number = 0.1,
        readonly nearFarMargin: number = 1.0,
        readonly farMaxRatio = 1.8
    ) {
        assert(maxElevation >= minElevation);
        assert(nearMin > 0);
        assert(nearFarMargin > epsilon);
        assert(farMaxRatio > 1.0);
        this.m_minElevation = minElevation;
        this.m_maxElevation = maxElevation;
        this.m_minimumViewRange = {
            near: nearMin,
            far: nearMin + nearFarMargin,
            maximum: Math.max(nearMin * farMaxRatio, nearMin + nearFarMargin)
        };
    }

    /**
     * Set maximum elevation above sea level to be rendered.
     * @param elevation the elevation (altitude) value in world units (meters).
     * @note If you set this exactly to the maximum rendered feature height (altitude above
     * the sea, you may notice some flickering or even polygons disappearing related to rounding
     * errors or depth buffer precision. In such cases increase [[nearFarMargin]] or add a little
     * bit offset to your assumed maximum elevation.
     * @note Reasonable values are in between (-DeadSeeDepression, MtEverestHeight>, both values
     * are defined in [[EarthConstant]] as [[EarthConstant.MIN_ELEVATION]] and
     * [[EarthConstant.MAX_ELEVATION]] respectivelly.
     * @see minElevation for more information about precision and rounding errors.
     */
    set maxElevation(elevation: number) {
        this.m_maxElevation = elevation;
        // Min elevation should be at least equal or smaller to max elevation.
        this.m_minElevation = Math.min(elevation, this.m_minElevation);
    }

    /**
     * Get maximum elevation to be covered by camera frustum.
     */
    get maxElevation(): number {
        return this.m_maxElevation;
    }

    /**
     * Set minimum elevation to be rendered, values beneath the sea level are negative.
     * @param elevation the minimum elevation (depression) in world units (meters).
     * @note If you set this parameter to zero you may not see any features rendered if they are
     * just below the sea level more then half of [[nearFarMargin]] assumed. Similarly if set to
     * -100m and rendered features lays exactly in such depression, you may notice that problem.
     * The errors ussually come from projection precision loss and depth buffer nature (significant
     * precision loss closer to far plane). Thus is such cases either increase the margin (if you
     * are sure features are just at this elevation, or setup bigger offset for [[minElevation]].
     * Reasonable values are between <-DeadSeaDepression, MtEverestHeight), where the first denotes
     * lowest depression on the Earth defined as [[EarthConstants.MIN_ELEVATION]] and the second is
     * the highest point our planet.
     * @see https://developer.nvidia.com/content/depth-precision-visualized
     */
    set minElevation(elevation: number) {
        this.m_minElevation = elevation;
        // Max elevation should be at least equal or bigger then min elevation.
        this.m_maxElevation = Math.max(elevation, this.m_maxElevation);
    }

    /**
     * Get minimum elevation to be covered by camera frustum.
     */
    get minElevation(): number {
        return this.m_minElevation;
    }

    /**
     * Get minimum view range that is possible to achieve with current evaluator settings.
     * @note This value will not change after evaluator is constructed.
     */
    get minimumViewRange(): ViewRanges {
        return this.m_minimumViewRange;
    }

    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): ViewRanges {
        if (projection.type === ProjectionType.Spherical) {
            return this.evaluateDistanceSphericalProj(camera, projection);
        } else if (projection.type === ProjectionType.Planar) {
            return this.evaluateDistancePlanarProj(camera, projection);
        }
        assert(false, "Unsuported projection type");
        return { ...this.minimumViewRange };
    }

    /**
     * Calculate camera altitute (closest distance) to ground level in world units.
     * @param camera
     * @param projection
     */
    protected getCameraAltitude(camera: THREE.Camera, projection: Projection): number {
        return projection.groundDistance(camera.position);
    }

    private evaluateDistancePlanarProj(camera: THREE.Camera, projection: Projection): ViewRanges {
        assert(projection.type !== ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin * this.farMaxRatio;

        // Calculate distance to closest point on the ground.
        const groundDistance = this.getCameraAltitude(camera, projection);
        const farMax = groundDistance * this.farMaxRatio;
        // We could at least try to keep margins along the eye vector (center of the view) in
        // tact with pitch angle changes, but this does not solve all tilt angle problems,
        // rather use more sophisticated evaluator.
        nearPlane = groundDistance - this.maxElevation;
        farPlane = groundDistance - this.minElevation;

        // Apply the constraints.
        nearPlane = Math.max(nearPlane - this.nearFarMargin / 2, this.nearMin);
        farPlane = Math.min(farPlane, farMax);
        farPlane = Math.max(farPlane, nearPlane + this.nearFarMargin);

        const viewRanges: ViewRanges = {
            near: nearPlane,
            far: farPlane,
            maximum: Math.max(farMax, farPlane)
        };
        return viewRanges;
    }

    private evaluateDistanceSphericalProj(
        camera: THREE.Camera,
        projection: Projection
    ): ViewRanges {
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
        // the camera, then we apply margin (elevation) to it along the sphere surface normal:
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
        // There may be situations when maximum elevation still remains below sea level (< 0) or
        // it is neglible, in such cases tangent extension (te) is not required.
        const te =
            this.maxElevation < epsilon
                ? 0
                : Math.sqrt(2 * r * this.maxElevation + this.maxElevation * this.maxElevation);

        // Next step is to project CT vector onto camera eye (forward) vector to get maximum
        // camera far plane distance. Point on sphere beyond that point won't be visible anyway
        // unless they are above the ground surface. For such cases [[this.maxElevation]] applies,
        // thus we project entire CE vector of length equal: t + te.

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
        nearPlane = Math.max(nearPlane - this.nearFarMargin / 2, this.nearMin);
        // In extreme cases the largest depression assumed may be further then tangent
        // based far plane distance, take it into account
        farPlane = Math.max(farPlane, cameraAltitude - this.minElevation);
        farPlane = Math.max(farPlane, nearPlane + this.nearFarMargin);

        const viewRanges: ViewRanges = { near: nearPlane, far: farPlane, maximum: farPlane };
        return viewRanges;
    }
}

/**
 * Evaluates camera clipping planes taking into account ground distance and camera angles.
 *
 * This evaluator provides support for camera with varying tilt (pitch) angle, the angle
 * between camera __look at__ vector and the ground surface normal.
 */
export class TiltBasedClipPlanesEvaluator extends AltitudeBasedClipPlanesEvaluator {
    /**
     * Helper [[THREE.Plane]] instance to speed up calculations (limits allocations required).
     */
    protected m_tmpPlane = new THREE.Plane();

    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): ViewRanges {
        // Different algorithms are used for spherical and planar projections.
        if (projection.type === ProjectionType.Spherical) {
            return this.evaluateSphericalProj(camera, projection);
        } else if (projection.type === ProjectionType.Planar) {
            return this.evaluatePlanarProj(camera, projection);
        }
        assert(false, "Unsuported projection type");
        return { ...this.minimumViewRange };
    }

    /**
     * Calculate the camera distance to the ground in direction of look at vector.
     * This is not equivalent to camera altitute cause value will change according to look at
     * direction. It simply measures the distance of intersection point between ray from
     * camera and ground level, yet without taking into account terrain elevation nor buildings.
     * @param camera
     * @param projection
     * @note Use with extreme care cause due to optimizations the internal temporary vectors
     * are used (m_tmpVectors[0], m_tmpVectors[1]). Thoose should not be used in outlining
     * function scope (calle).
     */
    protected getCameraLookAtDistance(camera: THREE.Camera, projection: Projection): number {
        assert(projection.type !== ProjectionType.Spherical);
        // Using simple trigonometry we may approximate the distance of camera eye vector
        // intersection with theoretical ground, knowing camera altitude and tilt angle:
        // cos(tiltAngle) = altitude / groundDistance
        // groundDistance = altitude / cos(tiltAngle)
        // where:
        // cos(tiltAngle) = dot(lookAt, eyeInverse)
        const lookAt: THREE.Vector3 = this.m_tmpVectors[0];
        camera.getWorldDirection(lookAt).normalize();
        const normal: THREE.Vector3 = this.m_tmpVectors[1];
        projection.surfaceNormal(camera.position, normal);
        normal.negate();
        let cosTiltAngle = lookAt.dot(normal);
        cosTiltAngle = cosTiltAngle === 0 ? epsilon : cosTiltAngle;
        return this.getCameraAltitude(camera, projection) / cosTiltAngle;
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
        const cameraTilt = MapViewUtils.getCameraTiltAngle(camera, projection);
        // Angle between z and c2, note, the fov is vertical, otherwise we would need to
        // translate it using aspect ratio:
        // let aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
        const aspect = 1;
        // Half fov angle in radians
        const halfFovAngleRad = MathUtils.degToRad((camera.fov * aspect) / 2);
        // Angle between z and c2
        const biggerAngleRad = cameraTilt + halfFovAngleRad;
        // Angle between z and c1
        const smallerAngleRad = cameraTilt - halfFovAngleRad;
        // Length C1->E1
        const projectionEyeVector = Math.tan(cameraTilt) * cameraAltitude;

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

    private evaluatePlanarProj(camera: THREE.Camera, projection: Projection): ViewRanges {
        assert(projection.type !== ProjectionType.Spherical);
        const clipPlanes = { ...this.minimumViewRange };
        const cameraTilt = MapViewUtils.getCameraTiltAngle(camera, projection);
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
        clipPlanes.far = lookAtDist - this.minElevation / cameraEyeDotGround;

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
        const farMax = lookAtDist * this.farMaxRatio;
        clipPlanes.near = Math.max(clipPlanes.near, this.nearMin);
        clipPlanes.far = Math.min(clipPlanes.far, farMax);
        clipPlanes.maximum = farMax;
        return clipPlanes;
    }

    private evaluateSphericalProj(camera: THREE.Camera, projection: Projection): ViewRanges {
        assert(projection.type === ProjectionType.Spherical);
        const clipPlanes = { ...this.minimumViewRange };

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

        // Apply tangent vector length onto camera to origin vector.
        let td: THREE.Vector3;
        // There may be situations when maximum elevation remains below sea level (< 0), or
        // is neglible, in such cases simply apply tangent distance to camera to origin vector.
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
            const te = Math.sqrt(2 * r * this.maxElevation - this.maxElevation * this.maxElevation);
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
        const farPlane = this.m_tmpPlane.setFromCoplanarPoints(tdrx, tdry, tdrx2);
        clipPlanes.far = farPlane.constant;

        // Finally apply the constraints.
        clipPlanes.near = Math.max(clipPlanes.near - this.nearFarMargin / 2, this.nearMin);
        // Take into account largest depression assumed, that may be further then
        // tangent based far plane distance.
        clipPlanes.far = Math.max(clipPlanes.far, cameraAltitude - this.minElevation);
        clipPlanes.far = Math.max(clipPlanes.far, clipPlanes.near + this.nearFarMargin);
        clipPlanes.maximum = clipPlanes.far;
        return clipPlanes;
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

    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): ViewRanges {
        // We do not need to perform actual evaluation cause results are precomputed and
        // kept stable until somebody changes the properties.
        const viewRanges: ViewRanges = {
            near: this.m_nearPlane,
            far: this.m_farPlane,
            maximum: this.m_farPlane
        };
        return viewRanges;
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
