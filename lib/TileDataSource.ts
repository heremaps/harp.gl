/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

/** @module @here/mapview-decoder **//** */

import { Tile, DataSource, Decoder } from '@here/mapview';
import { DecodedTile, getProjectionName } from '@here/datasource-protocol';
import { TileKey, TilingScheme, Projection } from "@here/geoutils";
import { LRUCache } from "@here/lrucache";
import { DataProvider } from "./DataProvider";
import { DecodeTileRequest } from "@here/mapview-decoder/lib/WorkerClient";

export interface TileDataSourceOptions {
    id: string;
    tilingScheme: TilingScheme;
    cacheSize: number;
    dataProvider: DataProvider;
}

export abstract class CachedTile extends Tile {
    constructor(dataSource: DataSource, tileKey: TileKey, projection: Projection) {
        super(dataSource, tileKey, projection);
    }
    abstract createGeometries(decodedTile: DecodedTile): void;
    abstract dispose(): void;
}

export class TileDataSource<TileType extends CachedTile> extends DataSource {
    private readonly m_tileCache: LRUCache<number, TileType>;

    constructor(private readonly tileType: { new (dataSource: DataSource, tileKey: TileKey, projection: Projection): TileType; }, private readonly m_options: TileDataSourceOptions) {

        super(m_options.id);

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

    getTile(tileKey: TileKey, projection: Projection, decoder: Decoder): TileType | undefined {
        let tile = this.m_tileCache.get(tileKey.mortonCode());
        if (tile !== undefined)
            return tile;

        tile = new this.tileType(this, tileKey, projection);

        this.m_tileCache.set(tileKey.mortonCode(), tile);

        this.m_options.dataProvider.getTile(tileKey).then(data => {
            this.decodeTile(data, tileKey, projection, decoder);
        });

        return tile;
    }

    tileDecoded(tileKey: TileKey, decodedTile: DecodedTile) {
        this.createGeometries(tileKey, decodedTile);
    }

    createGeometries(tileKey: TileKey, decodedTile: DecodedTile): void {
        const tile = this.m_tileCache.get(tileKey.mortonCode());

        if (tile === undefined)
            return;

        tile.createGeometries(decodedTile);
        this.requestUpdate();
    }
}
