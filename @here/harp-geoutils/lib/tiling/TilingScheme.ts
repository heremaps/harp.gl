/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { Projection } from "../projection/Projection";
import { FlatTileBoundingBoxGenerator } from "./FlatTileBoundingBoxGenerator";
import { SubdivisionScheme } from "./SubdivisionScheme";
import { TileKey } from "./TileKey";
import { TileKeyUtils } from "./TileKeyUtils";
import { TileTreeTraverse } from "./TileTreeTraverse";

/**
 * The `TilingScheme` represents how the data is tiled.
 */
export class TilingScheme {
    readonly boundingBoxGenerator: FlatTileBoundingBoxGenerator;
    readonly tileTreeTraverse: TileTreeTraverse;

    /**
     * Constructs a new `TilingScheme` with the given subdivision scheme and projection.
     *
     * @param subdivisionScheme - The subdivision scheme used by this `TilingScheme`.
     * @param projection - The projection used by this `TilingScheme`.
     */
    constructor(readonly subdivisionScheme: SubdivisionScheme, readonly projection: Projection) {
        this.boundingBoxGenerator = new FlatTileBoundingBoxGenerator(this);
        this.tileTreeTraverse = new TileTreeTraverse(subdivisionScheme);
    }

    /**
     * Returns the sub tile keys of the given tile.
     *
     * @param tileKey - The {@link TileKey}.
     * @returns The list of the sub tile keys.
     */
    getSubTileKeys(tileKey: TileKey): Iterable<TileKey> {
        return this.tileTreeTraverse.subTiles(tileKey);
    }

    /**
     * Gets the {@link TileKey} from the given geo position and level.
     *
     * @param geoPoint - The position in geo coordinates.
     * @param level - The level of the resulting `TileKey`.
     */
    getTileKey(geoPoint: GeoCoordinatesLike, level: number): TileKey | null {
        return TileKeyUtils.geoCoordinatesToTileKey(this, geoPoint, level);
    }

    /**
     * Gets the list of {@link TileKey}s contained in the given {@link GeoBox}.
     *
     * @param geoBox - The bounding box in geo coordinates.
     * @param level - The level of the resulting `TileKey`.
     */
    getTileKeys(geoBox: GeoBox, level: number): TileKey[] {
        return TileKeyUtils.geoRectangleToTileKeys(this, geoBox, level);
    }

    /**
     * Returns the bounding box in geo coordinates for the given {@link TileKey}.
     *
     * @param tileKey - The `TileKey`.
     */
    getGeoBox(tileKey: TileKey): GeoBox {
        return this.boundingBoxGenerator.getGeoBox(tileKey);
    }

    /**
     * Returns the bounding box in world coordinates.
     *
     * @param tileKey - The `TileKey`.
     * @param result - The optional object that will contain the resulting bounding box.
     */
    getWorldBox(tileKey: TileKey, result?: Box3Like): Box3Like {
        return this.boundingBoxGenerator.getWorldBox(tileKey, result);
    }
}
