/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { getTestResourceUrl } from "@here/harp-test-utils";
import { FontCatalog, FontStyle } from "../index";

async function loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise(resolve => {
        new THREE.TextureLoader().load(url, resolve);
    }) as Promise<THREE.Texture>;
}

async function loadJSON(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} Status Text:  ${response.statusText}`);
    }
    const rawJSON = await response.text();
    return JSON.parse(rawJSON);
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
                return new Promise(resolve => {
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

    let fontCatalog: FontCatalog;
    it("Creates an instance successfully.", async () => {
        const catalogJson = await loadJSON(
            getTestResourceUrl("@here/harp-text-canvas", "resources/fonts/Default_FontCatalog.json")
        );
        const replacementJson = await loadJSON(
            getTestResourceUrl(
                "@here/harp-text-canvas",
                "resources/fonts/Default_Assets/Extra/Specials.json"
            )
        );
        const replacementTexture = await loadTexture(
            getTestResourceUrl(
                "@here/harp-text-canvas",
                "resources/fonts/Default_Assets/Extra/Specials.png"
            )
        );

        fontCatalog = new FontCatalog(
            getTestResourceUrl("@here/harp-text-canvas", "resources/fonts"),
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
        assert.strictEqual(fontCatalog.maxWidth, 59);
        assert.strictEqual(fontCatalog.maxHeight, 68);
        assert.strictEqual(fontCatalog.distanceRange, 8);
        assert.strictEqual(fontCatalog.maxCodePointCount, 256);
        assert.strictEqual(fontCatalog.textureSize.x, 960);
        assert.strictEqual(fontCatalog.textureSize.y, 1104);
    });
    it("Loads assets for sample text.", async () => {
        for (const sample of textSamples) {
            await fontCatalog!.loadCharset(sample, {});
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
            await fontCatalog.loadCharset("A", {});
            result = false;
        } catch {
            result = true;
        }
        assert.isTrue(result);
    });
});
