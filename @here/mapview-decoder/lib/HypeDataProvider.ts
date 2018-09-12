/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { CancellationToken } from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { DataStoreClientParameters } from "@here/hype";
import { Catalog1Client, Catalog1Layer } from "@here/hype/lib/v1/Catalog1Client";
import { DataStore1Client } from "@here/hype/lib/v1/DataStore1Client";
import { Catalog2Client, Catalog2Layer } from "@here/hype/lib/v2/Catalog2Client";
import { DataStore2Client } from "@here/hype/lib/v2/DataStore2Client";

import { DataProvider } from "./DataProvider";

/**
 * Specify the options of the Hype datasource.
 */
export interface HypeDataProviderOptions {
    /**
     * Specify which layer to use.
     */
    layer: string;

    /**
     * Optional parameter of the proxy URL, override the URL specified in the Hype data layer.
     */
    proxyDataUrl?: string;

    /**
     * Specify which version of CatalogClient should be used.
     */
    catalogVersion?: number;
}

/**
 * The `HypeDataProvider` is a [[DataProvider]] which retrieves Hype tiles in any of the specified
 * versions of the Hype DataStore.
 */
export class HypeDataProvider extends DataProvider {
    private m_layer?: Catalog1Layer | Catalog2Layer;
    private m_catalogClient?: Catalog1Client | Catalog2Client;

    /**
     * Construct a new `HypeDataProvider` with the specified options.
     *
     * @param m_options Specify options like layer, URL and version.
     */
    constructor(private readonly m_options: HypeDataProviderOptions & DataStoreClientParameters) {
        super();
    }

    ready(): boolean {
        return this.m_layer !== undefined;
    }

    /**
     * Returns the underlying catalog client.
     *
     * **Note**: The data provider must be connected before this method can be called, so make sure
     * that `ready()` returns `true` before calling it.
     *
     * @returns The catalog client this data provider uses.
     */
    catalogClient(): Catalog1Client | Catalog2Client {
        if (this.m_catalogClient === undefined) {
            throw new Error("Data provider not connected");
        }
        return this.m_catalogClient;
    }

    async connect(): Promise<void> {
        const options = this.m_options;
        let dataStoreClient: DataStore1Client | DataStore2Client;
        if (this.m_options.hrn.data.service === "data") {
            dataStoreClient = new DataStore2Client(this.m_options);
        } else if (this.m_options.hrn.data.service === "datastore") {
            dataStoreClient = new DataStore1Client(this.m_options);
        } else {
            throw new Error(`Unknown service ${this.m_options.hrn.data.service}, cannot connect`);
        }

        this.m_catalogClient = await dataStoreClient.getCatalogClient(options.catalogVersion);

        const layer = this.m_catalogClient.getLayer(options.layer);

        if (options.proxyDataUrl !== undefined && options.proxyDataUrl.length > 0) {
            layer.setDataProxy(options.proxyDataUrl);
        }

        this.m_layer = layer;
    }

    async getTile(
        tileKey: TileKey,
        cancellationToken?: CancellationToken
    ): Promise<ArrayBufferLike> {
        if (this.m_layer === undefined) {
            throw new Error(`Hype data provider not connected`);
        }
        const response = await this.m_layer.getTile(tileKey, { cancellationToken });
        if (!response.ok) {
            throw new Error(
                `Error downloading tile ${tileKey.toHereTile()} from catalog ` +
                    `${this.m_options.hrn.toString()}: ${response.status} ${response.statusText}`
            );
        }
        return response.arrayBuffer();
    }
}
