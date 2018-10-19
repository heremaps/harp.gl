/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DownloadManager } from "@here/download-manager";
import "@here/fetch";
import { TileKey } from "@here/geoutils";
import { DataProvider } from "@here/mapview-decoder";

/**
 * The structure of the parameters to pass to the constructor of an [[XYZDataProvider]] instance.
 */
export interface XYZDataProviderParameters {
    baseUrl: string;
    token: string;
    downloadManager?: DownloadManager;
    spaceId: string;
}

/**
 * The class that converts a tile request in [[MapView]] to a proper call to the XYZ API.
 */
export class XYZDataProvider implements DataProvider {
    private readonly downloadManager: DownloadManager;

    /**
     * The constructor of the `XYZDataProvider`.
     *
     * @param params The required parameters of the constructor defined in
     * [[XYZDataProviderParameters]]
     */
    constructor(private params?: XYZDataProviderParameters) {
        this.downloadManager =
            params === undefined || params.downloadManager === undefined
                ? DownloadManager.instance()
                : params.downloadManager;
    }

    /**
     * @hidden
     */
    async connect(): Promise<void> {
        //not needed
    }

    /**
     * @hidden
     */
    ready(): boolean {
        return true;
    }

    /**
     * Sends a request for a GeoJSON tile to the XYZ API.
     *
     * @param tileKey The tile identifiers.
     * @param abortSignal An optional AbortSignal instance.
     *
     * @returns Promise
     */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal | undefined): Promise<{}> {
        const tileUrl = this.dataUrl(tileKey);
        const response = await this.downloadManager.downloadJson(tileUrl, {
            signal: abortSignal
        });
        return response;
    }

    /**
     * Sets the parameters of the call to the XYZ API.
     *
     * @param baseUrl The URL of the XYZ API.
     * @param spaceId The user's space ID.
     * @param token The user's personal token for the XYZ API.
     */
    setParameters(baseUrl: string, spaceId: string, token: string) {
        this.params = {
            baseUrl,
            spaceId,
            token
        };
    }

    /**
     * Concatenates the URL parameters with the tile to request and returns the full URL.
     *
     * @param tileKey
     */
    private dataUrl(tileKey: TileKey): string {
        if (this.params === undefined) {
            throw new TypeError(`The XYZDataProvider is missing credentials parameters. Call
                #setParameters to provide them`);
        }
        // tslint:disable-next-line:max-line-length
        let path = `/${this.params.spaceId}/tile/web/${tileKey.level}_${tileKey.column}_${
            tileKey.row
        }`;
        if (this.params.token) {
            path += this.addQueryParams([["access_token", this.params.token], ["clip", "true"]]);
        }
        return this.params.baseUrl + path;
    }

    /**
     * Concatenates optional query parameters to the API call.
     *
     * @param queryParams Additional parameters with their values.
     */
    private addQueryParams(queryParams: Array<[string, string]>): string {
        let queryString = "";
        let concatenator = "?";
        for (const param of queryParams) {
            queryString += concatenator + param[0] + "=" + param[1];
            if (concatenator === "?") {
                concatenator = "&";
            }
        }
        return queryString;
    }
}
