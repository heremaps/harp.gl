/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Definitions,
    ITileDecoder,
    StyleSet,
    Theme,
    TileInfo
} from "@here/harp-datasource-protocol";
import { TileKey, TilingScheme } from "@here/harp-geoutils";
import {
    ConcurrentDecoderFacade,
    CopyrightInfo,
    DataSource,
    Tile,
    TileLoaderState
} from "@here/harp-mapview";

import { LRUCache } from "@here/harp-lrucache";
import { LoggerManager } from "@here/harp-utils";
import { DataProvider } from "./DataProvider";
import { TileInfoLoader, TileLoader } from "./TileLoader";

/**
 * Set of common options for all [[TileDataSource]]s.
 */
export interface TileDataSourceOptions {
    /**
     * Name of [[TileDataSource]], must be unique.
     */
    name?: string;

    /**
     * The name of the [[StyleSet]] to evaluate for the decoding.
     */
    styleSetName: string;

    /**
     * The [[TilingScheme]] the data source is using.
     */
    tilingScheme: TilingScheme;

    /**
     * The [[DataProvider]] to use for downloading the actual data.
     */
    dataProvider: DataProvider;

    /**
     * Optional: Specify [[ITileDecoder]] instance.
     */
    decoder?: ITileDecoder;

    /**
     * Optional name of decoder service class.
     * @see [[ConcurrentDecoderFacade]]
     * @see [[ConcurrentWorkerSet]]
     */
    concurrentDecoderServiceName?: string;

    /**
     * Optional URL for decoder bundle to be loaded into web worker.
     */
    concurrentDecoderScriptUrl?: string;

    /**
     * Optional count of web workers to use with the decoder bundle.
     */
    concurrentDecoderWorkerCount?: number;

    /**
     * Optional, default copyright information of tiles provided by this data source.
     *
     * Implementation should provide this information from the source data if possible.
     */
    copyrightInfo?: CopyrightInfo[];

    /**
     * Optional minimum zoom level (storage level) for [[Tile]]s. Default is 1.
     */
    minZoomLevel?: number;

    /**
     * Optional maximum zoom level (storage level) for [[Tile]]s. Default is 20.
     */
    maxZoomLevel?: number;

    /**
     * Optional storage level offset for [[Tile]]s. Default is 0.
     */
    storageLevelOffset?: number;
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

const maxLevelTileLoaderCache = 3;
/**
 * Common base class for the typical [[DataSource]] which uses an [[ITileDecoder]] to decode the
 * tile content asynchronously. The decoder can be passed in as an option, or a default
 * asynchronous one is generated.
 */
export class TileDataSource<TileType extends Tile> extends DataSource {
    protected readonly logger = LoggerManager.instance.create("TileDataSource");
    protected readonly m_decoder: ITileDecoder;
    protected readonly m_tileLoaderCache: LRUCache<number, TileLoader>;
    private m_isReady: boolean = false;

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
        super(
            m_options.name,
            m_options.styleSetName,
            m_options.minZoomLevel,
            m_options.maxZoomLevel,
            m_options.storageLevelOffset
        );
        if (m_options.decoder) {
            this.m_decoder = m_options.decoder;
        } else if (m_options.concurrentDecoderServiceName) {
            this.m_decoder = ConcurrentDecoderFacade.getTileDecoder(
                m_options.concurrentDecoderServiceName,
                m_options.concurrentDecoderScriptUrl,
                m_options.concurrentDecoderWorkerCount
            );
        } else {
            throw new Error(
                `TileDataSource[${this.name}]: unable to create, missing decoder or ` +
                    `concurrentDecoderServiceName`
            );
        }

        this.useGeometryLoader = true;
        this.cacheable = true;
        this.m_tileLoaderCache = new LRUCache<number, TileLoader>(this.getCacheCount());
        this.m_tileLoaderCache.evictionCallback = (_, tileLoader) => {
            // Cancel any pending downloads as early as possible.
            tileLoader.cancel();
        };
    }

    dispose() {
        this.decoder.dispose();
    }

    ready(): boolean {
        return this.m_isReady && this.m_options.dataProvider.ready();
    }

    /**
     * Get the [[ITileDecoder]] of this `ITileDataSource`, which has either been passed in with
     * the options, or has been supplied by the [[ConcurrentDecoderFacade]].
     */
    get decoder(): ITileDecoder {
        return this.m_decoder;
    }

    async connect() {
        await Promise.all([this.m_options.dataProvider.connect(), this.m_decoder.connect()]);
        this.m_isReady = true;

        this.m_decoder.configure(undefined, undefined, undefined, {
            storageLevelOffset: this.m_options.storageLevelOffset
        });
    }

    setStyleSet(styleSet?: StyleSet, definitions?: Definitions, languages?: string[]): void {
        this.m_decoder.configure(styleSet, definitions, languages);
        this.mapView.markTilesDirty(this);
    }

    /**
     * Apply the [[Theme]] to this data source.
     *
     * Applies new [[StyleSet]] and definitions from theme only if matching styleset (see
     * `styleSetName` property) is found in `theme`.
     */
    setTheme(theme: Theme, languages?: string[]): void {
        const styleSet =
            this.styleSetName !== undefined && theme.styles
                ? theme.styles[this.styleSetName]
                : undefined;

        if (styleSet !== undefined) {
            this.setStyleSet(styleSet, theme.definitions, languages);
        }
    }

    clearCache() {
        this.m_tileLoaderCache.evictAll();
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

        const mortonCode = tileKey.mortonCode();
        const tileLoader = this.m_tileLoaderCache.get(mortonCode);
        if (tileLoader !== undefined) {
            tile.tileLoader = tileLoader;
        } else {
            const newTileLoader = new TileLoader(
                this,
                tileKey,
                this.m_options.dataProvider,
                this.decoder,
                0
            );
            tile.tileLoader = newTileLoader;
            tile.copyrightInfo = this.m_options.copyrightInfo;

            // We don't cache tiles with level 4 and above, at this level, there are 16 (2^4) tiles
            // horizontally, given the assumption that the zoom level assumes the tile should be 256
            // pixels wide (see function [[calculateZoomLevelFromDistance]]), and the current
            // storage offset of -2 (which makes the tiles then 1024 pixels wide). this would mean a
            // horizontal width of ~16k pixels for the entire earth, this would be quite a lot to
            // pan, hence caching doesn't make sense above this point (as the chance that we need to
            // share the TileLoader is small, and even if we did eventually see it, the original
            // TileLoader would probably be evicted because it was removed by other more recent
            // tiles).
            if (tileKey.level <= maxLevelTileLoaderCache) {
                this.m_tileLoaderCache.set(mortonCode, newTileLoader);
            }
        }

        if (tile.tileLoader.decodedTile !== undefined) {
            tile.decodedTile = tile.tileLoader.decodedTile;
        } else {
            tile.load();
        }
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
                this.decoder,
                0
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

    private getCacheCount(): number {
        // We support up to [[maxLevelTileLoaderCache]] levels, this equates to roughly
        // 2^maxLevelTileLoaderCache^2 tiles in total (at level maxLevelTileLoaderCache), we don't
        // generally see that many, so we add a factor of 2 to try to get the worst case.
        return Math.pow(2, maxLevelTileLoaderCache) * 2;
    }
}
