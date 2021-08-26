/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoPolygon, Projection } from "@here/harp-geoutils";

/**
 * View bounds for a given camera and world space projection.
 *
 * @internal
 */
export interface ViewBounds {
    readonly camera: THREE.Camera;
    readonly projection: Projection;

    /**
     * Generates a {@link @here/harp-geoutils#GeoPolygon} covering the visible map.
     * The coordinates are sorted to ccw winding, so a polygon could be drawn with them.
     * @returns The GeoPolygon with the view bounds or undefined if world is not in view.
     */
    generate(): GeoPolygon | undefined;
}
