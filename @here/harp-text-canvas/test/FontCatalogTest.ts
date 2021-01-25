/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTestResourceUrl } from "@here/harp-test-utils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { FontCatalog, FontStyle, GlyphData, TextRenderStyle } from "../index";

async function loadTexture(url: string): Promise<THREE.Texture> {
    return await new Promise(resolve => {
        new THREE.TextureLoader().load(url, resolve);
    });
}

async function loadJSON(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} Status Text:  ${response.statusText}`);
    }
    const rawJSON = await response.text();
    return JSON.parse(rawJSON);
}

function createFontCatalogStub(
    stub_url: string,
    stub_name: string,
    stub_type: string,
    stub_size: number,
    stub_maxWidth: number,
    stub_maxHeight: number,
    stub_distanceRange: number,
    stub_fonts: any[],
    stub_unicodeBlocks: any[],
    stub_maxCodePointCount: number,
    stub_replacementJson: any,
    stub_replacementTexture: THREE.Texture
): FontCatalog {
    const replacementFont = stub_fonts.find(font => font.name === "Extra");
    const replacementGlyph = new GlyphData(
        65533,
        "Specials",
        stub_replacementJson.chars[0].width,
        stub_replacementJson.chars[0].height,
        stub_replacementJson.chars[0].xadvance,
        stub_replacementJson.chars[0].xoffset,
        stub_replacementJson.chars[0].yoffset,
        0.0,
        0.0,
        1.0,
        1.0,
        stub_replacementTexture,
        replacementFont!
    );

    return ({
        url: stub_url,
        name: stub_name,
        type: stub_type,
        size: stub_size,
        maxWidth: stub_maxWidth,
        maxHeight: stub_maxHeight,
        distanceRange: stub_distanceRange,
        fonts: stub_fonts,
        unicodeBlocks: stub_unicodeBlocks,
        maxCodePointCount: stub_maxCodePointCount,
        m_replacementGlyph: replacementGlyph,
        m_glyphTextureCache: {
            has: (hash: number) => {
                return true;
            },
            add: (hash: number, glyph: GlyphData) => {
                glyph.isInCache = true;
                return;
            },
            clear: () => {
                return;
            },
            dispose: () => {
                return;
            }
        },
        m_loadingJson: new Map<string, Promise<any>>(),
        m_loadingPages: new Map<string, Promise<THREE.Texture>>(),
        m_loadingGlyphs: new Map<string, Promise<GlyphData>>(),
        m_loadedJson: new Map<string, any>(),
        m_loadedPages: new Map<string, THREE.Texture>(),
        m_loadedGlyphs: new Map<string, Map<number, GlyphData>>(),
        dispose: FontCatalog.prototype.dispose,
        clear: FontCatalog.prototype.clear,
        update: FontCatalog.prototype.update,
        texture: THREE.Texture.DEFAULT_IMAGE,
        textureSize: new THREE.Vector2(1, 1),
        isLoading: false,
        loadBlock: FontCatalog.prototype.loadBlock,
        removeBloc: FontCatalog.prototype.removeBlock,
        loadCharset: FontCatalog.prototype.loadCharset,
        getGlyph: FontCatalog.prototype.getGlyph,
        getGlyphs: FontCatalog.prototype.getGlyphs,
        getFont: FontCatalog.prototype.getFont,
        createReplacementGlyph: (FontCatalog.prototype as any).createReplacementGlyph,
        loadAssets: (FontCatalog.prototype as any).loadAssets,
        loadPage: (FontCatalog.prototype as any).loadPage,
        getAssetsPath: (FontCatalog.prototype as any).getAssetsPath
    } as any) as FontCatalog;
}

const textSamples = [
    "Lorem ipsum dolor sit amet",
    "Лорем ипсум долор сит амет",
    "Λορεμ ιπσθμ δολορ σιτ αμετ",
    "ლორემ იფსუმ დოლორ სით ამეთ",
    "شدّت ويكيبيديا ذات ما",
    "שמו את החול יוני",
    "कारन विवरन विज्ञान सोफ़तवेर विश्व शारिरिक",
    "図ぜッ摩注本ん打携ヱタセ窯27年ニタヤコ",
    "법률과 적법한 절차에 의하지 아니하고는 처벌·",
    "稿質検画入自郎提住協件全容図粘周名気因写。"
];

describe("FontCatalog", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        sandbox.stub(THREE, "TextureLoader").returns({
            load: (
                url: string,
                onLoad?: (texture: THREE.Texture) => void,
                onProgress?: (event: ProgressEvent) => void,
                onError?: (event: ErrorEvent) => void
            ) => {
                return new Promise<void>(resolve => {
                    if (onLoad !== undefined) {
                        const image = { width: 1, height: 1 };
                        onLoad(new THREE.Texture(image as HTMLImageElement));
                    }
                    resolve();
                });
            }
        });
    });
    afterEach(() => {
        sandbox.restore();
    });

    const textRenderStyle = new TextRenderStyle();
    let fontCatalog: FontCatalog;
    it("Creates an instance successfully.", async () => {
        const catalogJson = await loadJSON(
            getTestResourceUrl("@here/harp-fontcatalog", "resources/Default_FontCatalog.json")
        );
        const replacementJson = await loadJSON(
            getTestResourceUrl(
                "@here/harp-fontcatalog",
                "resources/Default_Assets/Extra/Specials.json"
            )
        );
        const replacementTexture = await loadTexture(
            getTestResourceUrl(
                "@here/harp-fontcatalog",
                "resources/Default_Assets/Extra/Specials.png"
            )
        );

        fontCatalog = createFontCatalogStub(
            getTestResourceUrl("@here/harp-fontcatalog", "resources"),
            catalogJson.name,
            catalogJson.type,
            catalogJson.size,
            catalogJson.maxWidth,
            catalogJson.maxHeight,
            catalogJson.distanceRange,
            catalogJson.fonts,
            catalogJson.supportedBlocks,
            256,
            replacementJson,
            replacementTexture
        );

        assert.strictEqual(fontCatalog.name, "Default");
        assert.strictEqual(fontCatalog.type, "msdf");
        assert.strictEqual(fontCatalog.size, 32);
        assert.strictEqual(fontCatalog.maxWidth, 83);
        assert.strictEqual(fontCatalog.maxHeight, 68);
        assert.strictEqual(fontCatalog.distanceRange, 8);
        assert.strictEqual(fontCatalog.maxCodePointCount, 256);
    });
    it("Loads assets for sample text.", async () => {
        for (const sample of textSamples) {
            await fontCatalog!.loadCharset(sample, textRenderStyle);
        }
        assert(true);
    });
    it("Retrieves font data for character.", () => {
        const font = fontCatalog.getFont(65);
        assert.strictEqual(font.name, "FiraGO_Map");
    });
    it("Retrieves specific font data for character", () => {
        const font = fontCatalog.getFont(65, "HanSans_ExtraLight");
        assert.strictEqual(font.name, "HanSans_ExtraLight");
    });
    it("Retrieves glyph data.", () => {
        for (const sample of textSamples) {
            for (const char of sample) {
                const codePoint = char.codePointAt(0)!;
                const font = fontCatalog.getFont(codePoint);
                assert.isTrue(
                    fontCatalog!.getGlyph(char.codePointAt(0)!, font, FontStyle.Regular) !==
                        undefined
                );
            }
        }
        assert(true);
    });

    it("Retrieves replacement glyph data.", () => {
        const char = "L";

        const codePoint = char.codePointAt(0)!;
        const font = fontCatalog.getFont(codePoint);
        assert.isTrue(
            fontCatalog!.getGlyph(char.codePointAt(0)!, font, FontStyle.Regular) !== undefined
        );

        const glyph = fontCatalog.getGlyph(codePoint, font, FontStyle.Regular);
        const renderStyle = new TextRenderStyle();
        try {
            // Make this glyph a replacement, which should lead to the glyph not being rendered on
            // production. Normally, the property `isReplacement` is only true for the replacement
            // glyph, the "<?>".
            (glyph as any).isReplacement = true;
            fontCatalog.showReplacementGlyphs = false;

            // should be undefined in production...
            assert.isUndefined(fontCatalog.getGlyphs(char, renderStyle));

            // enable debugging
            fontCatalog.showReplacementGlyphs = true;
            assert.isDefined(fontCatalog.getGlyphs(char, renderStyle));
            // should NOT be empty now...
            assert.strictEqual(fontCatalog.getGlyphs(char, renderStyle)!.length, 1);
            assert.strictEqual(fontCatalog.getGlyphs(char, renderStyle)![0], glyph);
        } finally {
            (glyph as any).isReplacement = false;
        }
    });

    it("Is cleared, and fails on glyph data retrieval.", () => {
        fontCatalog.clear();
        for (const sample of textSamples) {
            for (const char of sample) {
                const codePoint = char.codePointAt(0)!;
                const font = fontCatalog.getFont(codePoint);
                assert.isTrue(
                    fontCatalog!.getGlyph(char.codePointAt(0)!, font, FontStyle.Regular) ===
                        undefined
                );
            }
        }
        assert(true);
    });

    it("Is disposed, and fails on asset loading.", async () => {
        fontCatalog.dispose();
        assert.strictEqual(fontCatalog.fonts.length, 0);
        assert.strictEqual(fontCatalog.unicodeBlocks.length, 0);
        let result = true;
        try {
            fontCatalog.getFont(65);
            result = false;
        } catch {
            result = true;
        }
        try {
            await fontCatalog.loadCharset("A", textRenderStyle);
            result = false;
        } catch {
            result = true;
        }
        assert.isTrue(result);
    });
});
