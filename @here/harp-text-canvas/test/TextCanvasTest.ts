/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTestResourceUrl } from "@here/harp-test-utils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import {
    DefaultTextStyle,
    FontCatalog,
    GlyphData,
    TextCanvas,
    TextRenderStyle,
    WrappingMode
} from "../index";

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

const textSample = "Hello World!";
const position = new THREE.Vector3();
const bounds: THREE.Box2 = new THREE.Box2(new THREE.Vector2(), new THREE.Vector2());
const individualBounds: THREE.Box2[] = [];

describe("TextCanvas", () => {
    let sandbox: sinon.SinonSandbox;
    let webglRenderer = {};
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
        webglRenderer = { capabilities: { isWebGL2: false } };
    });
    afterEach(() => {
        sandbox.restore();
    });

    const textRenderStyle = new TextRenderStyle();
    let textCanvas: TextCanvas;

    for (const isWebGL2 of [false, true]) {
        const webGLVersion = isWebGL2 ? "WebGL2" : "WebGL1";
        it(`Creates an instance successfully for ${webGLVersion}`, async () => {
            (webglRenderer as any).capabilities.isWebGL2 = isWebGL2;

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

            const loadedFontCatalog = createFontCatalogStub(
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
            await loadedFontCatalog.loadCharset(textSample, textRenderStyle);
            textCanvas = new TextCanvas({
                renderer: webglRenderer as THREE.WebGLRenderer,
                fontCatalog: loadedFontCatalog,
                minGlyphCount: 16,
                maxGlyphCount: 16
            });

            assert.strictEqual(textCanvas.maxGlyphCount, 16);
            assert.deepEqual(
                textCanvas.textRenderStyle.fontSize,
                DefaultTextStyle.DEFAULT_FONT_SIZE
            );
            const expectedGLSLVersion = isWebGL2 ? THREE.GLSL3 : THREE.GLSL1;
            assert.equal((textCanvas.material as any).glslVersion, expectedGLSLVersion);
            assert.equal((textCanvas.backgroundMaterial as any).glslVersion, expectedGLSLVersion);
        });
    }
    it("Successfully measures text.", () => {
        const result = textCanvas.measureText("Hello World!", bounds, {
            outputCharacterBounds: individualBounds
        });
        assert.isTrue(result);

        assert.strictEqual(bounds.min.x, -0.5);
        assert.strictEqual(bounds.min.y, -2.5);
        assert.strictEqual(bounds.max.x, 89.5);
        assert.strictEqual(bounds.max.y, 14.0);
        // "H"
        assert.strictEqual(individualBounds[0].min.x, -0.5);
        assert.strictEqual(individualBounds[0].min.y, -2.0);
        assert.strictEqual(individualBounds[0].max.x, 11.0);
        assert.strictEqual(individualBounds[0].max.y, 13.0);
        // "e"
        assert.strictEqual(individualBounds[1].min.x, 10.0);
        assert.strictEqual(individualBounds[1].min.y, -2.5);
        assert.strictEqual(individualBounds[1].max.x, 21.0);
        assert.strictEqual(individualBounds[1].max.y, 10.5);
        // "l"
        assert.strictEqual(individualBounds[2].min.x, 19.0);
        assert.strictEqual(individualBounds[2].min.y, -2.0);
        assert.strictEqual(individualBounds[2].max.x, 26.0);
        assert.strictEqual(individualBounds[2].max.y, 14.0);
        // "l"
        assert.strictEqual(individualBounds[3].min.x, 23.5);
        assert.strictEqual(individualBounds[3].min.y, -2.0);
        assert.strictEqual(individualBounds[3].max.x, 30.5);
        assert.strictEqual(individualBounds[3].max.y, 14.0);
        // "o"
        assert.strictEqual(individualBounds[4].min.x, 27.5);
        assert.strictEqual(individualBounds[4].min.y, -2.5);
        assert.strictEqual(individualBounds[4].max.x, 39.0);
        assert.strictEqual(individualBounds[4].max.y, 10.5);
        // " "
        assert.strictEqual(individualBounds[5].min.x, 36.0);
        assert.strictEqual(individualBounds[5].min.y, 2.0);
        assert.strictEqual(individualBounds[5].max.x, 36.0);
        assert.strictEqual(individualBounds[5].max.y, 2.0);
        // "W"
        assert.strictEqual(individualBounds[6].min.x, 40.5);
        assert.strictEqual(individualBounds[6].min.y, -2.0);
        assert.strictEqual(individualBounds[6].max.x, 57.0);
        assert.strictEqual(individualBounds[6].max.y, 13.0);
        // "o"
        assert.strictEqual(individualBounds[7].min.x, 54.0);
        assert.strictEqual(individualBounds[7].min.y, -2.5);
        assert.strictEqual(individualBounds[7].max.x, 65.5);
        assert.strictEqual(individualBounds[7].max.y, 10.5);
        // "r"
        assert.strictEqual(individualBounds[8].min.x, 64.0);
        assert.strictEqual(individualBounds[8].min.y, -2.0);
        assert.strictEqual(individualBounds[8].max.x, 72.5);
        assert.strictEqual(individualBounds[8].max.y, 10.5);
        // "l"
        assert.strictEqual(individualBounds[9].min.x, 70.0);
        assert.strictEqual(individualBounds[9].min.y, -2.0);
        assert.strictEqual(individualBounds[9].max.x, 77.0);
        assert.strictEqual(individualBounds[9].max.y, 14.0);
        // "d"
        assert.strictEqual(individualBounds[10].min.x, 74.0);
        assert.strictEqual(individualBounds[10].min.y, -2.0);
        assert.strictEqual(individualBounds[10].max.x, 85.0);
        assert.strictEqual(individualBounds[10].max.y, 14.0);
        // "!"
        assert.strictEqual(individualBounds[11].min.x, 83.5);
        assert.strictEqual(individualBounds[11].min.y, -2.0);
        assert.strictEqual(individualBounds[11].max.x, 89.5);
        assert.strictEqual(individualBounds[11].max.y, 13.0);
    });
    it("Successfully adds text.", () => {
        const result = textCanvas.addText(textSample, position, { updatePosition: true });
        assert.isTrue(result);
        assert.strictEqual(position.x, 88.5);
        assert.strictEqual(position.y, 0.0);
        assert.strictEqual(position.z, 0.0);
        assert.strictEqual(textCanvas.getLayer(0)!.storage.drawCount, textSample.length);
    });
    it("Is cleared.", () => {
        textCanvas.clear();
        assert.strictEqual(textCanvas.getLayer(0)!.storage.drawCount, 0.0);
    });
    it("Word wrapping mode test", () => {
        const charBounds: THREE.Box2[] = [];
        textCanvas.textLayoutStyle.wrappingMode = WrappingMode.Word;
        // Set the line with 2 letters. The first word should stay on the first line completely.
        textCanvas.textLayoutStyle.lineWidth = 20;
        textCanvas.measureText(textSample, bounds, {
            outputCharacterBounds: charBounds
        });
        // box
        assert.strictEqual(bounds.min.x, -1.5);
        assert.strictEqual(bounds.min.y, -21.5);
        assert.strictEqual(bounds.max.x, 47.5);
        assert.strictEqual(bounds.max.y, 14);

        // "H"
        assert.strictEqual(charBounds[0].min.x, -0.5);
        assert.strictEqual(charBounds[0].min.y, -2);
        assert.strictEqual(charBounds[0].max.x, 11);
        assert.strictEqual(charBounds[0].max.y, 13);
        // "e"
        assert.strictEqual(charBounds[1].min.x, 10);
        assert.strictEqual(charBounds[1].min.y, -2.5);
        assert.strictEqual(charBounds[1].max.x, 21);
        assert.strictEqual(charBounds[1].max.y, 10.5);
        // "l"
        assert.strictEqual(charBounds[2].min.x, 19);
        assert.strictEqual(charBounds[2].min.y, -2);
        assert.strictEqual(charBounds[2].max.x, 26);
        assert.strictEqual(charBounds[2].max.y, 14);
        // "l"
        assert.strictEqual(charBounds[3].min.x, 23.5);
        assert.strictEqual(charBounds[3].min.y, -2);
        assert.strictEqual(charBounds[3].max.x, 30.5);
        assert.strictEqual(charBounds[3].max.y, 14);
        // "o"
        assert.strictEqual(charBounds[4].min.x, 27.5);
        assert.strictEqual(charBounds[4].min.y, -2.5);
        assert.strictEqual(charBounds[4].max.x, 39);
        assert.strictEqual(charBounds[4].max.y, 10.5);
        // "W"
        assert.strictEqual(charBounds[5].min.x, -1.5);
        assert.strictEqual(charBounds[5].min.y, -21);
        assert.strictEqual(charBounds[5].max.x, 15);
        assert.strictEqual(charBounds[5].max.y, -6);
        // "o"
        assert.strictEqual(charBounds[6].min.x, 12);
        assert.strictEqual(charBounds[6].min.y, -21.5);
        assert.strictEqual(charBounds[6].max.x, 23.5);
        assert.strictEqual(charBounds[6].max.y, -8.5);
        // "r"
        assert.strictEqual(charBounds[7].min.x, 22);
        assert.strictEqual(charBounds[7].min.y, -21);
        assert.strictEqual(charBounds[7].max.x, 30.5);
        assert.strictEqual(charBounds[7].max.y, -8.5);
        // "l"
        assert.strictEqual(charBounds[8].min.x, 28);
        assert.strictEqual(charBounds[8].min.y, -21);
        assert.strictEqual(charBounds[8].max.x, 35);
        assert.strictEqual(charBounds[8].max.y, -5);
        // "d"
        assert.strictEqual(charBounds[9].min.x, 32);
        assert.strictEqual(charBounds[9].min.y, -21);
        assert.strictEqual(charBounds[9].max.x, 43);
        assert.strictEqual(charBounds[9].max.y, -5);
        // "!"
        assert.strictEqual(charBounds[10].min.x, 41.5);
        assert.strictEqual(charBounds[10].min.y, -21);
        assert.strictEqual(charBounds[10].max.x, 47.5);
        assert.strictEqual(charBounds[10].max.y, -6);
    });
    it("Fails when adding too many characters.", () => {
        let resultA = true;
        let resultB = true;
        try {
            resultA = textCanvas.addText(textSample, position, { updatePosition: true });
            resultB = textCanvas.addText(textSample, position, { updatePosition: true });
            assert(false);
        } catch (e) {
            assert(resultA && !resultB);
        }
    });
    it("Fails when adding unloaded characters.", () => {
        textCanvas.clear();
        textCanvas.fontCatalog.clear();
        assert.isFalse(
            textCanvas.measureText(textSample, bounds, { outputCharacterBounds: individualBounds })
        );
        assert.isFalse(textCanvas.addText(textSample, position, { updatePosition: true }));
    });
});
