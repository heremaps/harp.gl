import { DataSource as MapViewDataSource, DecodedTile } from '@here/mapview';
import { Decoder } from './Decoder';
import { TileKey } from "@here/geoutils";

export abstract class TileDataSource extends MapViewDataSource {
    constructor(public readonly decoder: Decoder, public readonly id: string) {
        super();

        this.decoder.addEventListener(id, (message: any) => {
            const decodedTile = message.data.decodedTile;
            const tileKey = message.data.tileKey;
            this.createGeometries(tileKey, decodedTile);
        });
    }

    abstract createGeometries(tileKey: TileKey, decodedTile: DecodedTile): void;
}
