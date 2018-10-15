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
