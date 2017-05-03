/** @module @here/mapview-decoder **//** */

import { Tile, DataSource } from '@here/mapview';
import { DecodedTile, getProjectionName } from '@here/datasource-protocol';
import { TileKey, TilingScheme, Projection, GeoBox } from "@here/geoutils";
import { LRUCache } from "@here/lrucache";
import { DataProvider } from "./DataProvider";
import { Decoder } from "./Decoder";
import * as THREE from 'three';

export interface TileDataSourceOptions {
    id: string;
    decoder?: Decoder;
    projection: Projection;
    tilingScheme: TilingScheme;
    cacheSize: number;
    dataProvider: DataProvider;
}

export abstract class CachedTile extends Tile {
    constructor(center: THREE.Vector3) {
        super(center);
    }
    abstract createGeometries(decodedTile: DecodedTile): void;
    abstract dispose(): void;
}

export class TileDataSource<TileType extends CachedTile> extends DataSource {
    private readonly m_tileCache: LRUCache<number, TileType>;

    constructor(private readonly tileType: { new(tileKey: TileKey, geoBox: GeoBox, center: THREE.Box3): TileType; }, private readonly m_options: TileDataSourceOptions) {

        super();

        if (m_options.decoder !== undefined) {
            m_options.decoder.addEventListener(m_options.id, (message: any) => {
                const decodedTile = message.data.decodedTile;
                const tileKey = message.data.tileKey;
                this.createGeometries(TileKey.fromMortonCode(tileKey), decodedTile);
            });
        }

        this.m_tileCache = new LRUCache<number, TileType>(m_options.cacheSize);
        this.m_tileCache.evictionCallback = (_, tile) => {
            tile.dispose();
        }
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

    getTile(tileKey: TileKey): Tile | undefined {
        let tile = this.m_tileCache.get(tileKey.mortonCode());
        if (tile !== undefined)
            return tile;
        const geoBox = this.getTilingScheme().getGeoBox(tileKey);
        const bounds = new THREE.Box3();
        this.m_options.projection.projectBox(geoBox, bounds);

        tile = new this.tileType(tileKey, geoBox, bounds);

        this.m_tileCache.set(tileKey.mortonCode(), tile);
        this.decodeTile(tile, tileKey);
        return tile;
    }

    private async decodeTile(tile: Tile, tileKey: TileKey) {
        const data = await this.m_options.dataProvider.getTile(tileKey);

        const message = {
            type: this.m_options.id,
            tileKey: tileKey.mortonCode(),
            data: data,
            projection: getProjectionName(this.m_options.projection),
        };

        if (this.m_options.decoder) // ### not optional?
            this.m_options.decoder.postMessage(message, [data]);
    }

    createGeometries(tileKey: TileKey, decodedTile: DecodedTile): void {
        const tile = this.m_tileCache.get(tileKey.mortonCode());
        if (tile === undefined)
            return;

        tile.createGeometries(decodedTile);
        this.requestUpdate();
    }
}
