/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey, TilingScheme, webMercatorTilingScheme } from "@here/harp-geoutils";
import { CopyrightInfo, DataSource, DataSourceOptions, Tile } from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { enableBlending } from "@here/harp-materials";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import THREE = require("three");

const logger = LoggerManager.instance.create("MapView");

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
     */
    getTexture: (tile: Tile) => Promise<[THREE.Texture | undefined, CopyrightInfo[]] | undefined>;
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

    /**
     * Constructs a new `WebTileDataSource`.
     *
     * @param m_options - Represents the [[WebTileDataSourceParameters]].
     */
    constructor(protected readonly m_options: WebTileDataSourceOptions) {
        super(m_options);

        this.dataProvider = this.m_options.dataProvider;
        this.cacheable = true;
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
        this.dataProvider
            .getTexture(tile)
            .then(
                value => {
                    if (value === undefined || value[0] === undefined) {
                        tile.forceHasGeometry(true);
                        return;
                    }

                    const [texture, copyrightInfo] = value;
                    if (copyrightInfo !== undefined) {
                        tile.copyrightInfo = copyrightInfo;
                    }

                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = false;
                    tile.addOwnedTexture(texture);

                    let transparent = false;
                    let opacity = 1;
                    let renderOrder = 0;
                    if (this.m_options.renderingOptions !== undefined) {
                        opacity = this.m_options.renderingOptions.opacity ?? 1;
                        transparent =
                            this.m_options.renderingOptions.transparent === true ||
                            (opacity !== undefined && opacity < 1);
                        renderOrder = this.m_options.renderingOptions.renderOrder ?? 0;
                    }
                    const material = new THREE.MeshBasicMaterial({
                        map: texture,
                        opacity,
                        depthTest: false,
                        depthWrite: false
                    });
                    if (transparent) {
                        enableBlending(material);
                    }
                    const mesh = TileGeometryCreator.instance.createGroundPlane(
                        tile,
                        material,
                        true
                    );
                    tile.objects.push(mesh);
                    mesh.renderOrder = renderOrder;
                    tile.invalidateResourceInfo();
                    this.requestUpdate();
                },
                error => {
                    logger.warn(
                        `texture promise rejected for webtile ${tileKey.mortonCode()}: ${error}`
                    );
                    tile.dispose();
                }
            )
            .catch(error => {
                logger.warn(`failed to load webtile ${tileKey.mortonCode()}: ${error}`);
                tile.dispose();
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
