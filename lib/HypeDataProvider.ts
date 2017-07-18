/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
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

/** @module @here/mapview-decoder **//** */

import { DataStoreClient, HRN, CatalogClient, CatalogLayer } from "@here/hype";
import { DataProvider } from "./DataProvider";
import { TileKey } from "@here/geoutils";

export interface HypeDataProviderOptions {
    hrn: HRN;
    appId: string;
    appCode: string;
    layer: string;
    proxyDataUrl?: string;
    catalogVersion?: number;
}

export class HypeDataProvider extends DataProvider {
    private readonly m_dataStoreClient: DataStoreClient;
    private m_Layer: CatalogLayer;
    private m_catalogClient: CatalogClient;

    constructor(private readonly m_options: HypeDataProviderOptions) {
        super();
        this.m_dataStoreClient = new DataStoreClient(m_options.appId, m_options.appCode, m_options.hrn);
    }

    ready(): boolean {
        return this.m_Layer !== undefined;
    }

    /**
     * Returns the underlying catalog client.
     *
     * Note: The data provider must be connected before this method can be called.
     *
     * @returns the catalog client this data provider uses
     */
    catalogClient(): CatalogClient {
        if (this.m_catalogClient === undefined)
            throw new Error("Data provider not connected");
        return this.m_catalogClient;
    }

    async connect(): Promise<void> {
        this.m_catalogClient = await this.m_dataStoreClient.getCatalogClient(this.m_options.catalogVersion);
        const layer = this.m_catalogClient.layers.get(this.m_options.layer);
        if (layer === undefined)
            throw new Error(`layer ${this.m_options.layer} not found in catalog`);
        this.m_Layer = layer;
        if (this.m_options.proxyDataUrl !== undefined && this.m_options.proxyDataUrl.length > 0)
            this.m_Layer.dataUrl = this.m_options.proxyDataUrl;
    }

    async getTile(tileKey: TileKey): Promise<ArrayBuffer> {
        const response = await this.m_catalogClient.getTile(this.m_Layer, tileKey);
        if (!response.ok)
            throw new Error(`Error downloading tile ${tileKey.toHereTile()} from catalog ${this.m_dataStoreClient.hrn.toString()}, layer ${this.m_Layer.name}: ${response.status} ${response.statusText}`);
        return response.arrayBuffer();
    }
}
