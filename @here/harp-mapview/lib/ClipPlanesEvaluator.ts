/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { EarthConstants, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { MapView } from "./MapView";
import { MapViewUtils } from "./Utils";

const epsilon = 0.000001;

export interface ClipPlanesEvaluator {
    /**
     * Minimum elevation to be rendered, values beneath the sea level are negative.
     */
    minElevation: number;

    /**
     * Set maximum elevation to be rendered, values above sea level are positive.
     */
    maxElevation: number;

    /**
     * Compute near and far clipping planes distance.
     *
     * Evaluation method should be called on every frame  and camera clip planes updated.
     * This is related to evaluator implementation and its input data, that may suddenly change
     * such as camera position or angle, projection type or so.
     * Some evaluators may not depend on all or even any of input objects, but to preserve
     * compatibility with any evaluator type it is strongly recommended to update on every frame.
     * @param mapView The [[MapView]] in use.
     * @note Camera clipping planes aren't automatically updated via #evaluateClipPlanes()
     * call, user should do it manually if needed.
     */
    evaluateClipPlanes(mapView: MapView): ViewRanges;
}

/**
 * Simplest camera clip planes evaluator, interpolates near/far planes based on ground distance.
 *
 * At general ground distance to camera along the surface normal is used as reference point for
 * planes evaluation, where near plane distance is set as fraction of this distance refereed as
 * [[nearMultiplier]]. Far plane equation has its own multiplier - [[nearFarMultiplier]],
 * which is applied to near plane and offset giving finally far plane distance.
 * This evaluator supports both planar and spherical projections, although it's behavior is
 * slightly different in each case. General algorithm sets near plane between camera and
 * ground level, while far plane is just calculated using scale and bias approach with far offset
 * and multiplier.
 * @deprecated Class contains the legacy (first and original) clip planes evaluation method, which
 * is widelly used in examples thus is still kept for backward compatibility and comparisons.
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

    // tslint:disable-next-line: no-empty
    set minElevation(elevation: number) {}

    get minElevation(): number {
        // This evaluator does not support elevation so its always set to 0.
        return 0;
    }

    // tslint:disable-next-line: no-empty
    set maxElevation(elevation: number) {}

    get maxElevation(): number {
        // This evaluator does not support elevation so its always set to 0.
        return 0;
    }

    evaluateClipPlanes(mapView: MapView): ViewRanges {
        const camera = mapView.camera;
        const projection = mapView.projection;
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
            nearPlane = Math.max(
                this.nearMin,
                projection.groundDistance(camera.position) * this.nearMultiplier
            );
        } else if (projection.type === ProjectionType.Planar) {
            const groundDistance = projection.groundDistance(camera.position);
            nearPlane = Math.max(this.nearMin, groundDistance * this.nearMultiplier);
            // Will be already clamped to minFar due to clamping above.
            farPlane = nearPlane * this.nearFarMultiplier + this.farOffset;
        } else {
            assert(false, "Unsupported projection type");
        }

        const viewRanges: ViewRanges = {
            near: nearPlane,
            far: farPlane,
            minimum: this.nearMin,
            maximum: farPlane
        };
        return viewRanges;
    }
}

/**
 * Abstract evaluator class that adds support for elevation constraints.
 *
 * Classes derived from this should implement algorithms that takes into account rendered
 * features height (elevations), such as ground plane is no more flat (or spherical), but
 * contains geometry that should be overlapped by frustum planes.
 */
export abstract class ElevationBasedClipPlanesEvaluator implements ClipPlanesEvaluator {
    private m_maxElevation: number;
    private m_minElevation: number;

    constructor(maxElevation: number, minElevation: number) {
        assert(maxElevation >= minElevation);
        this.m_minElevation = minElevation;
        this.m_maxElevation = maxElevation;
    }

    abstract evaluateClipPlanes(mapView: MapView): ViewRanges;

    /**
     * Set maximum elevation above sea level to be rendered.
     *
     * @param elevation the elevation (altitude) value in world units (meters).
     * @note If you set this exactly to the maximum rendered feature height (altitude above
     * the sea, you may notice some flickering or even polygons disappearing related to rounding
     * errors or depth buffer precision. In such cases increase [[nearFarMargin]] or add a little
     * bit offset to your assumed maximum elevation.
     * @note Reasonable values are in between (-DeadSeeDepression, MtEverestHeight>, both values
     * are defined in [[EarthConstant]] as [[EarthConstant.MIN_ELEVATION]] and
     * [[EarthConstant.MAX_ELEVATION]] respectively.
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
     *
     * @param elevation the minimum elevation (depression) in world units (meters).
     * @note If you set this parameter to zero you may not see any features rendered if they are
     * just below the sea level more than half of [[nearFarMargin]] assumed. Similarly if set to
     * -100m and rendered features lays exactly in such depression, you may notice that problem.
     * The errors usually come from projection precision loss and depth buffer nature (significant
     * precision loss closer to far plane). Thus is such cases either increase the margin (if you
     * are sure features are just at this elevation, or setup bigger offset for [[minElevation]].
     * Reasonable values are between <-DeadSeaDepression, MtEverestHeight), where the first denotes
     * lowest depression on the Earth defined as [[EarthConstants.MIN_ELEVATION]] and the second is
     * the highest point our planet.
     * @see https://developer.nvidia.com/content/depth-precision-visualized
     */
    set minElevation(elevation: number) {
        this.m_minElevation = elevation;
        // Max elevation should be at least equal or bigger than min elevation.
        this.m_maxElevation = Math.max(elevation, this.m_maxElevation);
    }

    /**
     * Get minimum elevation to be covered by camera frustum.
     */
    get minElevation(): number {
        return this.m_minElevation;
    }
}

/**
 * Top view, clip planes evaluator that computes view ranges based on ground distance and elevation.
 *
 * This evaluator supports both planar and spherical projections, although it behavior is
 * slightly different in each case. General algorithm sets near plane and far plane close
 * to ground level, but taking into account maximum and minimum elevation of features on the ground.
 *
 * @note This evaluator supports only cameras which are always looking down the ground surface
 * (top-down view) along surface normal and does not preserve correct clip planes when
 * modifying camera pitch (tilt) angle. In simple words it is suitable only for top view camera
 * settings.
 */
export class TopViewClipPlanesEvaluator extends ElevationBasedClipPlanesEvaluator {
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
    private m_minimumViewRange: ViewRanges;

    /**
     * Allows to setup near/far offsets (margins), rendered geometry elevation relative to sea
     * level as also minimum near plane and maximum far plane distance constraints.
     * It is strongly recommended to set some reasonable [[nearFarMargin]] (offset) between near
     * and far planes to avoid flickering.
     * @param maxElevation defines near plane offset from the ground in the surface normal
     * direction, positive values allows to render elevated terrain features (mountains,
     * buildings). Defaults to Burj Khalifa building height.
     * @param minElevation defines far plane offset from the ground surface, negative values moves
     * far plane below the ground level (use it to render depressions). Default zero - sea level.
     * @param nearMin minimum allowable near plane distance from camera, must be bigger than zero.
     * @param nearFarMarginRatio minimum distance between near and far plane, as a ratio of average
     * near/far plane distance, it have to be significantly bigger than zero (especially if
     * [[maxElevation]] and [[minElevation]] are equal), otherwise you may notice flickering when
     * rendering, or even render empty scene if frustum planes are almost equal.
     * @param farMaxRatio maximum ratio between ground and far plane distance, allows to limit
     * viewing distance at overall. Have to be bigger than 1.0.
     * @note Keep in mind that this evaluator does not evaluate terrain (or building) elevation
     * automatically, to keep such features rendered (between frustum planes) use [[minElevation]],
     * [[maxElevation]] constraints. You may change this parameters at any time, but it requires
     * repeating [[evaluatePlanes]] step, if your camera is moving you need to evaluate planes
     * anyway.
     * @note You may treat [[minElevation]] and [[maxElevation]] parameters as the maximum and
     * minimum renderable elevation respectively along the surface normal, when camera is
     * constantly looking downwards (top-down view). If you need [[ClipPlanesEvaluator]] for
     * cameras that support tilt or yaw please use [[TiltViewClipPlanesEvaluator]].
     * @note [[nearFarMaxRatio]] does not limit far plane when spherical projection is in use,
     * the algorithm used there estimates distance to point on tangent where line from camera
     * touches the sphere horizon and there is no reason to clamp it.
     */
    constructor(
        maxElevation: number = EarthConstants.MAX_BUILDING_HEIGHT,
        minElevation: number = 0,
        readonly nearMin: number = 1.0,
        readonly nearFarMarginRatio: number = 0.05,
        readonly farMaxRatio = 6.0
    ) {
        super(maxElevation, minElevation);
        assert(nearMin > 0);
        assert(nearFarMarginRatio > epsilon);
        assert(farMaxRatio > 1.0);
        const nearFarMargin = nearFarMarginRatio * nearMin;
        this.m_minimumViewRange = {
            near: nearMin,
            far: nearMin + nearFarMargin,
            minimum: this.nearMin,
            maximum: Math.max(nearMin * farMaxRatio, nearMin + nearFarMargin)
        };
    }

    /** @override */
    evaluateClipPlanes(mapView: MapView): ViewRanges {
        if (mapView.projection.type === ProjectionType.Spherical) {
            return this.evaluateDistanceSphericalProj(mapView);
        } else if (mapView.projection.type === ProjectionType.Planar) {
            return this.evaluateDistancePlanarProj(mapView);
        }
        assert(false, "Unsupported projection type");
        return { ...this.minimumViewRange };
    }

    /**
     * Get minimum view range that is possible to achieve with current evaluator settings.
     * @note This value will not change after evaluator is constructed.
     */
    protected get minimumViewRange(): ViewRanges {
        return this.m_minimumViewRange;
    }

    /**
     * Calculate camera altitude (closest distance) to ground level in world units.
     * @param camera
     * @param projection
     */
    protected getCameraAltitude(camera: THREE.Camera, projection: Projection): number {
        return projection.groundDistance(camera.position);
    }

    protected evaluateDistancePlanarProj(mapView: MapView): ViewRanges {
        const { camera, projection } = mapView;
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
        nearPlane = Math.max(nearPlane, this.nearMin);
        farPlane = Math.min(farPlane, farMax);
        // Apply margins
        const nearFarMargin = (this.nearFarMarginRatio * (nearPlane + farPlane)) / 2;
        nearPlane = Math.max(nearPlane - nearFarMargin / 2, this.nearMin);
        farPlane = Math.max(farPlane + nearFarMargin / 2, nearPlane + nearFarMargin);

        const viewRanges: ViewRanges = {
            near: nearPlane,
            far: farPlane,
            minimum: this.nearMin,
            maximum: Math.max(farMax, farPlane)
        };
        return viewRanges;
    }

    protected evaluateDistanceSphericalProj(mapView: MapView): ViewRanges {
        const { camera, projection } = mapView;
        assert(projection.type === ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin * this.farMaxRatio;

        // The near plane calculus is quite straight forward and works the same as for planar
        // projections. We simply search for the closest point of the ground just above
        // the camera, then we apply margin (elevation) to it along the sphere surface normal:
        const cameraAltitude = this.getCameraAltitude(camera, projection);
        nearPlane = cameraAltitude - this.maxElevation;

        // Far plane calculation requires different approaches depending from camera projection:
        // - perspective
        // - orthographic

        const r = EarthConstants.EQUATORIAL_RADIUS;
        let d = camera.position.length();
        d = d === 0 ? epsilon : d;
        if (camera.type === "PerspectiveCamera") {
            // This solution computes near and far plane for a set up where
            // the camera is looking at the center of the scene.

            // The far plane distance calculus requires finding the sphere tangent line that is
            // co-linear with (goes thru) camera position, such tangent creates right angle
            // with sphere diameter where it touches its surface (point T). Given that sphere is
            // always at world origin and camera orbits around it we have (see
            // #getTangentBasedFarPlane):
            // angle(OTC) = 90
            // sin(OCT) = sin(alpha) = r / d
            // alpha = asin(r / d)
            const alpha = Math.asin(r / d);
            // If alpha it bigger than half fov angle, our visibility limit is set by tangent
            // line, otherwise we need to find top (or right) plane intersection with sphere,
            // which is definitely closer than the tangent point mentioned above.
            const cam = camera as THREE.PerspectiveCamera;
            // Take fov directly if it is vertical, otherwise we translate it using aspect ratio:
            const aspect = cam.aspect > 1 ? cam.aspect : 1 / cam.aspect;
            const halfFovAngle = THREE.MathUtils.degToRad((cam.fov * aspect) / 2);

            const farTangent = this.getTangentBasedFarPlane(cam, d, r, alpha);
            farPlane =
                halfFovAngle > alpha
                    ? farTangent
                    : this.getFovBasedFarPlane(cam, d, r, 2 * halfFovAngle, projection);
        }
        // Orthographic camera projection
        else {
            farPlane = this.getOrthoBasedFarPlane(d, r);
        }

        // In extreme cases the largest depression assumed may be further than tangent
        // based far plane distance, take it into account
        const farMin = cameraAltitude - this.minElevation;
        const farMax = cameraAltitude * this.farMaxRatio;
        // Apply the constraints.
        nearPlane = Math.max(nearPlane, this.nearMin);
        farPlane = Math.max(farPlane, farMin);
        // Apply margins
        const nearFarMargin = (this.nearFarMarginRatio * (nearPlane + farPlane)) / 2;
        nearPlane = Math.max(nearPlane - nearFarMargin / 2, this.nearMin);
        farPlane = Math.max(farPlane + nearFarMargin / 2, nearPlane + nearFarMargin);

        const viewRanges: ViewRanges = {
            near: nearPlane,
            far: farPlane,
            minimum: this.nearMin,
            maximum: farMax
        };
        return viewRanges;
    }

    /**
     * Calculate distance from a point to the tangent point of a sphere.
     *
     * Returns zero if point is below surface or only very slightly above surface of sphere.
     * @param d Distance from point to center of sphere
     * @param r Radius of sphere
     */
    protected getTangentDistance(d: number, r: number): number {
        // There may be situations when maximum elevation still remains below sea level
        // (elevation < 0) or it is negligible (elevation ~ epsilon)
        if (d - r < epsilon) {
            return 0;
        }

        // The distance to tangent point may be described as:
        // t = sqrt(d^2 - r^2)
        return Math.sqrt(d * d - r * r);
    }

    /**
     * Calculate far plane depending on furthest visible distance from camera position.
     *
     * Furthest visible distance is assumed to be distance from camera to horizon
     * plus distance from elevated geometry to horizon(so that high objects behind horizon
     * remain visible).
     * @param camera The camera of the mapview
     * @param d Distance from camera to origin
     * @param r Radius of earth
     * @param alpha Angle between camera eye vector and tangent
     */
    protected getTangentBasedFarPlane(
        camera: THREE.PerspectiveCamera,
        d: number,
        r: number,
        alpha: number
    ): number {
        // Find tangent point intersection distance
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
        const t = this.getTangentDistance(d, r);

        // Because we would like to see elevated geometry that may be visible beyond
        // the tangent point on ground surface, we need to extend viewing distance along
        // the tangent line by te (see graph above).
        const te = this.getTangentDistance(r + this.maxElevation, r);

        // Next step is to project CE vector(length t + te) onto camera eye (forward) vector
        // to get maximum camera far plane distance.
        //
        // Knowing that:
        // tangentVec.dot(cameraFwdVec) = cos(alpha) * len(tangentVec) * len(cameraFwdVec).
        // where:
        // ||cameraFwdVec|| == 1 ^ ||tangentVec|| == t + te
        // Formula simplifies to:
        const far = Math.cos(alpha) * (t + te);

        return far;
    }

    protected getFovBasedFarPlane(
        camera: THREE.PerspectiveCamera,
        d: number,
        r: number,
        fovAngle: number,
        projection: Projection
    ) {
        // Find intersection point that is closer to tangent point.
        //
        //         , - ~ ~ ~ - ,
        //     , '               ' ,
        //   ,           .           ,
        //  ,            .     r     ,' T1
        // ,             .     ,  '  / ,
        // ,             . O.'  a   /  ,
        // ,             | .  `  . /   ,
        //  ,            |   .  r / TA,
        //   ,           |    .  /   ,
        //     ,         |     ./  ,'_____ far
        //       ' -_, _ | _ , /' T0
        //     near      |    /
        //               |   / t
        //             d | /
        //               |/
        //               C
        //
        // See:
        // tslint:disable-next-line: max-line-length
        // https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-sphere-intersection

        // Vector from camera to world center
        const dVec = camera.position;
        // Extract camera X, Y, Z orientation axes into tmp vectors array.
        camera.matrixWorld.extractBasis(
            this.m_tmpVectors[0],
            this.m_tmpVectors[1],
            this.m_tmpVectors[2]
        );
        // Setup quaternion (X axis based) for angle between frustum plane and camera eye.
        this.m_tmpQuaternion.setFromAxisAngle(this.m_tmpVectors[0], fovAngle / 2);
        // Acquire camera (eye) forward vector from Z axis (keep it in tmpVectors[2]).
        const cameraFwdVec = this.m_tmpVectors[2];
        // Apply quaternion to forward vector, creating intersection vector, which is
        // parallel to top or right frustum plane (depending on the aspect ratio).
        const tVec = this.m_tmpVectors[1].copy(cameraFwdVec).applyQuaternion(this.m_tmpQuaternion);
        // Calculate camera to origin vector projection onto frustum plane (top or right).
        // This gives us the length of CTA segment:
        const cta = dVec.dot(tVec);
        // If it is negative, it means that the dVec and the tVec points in
        // opposite directions - there is no intersection - or intersection could
        // potentially be behind the intersection ray's origin (camera position).
        if (cta < 0) {
            // Intersection points are behind camera, camera looks in wrong direction.
            const groundDistance = this.getCameraAltitude(camera, projection);
            // Setup far plane to maximum distance.
            return groundDistance * this.farMaxRatio;
        }
        // Knowing the length of |CTA| we just need to subtract the length of |T0TA|
        // segment from it to get far plane distance.
        // In order to calculate |T0TA| we firstly need to use use Pythagorean theorem to
        // find length of |OTA| = a. Here we use the right triangle formed by O-C-TA points:
        // |OC|^2 = |CTA|^2 + |OTA|^2, where |OTA| = a, |OC| = d, |CTA| = cta
        // a^2 = d^2 - cta^2
        const a2 = dVec.dot(dVec) - cta * cta;
        // Note that if a is greater than sphere radius the ray misses the sphere and
        // thus there is no intersection at all.
        const r2 = r * r;
        assert(a2 <= r2, "Please use this evaluator only for top view camera poses.");
        // Now to find the length of |T0TA| == |T1TA| we use the second right triangle
        // formed by O-T0-TA points. Of course we know that |T0TA| segment length is
        // equal to |T1TA|, and |OT0| segment is simply sphere radius.
        // In order to find |T0TA| length we again use Pythagorean theorem, which says:
        // |OT0|^2 = |OTA|^2 + |T0TA|^2, where |OTO| = r, |OTA| = a
        // |T0TA|^2 = r^2 - a^2
        const tota = Math.sqrt(r2 - a2);
        // Finally our far plane (intersection point) is defined as:
        return cta - tota;
    }

    protected getOrthoBasedFarPlane(d: number, r: number): number {
        //         , - ~ ~ ~ - ,
        //     , '               ' ,     E
        //   ,            .--------- ,-.'- far + elev
        // | ,            .   r + e , `, |
        // |,             .     , '     ,| te
        // |,             . O '.........,|..
        // |,             |        r    ,|  far
        // | ,            |            , |
        // |  ,           |           ,  | t
        // |    ,         |        , '   |
        // |      ' -_, _ | _ ,  '       |
        // |    near      | \/___________| near - elev
        // |              |              |
        // |            d |              |
        // |              |              |
        //                C
        // The distance to tangent point may be described as:
        const t = d;
        // Tangent extension due to terrain elevation behind the horizon may be calculated
        // based on the right triangle:
        // (r+maxElev)^2 = r^2 + te^2
        // te = sqrt((r+maxElev)^2 - r^2)
        // although we may not calculate it if elevation is negligible:
        const te =
            this.maxElevation < epsilon
                ? 0
                : Math.sqrt(r + this.maxElevation) * (r + this.maxElevation) - r * r;
        // Both near and far planes distances are directly applied to frustum, because tangents'
        // lines are parallel to camera look at vector.
        // Now far plane distance is constituted with:
        return t + te;
    }
}

/**
 * Evaluates camera clipping planes taking into account ground distance and camera angles.
 *
 * This evaluator provides support for camera with varying tilt (pitch) angle, the angle
 * between camera __look at__ vector and the ground surface normal.
 */
export class TiltViewClipPlanesEvaluator extends TopViewClipPlanesEvaluator {
    /**
     * Calculate the camera distance to the ground in direction of look at vector.
     * This is not equivalent to camera altitude cause value will change according to look at
     * direction. It simply measures the distance of intersection point between ray from
     * camera and ground level, yet without taking into account terrain elevation nor buildings.
     * @param camera
     * @param projection
     * @note Use with extreme care cause due to optimizations the internal temporary vectors
     * are used (m_tmpVectors[0], m_tmpVectors[1]). Those should not be used in outlining
     * function scope (caller).
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
     * Calculate the lengths of frustum planes intersection with the ground plane.
     * This evaluates distances between eye vector (or eye plane in orthographic projection) and
     * ground intersections of top and bottom frustum planes.
     * @note This method assumes the world surface (ground) to be flat and
     * works only with planar projections.
     *
     * @param mapView The [[MapView]] instance in use.
     */
    protected getFrustumGroundIntersectionDist(mapView: MapView): { top: number; bottom: number } {
        assert(mapView.projection.type !== ProjectionType.Spherical);
        const camera = mapView.camera;
        const projection = mapView.projection;
        // This algorithm computes the length of frustum planes before intersecting with a flat
        // ground surface. Entire computation is split over two projections method and performed
        // for top and bottom plane, with addition of terrain (ground) elevation which is taken
        // into account.
        // The following diagram may help explain the algorithm below.
        //   🎥
        //   C
        //   |\
        //   |.\ .
        //   | . \  . t
        // z |  .  \   .c2
        //   |  c1.  \e ___. max elev
        //   |     .   \      .
        //___|a___D1.____\E1_____.D2______ g
        //   C1      .     \ __. min elev
        //            .      \.E2
        //          b  .    .
        //              . .
        //               .
        // Where:
        // - C gives the camera position.
        // - z is the height of the camera above the ground.
        // - z1 == z2 == z, for perspective camera all planes origin its the same
        // - a is a right angle.
        // - e is the look at vector of the camera.
        // - t and b are the frustum planes of the camera (top and bottom respectively).
        // - angle between c1 to c2 is the fov.
        // - c1, c2 - vectors from camera to the ground along frustum planes.
        // - angles between c1 and e or e and c2 splits fov on equal halves.
        // - d1 and d2 are the intersection points of the frustum with the world/ground plane.
        // - angle between z and e is the pitch of the camera.
        // - angle between g and e is the tilt angle.
        // - g is the ground/world surface
        //
        // The goal is to find distance for top/bottom planes intersections of frustum with ground
        // plane.
        // This are the distances from C->D1 and C->D2, and are described as
        // c1 and c2. Then we may compensate/correct those distances with actual
        // ground elevations, which is done by simply offsetting camera altitude, as it is
        // opposite to elevating ground level.
        const halfPiLimit = Math.PI / 2 - epsilon;
        const cameraAltitude = this.getCameraAltitude(camera, projection);
        const cameraTilt = this.getCameraTilt(mapView);
        // Angle between z and c2
        let topAngleRad: number;
        // Angle between z and c1
        let bottomAngleRad: number;
        // Bottom plane origin altitude
        let z1: number;
        // Top plane origin altitude
        let z2: number;
        // For perspective projection:
        if (camera.type === "PerspectiveCamera") {
            const cam = (camera as any) as THREE.PerspectiveCamera;
            // Angle between z and c2, note, the fov is vertical, otherwise we would need to
            // translate it using aspect ratio:
            // let aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
            const aspect = 1;
            // Half fov angle in radians
            const halfFovAngle = THREE.MathUtils.degToRad((cam.fov * aspect) / 2);
            topAngleRad = THREE.MathUtils.clamp(
                cameraTilt + halfFovAngle,
                -halfPiLimit,
                halfPiLimit
            );
            bottomAngleRad = THREE.MathUtils.clamp(
                cameraTilt - halfFovAngle,
                -halfPiLimit,
                halfPiLimit
            );
            z1 = z2 = cameraAltitude;
        }
        // For orthographic projection:
        else {
            const cam = (camera as any) as THREE.OrthographicCamera;
            // For orthogonal camera projections we may simply ignore FOV and use 0 for FOV
            // the top/bottom planes are simply parallel to the eye vector:
            topAngleRad = bottomAngleRad = cameraTilt;
            // Although the ray origin is not always the same (eye position) as for
            // the perspective projections, thus we need to compensate for ortho-cube
            // dimensions:
            // sin(tilt) = zc2 / top
            // sin(tilt) = zc1 / bottom
            // zc2 = sin(tilt) * top
            // zc1 = sin(tilt) * bottom
            const sinBeta = Math.sin(cameraTilt);
            z2 = cameraAltitude + sinBeta * cam.top;
            z1 = cameraAltitude - sinBeta * cam.bottom;
        }
        // Distance along the top plane to the ground - c2
        // cos(topAngle) = (z2 - minElev) / |c2|
        // |c2| = (z2 - minElev) / cos(topAngle)
        const topDist = (z2 - this.minElevation) / Math.cos(topAngleRad);
        // Distance along the bottom plane to the ground - c1
        // cos(bottomAngle) = (z - minElev) / |c1|
        // |c1| = (z - minElev) / cos(bottomAngle)
        const bottomDist = (z1 - this.maxElevation) / Math.cos(bottomAngleRad);

        return {
            top: Math.max(topDist, 0),
            bottom: Math.max(bottomDist, 0)
        };
    }

    /** @override */
    protected evaluateDistancePlanarProj(mapView: MapView): ViewRanges {
        assert(mapView.projection.type !== ProjectionType.Spherical);
        const viewRanges = { ...this.minimumViewRange };

        // Generally near/far planes are set to keep top/bottom planes intersection distance.
        // Then elevations margins are applied. Here margins (min/max elevations) are meant to
        // be defined as distance along the ground normal vector thus during camera
        // tilt they may affect near/far planes positions differently.
        const planesDist = this.getFrustumGroundIntersectionDist(mapView);
        const { camera, projection } = mapView;
        // Project clipping plane distances for the top/bottom frustum planes (edges), but
        // only if we deal with perspective camera type, this step is not required
        // for orthographic projections, cause all clip planes are parallel to eye vector.
        if (camera.type === "PerspectiveCamera") {
            const cam = camera as THREE.PerspectiveCamera;
            // Angle between z and c2, note, the fov is vertical, otherwise we would need to
            // translate it using aspect ratio:
            // let aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
            const aspect = 1;
            // Half fov angle in radians
            const halfFovAngle = THREE.MathUtils.degToRad((cam.fov * aspect) / 2);
            const cosHalfFov = Math.cos(halfFovAngle);
            // cos(halfFov) = near / bottomDist
            // near = cos(halfFov) * bottomDist
            viewRanges.near = planesDist.bottom * cosHalfFov;
            // cos(halfFov) = far / topDist
            // far = cos(halfFov) * topDist
            viewRanges.far = planesDist.top * cosHalfFov;
        }
        // Orthographic camera projection.
        else {
            viewRanges.near = planesDist.bottom;
            viewRanges.far = planesDist.top;
        }

        // Clamp values to constraints.
        const lookAtDist = this.getCameraLookAtDistance(camera, projection);
        const farMax = lookAtDist * this.farMaxRatio;
        viewRanges.near = Math.max(viewRanges.near, this.nearMin);
        viewRanges.far = Math.min(viewRanges.far, farMax);

        // Apply margins
        const nearFarMargin = (this.nearFarMarginRatio * (viewRanges.near + viewRanges.far)) / 2;
        viewRanges.near = Math.max(viewRanges.near - nearFarMargin / 2, this.nearMin);
        viewRanges.far = Math.max(
            viewRanges.far + nearFarMargin / 2,
            viewRanges.near + nearFarMargin
        );
        viewRanges.minimum = this.nearMin;
        viewRanges.maximum = farMax;

        return viewRanges;
    }

    /** @override */
    protected evaluateDistanceSphericalProj(mapView: MapView): ViewRanges {
        const { camera, projection } = mapView;
        assert(projection.type === ProjectionType.Spherical);
        const viewRanges = { ...this.minimumViewRange };

        // Near plane calculus is pretty straightforward and does not depend on camera tilt:
        const cameraAltitude = this.getCameraAltitude(camera, projection);
        viewRanges.near = cameraAltitude - this.maxElevation;

        // Take fov directly if it is vertical, otherwise we translate it using aspect ratio:
        const aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
        const halfFovAngle = THREE.MathUtils.degToRad((camera.fov * aspect) / 2);

        if (camera instanceof THREE.PerspectiveCamera) {
            // Now we need to account for camera tilt and frustum volume, so the longest
            // frustum edge does not intersects with sphere, it takes the worst case
            // scenario regardless of camera tilt, so may be improved little bit with more
            // sophisticated algorithm.
            viewRanges.near *= Math.cos(halfFovAngle);
        }

        // Far plane calculation requires different approaches depending from camera projection:
        // - perspective
        // - orthographic
        const cameraToOrigin = this.m_tmpVectors[0].copy(camera.position).negate();
        const r = EarthConstants.EQUATORIAL_RADIUS;
        const d = cameraToOrigin.length();
        let farPlane: number;
        if (camera instanceof THREE.PerspectiveCamera) {
            // Step-wise calculate angle between camera eye vector and tangent

            // Calculate angle between surface normal(below camera position) and tangent.
            const alpha = Math.asin(r / d);

            // Calculate angle between look at and surface normal(below camera position)
            const cameraPitch = this.getCameraPitch(cameraToOrigin, camera);

            // Calculate angle between camera eye vector and tangent.
            const modifiedAlpha = Math.abs(alpha - cameraPitch);

            // Use tangent based far plane if horizon is within field of view
            const farTangent = this.getTangentBasedFarPlane(camera, d, r, modifiedAlpha);
            farPlane =
                halfFovAngle >= modifiedAlpha
                    ? farTangent
                    : this.getTiltedFovBasedFarPlane(d, r, halfFovAngle, cameraPitch);
        } else {
            farPlane = this.getOrthoBasedFarPlane(d, r);
        }
        viewRanges.far = farPlane;

        // Apply the constraints.
        const farMin = cameraAltitude - this.minElevation;
        const farMax = mapView.targetDistance * this.farMaxRatio;
        viewRanges.near = Math.max(viewRanges.near, this.nearMin);
        viewRanges.far = THREE.MathUtils.clamp(viewRanges.far, farMin, farMax);

        // Apply margins.
        const nearFarMargin = (this.nearFarMarginRatio * (viewRanges.near + viewRanges.far)) / 2;
        viewRanges.near = Math.max(viewRanges.near - nearFarMargin / 2, this.nearMin);
        viewRanges.far = Math.max(
            viewRanges.far + nearFarMargin / 2,
            viewRanges.near + nearFarMargin
        );

        // Set minimum and maximum view range.
        viewRanges.minimum = this.nearMin;
        viewRanges.maximum = farMax;

        return viewRanges;
    }

    protected getTiltedFovBasedFarPlane(
        d: number,
        r: number,
        halfFovAngle: number,
        cameraPitch: number
    ) {
        // Find intersection point that is closer to tangent point.
        //
        //         , - ~ ~ ~ - ,
        //     , '               ' ,
        //   ,           .           ,
        //  ,            .     r     ,' T1
        // ,             .     ,  '  / ,
        // ,             . O.'  a   /  ,
        // ,             | .  `  . /   ,
        //  ,            |   .  r / TA,
        //   ,           |    .  /   ,
        //     ,         |     ./  ,'_____ far
        //       ' -_, _ | _ , /' T0
        //     near      |    /
        //               |   / t
        //             d | /
        //               |/
        //               C
        //
        // See:
        // tslint:disable-next-line: max-line-length
        // https://www.scratchapixel.com/lessons/3d-basic-rendering/minimal-ray-tracer-rendering-simple-shapes/ray-sphere-intersection

        // compute length of t (distance to fov intersection with sphere)
        // with law of cosines:
        // r² = d² + t² - 2dt * cos(alpha)
        // solved for t:
        // t0 = d * cos(alpha) - sqrt(d²*cos²(alpha) - d² + r²)  <-- first intersection
        // t1 = d * cos(alpha) + sqrt(d²*cos²(alpha) - d² + r²)  <-- second intersection
        // Use first intersection:
        const cosAlpha = Math.cos(cameraPitch + halfFovAngle);
        const dSqr = d * d;
        const t = d * cosAlpha - Math.sqrt(dSqr * cosAlpha * cosAlpha - dSqr + r * r);

        assert(
            !isNaN(t),
            "Field of view does not intersect sphere. Use tangent based far plane instead."
        );

        // project t onto camera fwd vector
        const far = Math.cos(halfFovAngle) * t;

        return far;
    }

    private getCameraPitch(cameraToOrigin: THREE.Vector3, camera: THREE.PerspectiveCamera) {
        cameraToOrigin.normalize();
        const lookAt = camera.getWorldDirection(this.m_tmpVectors[1]).normalize();
        const cosAlpha1 = cameraToOrigin.dot(lookAt);
        const cameraPitch = Math.acos(THREE.MathUtils.clamp(cosAlpha1, -1.0, 1.0));

        return cameraPitch;
    }

    private getCameraTilt(mapView: MapView): number {
        return MapViewUtils.extractCameraTilt(mapView.camera, mapView.projection);
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

    // tslint:disable-next-line: no-empty
    set minElevation(elevation: number) {}

    get minElevation(): number {
        // This evaluator does not support elevation so its always set to 0.
        return 0;
    }

    // tslint:disable-next-line: no-empty
    set maxElevation(elevation: number) {}

    get maxElevation(): number {
        // This evaluator does not support elevation so its always set to 0.
        return 0;
    }

    evaluateClipPlanes(mapView: MapView): ViewRanges {
        // We do not need to perform actual evaluation cause results are precomputed and
        // kept stable until somebody changes the properties.
        const viewRanges: ViewRanges = {
            near: this.m_nearPlane,
            far: this.m_farPlane,
            minimum: this.minNear,
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
 * Factory function that creates default [[ClipPlanesEvaluator]] that calculates near plane based
 * on ground distance and camera orientation.
 *
 * Creates [[TiltViewClipPlanesEvaluator]].
 */
export const createDefaultClipPlanesEvaluator = () => new TiltViewClipPlanesEvaluator();
