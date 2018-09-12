/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import {
    getCatalogsConfiguration,
    getLatestVersion,
    getLayerVersions
} from "@here/datastore-api/lib/api-v1";
import { DownloadManager } from "@here/download-manager";
import {
    DataStoreAppIdRequestBuilder,
    DataStoreOAuthRequestBuilder,
    DataStoreRequestBuilder
} from "../DataStoreRequestBuilder";
import { HRN } from "../HRN";
import { Catalog1Client } from "./Catalog1Client";

/**
 * Base interface for parameters passed to `DataStoreClient` constructor.
 */
export interface CommonDataStoreClient1Params {
    /**
     * The HRN to connect to.
     */
    hrn: HRN;

    /**
     * The download manager to use. If not specified, the default [[DownloadManager]] instance is
     * used.
     */
    downloadManager?: DownloadManager;
}

/**
 * `DataStoreClient` parameters for `appId` / `appCode` based authentication.
 */
export interface AppIdDataStoreClient1Params extends CommonDataStoreClient1Params {
    /**
     * The application id.
     */
    appId: string;

    /**
     * The application code.
     */
    appCode: string;
}

function isAppIdAuthorization(params: any): params is AppIdDataStoreClient1Params {
    return params.appId !== undefined && params.appCode !== undefined;
}

/**
 * `DataStoreClient` parameters for OAuth based authentication.
 */
export interface OAuthDataStoreClient1Params extends CommonDataStoreClient1Params {
    /**
     * Function returning a valid bearer token.
     */
    getBearerToken(): Promise<string>;
}

function isOAuthAuthorization(params: any): params is OAuthDataStoreClient1Params {
    return params.getBearerToken !== undefined;
}

export type DataStoreClient1Parameters = OAuthDataStoreClient1Params | AppIdDataStoreClient1Params;

/**
 * The main class to access a catalog from HERE DataStore.
 *
 * This API supports version 1 of the DataStore REST API.
 */
export class DataStore1Client {
    /**
     * Magic number to request the latest available catalog from the server.
     */
    static readonly LATEST_VERSION = -1;

    /**
     * The DataStore API version this `DataStoreClient supports.
     */
    readonly apiVersion: 1 = 1;

    /**
     * The HRN this `DataStoreClient` points to.
     */
    readonly hrn: HRN;

    private readonly requestBuilder: DataStoreRequestBuilder;
    /**
     * Constructs a new `DataStoreClient`.
     *
     * @deprecated Please use the constructor that takes a `params` argument instead.
     *
     * @param appId The application id that is used in all following calls to DataStore.
     * @param appCode The application code that is used in all following calls to DataStore.
     * @param hrn A HRN that points to the DataStore instance.
     * @param downloadManager Optional specified which [[DownloadManager]] should be used.
     *
     */

    constructor(appId: string, appCode: string, hrn: HRN, downloadManager?: DownloadManager);

    /**
     * Constructs a new `DataStoreClient`.
     *
     * @param params The parameters for this `DataStoreClient`.
     */
    constructor(params: DataStoreClient1Parameters);

    /** @private */
    constructor(
        appIdOrParams: string | DataStoreClient1Parameters,
        appCode?: string,
        hrn?: HRN,
        downloadManager?: DownloadManager
    ) {
        let params: DataStoreClient1Parameters;

        if (typeof appIdOrParams === "string") {
            // TODO - remove this code once we remove the deprecated constructor
            if (appCode === undefined || hrn === undefined) {
                throw new TypeError("Wrong arguments in constructor");
            }
            params = { appId: appIdOrParams, appCode, hrn, downloadManager };
        } else {
            params = appIdOrParams;
        }

        this.hrn = params.hrn;
        const resolvedHrn = this.hrn.resolve();
        const dm =
            params.downloadManager === undefined
                ? DownloadManager.instance()
                : params.downloadManager;

        if (isAppIdAuthorization(params)) {
            this.requestBuilder = new DataStoreAppIdRequestBuilder(
                dm,
                resolvedHrn,
                params.appId,
                params.appCode
            );
        } else if (isOAuthAuthorization(params)) {
            this.requestBuilder = new DataStoreOAuthRequestBuilder(
                dm,
                resolvedHrn,
                params.getBearerToken
            );
        } else {
            throw new Error("Unknown authorization method");
        }
    }

    /**
     * Asynchronously gets a `CatalogClient` for the given version.
     *
     * @param version (optional) The version of the catalog to obtain. If not specified, the latest
     * available catalog is fetched.
     * @returns A promise that is resolved when the required meta data for this catalog is
     * downloaded.
     */
    async getCatalogClient(
        version: number = DataStore1Client.LATEST_VERSION
    ): Promise<Catalog1Client> {
        if (version === DataStore1Client.LATEST_VERSION) {
            const latestVersion = await getLatestVersion(this.requestBuilder, {
                startVersion: DataStore1Client.LATEST_VERSION
            });
            if (latestVersion.version === DataStore1Client.LATEST_VERSION) {
                throw new Error(
                    "Invalid version received from latest version call, cannot proceed"
                );
            }
            version = latestVersion.version;
        }

        const layerVersionsPromise = getLayerVersions(this.requestBuilder, { version });
        const configPromise = getCatalogsConfiguration(this.requestBuilder);

        const results = await Promise.all<any>([configPromise, layerVersionsPromise]);
        return new Catalog1Client(this.requestBuilder, results[0], results[1]);
    }
}
