/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { TileKey } from "./TileKey";
import { TilingScheme } from "./TilingScheme";

/**
 * A class used to represent a quadtree.
 */
export class QuadTree {
    /**
     * Constructs a new `QuadTree` for the given {@link TilingScheme}.
     *
     * Example:
     * ```typescript
     * const quadTree = new QuadTree(hereTilingScheme);
     * const geoBox = quadTree.getGeoBox(tileKey);
     * console.log(geoBox.center);
     * ```
     *
     * @param tilingScheme - The TilingScheme used by this `QuadTree`.
     */
    constructor(readonly tilingScheme: TilingScheme) {}

    /**
     * Visits this `QuadTree` and invoke the given accept method
     * with the current {@link TileKey} and
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
     * @param accept - A function that takes a {@link TileKey}
     * and its bounding box in geo coordinates
     * and returns `true` if the visit of the `QuadTree`
     * should continue; otherwise `false`.
     */
    visit(accept: (tileKey: TileKey, geoBox: GeoBox) => boolean) {
        this.visitTileKey(TileKey.fromRowColumnLevel(0, 0, 0), accept);
    }

    /**
     * Visits the subtree starting from the given tile.
     *
     * @param tileKey - The root of the subtree that should be visited.
     * @param accept - A function that takes a {@link TileKey}
     *                 and its bounding box in geo coordinates
     *                 and returns `true` if the visit of the
     *                 `QuadTree` should continue; otherwise `false`.
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
