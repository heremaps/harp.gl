/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { mercatorTilingScheme, TileKey, TilingScheme } from "@here/harp-geoutils";
import { CopyrightInfo, DataSource, Tile } from "@here/harp-mapview";
import { getOptionValue, LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("MapView");

declare const require: any;
// tslint:disable-next-line:no-var-requires
const RTree = require("rtree");

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

    /**
     * Whether to provide copyright info.
     *
     * @default `true`
     */
    gatherCopyrightInfo?: boolean;
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
 * Schema of Map Tile API `copyright` endpoint JSON response.
 *
 * @see https://developer.here.com/documentation/map-tile/topics/resource-copyright.html
 */
interface AreaCopyrightInfo {
    /**
     * Minimum zoom level for the specified copyright label.
     */
    minLevel?: number;

    /**
     * Maximum zoom level for the specified copyright label.
     */
    maxLevel?: number;

    /**
     * Copyright text to display after the copyright symbol on the map.
     */
    label: string;

    /**
     * Verbose copyright text of the label to display by mouse over label or info menu entry.
     */
    alt?: string;

    /**
     * The bounding boxes define areas where specific copyrights are valid. A bounding box is
     * defined by bottom (latitude), left (longitude) and top (latitude), right (longitude).
     *
     * The default copyright has no boxes element and covers all other areas.
     */
    boxes?: Array<[number, number, number, number]>;
}

/**
 * Schema of Map Tile API `copyright` endpoint JSON response.
 *
 * @see https://developer.here.com/documentation/map-tile/topics/resource-copyright.html
 */
interface CopyrightCoverageResponse {
    [scheme: string]: AreaCopyrightInfo[];
}

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
    mapVestion?: string;

    /**
     * Scheme
     *
     * @default `normal.day`
     */
    scheme?: string;
}

const hereCopyrightInfo: CopyrightInfo = {
    id: "here.com",
    year: new Date().getFullYear(),
    label: "HERE"
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
     * Base address for Base Map rendered using `normal.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-normal-day-view.html
     */
    static readonly TILE_BASE_NORMAL =
        "base.maps.cit.api.here.com/maptile/2.1/maptile/newest/normal.day";
    /**
     * Base address for Aerial Map rendered using `hybrid.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-hybrid-map.html
     */
    static readonly TILE_AERIAL_HYBRID =
        "aerial.maps.cit.api.here.com/maptile/2.1/maptile/newest/hybrid.day";

    /**
     * Base address for Aerial Map rendered using `satellite.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-satellite-map.html
     */
    static readonly TILE_AERIAL_SATELLITE =
        "aerial.maps.cit.api.here.com/maptile/2.1/maptile/newest/satellite.day";

    /**
     * Base address for Traffic Map rendered using `normal.day` scheme.
     * @see https://developer.here.com/documentation/map-tile/topics/example-traffic.html
     */
    static readonly TILE_TRAFFIC_NORMAL =
        "traffic.maps.cit.api.here.com/maptile/2.1/traffictile/newest/normal.day";

    private m_resolution: number;
    private m_tileBaseAddress: string;
    private m_languages?: string[];
    private m_cachedCopyrightResponse?: Promise<AreaCopyrightInfo[]>;

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

        Promise.all([this.loadTexture(url), this.getTileCopyright(tile)])
            .then(([texture, copyrightInfo]) => {
                tile.copyrightInfo = copyrightInfo;

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
            })
            .catch(error => {
                logger.error(`failed to load webtile ${tileKey.mortonCode()}: ${error}`);
            });
        return tile;
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
            mapVestion: match[3],
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
        // NOTE:
        // For some reason Map Tile copyright endpoint doesn't return HERE as copyright holder, so
        // add it statically.
        //
        // (https://developer.here.com/documentation/map-tile/topics/resource-copyright.html)
        const result: CopyrightInfo[] = [hereCopyrightInfo];

        if (this.m_options.gatherCopyrightInfo === false) {
            return result;
        }
        const rtree = await this.getCopyrightCoverageData();
        const tileBounds = {
            x: Math.min(tile.geoBox.west, tile.geoBox.east),
            y: Math.min(tile.geoBox.south, tile.geoBox.north),
            h: Math.abs(tile.geoBox.longitudeSpan),
            w: Math.abs(tile.geoBox.latitudeSpan)
        };
        const matchingEntries: AreaCopyrightInfo[] | null | undefined = rtree.search(tileBounds);
        const tileLevel = tile.tileKey.level;
        if (!matchingEntries) {
            return result;
        }
        for (const entry of matchingEntries) {
            const minLevel = getOptionValue(entry.minLevel, 0);
            const maxLevel = getOptionValue(entry.maxLevel, Infinity);

            if (tileLevel >= minLevel && tileLevel <= maxLevel) {
                result.push({
                    id: entry.label
                });
            }
        }
        return result;
    }

    private getCopyrightCoverageData(): Promise<any> {
        const cachedResponse = this.m_cachedCopyrightResponse;
        if (cachedResponse !== undefined) {
            return cachedResponse;
        }

        const mapTileParams = this.parseBaseUrl(this.m_tileBaseAddress);
        const baseHostName = mapTileParams.baseUrl;
        const mapId = getOptionValue(mapTileParams.mapVestion, "newest");
        const scheme = mapTileParams.scheme || "normal.day";
        const baseScheme = scheme.split(".")[0] || "normal";
        const { appId, appCode } = this.m_options;
        const url =
            `https://1.${baseHostName}/maptile/2.1/copyright/${mapId}` +
            `?output=json&app_id=${appId}&app_code=${appCode}`;

        this.m_cachedCopyrightResponse = fetch(url)
            .then(response => response.json())
            .then((responseJson: CopyrightCoverageResponse) => {
                const entries = responseJson[baseScheme] || [];
                const tree = new RTree();
                if (!entries) {
                    return tree;
                }
                for (const entry of entries) {
                    if (!entry.boxes) {
                        const wholeWorld = {
                            x: -180,
                            y: -90,
                            w: 360,
                            h: 180
                        };
                        tree.insert(wholeWorld, entry);
                    } else {
                        for (const box of entry.boxes) {
                            const [bottom, left, top, right] = box;
                            const bounds = {
                                x: Math.min(left, right),
                                y: Math.min(bottom, top),
                                w: Math.abs(left - right),
                                h: Math.abs(top - bottom)
                            };
                            tree.insert(bounds, entry);
                        }
                    }
                }
                return tree;
            });
        return this.m_cachedCopyrightResponse;
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
