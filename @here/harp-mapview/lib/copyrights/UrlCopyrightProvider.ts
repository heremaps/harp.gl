/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITransferManager, TransferManager } from "@here/harp-transfer-manager";

import {
    AreaCopyrightInfo,
    CopyrightCoverageProvider,
    CopyrightCoverageResponse
} from "./CopyrightCoverageProvider";

interface RequestHeaders {
    [field: string]: string;
}

/**
 * Copyright provider which retrieves copyright coverage information from provided URL.
 */
export class UrlCopyrightProvider extends CopyrightCoverageProvider {
    private m_cachedCopyrightResponse: Promise<AreaCopyrightInfo[]> | undefined;

    /**
     * Default constructor.
     *
     * @param m_fetchURL - URL to fetch copyrights data from.
     * @param m_baseScheme - Scheme to get copyrights from.
     * @param m_requestHeaders - Optional request headers for requests(e.g. Authorization)
     */
    constructor(
        private readonly m_fetchURL: string,
        private readonly m_baseScheme: string,
        private m_requestHeaders?: RequestHeaders,
        private readonly m_transferManager: ITransferManager = TransferManager.instance()
    ) {
        super();
    }

    /**
     * Sets request headers.
     * @param headers -
     */
    setRequestHeaders(headers: RequestHeaders | undefined) {
        this.m_requestHeaders = headers;
    }

    /**
     * @inheritdoc
     * @override
     */
    getCopyrightCoverageData(abortSignal?: AbortSignal): Promise<AreaCopyrightInfo[]> {
        if (this.m_cachedCopyrightResponse !== undefined) {
            return this.m_cachedCopyrightResponse;
        }

        this.m_cachedCopyrightResponse = this.m_transferManager
            .downloadJson<CopyrightCoverageResponse>(this.m_fetchURL, {
                headers: this.m_requestHeaders,
                signal: abortSignal
            })
            .then(json => json[this.m_baseScheme])
            .catch(error => {
                this.logger.error(error);
                return [];
            });

        return this.m_cachedCopyrightResponse;
    }
}
