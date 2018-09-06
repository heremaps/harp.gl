/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import {
    mercatorProjection,
    Projection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/geoutils";
import { DataSource } from "../lib/DataSource";
import { Tile } from "../lib/Tile";

export class FakeOmvDataSource extends DataSource {
    constructor() {
        super("omv");
        this.cacheable = true;
    }

    get projection(): Projection {
        return mercatorProjection;
    }

    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);
        return tile;
    }
    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > 14) {
            return false;
        }
        if (tileKey.level === 14 && zoomLevel >= 14) {
            return true;
        }
        return super.shouldRender(zoomLevel, tileKey);
    }
}
