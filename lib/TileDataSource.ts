/** @module @here/mapview-decoder **//** */

import { DataSource, DecodedTile } from '@here/mapview';
import { Decoder } from './Decoder';
import { TileKey } from "@here/geoutils";

export abstract class TileDataSource extends DataSource {
    constructor(public readonly id: string, public readonly decoder?: Decoder) {
        super();

        if (this.decoder === undefined)
            return;

        this.decoder.addEventListener(id, (message: any) => {
            const decodedTile = message.data.decodedTile;
            const tileKey = message.data.tileKey;
            this.createGeometries(TileKey.fromMortonCode(tileKey), decodedTile);
        });
    }

    abstract createGeometries(tileKey: TileKey, decodedTile: DecodedTile): void;
}
