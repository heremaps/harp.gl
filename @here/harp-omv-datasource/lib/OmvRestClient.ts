/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import {
    VectorTileRestClient,
    VectorTileRestClientParameters
} from "@here/harp-vectortile-datasource";

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
     * If [[VectorTileRestClientParams.authenticationToken]] is provided, it will be added as HTTP header:
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
     * `<VectorTileRestClientParams.baseUrl>/<zoom>/<X>/<Y>.mvt?access_token=<VectorTileRestClientParams.authenticationCode>`
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
     * Usage:
     * `<VectorTileRestClientParams.baseUrl>/tiles/omsbase/256/<zoom>/<X>/<Y>.mvt?access_token=<VectorTileRestClientParams.authenticationCode>`
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
     * Usage:
     * `<VectorTileRestClientParams.baseUrl>/tiles/omsbase/256/<zoom>/<X>/<Y>.mvt?access_token=<VectorTileRestClientParams.authenticationCode>`
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
     * Usage:
     * `<VectorTileRestClientParams.baseUrl>/tiles/herebase.02/<zoom>/<X>/<Y>/omv?access_token=<VectorTileRestClientParams.authenticationCode>`
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
     * Usage:
     * `<VectorTileRestClientParams.baseUrl>/<zoom>/<X>/<Y>.pbf?key=<VectorTileRestClientParams.authenticationCode>`
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
     * Usage:
     * `<VectorTileRestClientParams.baseUrl>/hub/spaces/<space-id>/tile/web/<zoom>_<X>_<Y>.mvt?access_token=<VectorTileRestClientParams.authenticationCode>`
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
// tslint:enable:max-line-length

/**
 * Authentication token/code provider used by [[VectorTileRestClient]] before each call to currently
 * valid authentication code/token.
 */
export type AuthenticationCodeProvider = () => Promise<string>;
export type OmvRestClientParameters = VectorTileRestClientParameters;

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

let warningShown = false;
export class OmvRestClient extends VectorTileRestClient {
    constructor(readonly params: OmvRestClientParameters) {
        super(params);
        if (!warningShown) {
            logger.warn(
                "OmvRestClient is deprecated and will be removed soon. Use " +
                    "VectorTileRestClient instead (package @here/harp-vectortile-datasource)."
            );
            warningShown = true;
        }
    }
}
