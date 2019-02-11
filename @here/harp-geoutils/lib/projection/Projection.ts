/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { Vector3Like } from "../math/Vector3Like";

/**
 * `Projection` is used to convert positions from geo coordinates to world coordinates and vice
 * versa.
 */
export interface Projection {
    /**
     * Returns the world extents in world coordinates.
     *
     * @param minElevation The minimum elevation in meters.
     * @param maxElevation The maximum elevation in meters.
     * @param result The optional object that will be used to create the resulting bounding box.
     */
    worldExtent<Bounds extends Box3Like>(
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
     * @param geoPoint The position in geo coordinates.
     * @param result The optional object used to store the resulting world position, result must
     * implement [[Vector3Like]].
     */
    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates;

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
     * @param worldPoint The position in world coordinates.
     */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates;

    /**
     * Projects bounds in geo coordinates to a bounding box in world coordinates.
     *
     * Example:
     * ```typescript
     * const boundingBox = new THREE.Box3();
     * projection.projectBox(geoBox, boundingBox);
     * console.log(geoBox.min, geoBox.max, geoBox.getCenter());
     * ```
     *
     * @param geoBox The bounding box in geo coordinates.
     * @param result The resulting bounding box in world coordinates.
     */
    projectBox<WorldBoundingBox extends Box3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
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
     * @param worldBox The bounding box in world coordinates.
     */
    unprojectBox(worldBox: Box3Like): GeoBox;

    /**
     * Returns the scaling factor that must be used to convert the units used by `worldPoint` to
     * meters.
     *
     * @param worldPoint The position in world coordinates.
     */
    getScaleFactor<WorldCoordinates extends Vector3Like>(worldPoint: WorldCoordinates): number;
}
