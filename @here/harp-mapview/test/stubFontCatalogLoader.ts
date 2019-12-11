/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FontCatalog } from "@here/harp-text-canvas";
import * as sinon from "sinon";
import { DEFAULT_FONT_CATALOG_NAME, FontCatalogLoader } from "../lib/text/FontCatalogLoader";

/**
 * Stubs font catalog loader.
 * @param sandbox Sinon sandbox to keep track of created stubs.
 * @param fontCatalog Font catalog the loader will always return.
 * @returns FontCatalogLoader stub.
 */
export function stubFontCatalogLoader(
    sandbox: sinon.SinonSandbox,
    fontCatalog: FontCatalog
): FontCatalogLoader {
    const fontCatalogLoaderStub = sinon.createStubInstance(FontCatalogLoader);

    sandbox.stub(fontCatalogLoaderStub, "loading").get(() => {
        return false;
    });
    fontCatalogLoaderStub.loadCatalogs
        .yields([DEFAULT_FONT_CATALOG_NAME, fontCatalog])
        .resolves([]);

    return (fontCatalogLoaderStub as unknown) as FontCatalogLoader;
}
