/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { EarthConstants, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";

import { CameraUtils } from "./CameraUtils";
import { ElevationProvider } from "./ElevationProvider";
import { MapViewUtils } from "./Utils";

const epsilon = 0.000001;

namespace SphericalProj {
    const tmpVectors: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
    const raycaster = new THREE.Raycaster();
    const sphere = new THREE.Sphere(new THREE.Vector3(), EarthConstants.EQUATORIAL_RADIUS);

    /**
     * Calculate the horizon distance from a point above a sphere's surface.
     *
     * @remarks
     * Returns zero if point is below surface or only very slightly above surface of sphere.
     * @see https://en.wikipedia.org/wiki/Horizon#Derivation
     * @param d - Distance from point to center of sphere.
     * @param r - Radius of sphere.
     */
    function getHorizonDistance(d: number, r: number): number {
        // There may be situations when maximum elevation still remains below sea level
        // (elevation < 0) or it is negligible (elevation ~ epsilon)
        return d - r < epsilon ? 0 : Math.sqrt(d * d - r * r);
    }

    /**
     * Calculate furthest visible distance from camera position projected on eye direction.
     *
     * @remarks
     * Furthest visible distance is assumed to be distance from camera to horizon
     * plus distance from elevated geometry to horizon(so that high objects behind horizon
     * remain visible).
     * @see https://en.wikipedia.org/wiki/Horizon#Objects_above_the_horizon
     * @param camera - The camera.
     * @param d - Distance from camera to origin.
     * @param minR - Min sphere radius.
     * @param maxR - Max sphere radius.
     */
    export function getFarDistanceFromElevatedHorizon(
        camera: THREE.PerspectiveCamera,
        d: number,
        minR: number,
        maxR: number
    ): number {
        //                              F
        //                         far +_
        //         , - ~ ~ ~ - ,      +  <_
        //     , '               ' , +     <_ E
        //   ,           .          +,    . '
        //  ,            .   maxR  + , '   /
        // ,             .     ,  '    ,  /
        // ,             . O '   +     , / te
        // ,             | .    +      ,/
        //  ,            |   . minR   ,/
        //   ,           |     +.    ,/
        //     ,         |    +   , '/
        //       ' -_, _ | _ ,  '  / T (Tangent point = Horizon)
        //     near      |  +     /
        //             d | +    / t
        //               | +   /
        //               |+  /
        //               C /---> up
        //
        // CF: Forward (look-at) vector.
        // OC: Normal at camera
        // OCF: Angle between camera normal and forward vector.
        const t = getHorizonDistance(d, minR);

        // Because we would like to see elevated geometry that may be visible beyond
        // the tangent point on ground surface, we need to extend viewing distance along
        // the tangent line by te (see graph above).
        const te = getHorizonDistance(maxR, minR);

        const normalToTanAngle = Math.asin(minR / d); // Angle OCT
        // Angle between fwd vector (CF) and tangent (CT) in camera's up direction: FCT (= FCE)
        const fwdToTanAngle = Math.abs(
            normalToTanAngle - SphericalProj.getNormalToFwdAngle(camera)
        );

        // Project CE vector(length t + te) onto fwd vector (CF) to get far distance.
        // |CF| = cos(FCE) * |CE| (angle CFE is the projection right angle).
        const far = Math.cos(fwdToTanAngle) * (t + te);

        return far;
    }

    /**
     * Calculate distance to the nearest point where the near plane is tangent to the sphere,
     * projected onto the camera forward vector.
     * @param camera - The camera.
     * @param bottomFov - Angle from camera forward vector to frustum bottom plane.
     * @param R - The sphere radius.
     * @returns The tangent point distance if the point is visible, otherwise `undefined`.
     */
    export function getProjNearPlaneTanDistance(
        camera: THREE.Camera,
        bottomFov: number,
        R: number
    ): number | undefined {
        //                                                          ,^;;;;;;;;;;;;;;;;-
        //                                                      ^^^^:                `;^^^:
        //                          near plane              `++^                          '++^
        //                              ,                 :?;                                `*?'
        //                              +;              :\"                                     ^\-
        //                               {-           `/:                                         *>
        //                                }`  :^^^^` :/                                            '{`
        //                               ;\N^^'     :|                                              `}`
        //              fwdDir     ';^^^;` ,|      :(                                                 }`
        // up                  :^^^^,   90° *>     }                                                  '}
        //  ^            :^^^^,              ('   \'                                                   (-
        //  |      `;^^^;`                    }   }                                                     }
        //  | ,^^^^:                          `}  }                                                     }
        // CAM<--------------------------------{$?&-------------------------O                           {
        //    \ ';;;;;;;:`                      ^^}                  :^^^^,                             }
        //     \        `;;;;;;;;,               (%            -^^^^;`                                 `}
        //      \               `:;;;;;;;'        @, 90°  '^^^^;`                                      (-
        //       \       camToTanVec     ';;;;;;;TAN`:^^^^"   -R*fwdDir                               ,{
        //        \                              `:}@-                                               `}
        //         \                                *$                                              `}`
        //   Bottom frustum plane                    }$`                                           "(
        //                                            }{^                                        `\;
        //                                            `}"|:                                     >|`
        //                                             '( ,*+`                               '**`
        //                                              ;|   ^++-                         :+>:
        //                                               ;      ;^^^;`               -;^^^,
        //                                                          `;;;;;;;;;;;;;;;;"

        const fwdDir = camera.getWorldDirection(tmpVectors[0]);
        const camToTanVec = tmpVectors[1].copy(fwdDir).multiplyScalar(-R).sub(camera.position);
        const near = camToTanVec.dot(fwdDir);
        const cosTanDirToFwdDir = near / camToTanVec.length();

        // Tangent point visible if angle from fwdDir to tangent is less than to frustum bottom.
        return cosTanDirToFwdDir > Math.cos(bottomFov) ? near : undefined;
    }

    /**
     * Calculate the distance to the intersection of a given ray with the sphere,
     * projected onto the camera forward vector.
     * @param camera - The camera.
     * @param ndcDir - Ray direction in NDC coordinates.
     * @param R - The sphere radius.
     * @returns Intersection distance or `undefined` if there's no intersection.
     */
    export function getProjSphereIntersectionDistance(
        camera: THREE.Camera,
        ndcDir: THREE.Vector2,
        R: number
    ): number | undefined {
        raycaster.setFromCamera(ndcDir, camera);
        sphere.radius = R;
        const intersection = raycaster.ray.intersectSphere(sphere, tmpVectors[0]);

        return intersection !== null
            ? intersection.sub(camera.position).dot(camera.getWorldDirection(tmpVectors[1]))
            : undefined;
    }

    /**
     * Calculate angle between forward vector and surface normal at camera position.
     * @param camera - The camera.
     * @returns The angle in radians.
     */
    export function getNormalToFwdAngle(camera: THREE.PerspectiveCamera): number {
        const camToOriginDir = tmpVectors[0].copy(camera.position).negate().normalize();
        const cosAngle = camToOriginDir.dot(camera.getWorldDirection(tmpVectors[1]));
        return Math.acos(THREE.MathUtils.clamp(cosAngle, -1.0, 1.0));
    }
}

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
     * @remarks
     * Evaluation method should be called on every frame  and camera clip planes updated.
     * This is related to evaluator implementation and its input data, that may suddenly change
     * such as camera position or angle, projection type or so.
     * Some evaluators may not depend on all or even any of input objects, but to preserve
     * compatibility with any evaluator type it is strongly recommended to update on every frame.
     * @note The camera clipping planes (near/far properties) aren't automatically updated
     * via #evaluateClipPlanes() call, user should do it manually if needed.
     * @param camera - The camera in use.
     * @param projection - The geo-projection currently used for encoding geographic data.
     * @param elevationProvider - The optional elevation provider for fine tuned range calculation,
     * taking into account terrain variability and unevenness.
     *
     */
    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges;
}

/**
 * Abstract evaluator class that adds support for elevation constraints.
 *
 * @remarks
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

    abstract evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges;

    /**
     * Set maximum elevation above sea level to be rendered.
     *
     * @remarks
     * @param elevation - the elevation (altitude) value in world units (meters).
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
     * @remarks
     * @param elevation - the minimum elevation (depression) in world units (meters).
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
 * @deprecated Default evaluator {@link TiltViewClipPlanesEvaluator} supports top-down views.
 *
 * @remarks
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

    private readonly m_minimumViewRange: ViewRanges;

    /**
     * Allows to setup near/far offsets (margins), rendered geometry elevation relative to sea
     * level as also minimum near plane and maximum far plane distance constraints.
     *
     * @remarks
     * It is strongly recommended to set some reasonable [[nearFarMargin]] (offset) between near
     * and far planes to avoid flickering.
     * @param maxElevation - defines near plane offset from the ground in the surface normal
     * direction, positive values allows to render elevated terrain features (mountains,
     * buildings). Defaults to Burj Khalifa building height.
     * @param minElevation - defines far plane offset from the ground surface, negative values moves
     * far plane below the ground level (use it to render depressions). Default zero - sea level.
     * @param nearMin - minimum allowable near plane distance from camera, must be bigger than zero.
     * @param nearFarMarginRatio - minimum distance between near and far plane, as a ratio of
     * average near/far plane distance, it have to be significantly bigger than zero (especially if
     * [[maxElevation]] and [[minElevation]] are equal), otherwise you may notice flickering when
     * rendering, or even render empty scene if frustum planes are almost equal.
     * @param farMaxRatio - maximum ratio between ground and far plane distance, allows to limit
     * viewing distance at overall. Have to be bigger than 1.0.
     * @note Keep in mind that this evaluator does not evaluate terrain (or building) elevation
     * automatically, to keep such features rendered (between frustum planes) use [[minElevation]],
     * [[maxElevation]] constraints. You may change this parameters at any time, but it requires
     * repeating [[evaluatePlanes]] step, if your camera is moving you need to evaluate planes
     * anyway.
     * @note You may treat [[minElevation]] and [[maxElevation]] parameters as the maximum and
     * minimum renderable elevation respectively along the surface normal, when camera is
     * constantly looking downwards (top-down view). If you need {@link ClipPlanesEvaluator} for
     * cameras that support tilt or yaw please use {@link TiltViewClipPlanesEvaluator}.
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
        assert(nearFarMarginRatio >= 0);
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
    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        assert(camera instanceof THREE.PerspectiveCamera, "Unsupported camera type.");
        const persCamera = camera as THREE.PerspectiveCamera;
        if (projection.type === ProjectionType.Spherical) {
            return this.evaluateDistanceSphericalProj(persCamera, projection, elevationProvider);
        } else if (projection.type === ProjectionType.Planar) {
            return this.evaluateDistancePlanarProj(persCamera, projection, elevationProvider);
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

    protected evaluateDistancePlanarProj(
        camera: THREE.PerspectiveCamera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        assert(projection.type !== ProjectionType.Spherical);

        let nearPlane: number = this.nearMin;
        let farPlane: number = this.nearMin * this.farMaxRatio;

        // Calculate distance to closest point on the ground.
        const groundDistance = projection.groundDistance(camera.position);
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

    protected evaluateDistanceSphericalProj(
        camera: THREE.PerspectiveCamera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        assert(projection.type === ProjectionType.Spherical);

        // The near plane calculus is quite straight forward and works the same as for planar
        // projections. We simply search for the closest point of the ground just above
        // the camera, then we apply margin (elevation) to it along the sphere surface normal:
        const cameraAltitude = projection.groundDistance(camera.position);
        let nearPlane = cameraAltitude - this.maxElevation;

        const r = EarthConstants.EQUATORIAL_RADIUS;
        const d = Math.max(epsilon, camera.position.length());

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
        // Take fov directly if it is vertical, otherwise we translate it using aspect ratio:

        let halfFovAngle = THREE.MathUtils.degToRad(camera.fov / 2);
        // If width > height, then we have to compute the horizontal FOV.
        if (camera.aspect > 1) {
            halfFovAngle = MapViewUtils.calculateHorizontalFovByVerticalFov(
                halfFovAngle * 2,
                camera.aspect
            );
        }

        const maxR = r + this.maxElevation;
        const farTangent = SphericalProj.getFarDistanceFromElevatedHorizon(camera, d, r, maxR);
        let farPlane =
            halfFovAngle > alpha
                ? farTangent
                : this.getFovBasedFarPlane(camera, d, r, 2 * halfFovAngle, projection);
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
            const groundDistance = projection.groundDistance(camera.position);
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
}

/**
 * Evaluates camera clipping planes taking into account ground distance and camera tilt (pitch)
 * angle (angle between look-at vector and ground surface normal).
 */
export class TiltViewClipPlanesEvaluator extends TopViewClipPlanesEvaluator {
    private readonly m_tmpV2 = new THREE.Vector2();

    /** @override */
    protected evaluateDistancePlanarProj(
        camera: THREE.PerspectiveCamera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        // Find intersections of top/bottom frustum side's medians with the ground plane, taking
        // into account min/max elevations.Top side intersection distance determines the far
        // distance (it's further away than bottom intersection on tilted views), and bottom side
        // intersection distance determines the near distance.
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
        // The intersection distances to be found are |c1| (bottom plane) and |c2| (top plane).

        assert(projection.type !== ProjectionType.Spherical);
        const viewRanges = { ...this.minimumViewRange };
        const halfPiLimit = Math.PI / 2 - epsilon;
        const z = projection.groundDistance(camera.position);
        const cameraTilt = MapViewUtils.extractCameraTilt(camera, projection);

        // Angles between top/bottom plane and eye vector. For centered projections both are equal
        // to half of the vertical fov.
        const topFov = CameraUtils.getTopFov(camera);
        const bottomFov = CameraUtils.getBottomFov(camera);
        // Angle between z and c2
        const topAngle = THREE.MathUtils.clamp(cameraTilt + topFov, -halfPiLimit, halfPiLimit);
        // Angle between z and c1
        const bottomAngle = THREE.MathUtils.clamp(
            cameraTilt - bottomFov,
            -halfPiLimit,
            halfPiLimit
        );

        // Compute |c2|. This will determine the far distance (top intersection is further away than
        // bottom intersection on tilted views), so take the furthest distance possible, i.e.the
        // distance to the min elevation.
        // cos(topAngle) = (z2 - minElev) / |c2|
        // |c2| = (z2 - minElev) / cos(topAngle)
        const topDist = Math.max(0, (z - this.minElevation) / Math.cos(topAngle));
        // Compute |c1|. This will determine the near distance, so take the nearest distance
        // possible, i.e.the distance to the max elevation.
        const bottomDist = Math.max(0, (z - this.maxElevation) / Math.cos(bottomAngle));

        // Project intersection distances onto the eye vector.
        // cos(halfFov) = near / bottomDist
        // near = cos(halfFov) * bottomDist
        viewRanges.near = bottomDist * Math.cos(bottomFov);
        // cos(halfFov) = far / topDist
        // far = cos(halfFov) * topDist
        viewRanges.far = topDist * Math.cos(topFov);

        return this.applyViewRangeConstraints(viewRanges, camera, projection, elevationProvider);
    }

    /** @override */
    protected evaluateDistanceSphericalProj(
        camera: THREE.PerspectiveCamera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        assert(projection.type === ProjectionType.Spherical);
        const viewRanges = { ...this.minimumViewRange };

        viewRanges.near = this.computeNearDistSphericalProj(camera, projection);
        viewRanges.far = this.computeFarDistSphericalProj(camera, projection);

        return this.applyViewRangeConstraints(viewRanges, camera, projection, elevationProvider);
    }

    private computeNearDistSphericalProj(
        camera: THREE.PerspectiveCamera,
        projection: Projection
    ): number {
        assert(projection.type === ProjectionType.Spherical);

        // Default near plane approximation.
        const defaultNear = projection.groundDistance(camera.position) - this.maxElevation;
        const cameraBelowMaxElevation = defaultNear <= 0;
        if (cameraBelowMaxElevation) {
            // Near distance will be adjusted by constraints later.
            return 0;
        }

        const maxR = EarthConstants.EQUATORIAL_RADIUS + this.maxElevation;

        // Angles between bottom plane and eye vector. For centered projections it's equal to half
        // of the vertical fov.
        const bottomFov = CameraUtils.getBottomFov(camera);

        // First, use the distance of the near plane's tangent point to the sphere.
        const nearPlaneTanDist = SphericalProj.getProjNearPlaneTanDistance(camera, bottomFov, maxR);
        if (nearPlaneTanDist !== undefined) {
            return nearPlaneTanDist;
        }
        // If near plan tangent is not visible, use the distance to the closest frustum intersection
        // with the sphere. If principal point has a y offset <= 0, bottom frustum intersection
        // is at same distance or closer than top intersection, otherwise both need to be checked.
        // At least one of the sides must intersect, if not the near plane tangent must have been
        // visible.
        CameraUtils.getPrincipalPoint(camera, this.m_tmpV2);
        const checkTopIntersection = this.m_tmpV2.y > 0;
        const bottomDist = SphericalProj.getProjSphereIntersectionDistance(
            camera,
            this.m_tmpV2.setComponent(1, -1),
            maxR
        );
        const topDist = checkTopIntersection
            ? SphericalProj.getProjSphereIntersectionDistance(
                  camera,
                  this.m_tmpV2.setComponent(1, 1),
                  maxR
              )
            : Infinity;
        const near = Math.min(bottomDist ?? Infinity, topDist ?? Infinity);
        assert(near !== Infinity, "No reference point for near distance found");
        return near ?? defaultNear;
    }

    private computeFarDistSphericalProj(
        camera: THREE.PerspectiveCamera,
        projection: Projection
    ): number {
        assert(projection.type === ProjectionType.Spherical);
        const r = EarthConstants.EQUATORIAL_RADIUS;
        const minR = r + this.minElevation;
        const maxR = r + this.maxElevation;
        const d = camera.position.length();

        // If all frustum edges intersect the world, use as far distance the distance to the
        // farthest intersection projected on eye vector. If principal point has a y offset <= 0,
        // top frustum intersection is at same distance or farther than bottom intersection,
        // otherwise both need to be checked.
        CameraUtils.getPrincipalPoint(camera, this.m_tmpV2);
        const isRightIntersectionFarther = this.m_tmpV2.x <= 0.0;
        const ndcX = isRightIntersectionFarther ? 1 : -1;
        const checkBottomIntersection = this.m_tmpV2.y > 0;

        const topDist = SphericalProj.getProjSphereIntersectionDistance(
            camera,
            this.m_tmpV2.set(ndcX, 1),
            minR
        );
        const bottomDist = checkBottomIntersection
            ? SphericalProj.getProjSphereIntersectionDistance(
                  camera,
                  this.m_tmpV2.set(ndcX, -1),
                  minR
              )
            : 0;
        const largestDist = Math.max(topDist ?? Infinity, bottomDist ?? Infinity);
        if (largestDist !== Infinity) {
            return largestDist;
        }

        // If any frustum edge does not intersect (i.e horizon is visible in that viewport corner),
        // use the horizon distance at the maximum elevation.
        return SphericalProj.getFarDistanceFromElevatedHorizon(camera, d, r, maxR);
    }

    private applyViewRangeConstraints(
        viewRanges: ViewRanges,
        camera: THREE.Camera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        // Compute the focus point (target) distance for current camera and projection setup,
        // in a same way the MapView component does.
        const { distance } = MapViewUtils.getTargetAndDistance(
            projection,
            camera,
            elevationProvider
        );

        // Apply the constraints.
        const farMin = projection.groundDistance(camera.position) - this.minElevation;
        const farMax = distance * this.farMaxRatio;
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
}

/**
 * Creates default {@link ClipPlanesEvaluator}.
 * @internal
 */
export const createDefaultClipPlanesEvaluator = () => new TiltViewClipPlanesEvaluator();
