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

import { Tile, DataSource, ConcurrentDecoderFacade } from '@here/mapview';
import { TileKey, TilingScheme } from "@here/geoutils";
import { DataProvider } from "./DataProvider";
import { TileDecoder, Theme } from '@here/datasource-protocol';
import { CancellationException } from '@here/fetch';

export interface TileDataSourceOptions {
    id: string;
    tilingScheme: TilingScheme;
    dataProvider: DataProvider;
    usesWorker?: boolean;
    cacheSize?: number; // deprecated
    decoder?: TileDecoder;
    concurrentDecoderServiceName?: string;
    concurrentDecoderScriptUrl?: string;
}

export class TileDataSource<TileType extends Tile> extends DataSource {
    private m_isReady: boolean = false;
    private readonly m_decoder: TileDecoder;

    constructor(private readonly tileType: { new(dataSource: DataSource, tileKey: TileKey): TileType; }, private readonly m_options: TileDataSourceOptions) {

        super(m_options.id);
        if (m_options.decoder) {
            this.m_decoder = m_options.decoder;
        } else if (m_options.concurrentDecoderServiceName) {
            this.m_decoder = ConcurrentDecoderFacade.getTileDecoder(m_options.concurrentDecoderServiceName, m_options.concurrentDecoderScriptUrl);
        } else {
            throw new Error(`TileDataSource[${this.name}]: unable to create, missing decoder or concurrentDecoderServiceName`)
        }

        this.cacheable = true;
    }

    ready(): boolean {
        return this.m_isReady;
    }

    async connect() {
        if (this.m_options.usesWorker) {
            await Promise.all([
                this.m_options.dataProvider.connect(),
                this.m_decoder.connect()
            ]);
        } else {
            await this.m_options.dataProvider.connect();
        }

        this.m_isReady = true;
    }

    setTheme(theme: Theme | undefined): void {
        if (theme === undefined)
            return;
        this.m_decoder.configure(theme);
    }

    dataProvider(): DataProvider {
        return this.m_options.dataProvider;
    }

    getTilingScheme(): TilingScheme {
        return this.m_options.tilingScheme;
    }

    getTile(tileKey: TileKey): TileType | undefined {
        const tile = new this.tileType(this, tileKey);

        this.loadTileGeometry(tile)
            .catch(err => {
                if (!(err instanceof CancellationException))
                    console.log("TileDataSource: failed to fetch tile", err);
            });

        return tile;
    }

    private async loadTileGeometry(tile: Tile) {
        const payload = await this.m_options.dataProvider.getTile(tile.tileKey)

        if (payload.byteLength === 0)
            return;

        const decodedTile = await this.m_decoder.decodeTile(payload, tile.tileKey, this.name, this.projection);
        tile.createGeometries(decodedTile);
        this.requestUpdate();

        const stats = this.mapView.statistics;
        if (stats.enabled) {
            stats.getTimer("decoding").setValue(decodedTile.decodeTime);
        }
    }
}
