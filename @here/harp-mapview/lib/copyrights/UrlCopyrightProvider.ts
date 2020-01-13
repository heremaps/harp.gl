/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransferManager } from "@here/harp-transfer-manager";
import {
    AreaCopyrightInfo,
    CopyrightCoverageProvider,
    CopyrightCoverageResponse
} from "./CopyrightCoverageProvider";

/**
 * Copyright provider which retrieves copyright coverage information from provided URL.
 */
export class UrlCopyrightProvider extends CopyrightCoverageProvider {
    private m_cachedCopyrightResponse: Promise<AreaCopyrightInfo[]> | undefined;

    /**
     * Default constructor.
     *
     * @param m_fetchURL URL to fetch copyrights data from.
     * @param m_baseScheme Scheme to get copyrights from.
     */
    constructor(private m_fetchURL: string, private m_baseScheme: string) {
        super();
    }

    /**
     * @inheritdoc
     * @override
     */
    getCopyrightCoverageData(): Promise<AreaCopyrightInfo[]> {
        if (this.m_cachedCopyrightResponse !== undefined) {
            return this.m_cachedCopyrightResponse;
        }

        this.m_cachedCopyrightResponse = new TransferManager()
            .downloadJson<CopyrightCoverageResponse>(this.m_fetchURL)
            .then(json => json[this.m_baseScheme])
            .catch(error => {
                this.logger.error(error);
                return [];
            });

        return this.m_cachedCopyrightResponse;
    }
}
