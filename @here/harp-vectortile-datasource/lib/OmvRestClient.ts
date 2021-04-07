/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";

import { TileKey, TilingScheme } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";
import { ITransferManager, TransferManager } from "@here/harp-transfer-manager";
import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("OmvRestClient");

interface QueryParameters {
    [key: string]: string;
}

export enum APIFormat {
    /**
     * Use the REST API format of HERE Vector Tiles Server component version 1.
     *
     * @remarks
     * Documentation:
     *  https://developer.here.com/documentation/vector-tiles-api/dev_guide/index.html
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
     * @remarks
     * Usage:
     * `<OmvRestClientParams.baseUrl>/<zoom>/<X>/<Y>.mvt?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/v4/{map_id}/{z}/{x}/{y}{@2x}.{format}?[style]&access_token={access_token}`
     *
     * Sample URL:
     * `http://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/14/4823/6160.mvt?access_token=your-mapbox-access-token`
     *
     * Default authentication method used: [[AuthenticationTypeAccessToken]].
     */
    MapboxV4,

    /**
     * Use the REST API format of XYZ Vector Tile API in MVT format.
     *
     * @remarks
     * Usage:
     * `<OmvRestClientParams.baseUrl>/tiles/omsbase/256/<zoom>/<X>/<Y>.mvt?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/tiles/{layers}/{z}/{x}/{y}/{format}?access_token={access_token}`
     *
     * Sample URL:
     * `https://xyz.api.here.com/tiles/osmbase/256/all/16/19293/24641.mvt?access_token=your-xyz-access-token`
     *
     * Default authentication method used: [[AuthenticationTypeAccessToken]].
     */
    XYZMVT,

    /**
     * Use the REST API format of XYZ Vector Tile API in JSON format.
     *
     * @remarks
     * Usage:
     * `<OmvRestClientParams.baseUrl>/tiles/omsbase/256/<zoom>/<X>/<Y>.mvt?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/tiles/{layers}/{z}/{x}/{y}/{format}?access_token={access_token}`
     *
     * Sample URL:
     * `https://xyz.api.here.com/tiles/osmbase/256/all/16/19293/24641.json?access_token=your-xyz-api-key`
     *
     * Default authentication method used: [[AuthenticationTypeAccessToken]].
     */
    XYZJson,

    /**
     * Use the REST API format of XYZ Vector Tile API in OMV format.
     *
     * @remarks
     * Usage:
     * `<OmvRestClientParams.baseUrl>/tiles/herebase.02/<zoom>/<X>/<Y>/omv?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/tiles/herebase.02/{z}/{x}/{y}/{format}?access_token={access_token}`
     *
     * Sample URL:
     * `https://xyz.api.here.com/tiles/herebase.02/14/2649/6338/omv?access_token=your-xyz-access-token`
     *
     * Default authentication method used: [[AuthenticationTypeAccessToken]].
     */
    XYZOMV,

    /**
     * Use the REST API format of Tomtoms Vector Tile API v1.
     *
     * @remarks
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
    TomtomV1,

    /**
     * Use the REST API format of XYZ Space Vector Tile API in OMV format.
     *
     * @remarks
     * Usage:
     * `<OmvRestClientParams.baseUrl>/hub/spaces/<space-id>/tile/web/<zoom>_<X>_<Y>.mvt?access_token=<OmvRestClientParams.authenticationCode>`
     *
     * Format definition:
     * `http|s://<base-url>/hub/spaces/{spaceId}/tile/web/{z}_{x}_{y}.mvt?access_token={access_token}`
     *
     * Sample URL:
     * `https://xyz.api.here.com/hub/spaces/your-space-id/tile/web/{z}_{x}_{y}.mvt?access_token=your-access-token`
     *
     * Default authentication method used: [[AuthenticationTypeAccessToken]].
     */
    XYZSpace
}

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

export const AuthenticationTypeAccessToken: AuthenticationMethodInfo = {
    method: AuthenticationMethod.QueryString,
    name: "access_token"
};

export interface OmvRestClientParameters {
    /**
     * `URL` pattern used to fetch tile files.
     *
     * @remarks
     * `URL` with special keywords replaced to retrieve specific tile:
     *  - `{z}` - zoom level of tile, @see {@link @here/harp-geoutils#TileKey.level}
     *  - `{x}` - horizontal coordinate of tile (column number),
     *            see {@link @here/harp-geoutils#TileKey.column}
     *  - `{y}` - vertical coordinate of Tile (row number),
     *            see {@link @here/harp-geoutils#TileKey.row}
     *
     * Examples of `url` patterns:
     * ```
     *   https://my-base-url.com/vector-tiles/{z}/{x}/{y}.mvt
     *   https://xyz.api.here.com/tiles/herebase.02/{z}/{x}/{y}/omv
     *   https://xyz.api.here.com/tiles/osmbase/512/all/{z}/{x}/{y}.mvt
     * ```
     *
     * Note: To add authentication headers and/or query params, use [[authMethod]], [[urlParams]]
     * properties or embed token directly in `url`.
     *
     * Complete examples:
     * ```
     * // XYZ OSM with authentication using query param
     * {
     *     url: "https://xyz.api.here.com/tiles/osmbase/512/all/{z}/{x}/{y}.mvt",
     *     urlParams: {
     *           access_token: accessToken
     *     },
     * }
     * // HERE Vector Tile with authentication using bearer token retrieved by callback
     * {
     *     url: "https://vector.hereapi.com/v2/vectortiles/base/mc/{z}/{x}/{y}/omv",
     *     authenticationMethod: AuthenticationTypeBearer,
     *     authenticationCode: () => getBearerToken()
     * }
     * ```
     */
    url?: string;

    /**
     * The base URL of the REST Tile Service.
     * @see [[APIFormat]] for the definition of `baseUrl`.
     */
    baseUrl?: string;

    /**
     * Authentication code used for the different APIs.
     *
     * @remarks
     * When [[AuthenticationCodeProvider]] is is used as value, the provider is called before each
     * to get currently valid authentication code/token.
     *
     * @see [[APIFormat]] for the query parameter this is used with.
     */
    authenticationCode?: string | AuthenticationCodeProvider;

    /**
     * Specifies [[AuthMethod]] to be used when requesting tiles.
     *
     * @remarks
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
     * Transfer Manager to use; creates an own instance if none passed.
     */
    downloadManager?: ITransferManager;

    /**
     * Function to retrieve the Bearer Token
     *
     * @deprecated Please use [[authenticationCode]].
     */
    getBearerToken?: () => Promise<string>;

    /**
     * Array of query parameters to be appended at the end of the url.
     * It is empty by default.
     */
    urlParams?: { [key: string]: string };
}

/**
 * REST client supporting getting protobuf OMV Tile from REST-based servers.
 */
export class OmvRestClient extends DataProvider {
    private readonly downloadManager: ITransferManager;
    private readonly urlParams: { [key: string]: string };

    constructor(readonly params: OmvRestClientParameters) {
        super();
        this.downloadManager =
            params.downloadManager === undefined
                ? TransferManager.instance()
                : params.downloadManager;
        this.urlParams = params.urlParams === undefined ? {} : params.urlParams;
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
     * @remarks
     * **Note:** In case of an HTTP Error, rejected promise is returned
     * with an error.
     *
     * @example
     * ```typescript
     * const response = layer.getTile(tileKey);
     * if (!response.ok) {
     *     // a network error happened
     *     console.error("Unable to download tile", response.statusText);
     *     return;
     * }
     *
     * // the response is ok and contains data, access it e.g. as arrayBuffer:
     * const payload = await response.arrayBuffer();
     * ```
     *
     * @param tileKey - The tile key of the tile.
     * @param tileRequestInit - Optional request options to be passed to fetch when downloading a
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
        tileUrl = this.addQueryParams(tileUrl, this.urlParams);

        if (this.params.apiFormat === APIFormat.XYZJson) {
            return await this.downloadManager.downloadJson(tileUrl, init);
        }

        return await this.downloadManager.downloadArrayBuffer(tileUrl, init);
    }

    /**
     * Destroys this `OmvRestClient`.
     */
    dispose() {
        // to be overloaded by subclasses
    }

    /**
     * Get actual authentication code/token for this request according to configuration.
     */
    private async getActualAuthenticationCode() {
        if (typeof this.params.authenticationCode === "string") {
            return this.params.authenticationCode;
        } else if (this.params.authenticationCode !== undefined) {
            return await this.params.authenticationCode();
        } else if (this.params.getBearerToken !== undefined) {
            return await this.params.getBearerToken();
        } else {
            return undefined;
        }
    }

    /**
     * Get default authentication method basing on apiFormat and other params.
     */
    private getDefaultAuthMethod() {
        if (this.params.getBearerToken !== undefined) {
            return AuthenticationTypeBearer;
        }

        switch (this.params.apiFormat) {
            case APIFormat.HereV1:
                return AuthenticationTypeBearer;
            case APIFormat.MapboxV4:
            case APIFormat.XYZOMV:
            case APIFormat.XYZMVT:
            case APIFormat.XYZSpace:
            case APIFormat.XYZJson:
                return AuthenticationTypeAccessToken;
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
     * Apply authentication code/token using configured (or default) authentication method.
     *
     * @param url -
     * @param init - request extra data
     * @param authenticationCode - authentication/token to be applied
     * @return new url to be used
     */
    private applyAuthCode(url: string, init: RequestInit, authenticationCode: string | undefined) {
        if (authenticationCode === undefined) {
            return url;
        }
        const authMethod = this.params.authenticationMethod ?? this.getDefaultAuthMethod();
        if (authMethod === undefined) {
            return url;
        }

        if (authMethod.method === AuthenticationMethod.AuthorizationHeader) {
            if (init.headers === undefined) {
                init.headers = new Headers();
            }
            const authType = authMethod.name ?? "Bearer";
            (init.headers as Headers).append("Authorization", `${authType} ${authenticationCode}`);
        } else if (authMethod.method === AuthenticationMethod.QueryString) {
            const attrName: string = authMethod.name ?? "access_token";
            const authParams: { [key: string]: string } = {};
            authParams[attrName] = authenticationCode;
            url = this.addQueryParams(url, authParams);
        }
        return url;
    }

    /**
     * Get actual tile URL depending on configured API format.
     */
    private dataUrl(tileKey: TileKey): string {
        if (this.params.url !== undefined) {
            return this.params.url
                .replace("{x}", String(tileKey.column))
                .replace("{y}", String(tileKey.row))
                .replace("{z}", String(tileKey.level));
        }
        let path = [`/${tileKey.level}`, tileKey.column, tileKey.row].join(
            this.params.apiFormat === APIFormat.XYZSpace ||
                this.params.apiFormat === APIFormat.XYZJson
                ? "_"
                : "/"
        );
        switch (this.params.apiFormat) {
            case APIFormat.HereV1:
            case APIFormat.XYZOMV:
                path += "/omv";
                break;
            case APIFormat.MapboxV4:
                path += ".mvt";
                break;
            case APIFormat.XYZMVT:
                path += ".mvt";
                break;
            case APIFormat.XYZJson:
                break;
            case APIFormat.XYZSpace:
                path += ".mvt";
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

    private addQueryParams(url: string, queryParams: QueryParameters): string {
        let queryString = "";
        let sep = url.includes("?") ? "&" : "?";
        for (const prop in queryParams) {
            if (!queryParams.hasOwnProperty(prop)) {
                continue;
            }
            queryString += `${sep}${encodeURIComponent(prop)}=${encodeURIComponent(
                queryParams[prop]
            )}`;
            if (sep === "?") {
                sep = "&";
            }
        }
        return url + queryString;
    }
}
