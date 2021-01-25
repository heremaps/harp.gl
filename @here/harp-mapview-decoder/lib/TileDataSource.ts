/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    FlatTheme,
    ITileDecoder,
    OptionsMap,
    StyleSet,
    Theme,
    TileInfo
} from "@here/harp-datasource-protocol";
import { TileKey, TilingScheme } from "@here/harp-geoutils";
import {
    ConcurrentDecoderFacade,
    CopyrightInfo,
    CopyrightProvider,
    DataSource,
    DataSourceOptions,
    Tile,
    TileLoaderState
} from "@here/harp-mapview";
import { ThemeLoader } from "@here/harp-mapview/lib/ThemeLoader";
import { ILogger, LoggerManager } from "@here/harp-utils";

import { DataProvider } from "./DataProvider";
import { TileInfoLoader, TileLoader } from "./TileLoader";

/**
 * Set of common options for all [[TileDataSource]]s.
 */
export interface TileDataSourceOptions extends DataSourceOptions {
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
     * Implementation should provide this information from the source data if possible.
     */
    copyrightInfo?: CopyrightInfo[];

    /**
     * Optional copyright info provider for tiles provided by this data source. Copyrights from
     * provider are concatenated with default ones from `copyrightInfo`.
     */
    copyrightProvider?: CopyrightProvider;
}

/**
 * Templated factory class to create instances of [[Tile]].
 */
export class TileFactory<TileType extends Tile> {
    /**
     * Initialize the factory using the constructor of the element to be called when a [[Tile]] is
     * created.
     *
     * @param m_modelConstructor - Constructor of (subclass of) [[Tile]].
     */
    constructor(
        private readonly m_modelConstructor: new (
            dataSource: DataSource,
            tileKey: TileKey
        ) => TileType
    ) {}

    /**
     * Create an instance of (subclass of) [[Tile]]. The required parameters are passed as arguments
     * to the constructor of [[Tile]].
     *
     * @param dataSource - [[Datasource]] this class belongs to.
     * @param tileKey - Quadtree address of the [[Tile]].
     */
    create(dataSource: TileDataSource<TileType>, tileKey: TileKey): TileType {
        const tile = new this.m_modelConstructor(dataSource, tileKey);
        tile.tileLoader = new TileLoader(
            dataSource,
            tileKey,
            dataSource.dataProvider(),
            dataSource.decoder
        );
        return tile;
    }
}

/**
 * Common base class for the typical [[DataSource]] which uses an [[ITileDecoder]] to decode the
 * tile content asynchronously. The decoder can be passed in as an option, or a default
 * asynchronous one is generated.
 */
export class TileDataSource<TileType extends Tile = Tile> extends DataSource {
    protected readonly logger: ILogger = LoggerManager.instance.create("TileDataSource");
    protected readonly m_decoder: ITileDecoder;
    private m_isReady: boolean = false;
    private readonly m_unregisterClearTileCache?: () => void;

    /**
     * Set up the `TileDataSource`.
     *
     * @param m_tileFactory - Factory to create the [[Tile]] instances.
     * @param m_options - Options specifying the parameters of the [[DataSource]].
     */
    constructor(
        private readonly m_tileFactory: TileFactory<TileType>,
        private readonly m_options: TileDataSourceOptions
    ) {
        super(m_options);
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

        this.m_unregisterClearTileCache = this.dataProvider().onDidInvalidate?.(() =>
            this.mapView.markTilesDirty(this)
        );
    }

    /** @override */
    dispose() {
        this.m_unregisterClearTileCache?.();
        this.decoder.dispose();
        this.dataProvider().unregister(this);
    }

    /** @override */
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

    /** @override */
    async connect() {
        await Promise.all([this.m_options.dataProvider.register(this), this.m_decoder.connect()]);
        this.m_isReady = true;

        let customOptions: OptionsMap = {};
        if (this.m_options.storageLevelOffset !== undefined) {
            customOptions = {
                storageLevelOffset: this.m_options.storageLevelOffset
            };
        }
        this.m_decoder.configure({ languages: this.languages }, customOptions);
    }

    /**
     * @override
     */
    setLanguages(languages: string[]): void {
        this.languages = languages;

        this.m_decoder.configure({
            languages: this.languages
        });
        this.mapView.clearTileCache(this.name);
    }

    /**
     * Apply the {@link @here/harp-datasource-protocol#Theme} to this data source.
     *
     * Applies new {@here/harp-datasource-protocol StyleSet} and definitions from theme only
     * if matching styleset (see `styleSetName` property) is found in `theme`.
     * @override
     */
    async setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void> {
        // Seems superfluent, but the call to  ThemeLoader.load will resolve extends etc.
        theme = await ThemeLoader.load(theme);

        let styleSet: StyleSet | undefined;
        if (this.styleSetName !== undefined && theme.styles !== undefined) {
            styleSet = theme.styles[this.styleSetName];
        }
        if (languages !== undefined) {
            this.languages = languages;
        }

        if (styleSet !== undefined) {
            this.m_decoder.configure({
                styleSet,
                definitions: theme.definitions,
                priorities: theme.priorities,
                labelPriorities: theme.labelPriorities,
                languages
            });
            this.mapView.clearTileCache(this.name);
        }
    }

    /**
     * Get the [[DataProvider]] that has been passed in with the options.
     */
    dataProvider(): DataProvider {
        return this.m_options.dataProvider;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_options.tilingScheme;
    }

    /**
     * Create a [[Tile]] and start the asynchronous download of the tile content. The [[Tile]] will
     * be empty, but the download and decoding will be scheduled immediately. [[Tile]] instance is
     * initialized with default copyrights, concatenated with copyrights from copyright provider of
     * this data source.
     *
     * @param tileKey - Quadtree address of the requested tile.
     * @param delayLoad - If true, the Tile will be created, but Tile.load will not be called.
     * @default false.
     * @override
     */
    getTile(tileKey: TileKey, delayLoad: boolean = false): TileType | undefined {
        const tile = this.m_tileFactory.create(this, tileKey);
        tile.copyrightInfo = this.m_options.copyrightInfo;
        if (this.m_options.copyrightProvider !== undefined) {
            this.m_options.copyrightProvider
                .getCopyrights(tile.geoBox, tileKey.level)
                .then(copyrightInfo => {
                    tile.copyrightInfo =
                        tile.copyrightInfo === undefined
                            ? copyrightInfo
                            : [...tile.copyrightInfo, ...copyrightInfo];
                    this.requestUpdate();
                });
        }
        if (!delayLoad) {
            tile.load();
        }

        return tile;
    }

    /**
     * Get [[TileInfo]] of a tile.
     *
     * @param tileKey - Quadtree address of the requested tile.
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
}
