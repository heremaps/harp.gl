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
    getCatalogUsingGET,
    latestVersionUsingGET,
    layerVersionsForCatalogUsingGET
} from "@here/datastore-api/lib/api-v2";
import { DownloadManager } from "@here/download-manager";
import {
    DataStoreAppIdRequestBuilder,
    DataStoreOAuthRequestBuilder,
    DataStoreRequestBuilder
} from "../DataStoreRequestBuilder";
import { HRN } from "../HRN";
import { Catalog2Client } from "./Catalog2Client";

export interface ServiceUrls {
    [index: string]: string | undefined;
    discovery?: string;
    query?: string;
    blobstore?: string;
    volatileblob?: string;
    config?: string;
    metadata?: string;
    coverage?: string;
    artifact?: string;
}

/**
 * Base interface for parameters passed to `DataStoreClient` constructor.
 */
export interface CommonDataStoreClientParams {
    /**
     * The HRN to connect to
     */
    hrn: HRN;

    /**
     * The download manager to use. If not specified, the default downloadManager instance
     * is used.
     */
    downloadManager?: DownloadManager;

    /**
     * The service base URLs. Use this to override the default service base URLs, for example, for
     * debugging or testing.
     */
    serviceUrls?: ServiceUrls;
}

/**
 * `DataStoreClient` parameters for appId / appCode based authentication
 */
export interface AppIdDataStoreClientParams extends CommonDataStoreClientParams {
    /**
     * The application id
     */
    appId: string;

    /**
     * The application code
     */
    appCode: string;
}

/// Returns true if params is AppIdDataStoreClientParams, false otherwise
export function isAppIdAuthorization(params: any): params is AppIdDataStoreClientParams {
    return params.appId !== undefined && params.appCode !== undefined;
}

/**
 * `DataStoreClient` parameters for OAuth based authentication
 */
export interface OAuthDataStoreClientParams extends CommonDataStoreClientParams {
    /**
     * Function returning a valid bearer token.
     */
    getBearerToken(): Promise<string>;
}

/// Returns true if params is OAuthDataStoreClientParams, false otherwise
export function isOAuthAuthorization(params: any): params is OAuthDataStoreClientParams {
    return params.getBearerToken !== undefined;
}

/// Type definition for possible DataStoreClient parameters
export type DataStoreClientParameters = OAuthDataStoreClientParams | AppIdDataStoreClientParams;

interface RequestBuilders {
    queryApiRequestBuilder: DataStoreRequestBuilder;
    blobstoreApiRequestBuilder: DataStoreRequestBuilder;
    volatileBlobApiRequestBuilder: DataStoreRequestBuilder;
    configApiRequestBuilder: DataStoreRequestBuilder;
    metaDataApiRequestBuilder: DataStoreRequestBuilder;
    coverageApiRequestBuilder: DataStoreRequestBuilder;
    artifactApiRequestBuilder: DataStoreRequestBuilder;
}

/**
 * The main class to access a catalog from HERE Data Service.
 *
 * This API supports version 2 of the Data Service REST API.
 */
export class DataStore2Client {
    /**
     * Magic number to request the latest available catalog from the server.
     */
    static readonly LATEST_VERSION = -1;

    /**
     * The HRN this `DataStoreClient` points to.
     */
    readonly hrn: HRN;

    /**
     * The Data Service API version this `DataStoreClient` supports.
     */
    readonly apiVersion: 2 = 2;

    private readonly discoveryRequestBuilder: DataStoreRequestBuilder;
    private readonly serviceUrls: ServiceUrls;

    /**
     * Constructs a new `DataStoreClient`.
     *
     * @param params The parameters for this `DataStoreClient`.
     */
    constructor(params: DataStoreClientParameters) {
        this.hrn = params.hrn;
        this.serviceUrls = params.serviceUrls === undefined ? {} : params.serviceUrls;
        const dm =
            params.downloadManager === undefined
                ? DownloadManager.instance()
                : params.downloadManager;

        const discoveryBaseUrl =
            this.serviceUrls.discovery === undefined
                ? "https://discovery.datastore.sit.api.here.com/v1/discover/catalogs"
                : this.serviceUrls.discovery;

        if (isAppIdAuthorization(params)) {
            this.discoveryRequestBuilder = new DataStoreAppIdRequestBuilder(
                dm,
                discoveryBaseUrl,
                params.appId,
                params.appCode
            );
        } else if (isOAuthAuthorization(params)) {
            this.discoveryRequestBuilder = new DataStoreOAuthRequestBuilder(
                dm,
                discoveryBaseUrl,
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
        version: number = DataStore2Client.LATEST_VERSION
    ): Promise<Catalog2Client> {
        const requestBuilders = await this.getRequestBuilders();

        if (version === DataStore2Client.LATEST_VERSION) {
            const latestVersion = await latestVersionUsingGET(
                requestBuilders.metaDataApiRequestBuilder,
                {
                    catalogId: this.hrn.data.resource,
                    startVersion: DataStore2Client.LATEST_VERSION
                }
            );
            if (latestVersion.version === undefined || latestVersion.version === -1) {
                throw new Error(
                    "Invalid version received from latest version call, cannot proceed"
                );
            }
            version = latestVersion.version;
        }

        const layerVersionsPromise = layerVersionsForCatalogUsingGET(
            requestBuilders.metaDataApiRequestBuilder,
            { catalogId: this.hrn.data.resource, version }
        );
        const configPromise = getCatalogUsingGET(requestBuilders.configApiRequestBuilder, {
            catalogHrn: this.hrn.toString()
        });

        const results = await Promise.all<any>([configPromise, layerVersionsPromise]);
        return new Catalog2Client({
            configuration: results[0],
            layerVersions: results[1],
            metaDataRequestBuilder: requestBuilders.metaDataApiRequestBuilder,
            queryRequestBuilder: requestBuilders.queryApiRequestBuilder,
            blobStoreRequestBuilder: requestBuilders.blobstoreApiRequestBuilder,
            volatileBlobRequestBuilder: requestBuilders.volatileBlobApiRequestBuilder,
            coverageRequestBuilder: requestBuilders.coverageApiRequestBuilder,
            artifactRequestBuilder: requestBuilders.artifactApiRequestBuilder
        });
    }

    private getBaseUrl(response: any, service: string, api: string): string {
        const baseUrl = this.serviceUrls[api];
        if (baseUrl !== undefined) {
            return baseUrl;
        }

        if (response.endpoints !== undefined) {
            for (const endpoint of response.endpoints) {
                if (
                    endpoint.service === service &&
                    endpoint.api === api &&
                    endpoint.baseUrl !== undefined
                ) {
                    // ### baseUrl undefined??
                    return endpoint.baseUrl;
                }
            }
        }

        throw new Error(`Unable to determine ${service} ${api} base URL`);
    }

    private async getRequestBuilders(): Promise<RequestBuilders> {
        // ### hack - bypass discovery
        Object.assign(this.serviceUrls, this.bypassDiscovery());
        const discoverResponse = {}; // await this.discover();

        const metaDataApiBaseUrl = this.getBaseUrl(discoverResponse, "datastore", "metadata");
        const queryApiBaseUrl = this.getBaseUrl(discoverResponse, "datastore", "query");
        const blobstoreApiBaseUrl = this.getBaseUrl(discoverResponse, "datastore", "blobstore");
        const volatileBlobApiBaseUrl = this.getBaseUrl(
            discoverResponse,
            "datastore",
            "volatile-blob"
        );
        const configApiBaseUrl = this.getBaseUrl(discoverResponse, "datastore", "config");
        const coverageApiBaseUrl = this.getBaseUrl(discoverResponse, "datastore", "coverage");
        const artifactApiBaseUrl = this.getBaseUrl(discoverResponse, "datastore", "artifact");

        return {
            configApiRequestBuilder: this.discoveryRequestBuilder.clone(configApiBaseUrl),
            blobstoreApiRequestBuilder: this.discoveryRequestBuilder.clone(blobstoreApiBaseUrl),
            volatileBlobApiRequestBuilder:
                this.discoveryRequestBuilder.clone(volatileBlobApiBaseUrl),
            queryApiRequestBuilder: this.discoveryRequestBuilder.clone(queryApiBaseUrl),
            metaDataApiRequestBuilder: this.discoveryRequestBuilder.clone(metaDataApiBaseUrl),
            coverageApiRequestBuilder: this.discoveryRequestBuilder.clone(coverageApiBaseUrl),
            artifactApiRequestBuilder: this.discoveryRequestBuilder.clone(artifactApiBaseUrl)
        };
    }

    private bypassDiscovery(): ServiceUrls {
        const result: ServiceUrls = {};

        const serverType = this.hrn.data.partition === "here-dev" ? ".in" : "";

        for (const api of [
            "metadata",
            "query",
            "blobstore",
            "volatile-blob",
            "config",
            "coverage",
            "artifact"
        ]) {
            result[api] =
                this.serviceUrls[api] === undefined
                    ? `https://${api}${api === "artifact"? '': '.data'}.api.platform${serverType}`+
                    `.here.com`
                    : this.serviceUrls[api];
        }
        return result;
    }

    /* ### Discovery service has been de-scoped for beta release
    private async discover(): Promise<DiscoverResponse> {
        const actions = DataStore2Client.getDiscoveryActions(this.serviceUrls);
        if (actions.length === 0)
            return Promise.resolve({}); // all services already available.

        const discoverRequest: DiscoverRequest = {
            actions
        };

        const response = await listEndpointsUsingPOST(this.discoveryRequestBuilder,
            { catalogHrn: this.hrn.toString(), body: discoverRequest });
        return response;
    }

    private static getDiscoveryActions(serviceUrls: ServiceUrls): Array<ClientAction> {
        const actions = new Array<ClientAction>();

        const requiredApis: { [ index: string ] : string } = {
            metadata: "v1",
            query: "v1",
            blobstore: "v1",
            config: "v1"
        };

        for (let requiredApi in requiredApis) {
            if (serviceUrls[requiredApi] === undefined) {
                actions.push({
                    service: "datastore",
                    api: requiredApi,
                    apiVersion: requiredApis[requiredApi]
                });
            }
        }

        return actions;
    }
    */
}
