/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { AreaCopyrightInfo, CopyrightCoverageProvider } from "@here/harp-mapview";
import { HRN, OlpClientSettings } from "@here/olp-sdk-core";
import { DataRequest, EnvironmentName, VersionedLayerClient } from "@here/olp-sdk-dataservice-read";

/**
 * [[OlpCopyrightProvider]] initialization parameters.
 */
export interface OlpCopyrightProviderParams {
    /** OLP catalog HRN. */
    hrn: string;

    /** Token resolution callback. */
    getToken: () => Promise<string>;

    /**
     * Scheme to retrieve copyrights from.
     * @default `"normal"`
     */
    baseScheme?: string;

    /**
     * Layer name.
     * @default `"copyright"`
     */
    layer?: string;

    /**
     * Partition name with copyright coverage data.
     * @default `"copyright_suppliers_here"`
     */
    partition?: string;

    /**
     * Version of the catalog
     */
    version: number;
    /** The name of environment. If omitted, environment from catalog HRN will be used. */
    environment?: EnvironmentName;
}

const DEFAULT_LAYER = "copyright";
const DEFAULT_PARTITION = "copyright_suppliers_here";

/**
 * Copyright provider which retrieves copyright coverage information from OLP partition.
 */
export class OlpCopyrightProvider extends CopyrightCoverageProvider {
    private m_cachedCopyrightResponse: Promise<AreaCopyrightInfo[]> | undefined;

    /**
     * Default constructor.
     * @param m_params - Copyright provider configuration.
     */
    constructor(private readonly m_params: OlpCopyrightProviderParams) {
        super();
    }

    /**
     * @inheritdoc
     * @override
     */
    async getCopyrightCoverageData(abortSignal?: AbortSignal): Promise<AreaCopyrightInfo[]> {
        if (this.m_cachedCopyrightResponse !== undefined) {
            return await this.m_cachedCopyrightResponse;
        }

        try {
            const hrn = HRN.fromString(this.m_params.hrn);
            const settings = new OlpClientSettings({
                getToken: this.m_params.getToken,
                environment: this.m_params.environment ?? hrn.data.partition
            });
            const client = new VersionedLayerClient({
                catalogHrn: hrn,
                layerId: this.m_params.layer ?? DEFAULT_LAYER,
                version: this.m_params.version,
                settings
            });
            const partition = await client.getData(
                new DataRequest().withPartitionId(this.m_params.partition ?? DEFAULT_PARTITION),
                abortSignal
            );
            const json = await partition.json();
            this.m_cachedCopyrightResponse = json[this.m_params.baseScheme ?? "normal"];
            if (this.m_cachedCopyrightResponse !== undefined) {
                return await this.m_cachedCopyrightResponse;
            }
        } catch (error) {
            this.logger.error(error);
        }
        return [];
    }
}
