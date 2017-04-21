/** @module @here/mapview-decoder **//** */

import { DataSource, DecodedTile } from '@here/mapview';
import { Decoder } from './Decoder';
import { TileKey } from "@here/geoutils";

export interface AbstractTileDataSourceOptions {
    id: string;
    decoder?: Decoder
}

export abstract class AbstractTileDataSource extends DataSource {
    constructor(options: AbstractTileDataSourceOptions) {
        super();

        if (options.decoder === undefined)
            return;

        options.decoder.addEventListener(options.id, (message: any) => {
            const decodedTile = message.data.decodedTile;
            const tileKey = message.data.tileKey;
            this.createGeometries(TileKey.fromMortonCode(tileKey), decodedTile);
        });
    }

    abstract createGeometries(tileKey: TileKey, decodedTile: DecodedTile): void;
}
