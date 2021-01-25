/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { FontCatalogConfig } from "@here/harp-datasource-protocol";
import { FontCatalog } from "@here/harp-text-canvas";
import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("FontCatalogLoader");

type FontCatalogCallback = (name: string, catalog: FontCatalog) => void;

export async function loadFontCatalog(
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
