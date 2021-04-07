/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey, TilingScheme, webMercatorTilingScheme } from "@here/harp-geoutils";
import { CopyrightInfo, DataSource, DataSourceOptions, Tile } from "@here/harp-mapview";
import { getOptionValue } from "@here/harp-utils";
import THREE = require("three");
import { WebTileLoader } from "./WebTileLoader";

/**
 * An interface for the rendering options that can be passed to the [[WebTileDataSource]].
 */
export interface WebTileRenderingOptions {
    /**
     * Opacity of the rendered images.
     * @defaultValue 1.0
     */
    opacity?: number;

    /**
     * Force Material to use transparency from texture if available
     * @defaultValue false
     */
    transparent?: boolean;

    /**
     * RenderOrder for order in which to render WebTileDataSouurces
     * @defaultValue 0
     * @deprecated Use instead `dataSourceOrder` on {@link DataSource}
     */
    renderOrder?: number;
}

export interface WebTileDataProvider {
    /**
     * The method to create the Texture that will be applied to the Tile
     *
     * If the Promise is resolved with an undefined Texture, the Tile is considered loaded
     * and having no data.
     * If the Promise is rejected, it is considered a temporary failure and the tile will be
     * disposed and recreated if visible again.
     * @param tile - Tile to which the texture will be applied.
     * @param abortSignal - Optional AbortSignal to cancel the request.
     */
    getTexture: (
        tile: Tile,
        abortSignal?: AbortSignal
    ) => Promise<[THREE.Texture | undefined, CopyrightInfo[]] | undefined>;
}

/**
 * Options for [[WebTileDataSource]].
 */
export interface WebTileDataSourceOptions
    extends Omit<DataSourceOptions, "enablePicking" | "styleSetName"> {
    /**
     * A DataProvider that will provide the tiles.
     */
    dataProvider: WebTileDataProvider;

    /**
     * The resolution of Web Tile images, defaults to 512.
     */
    resolution?: WebTileDataSource.resolutionValue;

    /**
     * Options affecting the rendering of the web tiles.
     */
    renderingOptions?: WebTileRenderingOptions;
}

/**
 * Instances of `WebTileDataSource` can be used to add Web Tile to [[MapView]].
 *
 * Example:
 *
 * ```typescript
 * const webTileDataSource = new WebTileDataSource({
 *     dataProvider: {
 *         getTexture: <your custom implementation>
 *     }
 * });
 * ```
 * @see {@links DataSource}
 */
export class WebTileDataSource extends DataSource {
    protected readonly m_resolution: WebTileDataSource.resolutionValue;
    protected dataProvider: WebTileDataProvider;

    private m_opacity: number = 1;
    private readonly m_renderOrder: number = 0;
    private m_transparent: boolean = false;

    /**
     * Constructs a new `WebTileDataSource`.
     *
     * @param m_options - Represents the [[WebTileDataSourceParameters]].
     */
    constructor(protected readonly m_options: WebTileDataSourceOptions) {
        super(m_options);

        this.dataProvider = this.m_options.dataProvider;
        this.cacheable = true;
        this.m_opacity = this.m_options.renderingOptions?.opacity ?? 1;
        this.m_transparent =
            this.m_options.renderingOptions?.transparent === true || this.m_opacity < 1;
        this.m_renderOrder = this.m_options.renderingOptions?.renderOrder ?? 0;
        this.m_resolution = getOptionValue(
            m_options.resolution,
            WebTileDataSource.resolutionValue.resolution512
        );
    }

    /**
     * Sets the opacity for the WebTileDataSource, will only affect not yet loaded or not cached
     * tiles.
     *
     * Use WebTileDataSource:clearCache and MapView:markTilesDirty to reload all tiles with the
     * new opacity setting.
     */
    set opacity(value: number) {
        this.m_opacity = value;
        if (this.m_opacity < 1) {
            this.m_transparent = true;
        } else if (this.m_options.renderingOptions?.transparent !== true) {
            this.m_transparent = false;
        }
    }

    /**
     * Gets the opacity of the WebTileDataSource.
     */
    get opacity(): number {
        return this.m_opacity;
    }

    get resolution(): WebTileDataSource.resolutionValue {
        return this.m_resolution as WebTileDataSource.resolutionValue;
    }

    /**
     * Gets the renderOrder of the WebTileDataSource.
     *
     * @deprecated Use instead the `dataSourceOrder` on {@link DataSource}
     */
    get renderOrder(): number {
        return this.m_renderOrder;
    }

    /**
     * Gets whether tiles of this WebTileDataSource are transparent.
     */
    get transparent(): boolean {
        return this.m_transparent;
    }

    /** @override */
    shouldPreloadTiles(): boolean {
        return true;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey) {
        const tile: Tile = new Tile(this, tileKey);
        tile.tileLoader = new WebTileLoader(this, tile, this.dataProvider);
        return tile;
    }

    /** @override */
    isFullyCovering(): boolean {
        return true;
    }
}
/**
 * Definitions of variable values to be used with `WebTileDataSource`
 */
export namespace WebTileDataSource {
    export enum ppiValue {
        ppi72 = 72,
        ppi250 = 250,
        ppi320 = 320,
        ppi500 = 500
    }
    export enum resolutionValue {
        resolution256 = 256,
        resolution512 = 512
    }
}
