/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { FontCatalogConfig } from "@here/harp-datasource-protocol";
import { FontCatalog } from "@here/harp-text-canvas";
import { assert, LoggerManager } from "@here/harp-utils";

export const DEFAULT_FONT_CATALOG_NAME = "default";

const logger = LoggerManager.instance.create("FontCatalogLoader");

type FontCatalogCallback = (name: string, catalog: FontCatalog) => void;

export class FontCatalogLoader {
    private m_catalogsLoading: number = 0;

    constructor(private m_fontCatalogs?: FontCatalogConfig[]) {}

    /**
     * Initializes font catalog loader.
     * @param defaultFontCatalogUrl - Url of the font catalog that will be used by default if the
     * theme doesn't define any font catalog.
     * @returns Name of the default font catalog.
     */
    initialize(defaultFontCatalogUrl: string): string {
        if (this.m_fontCatalogs === undefined || this.m_fontCatalogs.length === 0) {
            this.m_fontCatalogs = [
                {
                    name: DEFAULT_FONT_CATALOG_NAME,
                    url: defaultFontCatalogUrl
                }
            ];
            return DEFAULT_FONT_CATALOG_NAME;
        }

        const defaultFontCatalogName = this.m_fontCatalogs[0].name;
        return defaultFontCatalogName;
    }

    async loadCatalogs(
        catalogCallback: FontCatalogCallback,
        failureCallback?: (name: string, error: Error) => void
    ): Promise<void[]> {
        assert(this.m_fontCatalogs !== undefined);
        assert(this.m_fontCatalogs!.length > 0);

        const promises: Array<Promise<void>> = [];

        this.m_fontCatalogs!.forEach(fontCatalogConfig => {
            this.m_catalogsLoading += 1;
            const fontCatalogPromise: Promise<void> = FontCatalog.load(fontCatalogConfig.url, 1024)
                .then<void>(catalogCallback.bind(undefined, fontCatalogConfig.name))
                .catch((error: Error) => {
                    logger.error("Failed to load FontCatalog: ", error);
                    if (failureCallback) {
                        failureCallback(fontCatalogConfig.name, error);
                    }
                })
                .finally(() => {
                    this.m_catalogsLoading -= 1;
                });
            promises.push(fontCatalogPromise);
        });

        return Promise.all(promises);
    }

    get loading(): boolean {
        return this.m_catalogsLoading > 0;
    }
}
