/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike, isGeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { OrientedBox3Like } from "../math/OrientedBox3Like";
import { TransformLike } from "../math/TransformLike";
import { Vector3Like } from "../math/Vector3Like";

/**
 * The type of projection.
 */
export enum ProjectionType {
    /**
     * A type of [Projection] with zero curvature.
     */
    Planar,

    /**
     * A spherical [Projection].
     */
    Spherical
}

/**
 * `Projection` is used to convert positions from geo coordinates to world coordinates and vice
 * versa.
 */
export abstract class Projection {
    /**
     * The type of this [Projection].
     */
    abstract get type(): ProjectionType;

    /**
     * Constructs the Projection
     *
     * @param unitScale - How to transform the projected coordinates to world units.
     */
    constructor(readonly unitScale: number) {
        //Prevent empty constructor error.
    }

    /**
     * Returns the world extents in world coordinates.
     *
     * @param minElevation - The minimum elevation in meters.
     * @param maxElevation - The maximum elevation in meters.
     * @param result - The optional object that will be used to create the resulting bounding box.
     */
    abstract worldExtent<Bounds extends Box3Like>(
        minElevation: number,
        maxElevation: number,
        result?: Bounds
    ): Bounds;

    /**
     * Projects a point from geo coordinates (latitude, longitude, altitude) to world coordinates
     * (x,y,z).
     *
     * Example:
     * ```typescript
     * const worldPos = new THREE.Vector3();
     * projection.projectPoint(geoPos, worldPos);
     * ```
     *
     * @param geoPoint - The position in geo coordinates.
     * @param result - The optional object used to store the resulting world position, result must
     * implement {@link Vector3Like}.
     */
    abstract projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates;

    /**
     * Gets the {@link TransformLike} of the local tangent space at the given point.
     *
     * @param point - The geo / world coordinates.
     * @param result - The {@link TransformLike}.
     */
    localTangentSpace(
        point: GeoCoordinatesLike | Vector3Like,
        result: TransformLike
    ): TransformLike {
        if (isGeoCoordinatesLike(point)) {
            this.projectPoint(point, result.position);
        } else {
            MathUtils.copyVector3(point, result.position);
        }
        MathUtils.newVector3(1, 0, 0, result.xAxis);
        MathUtils.newVector3(0, 1, 0, result.yAxis);
        MathUtils.newVector3(0, 0, 1, result.zAxis);
        return result;
    }

    /**
     * Returns the geo coordinates (latitude, longitude, altitude) from the given world position
     * (x,y,z).
     *
     * Example:
     * ```typescript
     * const geoPos = projection.unprojectPoint(worldPos);
     * console.log(geoPos.latitude, geoPos.longitude, geoPos.altitude);
     * ```
     *
     * @param worldPoint - The position in world coordinates.
     */
    abstract unprojectPoint(worldPoint: Vector3Like): GeoCoordinates;

    /**
     * Returns the altitude at the given world position (x,y,z) in meters.
     *
     * @param worldPoint - The position in world coordinates.
     */
    abstract unprojectAltitude(worldPoint: Vector3Like): number;

    /**
     * Projects bounds in geo coordinates to a bounding box in world coordinates.
     *
     * Example:
     * ```typescript
     * const bounds = projection.projectBox(geoBox);
     * console.log(bounds.min, bounds.max);
     * ```
     *
     * @param geoBox - The bounding box in geo coordinates.
     */
    abstract projectBox(geoBox: GeoBox): Box3Like;

    /**
     * Projects bounds in geo coordinates to a bounding box in world coordinates.
     *
     * Example:
     * ```typescript
     * const bounds = projection.projectBox(geoBox, new THREE.Box3());
     * console.log(bounds.min, bounds.max);
     * ```
     *
     * @param geoBox - The bounding box in geo coordinates.
     * @param result - The resulting {@link OrientedBox3Like}.
     */
    abstract projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result: WorldBoundingBox
    ): WorldBoundingBox;

    /**
     * Converts a bounding box in world coordinates to a bounding box in geo coordinates.
     *
     * Example:
     * ```typescript
     * const geoPos = projection.unprojectPoint(worldPos);
     * console.log(geoPos.latitude, geoPos.longitude, geoPos.altitude);
     * ```
     *
     * @param worldBox - The bounding box in world coordinates.
     */
    abstract unprojectBox(worldBox: Box3Like): GeoBox;

    /**
     * Returns the scaling factor that must be used to convert the units used by `worldPoint` to
     * meters.
     *
     * @param worldPoint - The position in world coordinates.
     */
    abstract getScaleFactor(worldPoint: Vector3Like): number;

    /**
     * Returns the surface normal at the given world position.
     *
     * @param worldPoint - The position in world coordinates.
     */
    abstract surfaceNormal(worldPoint: Vector3Like): Vector3Like;

    /**
     * Returns the surface normal at the given world position.
     *
     * @param worldPoint - The position in world coordinates.
     * @returns The resulting normal vector.
     */
    abstract surfaceNormal<Normal extends Vector3Like>(
        worldPoint: Vector3Like,
        result: Normal
    ): Normal;

    /**
     * Returns the signed distance between the given coordinates and
     * the closest point on the surface.
     *
     * @param worldPoint - The position in world coordinates.
     */
    abstract groundDistance(worldPoint: Vector3Like): number;

    /**
     * Scales the given world coordinates to the surface.
     *
     * @param worldPoint - The position in world coordinates.
     */
    abstract scalePointToSurface(worldPoint: Vector3Like): Vector3Like;

    /**
     * Reproject a world position from the given source {@link Projection}.
     *
     * @param sourceProjection - The source projection.
     * @param worldPos - A valid world position for the given source projection.
     * @returns The world position reprojected using this {@link Projection}.
     */
    reprojectPoint(sourceProjection: Projection, worldPos: Vector3Like): Vector3Like;

    /**
     * Reproject a world position from the given source {@link Projection}.
     *
     * @param sourceProjection - The source projection.
     * @param worldPos - A valid position in the world space defined by the source projection.
     * @param result - The resulting position reprojected using this {@link Projection}.
     */
    reprojectPoint<WorldCoordinates extends Vector3Like>(
        sourceProjection: Projection,
        worldPos: Vector3Like,
        result: WorldCoordinates
    ): WorldCoordinates;

    /**
     * Reproject a world position from the given source {@link Projection}.
     * Implementations should be aware of worldPos and result may be one object
     *
     * @param sourceProjection - The source projection.
     * @param worldPos - A valid position in the world space defined by the source projection.
     * @param result - The resulting position reprojected using this {@link Projection}.
     * @hidden
     */
    reprojectPoint(
        sourceProjection: Projection,
        worldPos: Vector3Like,
        result?: Vector3Like
    ): Vector3Like {
        if (sourceProjection === this) {
            if (result === undefined) {
                return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
            }
            result.x = worldPos.x;
            result.y = worldPos.y;
            result.z = worldPos.z;
            return result;
        }
        return this.projectPoint(sourceProjection.unprojectPoint(worldPos), result);
    }
}
