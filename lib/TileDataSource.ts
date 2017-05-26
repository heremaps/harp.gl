/** @module @here/mapview-decoder **//** */

import { Tile, DataSource } from '@here/mapview';
import { DecodedTile, getProjectionName } from '@here/datasource-protocol';
import { TileKey, TilingScheme, Projection } from "@here/geoutils";
import { LRUCache } from "@here/lrucache";
import { DataProvider } from "./DataProvider";
import { Decoder } from "./Decoder";

export interface TileDataSourceOptions {
    id: string;
    decoder: Decoder;
    tilingScheme: TilingScheme;
    dataProvider: DataProvider;

    /**
     * Deprecated, the value of this property will be ignored.
     */
    cacheSize?: number;
}

export abstract class CachedTile extends Tile {
    constructor(dataSource: DataSource, tileKey: TileKey, projection: Projection) {
        super(dataSource, tileKey, projection);
    }
    abstract createGeometries(decodedTile: DecodedTile): void;
    abstract dispose(): void;
}

export class TileDataSource<TileType extends CachedTile> extends DataSource {
    private readonly m_pendingTileCache: LRUCache<number, TileType>;

    constructor(private readonly tileType: { new (dataSource: DataSource, tileKey: TileKey, projection: Projection): TileType; }, private readonly m_options: TileDataSourceOptions) {

        super();

        if (m_options.decoder !== undefined) {
            m_options.decoder.addEventListener(m_options.id, (message: any) => {
                const decodedTile = message.data.decodedTile;
                const tileKey = message.data.tileKey;
                this.createGeometries(TileKey.fromMortonCode(tileKey), decodedTile);
            });
        }

        this.m_pendingTileCache = new LRUCache<number, TileType>(32);
    }

    ready(): boolean {
        return this.m_options.dataProvider.ready();
    }

    async connect() {
        await this.m_options.dataProvider.connect();
    }

    getTilingScheme(): TilingScheme {
        return this.m_options.tilingScheme;
    }

    getTile(tileKey: TileKey, projection: Projection): Tile | undefined {
        let tile = this.m_pendingTileCache.get(tileKey.mortonCode());
        if (tile !== undefined)
            return tile;

        tile = new this.tileType(this, tileKey, projection);
        this.m_pendingTileCache.set(tileKey.mortonCode(), tile);
        this.decodeTile(tile, tileKey, projection);
        return tile;
    }

    private async decodeTile(tile: Tile, tileKey: TileKey, projection: Projection) {
        const data = await this.m_options.dataProvider.getTile(tileKey);

        const message = {
            type: this.m_options.id,
            tileKey: tileKey.mortonCode(),
            data: data,
            projection: getProjectionName(projection),
        };

        if (this.m_options.decoder) // ### not optional?
            this.m_options.decoder.postMessage(message, [data]);
    }

    createGeometries(tileKey: TileKey, decodedTile: DecodedTile): void {
        const tile = this.m_pendingTileCache.get(tileKey.mortonCode());
        if (tile === undefined)
            return;

        tile.createGeometries(decodedTile);

        this.m_pendingTileCache.delete(tileKey.mortonCode());

        this.requestUpdate();
    }
}
