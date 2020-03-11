/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { TileKey, TilingScheme, webMercatorTilingScheme } from "@here/harp-geoutils";
import { CopyrightInfo, DataSource, Tile, UrlCopyrightProvider } from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { getOptionValue, LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("MapView");

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = ""; // empty assignment required to support CORS

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

/**
 * An interface for the type of parameters that can be passed to the [[WebTileDataSource]].
 */
export interface WebTileDataSourceParameters {
    /**
     * The `apikey` for the access of the Web Tile Data.
     */
    apikey: string;

    // tslint:disable:max-line-length
    /**
     * This parameter specifies static part of the final Web Tile URL:
     *  * base url without protocol and load-balancing (`{1-4}.`) prefix
     *  * path,
     *  * resource (tile type)
     *  * map version,
     *  * scheme
     *
     * See [Map Tile API]
     * (https://developer.here.com/documentation/map-tile/topics/request-constructing.html) for
     * details.
     *
     * For example, given final url presented in documentation
     * (https://developer.here.com/documentation/map-tile/topics/examples-base.html):
     *
     *     https://
     *       2.base.maps.ls.hereapi.com/maptile/2.1/maptile/newest/normal.day/11/525/761/256/png8
     *       ?apikey={YOUR_API_KEY}
     *
     * `tileBaseAddress` should be:
     *
     *      base.maps.ls.hereapi.com/maptile/2.1/maptile/newest/normal.day
     *
     * Rest of parameters are added by [[WebTileDataSource]].
     *
     * @see [Map Tile API]
     * (https://developer.here.com/documentation/map-tile/topics/introduction.html)
     * @default [[WebTileDataSource.TILE_BASE_NORMAL]]
     * @see [[WebTileDataSource.TILE_BASE_NORMAL]]
     * @see [[WebTileDataSource.TILE_AERIAL_HYBRID]]
     * @see [[WebTileDataSource.TILE_AERIAL_SATELLITE]]
     * @see [[WebTileDataSource.TILE_TRAFFIC_NORMAL]]
     */
    tileBaseAddress?: string;
    // tslint:enable:max-line-length

    /**
     * The resolution of Web Tile images, defaults to 512.
     */
    resolution?: WebTileDataSource.resolutionValue;

    /**
     * String which is appended to the tile request url, e.g. to add additional parameters
     * to the tile requests as described in
     * @see https://developer.here.com/documentation/map-tile/topics/resource-base-basetile.html
     */
    additionalRequestParameters?: string;

    /**
     * ppi parameter which impacts font/icon sizes, road width and other content
     * of the map tiles. For valid values and restrictions see
     * @see https://developer.here.com/documentation/map-tile/topics/resource-base-basetile.html#ppi
     * By default it is not used.
     */
    ppi?: WebTileDataSource.ppiValue;

    /**
     * Whether to provide copyright info.
     *
     * @default `true`
     */
    gatherCopyrightInfo?: boolean;

    /**
     * Options affecting the rendering of the web tiles.
     */
    renderingOptions?: WebTileRenderingOptions;
}

/**
 * Mapping from ISO-639-1 language codes to codes used by HERE Map Tile API (MARC)
 *
 * @see https://developer.here.com/documentation/map-tile/topics/resource-base-maptile.html
 * @see [MARC Code List for Languages](https://www.loc.gov/marc/languages/)
 */
const WEBTILE_LANGUAGE_DICTIONARY: { [s: string]: string } = {
    eu: "baq",
    ca: "cat",
    zh: "chi",
    cs: "cze",
    da: "dan",
    nl: "dut",
    en: "eng",
    fi: "fin",
    fr: "fre",
    de: "ger",
    ga: "gle",
    el: "gre",
    he: "heb",
    hi: "hin",
    id: "ind",
    it: "ita",
    no: "nor",
    fa: "per",
    pl: "pol",
    pt: "por",
    ru: "rus",
    si: "sin",
    es: "spa",
    sv: "swe",
    th: "tha",
    tr: "tur",
    uk: "ukr",
    ur: "urd",
    vi: "vie",
    cy: "wel"
};

/**
 * Map Tile request params.
 *
 * @see https://developer.here.com/documentation/map-tile/topics/request-constructing.html
 */
interface MapTileParams {
    /**
     * Baseurl without load-balancing prefix and scheme.
     */
    baseUrl: string;

    /**
     * Path, should be `/maptile/2.1`
     */
    path: string;

    /**
     * Tile type (`basetile`, `maptile` etc).
     *
     * @see https://developer.here.com/documentation/map-tile/topics/request-constructing.html
     */
    tileType: string;

    /**
     * Map version - `newest` or `hash` value
     *
     * @default `newest`
     */
    mapVersion?: string;

    /**
     * Scheme
     *
     * @default `normal.day`
     */
    scheme?: string;
}

/**
 * Instances of `WebTileDataSource` can be used to add Web Tile to [[MapView]].
 *
 * Example:
 *
 * ```typescript
 * const webTileDataSource = new WebTileDataSource({
 *     apikey: <apikey>
 * });
 * ```
 * @see [[DataSource]], [[OmvDataSource]].
 */
export class WebTileDataSource extends DataSource {
    /**
     * Base address for Base Map rendered using `normal.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-normal-day-view.html
     */
    static readonly TILE_BASE_NORMAL =
        "base.maps.ls.hereapi.com/maptile/2.1/maptile/newest/normal.day";
    /**
     * Base address for Aerial Map rendered using `hybrid.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-hybrid-map.html
     */
    static readonly TILE_AERIAL_HYBRID =
        "aerial.maps.ls.hereapi.com/maptile/2.1/maptile/newest/hybrid.day";

    /**
     * Base address for Aerial Map rendered using `satellite.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-satellite-map.html
     */
    static readonly TILE_AERIAL_SATELLITE =
        "aerial.maps.ls.hereapi.com/maptile/2.1/maptile/newest/satellite.day";

    /**
     * Base address for Traffic Map rendered using `normal.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-traffic.html
     */
    static readonly TILE_TRAFFIC_NORMAL =
        "traffic.maps.ls.hereapi.com/maptile/2.1/traffictile/newest/normal.day";

    private m_resolution: WebTileDataSource.resolutionValue;
    private m_ppi: WebTileDataSource.ppiValue;
    private m_tileBaseAddress: string;
    private m_languages?: string[];

    /** Copyright provider instance. */
    private m_copyrightProvider: UrlCopyrightProvider;

    /** Predefined fixed HERE copyright info. */
    private readonly HERE_COPYRIGHT_INFO: CopyrightInfo = {
        id: "here.com",
        year: new Date().getFullYear(),
        label: "HERE",
        link: "https://legal.here.com/terms"
    };

    /**
     * Constructs a new `WebTileDataSource`.
     *
     * @param m_options Represents the [[WebTileDataSourceParameters]].
     */
    constructor(private readonly m_options: WebTileDataSourceParameters) {
        super({ name: "webtile", minDataLevel: 1, maxDataLevel: 20 });
        this.cacheable = true;
        this.storageLevelOffset = -1;
        this.m_resolution = getOptionValue(
            m_options.resolution,
            WebTileDataSource.resolutionValue.resolution512
        );
        if (this.m_resolution === WebTileDataSource.resolutionValue.resolution512) {
            this.maxDataLevel = 19; // 512x512 tiles do not have z19
        }
        this.m_ppi = getOptionValue(m_options.ppi, WebTileDataSource.ppiValue.ppi72);
        this.m_tileBaseAddress = m_options.tileBaseAddress || WebTileDataSource.TILE_BASE_NORMAL;
        if (
            this.m_tileBaseAddress === WebTileDataSource.TILE_AERIAL_SATELLITE &&
            this.m_ppi !== WebTileDataSource.ppiValue.ppi72
        ) {
            throw new Error("Requested combination of scheme satellite.day and ppi is not valid");
        }

        const mapTileParams = this.parseBaseUrl(this.m_tileBaseAddress);
        const baseHostName = mapTileParams.baseUrl;
        const mapId = getOptionValue(mapTileParams.mapVersion, "newest");
        const scheme = mapTileParams.scheme || "normal.day";
        const baseScheme = scheme.split(".")[0] || "normal";
        const { apikey } = this.m_options;
        const url =
            `https://1.${baseHostName}/maptile/2.1/copyright/${mapId}` +
            `?output=json&apikey=${apikey}`;
        this.m_copyrightProvider = new UrlCopyrightProvider(url, baseScheme);
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
    setLanguages(languages?: string[]): void {
        if (languages !== undefined) {
            this.mapIsoLanguageToWebTile(languages);
            this.mapView.markTilesDirty(this);
        }
    }

    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);

        const column = tileKey.column;
        const row = tileKey.row;
        const level = tileKey.level;
        const { apikey } = this.m_options;
        const quadKey = tileKey.toQuadKey();
        const server = parseInt(quadKey[quadKey.length - 1], 10) + 1;
        let url =
            `https://${server}.${this.m_tileBaseAddress}/` +
            `${level}/${column}/${row}/${this.m_resolution}/png8` +
            `?apikey=${apikey}` +
            getOptionValue(this.m_options.additionalRequestParameters, "");

        if (this.m_ppi !== WebTileDataSource.ppiValue.ppi72) {
            // because ppi=72 is default, we do not include it in the request
            url += `&ppi=${this.m_ppi}`;
        }
        if (this.m_languages !== undefined && this.m_languages[0] !== undefined) {
            url += `&lg=${this.m_languages[0]}`;
        }

        if (this.m_languages !== undefined && this.m_languages[1] !== undefined) {
            url += `&lg2=${this.m_languages[1]}`;
        }

        Promise.all([this.loadTexture(url), this.getTileCopyright(tile)])
            .then(([texture, copyrightInfo]) => {
                tile.copyrightInfo = copyrightInfo;

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

    private parseBaseUrl(url: string): MapTileParams {
        const parsed = new URL(url.startsWith("https:") ? url : `https://${url}`);
        const fullPath = parsed.pathname;
        const maptilePathRegexp = new RegExp("^(/maptile/2.1/)([^/]+)/([^/]+)/([^/]+)");
        const match = fullPath.match(maptilePathRegexp);
        if (!match) {
            throw new Error(`WebTileDataSource: invalid baseUrl: ${url}`);
        }
        return {
            baseUrl: parsed.host,
            path: match[1],
            tileType: match[2],
            mapVersion: match[3],
            scheme: match[4]
        };
    }

    private loadTexture(url: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            textureLoader.load(
                url,
                texture => {
                    resolve(texture);
                },
                undefined, // onProgress
                () => {
                    // ErrorEvent received here doesn't have any meaningful code/ message to be
                    // shown
                    reject(new Error("failed to load texture"));
                }
            );
        });
    }

    private async getTileCopyright(tile: Tile): Promise<CopyrightInfo[]> {
        if (this.m_options.gatherCopyrightInfo === false) {
            return [this.HERE_COPYRIGHT_INFO];
        }
        return this.m_copyrightProvider.getCopyrights(tile.geoBox, tile.tileKey.level);
    }

    private mapIsoLanguageToWebTile(languages: string[]): void {
        this.m_languages = [];
        for (const language of languages) {
            if (WEBTILE_LANGUAGE_DICTIONARY[language] !== undefined) {
                this.m_languages.push(WEBTILE_LANGUAGE_DICTIONARY[language]);
            }
        }
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
