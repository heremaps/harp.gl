/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { ITileDecoder, Theme, TileInfo } from "@here/datasource-protocol";
import { TileKey, TilingScheme } from "@here/geoutils";
import { ConcurrentDecoderFacade, DataSource, Tile, TileLoaderState } from "@here/mapview";

import { DataProvider } from "./DataProvider";
import { TileInfoLoader, TileLoader } from "./TileLoader";

/**
 * Set of common options for all [[TileDataSource]]s.
 */
export interface TileDataSourceOptions {
    /**
     * Name of [[TileDataSource]], must be unique.
     */
    id: string;

    /**
     * The [[TilingScheme]] the data source is using.
     */
    tilingScheme: TilingScheme;

    /**
     * The [[DataProvider]] to use for downloading the actual data.
     */
    dataProvider: DataProvider;

    /**
     * Specify if the decoding should be handled in web workers.
     */
    useWorker?: boolean;

    /**
     * Optional: Specify [[ITileDecoder]] instance.
     */
    decoder?: ITileDecoder;

    /**
     * Optional name of decoder service.
     * @see [[ConcurrentDecoderFacade]]
     * @see [[ConcurrentWorkerSet]]
     */
    concurrentDecoderServiceName?: string;

    /**
     * Optional URL for decoder bundle to be loaded into web worker.
     */
    concurrentDecoderScriptUrl?: string;
}

/**
 * Templated factory class to create instances of [[Tile]].
 */
export class TileFactory<TileType extends Tile> {
    /**
     * Initialize the factory using the constructor of the element to be called when a [[Tile]] is
     * created.
     *
     * @param m_modelConstructor Constructor of (subclass of) [[Tile]].
     */
    constructor(
        private m_modelConstructor: new (dataSource: DataSource, tileKey: TileKey) => TileType
    ) {}

    /**
     * Create an instance of (subclass of) [[Tile]]. The required parameters are passed as arguments
     * to the constructor of [[Tile]].
     *
     * @param dataSource [[Datasource]] this class belongs to.
     * @param tileKey Quadtree address of the [[Tile]].
     */
    create(dataSource: DataSource, tileKey: TileKey): TileType {
        return new this.m_modelConstructor(dataSource, tileKey);
    }
}

/**
 * Common base class for the typical [[DataSource]] which uses an [[ITileDecoder]] to decode the
 * tile content asynchronously. The decoder can be passed in as an option, or a default
 * asynchronous one is generated.
 */
export class TileDataSource<TileType extends Tile> extends DataSource {
    private m_isReady: boolean = false;
    private readonly m_decoder: ITileDecoder;

    /**
     * Set up the `TileDataSource`.
     *
     * @param m_tileFactory Factory to create the [[Tile]] instances.
     * @param m_options Options specifying the parameters of the [[DataSource]].
     */
    constructor(
        private readonly m_tileFactory: TileFactory<TileType>,
        private readonly m_options: TileDataSourceOptions
    ) {
        super(m_options.id);
        if (m_options.decoder) {
            this.m_decoder = m_options.decoder;
        } else if (m_options.concurrentDecoderServiceName) {
            this.m_decoder = ConcurrentDecoderFacade.getTileDecoder(
                m_options.concurrentDecoderServiceName,
                m_options.concurrentDecoderScriptUrl
            );
        } else {
            throw new Error(
                `TileDataSource[${this.name}]: unable to create, missing decoder or ` +
                    `concurrentDecoderServiceName`
            );
        }

        this.cacheable = true;
    }

    dispose() {
        this.decoder.dispose();
    }

    ready(): boolean {
        return this.m_isReady;
    }

    /**
     * Get the [[ITileDecoder]] of this `ITileDataSource`, which has either been passed in with
     * the options, or has been supplied by the [[ConcurrentDecoderFacade]].
     */
    get decoder(): ITileDecoder {
        return this.m_decoder;
    }

    async connect() {
        if (this.m_options.useWorker === true) {
            await Promise.all([this.m_options.dataProvider.connect(), this.m_decoder.connect()]);
        } else {
            await this.m_options.dataProvider.connect();
        }

        this.m_isReady = true;
    }

    setTheme(theme: Theme | undefined): void {
        if (theme === undefined) {
            return;
        }
        this.m_decoder.configure(theme);
        this.mapView.markTilesDirty(this);
    }

    /**
     * Get the [[DataProvider]] that has been passed in with the options.
     */
    dataProvider(): DataProvider {
        return this.m_options.dataProvider;
    }

    getTilingScheme(): TilingScheme {
        return this.m_options.tilingScheme;
    }

    /**
     * Create a [[Tile]] and start the asynchronous download of the tile content. The [[Tile]] will
     * be empty, but the download and decoding will be scheduled immediately.
     *
     * @param tileKey Quadtree address of the requested tile.
     */
    getTile(tileKey: TileKey): TileType | undefined {
        const tile = this.m_tileFactory.create(this, tileKey);
        tile.tileLoader = new TileLoader(this, tileKey, this.m_options.dataProvider, this.decoder);

        this.updateTile(tile);
        return tile;
    }

    /**
     * Get [[TileInfo]] of a tile.
     *
     * @param tileKey Quadtree address of the requested tile.
     * @returns A promise which will contain the [[TileInfo]] when resolved.
     */
    getTileInfo(tileKey: TileKey): Promise<TileInfo | undefined> {
        const promise = new Promise<TileInfo | undefined>((resolve, reject) => {
            const tileLoader = new TileInfoLoader(
                this,
                tileKey,
                this.m_options.dataProvider,
                this.decoder
            );

            tileLoader.loadAndDecode().then(loaderState => {
                if (loaderState === TileLoaderState.Ready) {
                    resolve(tileLoader.tileInfo);
                } else {
                    reject(
                        new Error(`TileDataSource#getInfoTile wrong final state: ${loaderState}`)
                    );
                }
            });
        });

        return promise;
    }

    updateTile(tile: Tile) {
        const tileLoader = tile.tileLoader;
        if (tileLoader === undefined) {
            return;
        }

        tileLoader.loadAndDecode().then(() => {
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
