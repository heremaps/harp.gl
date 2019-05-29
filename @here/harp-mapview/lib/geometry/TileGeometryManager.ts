/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapView } from "../MapView";
import { Tile } from "../Tile";
import { SimpleTileGeometryLoader, TileGeometryLoader } from "./TileGeometryLoader";

/**
 * Manages the content (the geometries) of a tile. Derived classes allow different strategies that
 * control the sequence in which the geometries of the tile are being loaded.
 */
export interface TileGeometryManager {
    /**
     * Initialize the [[Tile]] with the TileGeometryManager.
     */
    initTile(tile: Tile): void;

    /**
     * Process the [[Tile]]s for rendering. May alter the content of the tile per frame.
     */
    updateTiles(tiles: Tile[]): void;
}

/**
 * Base class for all [[TileGeometryManager]]s.
 */
export abstract class TileGeometryManagerBase implements TileGeometryManager {
    /**
     * Creates an instance of `TileGeometryManagerBase` with a reference to the [[MapView]].
     */
    constructor(protected mapView: MapView) {}

    abstract initTile(tile: Tile): void;

    abstract updateTiles(tiles: Tile[]): void;
}

/**
 * Implements the simplest for of [[TileGeometryManager]]. Uses a [[SimpleTileGeometryLoader]] to
 * load the geometries of the [[Tile]].
 */
export class SimpleTileGeometryManager extends TileGeometryManagerBase {
    /**
     * Creates an instance of `SimpleTileGeometryManager` with a reference to the [[MapView]].
     */
    constructor(mapView: MapView) {
        super(mapView);
    }

    initTile(tile: Tile): void {
        tile.tileGeometryLoader = new SimpleTileGeometryLoader(tile);
    }

    updateTiles(tiles: Tile[]): void {
        for (const tile of tiles) {
            const geometryLoader = tile.tileGeometryLoader as TileGeometryLoader;
            if (geometryLoader !== undefined) {
                geometryLoader.update();
            }
        }
    }
}
