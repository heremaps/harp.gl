/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { mercatorTilingScheme, TileKey, TilingScheme } from "@here/harp-geoutils";
import { DataSource, Tile } from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("MapView");

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = ""; // empty assignment required to support CORS

/**
 * An interface for the type of parameters that can be passed to the [[WebTileDataSource]].
 */
export interface WebTileDataSourceParameters {
    /**
     * The `appId` for the access of the Web Tile Data.
     */
    appId: string;

    /**
     * The `appCode` for the access of the Web Tile Data.
     */
    appCode: string;

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
     *       2.base.maps.cit.api.here.com/maptile/2.1/maptile/newest/normal.day/11/525/761/256/png8
     *       ?app_id={YOUR_APP_ID}
     *       &app_code={YOUR_APP_CODE}
     *
     * `tileBaseAddress` should be:
     *
     *      base.maps.cit.api.here.com/maptile/2.1/maptile/newest/normal.day
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
    resolution?: number;
}
/**
 * @see https://developer.here.com/documentation/map-tile/topics/resource-base-maptile.html
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
 * Instances of `WebTileDataSource` can be used to add Web Tile to [[MapView]].
 *
 * Example:
 *
 * ```typescript
 * const webTileDataSource = new WebTileDataSource({
 *     appId: <appId>,
 *     appCode: <appCode>
 * });
 * ```
 * @see [[DataSource]], [[OmvDataSource]], [[LandmarkDataSource]].
 */
export class WebTileDataSource extends DataSource {
    /**
     * Base address for Base Map rendered using `normal.day` theme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-normal-day-view.html
     */
    static readonly TILE_BASE_NORMAL =
        "base.maps.cit.api.here.com/maptile/2.1/maptile/newest/normal.day";
    /**
     * Base address for Aerial Map rendered using `hybrid.day` theme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-hybrid-map.html
     */
    static readonly TILE_AERIAL_HYBRID =
        "aerial.maps.cit.api.here.com/maptile/2.1/maptile/newest/hybrid.day";

    /**
     * Base address for Aerial Map rendered using `satellite.day` theme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-satellite-map.html
     */
    static readonly TILE_AERIAL_SATELLITE =
        "aerial.maps.cit.api.here.com/maptile/2.1/maptile/newest/satellite.day";

    /**
     * Base address for Traffic Map rendered using `normal.day` theme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-traffic.html
     */
    static readonly TILE_TRAFFIC_NORMAL =
        "traffic.maps.cit.api.here.com/maptile/2.1/traffictile/newest/normal.day";

    private m_resolution: number;
    private m_tileBaseAddress: string;
    private m_languages?: string[];
    /**
     * Constructs a new `WebTileDataSource`.
     *
     * @param m_options Represents the [[WebTileDataSourceParameters]].
     */
    constructor(private readonly m_options: WebTileDataSourceParameters) {
        super("webtile");
        this.cacheable = true;
        this.m_resolution = m_options.resolution || 512;
        this.m_tileBaseAddress = m_options.tileBaseAddress || WebTileDataSource.TILE_BASE_NORMAL;
    }

    shouldPreloadTiles(): boolean {
        return true;
    }

    getTilingScheme(): TilingScheme {
        return mercatorTilingScheme;
    }

    get minZoomLevel(): number {
        return 1;
    }

    get maxZoomLevel(): number {
        return 19;
    }

    setLanguages(languages?: string[]): void {
        if (languages !== undefined) {
            this.mapIsoLanguageToWebTile(languages);
            this.mapView.markTilesDirty(this);
        }
    }

    getDisplayZoomLevel(zoomLevel: number): number {
        return THREE.Math.clamp(zoomLevel + 1, this.minZoomLevel, this.maxZoomLevel);
    }

    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);

        const column = tileKey.column;
        const row = tileKey.rowCount() - tileKey.row - 1;
        const level = tileKey.level;
        const { appId, appCode } = this.m_options;
        const quadKey = tileKey.toQuadKey();
        const server = parseInt(quadKey[quadKey.length - 1], 10) + 1;
        let url =
            `https://${server}.${this.m_tileBaseAddress}/` +
            `${level}/${column}/${row}/${this.m_resolution}/png8` +
            `?app_id=${appId}&app_code=${appCode}`;

        if (this.m_languages !== undefined && this.m_languages[0] !== undefined) {
            url += `&lg=${this.m_languages[0]}`;
        }

        if (this.m_languages !== undefined && this.m_languages[1] !== undefined) {
            url += `&lg2=${this.m_languages[1]}`;
        }

        textureLoader.load(
            url,
            texture => {
                // onLoad
                if (tile === undefined) {
                    return;
                }
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;

                const bounds = tile.boundingBox;

                bounds.min.sub(tile.center);
                bounds.max.sub(tile.center);
                const size = new THREE.Vector3();
                bounds.getSize(size);
                const quad = new THREE.PlaneBufferGeometry(size.x, size.y);
                const material = new THREE.MeshBasicMaterial({
                    map: texture
                });
                const mesh = new THREE.Mesh(quad, material);
                tile.objects.push(mesh);
                this.requestUpdate();
            },
            undefined, // onProgress
            () => {
                // ErrorEvent received here doesn't have any meaningful code/ message to be shown
                logger.error(`failed to load webtile ${tileKey.mortonCode()}`);
            }
        );
        return tile;
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
