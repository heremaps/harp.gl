/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { AreaCopyrightInfo, CopyrightCoverageProvider } from "@here/harp-mapview";
import { CatalogClient, DataStoreContext, HRN } from "@here/olp-sdk-dataservice-read";

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
     * @param m_params Copyright provider configuration.
     */
    constructor(private m_params: OlpCopyrightProviderParams) {
        super();
    }

    /**
     * @inheritdoc
     * @override
     */
    async getCopyrightCoverageData(): Promise<AreaCopyrightInfo[]> {
        if (this.m_cachedCopyrightResponse !== undefined) {
            return this.m_cachedCopyrightResponse;
        }

        const hrn = HRN.fromString(this.m_params.hrn);
        const context = new DataStoreContext({
            getToken: this.m_params.getToken,
            environment: hrn.data.partition
        });
        const catalogClient = new CatalogClient({
            context,
            hrn: this.m_params.hrn
        });

        this.m_cachedCopyrightResponse = catalogClient
            .getVolatileOrVersionedLayer(this.m_params.layer || DEFAULT_LAYER)
            .then()
            .then(layer => layer.getPartition(this.m_params.partition || DEFAULT_PARTITION))
            .then(response => response.json())
            .then(json => json[this.m_params.baseScheme || "normal"])
            .catch(error => {
                this.logger.error(error);
                return [];
            });

        return this.m_cachedCopyrightResponse;
    }
}
