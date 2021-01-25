/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, Projection } from "@here/harp-geoutils";
import * as THREE from "three";

import { Tile } from "../Tile";

/**
 * Coordinates of a tile's corners.
 * @internal
 * @hidden
 */
export interface TileCorners {
    se: THREE.Vector3;
    sw: THREE.Vector3;
    ne: THREE.Vector3;
    nw: THREE.Vector3;
}

/**
 * Returns the corners of the tile's geo bounding box projected using a given projection.
 * @param tile - The tile whose corners will be projected.
 * @param projection - The projection to be used.
 * @returns The projected tile corners.
 * @internal
 * @hidden
 */
export function projectTilePlaneCorners(tile: Tile, projection: Projection): TileCorners {
    const { east, west, north, south } = tile.geoBox;
    const sw = projection.projectPoint(new GeoCoordinates(south, west), new THREE.Vector3());
    const se = projection.projectPoint(new GeoCoordinates(south, east), new THREE.Vector3());
    const nw = projection.projectPoint(new GeoCoordinates(north, west), new THREE.Vector3());
    const ne = projection.projectPoint(new GeoCoordinates(north, east), new THREE.Vector3());
    return { sw, se, nw, ne };
}
