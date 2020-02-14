/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";
import { LoggerManager } from "@here/harp-utils";
import {
    CatalogClient,
    CatalogVersionRequest,
    DataRequest,
    HRN,
    OlpClientSettings,
    VersionedLayerClient
} from "@here/olp-sdk-dataservice-read";

const logger = LoggerManager.instance.create("OlpDataProvider");

/**
 * [[OlpDataProvider]] initialization parameters.
 */
export interface OlpDataProviderParams {
    /** OLP catalog HRN. */
    hrn: string;

    /** OLP catalog layer id. */
    layerId: string;

    /** Token resolution callback. */
    getToken: () => Promise<string>;

    /**
     * OLP catalog version.
     * @default Latest catalog version
     */
    version?: number;
}

/**
 * [[DataProvider]] implementation for OLP catalogs.
 */
export class OlpDataProvider implements DataProvider {
    private m_versionLayerClient: VersionedLayerClient | undefined;
    private m_catalogVersion: number = -1;

    constructor(readonly params: OlpDataProviderParams) {}

    /**
     * Connect to the data source. Returns a promise to wait for successful (or failed) connection.
     *
     * @returns A promise which is resolved when the connection has been established.
     */
    async connect(): Promise<void> {
        const settings = new OlpClientSettings({
            environment: "here",
            getToken: this.params.getToken
        });

        if (this.params.version !== undefined && this.params.version >= 0) {
            this.m_catalogVersion = this.params.version;
        } else {
            const latestVersion = await new CatalogClient(
                HRN.fromString(this.params.hrn),
                settings
            ).getLatestVersion(new CatalogVersionRequest());

            this.m_catalogVersion = latestVersion;
        }
        this.m_versionLayerClient = new VersionedLayerClient(
            HRN.fromString(this.params.hrn),
            this.params.layerId,
            settings
        );
    }

    /**
     * Returns `true` if it has been connected successfully.
     */
    ready(): boolean {
        return this.m_versionLayerClient !== undefined;
    }

    /**
     * Load the data of a [[Tile]] asynchronously in form of an [[ArrayBufferLike]].
     *
     * @param tileKey Address of a tile.
     * @param abortSignal Optional AbortSignal to cancel the request.
     * @returns A promise delivering the data as an [[ArrayBufferLike]], or any object.
     */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        if (this.m_versionLayerClient === undefined) {
            throw new Error("OlpDataProvider is not connected.");
        }

        try {
            const response = await this.m_versionLayerClient.getData(
                new DataRequest().withQuadKey(tileKey).withVersion(this.m_catalogVersion),
                abortSignal
            );
            if (abortSignal && abortSignal.aborted) {
                // Safety belt if `getData` doesn't really support abort signal.
                const err = new Error("Aborted");
                err.name = "AbortError";
                throw err;
            }
            if (response.status !== 200) {
                throw new Error(response.statusText);
            }
            return response.arrayBuffer();
        } catch (error) {
            if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                // Rethrow abort errors as they shall be handled on higher level.
                throw error;
            }

            // 204 - NO CONTENT, no data exists at the given tile.
            if (error.name === "HttpError" && error.status === 204) {
                return {};
            }

            logger.error(
                `Error loading tile ${tileKey.mortonCode()} for catalog ${
                    this.params.hrn
                }: ${error}`
            );
            return {};
        }
    }
}
