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

import { Tile, DataSource, ConcurrentDecoderFacade, TileLoaderState } from '@here/mapview';
import { TileKey, TilingScheme } from "@here/geoutils";
import { DataProvider } from "./DataProvider";
import { TileLoader, TileInfoLoader } from './TileLoader';
import { ITileDecoder, Theme, TileInfo } from '@here/datasource-protocol';

export interface TileDataSourceOptions {
    id: string;
    tilingScheme: TilingScheme;
    dataProvider: DataProvider;
    useWorker?: boolean;
    cacheSize?: number; // deprecated
    decoder?: ITileDecoder;
    concurrentDecoderServiceName?: string;
    concurrentDecoderScriptUrl?: string;
}

export class TileFactory<TileType extends Tile> {
    constructor(
        private modelConstructor: new (dataSource: DataSource, tileKey: TileKey) => TileType
    ) {
    }

    create(dataSource: DataSource, tileKey: TileKey): TileType {
        return new (this.modelConstructor)(dataSource, tileKey);
    }
}

export class TileDataSource<TileType extends Tile> extends DataSource {
    private m_isReady: boolean = false;
    private readonly m_decoder: ITileDecoder;

    constructor(
        private readonly tileFactory: TileFactory<TileType>,
        private readonly m_options: TileDataSourceOptions
    ) {

        super(m_options.id);
        if (m_options.decoder) {
            this.m_decoder = m_options.decoder;
        } else if (m_options.concurrentDecoderServiceName) {
            this.m_decoder = ConcurrentDecoderFacade.getTileDecoder(
                m_options.concurrentDecoderServiceName,
                m_options.concurrentDecoderScriptUrl);
        } else {
            throw new Error(`TileDataSource[${this.name}]: unable to create, missing decoder or ` +
                `concurrentDecoderServiceName`);
        }

        this.cacheable = true;
    }

    dispose() {
        this.decoder.dispose();
    }

    ready(): boolean {
        return this.m_isReady;
    }

    get decoder(): ITileDecoder {
        return this.m_decoder;
    }

    async connect() {
        if (this.m_options.useWorker) {
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
        this.mapView.markTilesDirty(this);
    }

    dataProvider(): DataProvider {
        return this.m_options.dataProvider;
    }

    getTilingScheme(): TilingScheme {
        return this.m_options.tilingScheme;
    }

    getTile(tileKey: TileKey): TileType | undefined {
        const tile = this.tileFactory.create(this, tileKey);
        tile.tileLoader = new TileLoader(
            this,
            tileKey,
            this.m_options.dataProvider,
            this.decoder);

        this.updateTile(tile);
        return tile;
    }

    getTileInfo(tileKey: TileKey): Promise<TileInfo|undefined> {

        const promise = new Promise<TileInfo|undefined>((resolve, reject) => {
            const tileLoader = new TileInfoLoader(
                this,
                tileKey,
                this.m_options.dataProvider,
                this.decoder);

            tileLoader.loadAndDecode().then(loaderState => {

                if (loaderState === TileLoaderState.Ready) {
                    resolve(tileLoader.tileInfo);
                } else {
                    reject(new Error(`TileDataSource#getInfoTile wrong final state: ${
                        loaderState}`));
                }
            })
        });

        return promise;
    }

    updateTile(tile: Tile) {
        const tileLoader = tile.tileLoader;
        if (tileLoader === undefined) {
            return;
        }

        tileLoader.loadAndDecode().then(loaderState => {
            if (tileLoader.decodedTile) {

                tile.setDecodedTile(tileLoader.decodedTile);

                this.requestUpdate();
            } else {
                // empty tiles are traditionally ignored and don't need decode
                tile.forceHasGeometry(true);
            }
        });
    }
}
