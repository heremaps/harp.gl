/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FontCatalog, GlyphData } from "@here/harp-text-canvas";
import * as sinon from "sinon";
import * as THREE from "three";

const DEF_TEXTURE_SIZE = 1;

/**
 * Creates a font catalog stub that returns stubbed glyph data.
 * @param sandbox - Sinon sandbox to keep track of created stubs.
 * @returns FontCatalog stub.
 */
export function stubFontCatalog(sandbox: sinon.SinonSandbox): FontCatalog {
    const fontCatalogStub = sinon.createStubInstance(FontCatalog);
    sandbox.stub(fontCatalogStub, "isLoading").get(() => {
        return false;
    });
    const defaultTextureSize = new THREE.Vector2(DEF_TEXTURE_SIZE, DEF_TEXTURE_SIZE);
    sandbox.stub(fontCatalogStub, "textureSize").get(() => {
        return defaultTextureSize;
    });
    const defaultTexture = new THREE.Texture();
    sandbox.stub(fontCatalogStub, "texture").get(() => {
        return defaultTexture;
    });
    fontCatalogStub.loadCharset.resolves([]);
    fontCatalogStub.getGlyphs.callsFake(() => {
        return [(sinon.createStubInstance(GlyphData) as unknown) as GlyphData];
    });

    return (fontCatalogStub as unknown) as FontCatalog;
}
