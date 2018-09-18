/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { GeoBox } from "../coordinates/GeoBox";
import { TileKey } from "./TileKey";
import { TilingScheme } from "./TilingScheme";

/**
 * A class used to represent a quadtree.
 */
export class QuadTree {
    /**
     * Constructs a new `QuadTree` for the given [[TilingScheme]].
     *
     * Example:
     * ```typescript
     * const quadTree = new QuadTree(hereTilingScheme);
     * const geoBox = quadTree.getGeoBox(tileKey);
     * console.log(geoBox.center);
     * ```
     *
     * @param tilingScheme The TilingScheme used by this `QuadTree`.
     */
    constructor(readonly tilingScheme: TilingScheme) {}

    /**
     * Visits this `QuadTree` and invoke the given accept method with the current [[TileKey]] and
     * its bounding box in geo coordinates.
     *
     * Example:
     * ```typescript
     * const geoPos = new GeoCoordinates(latitude, longitude);
     * const quadTree = new QuadTree(hereTilingScheme);
     * quadTree.visit((tileKey, geoBox) => {
     *     if (geoBox.contains(geoPos)) {
     *         console.log("tile", tileKey, "contains", geoPos);
     *         return tileKey.level < 14; // stop visiting the quadtree if the level is >= 14.
     *     }
     *     return false; // stop visiting the quadtree,
     *                   // the tile's geoBox doesn't contain the given coordinates.
     * });
     * ```
     *
     * @param accept A function that takes a [[TileKey]] and its bounding box in geo coordinates and
     * returns `true` if the visit of the `QuadTree` should continue; otherwise `false`.
     */
    visit(accept: (tileKey: TileKey, geoBox: GeoBox) => boolean) {
        this.visitTileKey(TileKey.fromRowColumnLevel(0, 0, 0), accept);
    }

    /**
     * Visits the subtree starting from the given tile.
     *
     * @param tileKey The root of the subtree that should be visited.
     * @param accept A function that takes a [[TileKey]] and its bounding box in geo coordinates and
     * returns `true` if the visit of the `QuadTree` should continue; otherwise `false`.
     */
    visitTileKey(tileKey: TileKey, accept: (tileKey: TileKey, geoBox: GeoBox) => boolean) {
        const geoBox = this.tilingScheme.getGeoBox(tileKey);

        if (!accept(tileKey, geoBox)) {
            return;
        }

        for (const subTileKey of this.tilingScheme.getSubTileKeys(tileKey)) {
            this.visitTileKey(subTileKey, accept);
        }
    }
}
