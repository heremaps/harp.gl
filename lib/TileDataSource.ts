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

import { Tile, DataSource, Decoder } from '@here/mapview';
import { DecodedTile, getProjectionName } from '@here/datasource-protocol';
import { TileKey, TilingScheme, Projection } from "@here/geoutils";
import { LRUCache } from "@here/lrucache";
import { DataProvider } from "./DataProvider";

export interface TileDataSourceOptions {
    id: string;
    tilingScheme: TilingScheme;
    dataProvider: DataProvider;
    usesWorker?: boolean;
    cacheSize?: number; // deprecated
}

export class TileDataSource<TileType extends Tile> extends DataSource {
    private m_isReady: boolean = false;

    constructor(private readonly tileType: { new(dataSource: DataSource, tileKey: TileKey, projection: Projection): TileType; }, private readonly m_options: TileDataSourceOptions) {

        super(m_options.id);

        this.cacheable = true;
    }

    ready(): boolean {
        return this.m_isReady;
    }

    async connect(decoder: Decoder | undefined) {
        if (this.m_options.usesWorker) {
            if (decoder === undefined)
                throw new Error("Data source requires a decoder");

            await Promise.all([this.m_options.dataProvider.connect(), decoder.connect(this.m_options.id)]);
        } else {
            await this.m_options.dataProvider.connect();
        }

        this.m_isReady = true;
    }

    dataProvider(): DataProvider {
        return this.m_options.dataProvider;
    }

    getTilingScheme(): TilingScheme {
        return this.m_options.tilingScheme;
    }

    getTile(tileKey: TileKey, projection: Projection, decoder: Decoder): TileType | undefined {
        const tile = new this.tileType(this, tileKey, projection);

        this.m_options.dataProvider.getTile(tileKey).then(data => {
            if (tile.disposed)
                return; // the response arrived too late.
            if (data.byteLength > 0)
                this.decodeTile(data, tileKey, projection, decoder);
        });

        return tile;
    }
}
