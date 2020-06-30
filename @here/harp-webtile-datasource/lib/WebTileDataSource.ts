/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey, TilingScheme, webMercatorTilingScheme } from "@here/harp-geoutils";
import { CopyrightInfo, DataSource, Tile } from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import THREE = require("three");

const logger = LoggerManager.instance.create("MapView");

/**
 * An interface for the rendering options that can be passed to the [[WebTileDataSource]].
 */
export interface WebTileRenderingOptions {
    /**
     * Opacity of the rendered images.
     * @default 1.0
     */
    opacity?: number;
}

export interface WebTileDataProvider {
    /**
     * The method to create the Texture that will be applied to the Tile
     */
    getTexture: (tile: Tile) => Promise<[THREE.Texture, CopyrightInfo[]]>;
}

/**
 * Options for [[WebTileDataSource]].
 */
export interface WebTileDataSourceOptions {
    /**
     * A DataProvider that will provide the tiles.
     */
    dataProvider: WebTileDataProvider;

    /**
     * The resolution of Web Tile images, defaults to 512.
     */
    resolution?: WebTileDataSource.resolutionValue;

    /**
     * The minimal level Data is available, @defaults 1
     */
    minDataLevel?: number;

    /**
     * The maximal level Data is available, @defaults 20
     */
    maxDataLevel?: number;

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

    /**
     * Constructs a new `WebTileDataSource`.
     *
     * @param m_options - Represents the [[WebTileDataSourceParameters]].
     */
    constructor(protected readonly m_options: WebTileDataSourceOptions) {
        super({
            name: "webtile",
            minDataLevel: getOptionValue(m_options.minDataLevel, 1),
            maxDataLevel: getOptionValue(m_options.maxDataLevel, 20)
        });

        this.dataProvider = this.m_options.dataProvider;
        this.cacheable = true;
        this.storageLevelOffset = -1;
        this.m_resolution = getOptionValue(
            m_options.resolution,
            WebTileDataSource.resolutionValue.resolution512
        );
    }

    get resolution(): WebTileDataSource.resolutionValue {
        return this.m_resolution as WebTileDataSource.resolutionValue;
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
        let {} = this.dataProvider
            .getTexture(tile)
            .then(value => {
                const [texture, copyrightInfo] = value;
                if (copyrightInfo !== undefined) {
                    tile.copyrightInfo = copyrightInfo;
                }

                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                tile.addOwnedTexture(texture);
                const opacity =
                    this.m_options.renderingOptions !== undefined
                        ? this.m_options.renderingOptions.opacity
                        : 1;
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    depthTest: false,
                    depthWrite: false,
                    opacity,
                    transparent: opacity !== undefined && opacity < 1.0 ? true : false
                });
                const mesh = TileGeometryCreator.instance.createGroundPlane(tile, material, true);
                tile.objects.push(mesh);
                tile.invalidateResourceInfo();
                this.requestUpdate();
            })
            .catch(error => {
                logger.error(`failed to load webtile ${tileKey.mortonCode()}: ${error}`);
            });

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
