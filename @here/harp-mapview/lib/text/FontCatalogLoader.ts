/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { FontCatalogConfig } from "@here/harp-datasource-protocol";
import { FontCatalog } from "@here/harp-text-canvas";
import { LoggerManager } from "@here/harp-utils";

export const DEFAULT_FONT_CATALOG_NAME = "default";

const logger = LoggerManager.instance.create("FontCatalogLoader");

type FontCatalogCallback = (name: string, catalog: FontCatalog) => void;

export class FontCatalogLoader {
    static createDefaultFontCatalogConfig(defaultFontCatalogUrl: string): FontCatalogConfig {
        return {
            name: DEFAULT_FONT_CATALOG_NAME,
            url: defaultFontCatalogUrl
        };
    }

    static async loadCatalog(
        fontCatalogConfig: FontCatalogConfig,
        onSuccess: FontCatalogCallback,
        onError?: (error: Error) => void
    ): Promise<void> {
        return await FontCatalog.load(fontCatalogConfig.url, 1024)
            .then<void>(onSuccess.bind(undefined, fontCatalogConfig.name))
            .catch((error: Error) => {
                logger.error("Failed to load FontCatalog: ", fontCatalogConfig.name, error);
                if (onError) {
                    onError(error);
                }
            });
    }
}
