import { TileKey } from "@here/geoutils";
import { DataSource, Tile } from "@here/mapview";

export class OmvTile extends Tile {
    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);
    }
}
