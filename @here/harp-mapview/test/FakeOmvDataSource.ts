/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    mercatorProjection,
    Projection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { DataSource } from "../lib/DataSource";
import { Tile } from "../lib/Tile";

export class FakeOmvDataSource extends DataSource {
    constructor() {
        super({ name: "omv" });
        this.cacheable = true;
    }

    /** @override */
    get projection(): Projection {
        return mercatorProjection;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }
    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);
        return tile;
    }
    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > 14) {
            return false;
        }
        if (tileKey.level <= 14 && zoomLevel >= 14) {
            return true;
        }
        return super.canGetTile(zoomLevel, tileKey);
    }
}
