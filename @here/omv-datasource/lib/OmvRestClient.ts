/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { DownloadManager } from "@here/download-manager";
import {
    addBearerToken, CancellationToken, DownloadRequestInit
} from "@here/fetch";
import { TileKey, TilingScheme } from "@here/geoutils";
import { DataProvider } from "@here/mapview-decoder";
import { LoggerManager } from "@here/utils";

const logger = LoggerManager.instance.create("OmvRestClient");

// tslint:disable:max-line-length
export enum APIFormat {

    /**
     * Use the REST API format of HERE Vector Tiles Server component version 1.
     *
     * Usage:
     * `<OmvRestClientParams.baseUrl>/<zoom>/<X>/<Y>/omv?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `//http|s://<base-url>/{API version}/{layers}/{projection}/{z}/{x}/{y}/{format}?[authentication]`
     */
    HereV1,

    /**
     * Use the REST API format of Mapbox Vector Tile API v4.
     *
     * Usage:
     * `<OmvRestClientParams.baseUrl>/<zoom>/<X>/<Y>.mvt?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/v4/{map_id}/{z}/{x}/{y}{@2x}.{format}?[style]?[access_token]`
     *
     * Sample URL:
     * `http://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/14/4823/6160.mvt?access_token=<your access token>`
     */
    MapboxV4,

    /**
     * Use the REST API format of Mapzen Vector Tile API v1.
     *
     * Usage:
     * `<OmvRestClientParams.baseUrl>/<zoom>/<X>/<Y>.pbf?api_key=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/{API version}/{layers}/{z}/{x}/{y}/{format}?api_key={api_key}`
     *
     * Sample URL:
     * `https://tile.mapzen.com/mapzen/vector/v1/all/16/19293/24641.json?api_key=your-mapzen-api-key`
     */
    MapzenV1,

    /**
     * Use the REST API format of Tomtoms Vector Tile API v1.
     *
     * Usage:
     * `<OmvRestClientParams.baseUrl>/<zoom>/<X>/<Y>.pbf?key=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `<http|https>://<baseURL>/map/<versionNumber>/tile/<layer>/<style>/<zoom>/<X>/<Y>.<format>?key=<apiKey>[&view=<view>][&language=<language>]`
     *
     * Sample URL:
     * `http://api.tomtom.com/map/1/tile/basic/main/0/0/0.pbf?key=<apiKey>`
     */
    TomtomV1
}
// tslint:enable:max-line-length

export interface OmvRestClientParameters {
    /**
     * The base URL of the REST Tile Service.
     * @see [[APIFormat]] for the definition of `baseUrl`.
     */
    baseUrl: string;

    /**
     * Authentication code used for the different APIs.
     * @see [[APIFormat]] for the query parameter this is used with.
     */
    authenticationCode?: string;

    /**
     * The REST API format to use for the tile path generation, will default to the HERE Vector Tile
     * API.
     */
    apiFormat?: APIFormat;

    /**
     * Tiling scheme is used in some of the APIs, not implemented yet.
     */
    tilingScheme?: TilingScheme;

    /**
     * Download Manager to use; creates an own instance if none passed.
     */
    downloadManager?: DownloadManager;

    /**
     * Function to retrieve the Bearer Token
     */
    getBearerToken?: () => Promise<string>;

}

/**
 * REST client supporting getting protobuf OMV Tile from REST-based servers.
 */
export class OmvRestClient extends DataProvider {
    private readonly downloadManager: DownloadManager;

    constructor(private readonly params: OmvRestClientParameters) {
        super();
        this.downloadManager =
            params.downloadManager === undefined
                ? DownloadManager.instance()
                : params.downloadManager;
    }

    /** Overriding abstract method, in this case doing nothing. */
    async connect(): Promise<void> {
        // not needed
    }

    /** Overriding abstract method, in this case always returning `true`. */
    ready(): boolean {
        return true;
    }

    /**
     * Asynchronously fetches a tile from this restful server.
     *
     * **Note:** If the tile doesn't exist, a successful response with a `404` status code is
     * returned.
     *
     * @example
     * ```typescript
     * const response = layer.getTile(tileKey);
     * if (!response.ok) {
     *     // a network error happened
     *     console.error("Unable to download tile", response.statusText);
     *     return;
     * }
     * if (response.status === 404) {
     *     // 404 -, no data exists at the given tile. Do nothing.
     *     return;
     * }
     *
     * // the response is ok and contains data, access it e.g. as arrayBuffer:
     * const payload = await response.arrayBuffer();
     * ```
     *
     * @param tileKey The tile key of the tile.
     * @param tileRequestInit Optional request options to be passed to fetch when downloading a
     * tile.
     * @returns A `Promise` of the HTTP response that contains the payload of the requested tile.
     */
    async getTile(
        tileKey: TileKey,
        cancellationToken?: CancellationToken | undefined
    ): Promise<ArrayBufferLike> {
        const tileUrl = this.dataUrl(tileKey);
        const init: DownloadRequestInit = {};
        init.cancellationToken = cancellationToken;
        if (this.params.getBearerToken !== undefined) {
           await addBearerToken(this.params.getBearerToken, init);
        }
        const response = await this.downloadManager.download(tileUrl, init );
        if (!response.ok) {
            throw new Error(
                `Error downloading tile ${tileKey.toHereTile()}` +
                    `${tileUrl}: ${response.status} ${response.statusText}`
            );
        }
        return response.arrayBuffer();
    }

    private dataUrl(tileKey: TileKey): string {
        let path = `/${tileKey.level}/${tileKey.column}/${tileKey.row}`;
        switch (this.params.apiFormat) {
            case APIFormat.HereV1:
                path += "/omv";
                break;
            case APIFormat.MapboxV4:
                path += ".mvt";
                if (this.params.authenticationCode) {
                    path += this.addQueryParams([["access_token", this.params.authenticationCode]]);
                }
                break;
            case APIFormat.MapzenV1:
                path += ".pbf";

                if (this.params.authenticationCode) {
                    path += this.addQueryParams([["api_key", this.params.authenticationCode]]);
                }
                break;
            case APIFormat.TomtomV1:
                path += ".pbf";

                if (this.params.authenticationCode) {
                    path += this.addQueryParams([["key", this.params.authenticationCode]]);
                }
                break;
            default:
                logger.warn(`Not supported API format: ${this.params.apiFormat}`);
                break;
        }

        return this.params.baseUrl + path;
    }

    private addQueryParams(queryParams: Array<[string, string]>): string {
        let queryString = "";
        let concatinator = "?";
        for (const param of queryParams) {
            queryString += concatinator + param[0] + "=" + param[1];
            if (concatinator === "?") {
                concatinator = "&";
            }
        }
        return queryString;
    }
}
