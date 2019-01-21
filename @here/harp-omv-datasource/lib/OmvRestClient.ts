/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DownloadManager } from "@here/harp-download-manager";
import "@here/harp-fetch";
import { TileKey, TilingScheme } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";
import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("OmvRestClient");

// tslint:disable:max-line-length
export enum APIFormat {
    /**
     * Use the REST API format of HERE Vector Tiles Server component version 1.
     *
     * Usage:
     *
     *     <OmvRestClientParams.baseUrl>/<zoom>/<X>/<Y>/omv
     *
     * If [[OmvRestClientParams.authenticationToken]] is provided, it will be added as HTTP header:
     *
     *     Authorization: Bearer $authenticationToken
     *
     * Format definition:
     * `//http|s://<base-url>/{API version}/{layers}/{projection}/{z}/{x}/{y}/{format}`
     *
     * Default authentication method used: [[AuthenticationTypeBearer]].
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
     *
     * Default authentication method used: [[AuthenticationTypeMapboxV4]].
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
     *
     * Default authentication method used: [[AuthenticationTypeMapZenV1]].
     */
    MapzenV1,

    /**
     * Use the REST API format of Mapzen Vector Tile API v2.
     *
     * Usage:
     * `<OmvRestClientParams.baseUrl>/tiles/omsbase/256/<zoom>/<X>/<Y>.mvt?api_key=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/tiles/{layers}/{z}/{x}/{y}/{format}?api_key={api_key}`
     *
     * Sample URL:
     * `https://xyz.api.here.com/tiles/osmbase/256/all/16/19293/24641.mvt?api_key=your-mapzen-api-key`
     */
    MapzenV2,

    /**
     * Use the REST API format of Mapzen Vector Tile API v2.
     *
     * Usage:
     * `<OmvRestClientParams.baseUrl>/tiles/omsbase/256/<zoom>/<X>/<Y>.mvt?api_key=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/tiles/{layers}/{z}/{x}/{y}/{format}?api_key={api_key}`
     *
     * Sample URL:
     * `https://xyz.api.here.com/tiles/osmbase/256/all/16/19293/24641.json?api_key=your-mapzen-api-key`
     */
    MapzenV2Json,

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
     *
     * Default authentication method used: [[AuthenticationTypeTomTomV1]].
     */
    TomtomV1
}
// tslint:enable:max-line-length

/**
 * Authentication token/code provider used by [[OmvRestClient]] before each call to currently valid
 * authentication code/token.
 */
export type AuthenticationCodeProvider = () => Promise<string>;

export enum AuthenticationMethod {
    QueryString,
    AuthorizationHeader
}

export interface AuthenticationMethodInfo {
    method: AuthenticationMethod;
    name?: string;
}

/**
 * Authentication method, where token will be provided as HTTP Header:
 *
 *    Authorization: Bearer $authenticationToken
 */
export const AuthenticationTypeBearer: AuthenticationMethodInfo = {
    method: AuthenticationMethod.AuthorizationHeader,
    name: "Bearer"
};

/**
 * TomTomV1 API compatible authorization method, where token will be provided as HTTP Header:
 *
 *    Authorization: Bearer $authenticationToken
 */
export const AuthenticationTypeTomTomV1: AuthenticationMethodInfo = {
    method: AuthenticationMethod.QueryString,
    name: "key"
};
export const AuthenticationTypeMapboxV4: AuthenticationMethodInfo = {
    method: AuthenticationMethod.QueryString,
    name: "access_token"
};
export const AuthenticationTypeMapZenV1: AuthenticationMethodInfo = {
    method: AuthenticationMethod.QueryString,
    name: "api_key"
};

export interface OmvRestClientParameters {
    /**
     * The base URL of the REST Tile Service.
     * @see [[APIFormat]] for the definition of `baseUrl`.
     */
    baseUrl: string;

    /**
     * Authentication code used for the different APIs.
     *
     * When [[AuthenticationCodeProvider]] is is used as value, the provider is called before each
     * to get currently valid authentication code/token.
     *
     * @see [[APIFormat]] for the query parameter this is used with.
     */
    authenticationCode?: string | AuthenticationCodeProvider;

    /**
     * Specifies [[AuthMethod]] to be used when requesting tiles.
     *
     * Defaults for each [[APIFormat]] are documented with each format type.
     */
    authenticationMethod?: AuthenticationMethodInfo;

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
     *
     * @deprecated Please use [[authenticationCode]].
     */
    getBearerToken?: () => Promise<string>;
}

/**
 * REST client supporting getting protobuf OMV Tile from REST-based servers.
 */
export class OmvRestClient implements DataProvider {
    private readonly downloadManager: DownloadManager;

    constructor(readonly params: OmvRestClientParameters) {
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
        abortSignal?: AbortSignal | undefined
    ): Promise<ArrayBufferLike | {}> {
        const init: RequestInit = { signal: abortSignal };

        let tileUrl = this.dataUrl(tileKey);

        const authenticationCode = await this.getActualAuthenticationCode();

        tileUrl = this.applyAuthCode(tileUrl, init, authenticationCode);

        if (this.params.apiFormat === APIFormat.MapzenV2Json) {
            return this.downloadManager.downloadJson(tileUrl, init);
        }

        return this.downloadManager.downloadArrayBuffer(tileUrl, init);
    }

    /**
     * Get actual authentication code/token for this request according to configuration.
     */
    private async getActualAuthenticationCode() {
        if (typeof this.params.authenticationCode === "string") {
            return this.params.authenticationCode;
        } else if (this.params.authenticationCode !== undefined) {
            return this.params.authenticationCode();
        } else if (this.params.getBearerToken !== undefined) {
            return this.params.getBearerToken();
        } else {
            return undefined;
        }
    }

    /**
     * Get default authnentication method basing on apiFormat and other params.
     */
    private getDefaultAuthMethod() {
        if (this.params.getBearerToken !== undefined) {
            return AuthenticationTypeBearer;
        }

        switch (this.params.apiFormat) {
            case APIFormat.HereV1:
                return AuthenticationTypeBearer;
            case APIFormat.MapboxV4:
                return AuthenticationTypeMapboxV4;
            case APIFormat.MapzenV1:
            case APIFormat.MapzenV2:
                return AuthenticationTypeMapZenV1;
            case APIFormat.TomtomV1:
                return AuthenticationTypeTomTomV1;
            default:
                logger.warn(
                    `#getDefaultAuthMethod: Not supported API format: ${this.params.apiFormat}`
                );
                return undefined;
        }
    }

    /**
     * Apply athentication code/token using configured (or default) authentication method.
     *
     * @param url
     * @param init request extra data
     * @param authenticationCode authentication/token to be applied
     * @return new url to be used
     */
    private applyAuthCode(url: string, init: RequestInit, authenticationCode: string | undefined) {
        if (authenticationCode === undefined) {
            return url;
        }
        const authMethod = this.params.authenticationMethod || this.getDefaultAuthMethod();
        if (authMethod === undefined) {
            return url;
        }

        if (authMethod.method === AuthenticationMethod.AuthorizationHeader) {
            if (init.headers === undefined) {
                init.headers = new Headers();
            }
            const authType = authMethod.name || "Bearer";
            (init.headers as Headers).append("Authorization", `${authType} ${authenticationCode}`);
        } else if (authMethod.method === AuthenticationMethod.QueryString) {
            const attrName = authMethod.name || "access_token";
            url = this.addQueryParams(url, [[attrName, authenticationCode]]);
        }
        return url;
    }

    /**
     * Get actual tile URL depending on configured API format.
     */
    private dataUrl(tileKey: TileKey): string {
        let path = `/${tileKey.level}/${tileKey.column}/${tileKey.row}`;
        switch (this.params.apiFormat) {
            case APIFormat.HereV1:
                path += "/omv";
                break;
            case APIFormat.MapboxV4:
                path += ".mvt";
                break;
            case APIFormat.MapzenV1:
                path += ".pbf";
                break;
            case APIFormat.MapzenV2:
                path += ".mvt";
                break;
            case APIFormat.MapzenV2Json:
                path += ".json";
                break;
            case APIFormat.TomtomV1:
                path += ".pbf";
                break;
            default:
                logger.warn(`Not supported API format: ${this.params.apiFormat}`);
                break;
        }

        return this.params.baseUrl + path;
    }

    private addQueryParams(url: string, queryParams: Array<[string, string]>): string {
        let queryString = "";
        let concatinator = url.indexOf("?") !== -1 ? "&" : "?";
        for (const param of queryParams) {
            queryString += concatinator + param[0] + "=" + param[1];
            if (concatinator === "?") {
                concatinator = "&";
            }
        }
        return url + queryString;
    }
}
