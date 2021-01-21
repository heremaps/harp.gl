/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

import { MemoryUsage } from "../TextCanvas";
import { UnicodeUtils } from "../utils/UnicodeUtils";
import { GlyphData } from "./GlyphData";
import { GlyphTextureCache } from "./GlyphTextureCache";
import { FontStyle, FontVariant, TextRenderStyle } from "./TextStyle";

const ASSETS_PATH = "_Assets/";
const BOLD_ASSETS_PATH = "_BoldAssets/";
const ITALIC_ASSETS_PATH = "_ItalicAssets/";
const BOLD_ITALIC_ASSETS_PATH = "_BoldItalicAssets/";
const REPLACEMENT_PATH = "_Assets/Extra/";

interface SrcGlyphData {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    page: number;
    chnl: number;
}

/**
 * Metrics defining the placement and rendering of all glyphs in a given [[Font]].
 */
export interface FontMetrics {
    size: number;
    distanceRange: number;
    base: number;
    lineHeight: number;
    lineGap: number;
    capHeight: number;
    xHeight: number;
}

/**
 * Description of all assets, charset and metrics that define a font inside a [[FontCatalog]].
 */
export interface Font {
    name: string;
    metrics: FontMetrics;
    charset: string;
    bold?: string;
    italic?: string;
    boldItalic?: string;
}

/**
 * Description of a continuous range of Unicode code points (as well as information on which fonts
 * supports it).
 */
export interface UnicodeBlock {
    name: string;
    min: number;
    max: number;
    fonts: string[];
}

/**
 * Collection of font assets used to render glyphs when using a [[TextCanvas]].
 *
 * @summary A `FontCatalog` works as a stack of SDF bitmap fonts (using the BMFont format) designed
 * to cover the widest Unicode code point range possible. In order to manage all these assets
 * elegantly, the assets inside the `FontCatalog` are stored on a per-Unicode-Block basis, and
 * assets for a block are only loaded once a glyph belonging to that block is requested.
 *
 * Bitmap information coming from all different fonts is then stored in a unified WebGL GPU Texture
 * resource, which can be sampled to render all currently loaded glyphs.
 *
 */
export class FontCatalog {
    /**
     * Loads a `FontCatalog`.
     *
     * @param url - Asset url.
     * @param maxCodePointCount - Maximum number of unique code points bitmaps this `FontCatalog`'s
     * internal texture can store simultaneously.
     *
     * @returns `FontCatalog` Promise.
     */
    static async load(path: string, maxCodePointCount: number): Promise<FontCatalog> {
        const url = new URL(path, window.location.href);
        const fontCatalog = await FontCatalog.loadJSON(url.href);

        const replacementDirUrl = new URL(`${fontCatalog.name}${REPLACEMENT_PATH}`, url);
        const replacementJson = await FontCatalog.loadJSON(
            replacementDirUrl.href + "Specials.json"
        );
        const replacementTexture = await FontCatalog.loadTexture(
            replacementDirUrl.href + "Specials.png"
        );
        replacementTexture.wrapS = THREE.ClampToEdgeWrapping;
        replacementTexture.wrapT = THREE.ClampToEdgeWrapping;
        replacementTexture.minFilter = THREE.NearestFilter;
        replacementTexture.needsUpdate = true;

        const replacementFont = fontCatalog.fonts.find((font: Font) => font.name === "Extra");
        const replacementGlyph = new GlyphData(
            65533,
            "Specials",
            replacementJson.chars[0].width,
            replacementJson.chars[0].height,
            replacementJson.chars[0].xadvance,
            replacementJson.chars[0].xoffset,
            replacementJson.chars[0].yoffset,
            0.0,
            0.0,
            1.0,
            1.0,
            replacementTexture,
            replacementFont!,
            true
        );

        const fontCatalogInfo = new FontCatalog(
            url.href.substr(0, url.href.lastIndexOf("/")),
            fontCatalog.name,
            fontCatalog.type,
            fontCatalog.size,
            fontCatalog.maxWidth,
            fontCatalog.maxHeight,
            fontCatalog.distanceRange,
            fontCatalog.fonts,
            fontCatalog.supportedBlocks,
            maxCodePointCount,
            replacementGlyph
        );
        return fontCatalogInfo;
    }

    static async loadTexture(url: string): Promise<THREE.Texture> {
        return await new Promise(resolve => {
            new THREE.TextureLoader().load(url, resolve);
        });
    }

    static async loadJSON(url: string): Promise<any> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${url} Status Text:  ${response.statusText}`);
        }
        const rawJSON = await response.text();
        return JSON.parse(rawJSON);
    }

    private readonly m_glyphTextureCache: GlyphTextureCache;

    private readonly m_loadingJson: Map<string, Promise<any>>;
    private readonly m_loadingPages: Map<string, Promise<THREE.Texture>>;
    private readonly m_loadingGlyphs: Map<string, Promise<GlyphData>>;
    private readonly m_loadedJson: Map<string, any>;
    private readonly m_loadedPages: Map<string, THREE.Texture>;
    private readonly m_loadedGlyphs: Map<string, Map<number, GlyphData>>;

    /** If `true`, a replacement glyph is returned for every missing glyph. */
    public showReplacementGlyphs = false;

    /**
     * @hidden
     * Creates a new FontCatalog.
     *
     * @param url - FontCatalog's URL.
     * @param name - FontCatalog's name.
     * @param type - FontCatalog's type (sdf or msdf).
     * @param size - FontCatalog's glyph size (pixels).
     * @param maxWidth - FontCatalog's maximum glyph width (pixels).
     * @param maxHeight - FontCatalog's maximum glyph height (pixels).
     * @param distanceRange - Distance range used to generate the SDF bitmaps.
     * @param fonts - Array of supported fonts.
     * @param unicodeBlocks - Array of supported Unicode blocks.
     * @param maxCodePointCount - Maximum number of unique code points bitmaps this `FontCatalog`'s
     * internal texture can store simultaneously.
     * @param m_replacementGlyph - [[GlyphData]] to be used whenever a Unicode code point is not
     * supported by this `FontCatalog`.
     *
     * @returns New FontCatalog.
     */
    private constructor(
        readonly url: string,
        readonly name: string,
        readonly type: string,
        readonly size: number,
        readonly maxWidth: number,
        readonly maxHeight: number,
        readonly distanceRange: number,
        readonly fonts: Font[],
        readonly unicodeBlocks: UnicodeBlock[],
        readonly maxCodePointCount: number,
        private readonly m_replacementGlyph: GlyphData
    ) {
        this.m_glyphTextureCache = new GlyphTextureCache(
            maxCodePointCount,
            this.maxWidth + 1,
            this.maxHeight + 1
        );

        this.m_loadingJson = new Map<string, Promise<any>>();
        this.m_loadingPages = new Map<string, Promise<THREE.Texture>>();
        this.m_loadingGlyphs = new Map<string, Promise<GlyphData>>();
        this.m_loadedJson = new Map<string, any>();
        this.m_loadedPages = new Map<string, THREE.Texture>();
        this.m_loadedGlyphs = new Map<string, Map<number, GlyphData>>();
    }

    /**
     * Release all allocated resources.
     */
    dispose() {
        this.fonts.length = 0;
        this.unicodeBlocks.length = 0;
        this.m_glyphTextureCache.dispose();
        this.m_loadingJson.clear();
        this.m_loadingPages.clear();
        this.m_loadingGlyphs.clear();
        this.m_loadedJson.clear();
        this.m_loadedPages.clear();
        this.m_loadedGlyphs.clear();
    }

    /**
     * Removes all loaded (and loading) assets.
     */
    clear() {
        this.m_glyphTextureCache.clear();
        this.m_loadingJson.clear();
        this.m_loadingPages.clear();
        this.m_loadingGlyphs.clear();
        this.m_loadedJson.clear();
        this.m_loadedPages.clear();
        this.m_loadedGlyphs.clear();
    }

    /**
     * Updates the internal WebGLRenderTarget.
     * The update will copy the newly introduced glyphs since the previous update.
     *
     * @param renderer - WebGLRenderer.
     */
    update(renderer: THREE.WebGLRenderer): void {
        this.m_glyphTextureCache.update(renderer);
    }

    /**
     * Internal WebGL Texture.
     */
    get texture(): THREE.Texture {
        return this.m_glyphTextureCache.texture;
    }

    /**
     * Internal WebGL Texture size.
     */
    get textureSize(): THREE.Vector2 {
        return this.m_glyphTextureCache.textureSize;
    }

    /**
     * Current internal loading state.
     */
    get isLoading(): boolean {
        return (
            this.m_loadingJson.size > 0 ||
            this.m_loadingPages.size > 0 ||
            this.m_loadingGlyphs.size > 0
        );
    }

    /**
     * Loads the description file for a specific [[UnicodeBlock]]. This speeds up consequent calls
     * to `FontCatalog`.loadCharset() that require glyphs from this block to be loaded.
     *
     * @param block - Requested [[UnicodeBlock]].
     * @param font - [[Font]] to retrieve this Unicode block from.
     * @param fontStyle - [[FontStyle]] assets to load.
     * @param loadPages - If `true`, all pages in this Unicode block will also be loaded.
     *
     * @returns Loaded Unicode Block json.
     */
    async loadBlock(
        block: UnicodeBlock,
        font: Font,
        fontStyle: FontStyle,
        loadPages?: boolean
    ): Promise<any> {
        const assetsPath = this.getAssetsPath(fontStyle, font);
        const jsonPath = `${assetsPath}/${block.name.replace(/ /g, "_")}.json`;
        let json = this.m_loadedJson.get(jsonPath);
        if (json === undefined) {
            let jsonPromise = this.m_loadingJson.get(jsonPath);
            if (jsonPromise === undefined) {
                try {
                    jsonPromise = FontCatalog.loadJSON(jsonPath);
                    this.m_loadingJson.set(jsonPath, jsonPromise);
                    json = await jsonPromise;
                    this.m_loadingJson.delete(jsonPath);
                    this.m_loadedJson.set(jsonPath, json);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error(e);
                    this.m_loadingJson.delete(jsonPath);
                }
            } else {
                json = await jsonPromise;
            }
        }

        const pagePromises: Array<Promise<THREE.Texture>> = [];
        if (loadPages === true) {
            for (const page of json.pages) {
                pagePromises.push(this.loadPage(`${assetsPath}/${page}`));
            }
        }
        await Promise.all(pagePromises);

        return json;
    }

    /**
     * Releases the description file for a specific [[UnicodeBlock]] (and all downloaded pages).
     * Safe to call when no assets for this block have been loaded.
     *
     * @param block - Requested [[UnicodeBlock]].
     * @param font - [[Font]] to remove this Unicode block from.
     * @param fontStyle - [[FontStyle]] assets to remove.
     */
    removeBlock(block: UnicodeBlock, font: Font, fontStyle: FontStyle): void {
        const assetsPath = this.getAssetsPath(fontStyle, font);
        const jsonPath = `${assetsPath}/${block.name.replace(/ /g, "_")}.json`;
        const json = this.m_loadedJson.get(jsonPath);
        if (json !== undefined) {
            for (const page of json.pages) {
                const pagePath = `${assetsPath}/${page}`;
                this.m_loadingPages.delete(pagePath);
                this.m_loadedPages.delete(pagePath);
            }
            this.m_loadingJson.delete(jsonPath);
            this.m_loadedJson.delete(jsonPath);
        }
    }

    /**
     * Loads all the required glyphs needed to render the input text. Character repetition will not
     * be considered, and only styled assets (with applied font selection, style and variants) will
     * be loaded.
     *
     * @param input - Input text.
     * @param style - Specific [[TextRenderStyle]] for which glyphs will be loaded.
     *
     * @returns Promise containing an array of all loaded [[GlyphData]] for the input text.
     */
    async loadCharset(input: string, style: TextRenderStyle): Promise<GlyphData[]> {
        const fontName = style.fontName;
        const fontStyle = style.fontStyle;
        const shouldTransform =
            style.fontVariant === FontVariant.AllCaps ||
            style.fontVariant === FontVariant.SmallCaps;

        const charset = (shouldTransform ? input.toUpperCase() : input).replace(
            /[\s\S](?=([\s\S]+))/g,
            (c, s) => {
                return s.indexOf(c) + 1 ? "" : c;
            }
        );
        const glyphPromises: Array<Promise<GlyphData>> = [];
        for (const char of charset) {
            const codePoint = char.codePointAt(0)!;
            const font = this.getFont(codePoint, fontName);
            const fontHash = `${font.name}_${fontStyle}`;
            const glyphHash = `${fontHash}_${codePoint}`;

            let fontGlyphMap = this.m_loadedGlyphs.get(fontHash);
            if (fontGlyphMap === undefined) {
                fontGlyphMap = new Map();
                this.m_loadedGlyphs.set(fontHash, fontGlyphMap);
            }

            const glyph = fontGlyphMap.get(codePoint);
            if (glyph === undefined) {
                let glyphPromise = this.m_loadingGlyphs.get(glyphHash);
                if (glyphPromise === undefined) {
                    if (!font.charset.includes(String.fromCodePoint(codePoint))) {
                        const replacementGlyph = this.createReplacementGlyph(codePoint, char, font);
                        fontGlyphMap!.set(codePoint, replacementGlyph);
                        this.m_glyphTextureCache.add(glyphHash, replacementGlyph);
                        continue;
                    }

                    let charUnicodeBlock: UnicodeBlock | undefined;
                    for (const block of this.unicodeBlocks) {
                        if (codePoint >= block.min && codePoint <= block.max) {
                            charUnicodeBlock = block;
                            break;
                        }
                    }

                    glyphPromise = this.loadAssets(codePoint, fontStyle, charUnicodeBlock!, font);
                    this.m_loadingGlyphs.set(glyphHash, glyphPromise);
                    glyphPromise.then((loadedGlyph: GlyphData) => {
                        this.m_loadingGlyphs.delete(glyphHash);
                        fontGlyphMap!.set(codePoint, loadedGlyph);
                        this.m_glyphTextureCache.add(glyphHash, loadedGlyph);
                    });
                }
                glyphPromises.push(glyphPromise);
            } else if (!this.m_glyphTextureCache.has(glyphHash)) {
                glyphPromises.push(Promise.resolve(glyph));
                this.m_glyphTextureCache.add(glyphHash, glyph);
            }
        }

        return Promise.all(glyphPromises);
    }

    /**
     * Retrieves the loaded [[GlyphData]] for a specific character.
     * Returns `undefined` if the assets for this glyph haven't been loaded yet.
     *
     * @param codePoint - Character's Unicode code point.
     * @param font - [[Font]] to get this glyph from.
     * @param fontStyle - Specific [[FontStyle]] to get glyphs for.
     *
     * @returns [[GlyphData]] for this code point.
     */
    getGlyph(codePoint: number, font: Font, fontStyle: FontStyle): GlyphData | undefined {
        const fontGlyphMap = this.m_loadedGlyphs.get(`${font.name}_${fontStyle}`);
        if (fontGlyphMap === undefined) {
            return undefined;
        }
        return fontGlyphMap.get(codePoint);
    }

    /**
     * Retrieves the loaded [[GlyphData]] for the specified text.
     * Returns `undefined` if the assets for these glyphs haven't been loaded yet.
     *
     * @param input - Input text.
     * @param style - Specific [[TextRenderStyle]] to get glyphs for.
     * @param letterCaseArray - Array containing the original letter case for the requested glyphs.
     *
     * @returns Array containing [[GlyphData]] for each character of the input text.
     */
    getGlyphs(
        input: string,
        style: TextRenderStyle,
        letterCaseArray?: boolean[]
    ): GlyphData[] | undefined {
        const result = [];
        const fontName = style.fontName;
        const fontStyle = style.fontStyle;
        const fontVariant = style.fontVariant;
        const shouldTransform =
            fontVariant === FontVariant.AllCaps || fontVariant === FontVariant.SmallCaps;
        for (const character of input) {
            const transformedCharacter = shouldTransform ? character.toUpperCase() : character;
            for (const char of transformedCharacter) {
                const codePoint = char.codePointAt(0)!;
                const font = this.getFont(codePoint, fontName);
                const glyphData = this.getGlyph(codePoint, font, fontStyle);
                if (
                    glyphData !== undefined &&
                    (!glyphData.isReplacement || this.showReplacementGlyphs)
                ) {
                    result.push(glyphData);
                    if (letterCaseArray !== undefined) {
                        letterCaseArray.push(char !== character);
                    }
                } else {
                    return undefined;
                }
            }
        }
        return result;
    }

    /**
     * Gets the best matched font for a specific character.
     *
     * @param codePoint - Character's Unicode code point.
     * @param fontName - Font name suggestion.
     *
     * @returns Best matched font.
     */
    getFont(codePoint: number, fontName?: string): Font {
        let selectedFontName: string = this.fonts[0].name;
        for (const block of this.unicodeBlocks) {
            if (codePoint >= block.min && codePoint <= block.max) {
                selectedFontName =
                    fontName !== undefined &&
                    block.fonts.find(element => {
                        return element === fontName;
                    }) !== undefined
                        ? fontName
                        : block.fonts[0];
                break;
            }
        }

        return this.fonts.find(element => {
            return element.name === selectedFontName;
        })!;
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `FontCatalog`.
     *
     * @param info - The info object to increment with the values from this `FontCatalog`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        let numBytes = 0;

        for (const block of this.unicodeBlocks) {
            numBytes += (block.max - block.min) * 2;
        }

        // Always stored in RGBA internally.
        let textureBytes =
            this.m_glyphTextureCache.textureSize.x * this.m_glyphTextureCache.textureSize.y * 4;

        for (const page in this.m_loadedPages.entries) {
            if (this.m_loadedPages.get(page) !== undefined) {
                const loadedPage = this.m_loadedPages.get(page);
                if (loadedPage !== undefined) {
                    textureBytes += loadedPage.image.width * loadedPage.image.height * 4;
                }
            }
        }

        info.heapSize += numBytes + textureBytes;
        info.gpuSize += textureBytes;
    }

    private createReplacementGlyph(codePoint: number, char: string, font: Font): GlyphData {
        const replacementGlyph = this.m_replacementGlyph.clone();
        (replacementGlyph as any).codePoint = codePoint;
        (replacementGlyph as any).character = char;
        (replacementGlyph as any).font = font;
        // Glyphs for ASCII control characters and such are not really replacement glyphs.
        (replacementGlyph as any).isReplacement = UnicodeUtils.isPrintable(codePoint);
        return replacementGlyph;
    }

    private async loadAssets(
        codePoint: number,
        fontStyle: FontStyle,
        block: UnicodeBlock,
        font: Font
    ): Promise<GlyphData> {
        const json = await this.loadBlock(block, font, fontStyle);
        if (json === undefined) {
            return this.m_replacementGlyph;
        }

        const sourceGlyphData = (json.chars as SrcGlyphData[]).find(char => char.id === codePoint);
        const assetsPath = this.getAssetsPath(fontStyle, font);
        const texturePath = `${assetsPath}/${json.pages[sourceGlyphData!.page]}`;
        const texture = await this.loadPage(texturePath);

        const glyphData = new GlyphData(
            sourceGlyphData!.id,
            block.name,
            sourceGlyphData!.width,
            sourceGlyphData!.height,
            sourceGlyphData!.xadvance,
            sourceGlyphData!.xoffset,
            sourceGlyphData!.yoffset,
            sourceGlyphData!.x / texture!.image.width,
            1.0 - (sourceGlyphData!.y + sourceGlyphData!.height) / texture!.image.height,
            (sourceGlyphData!.x + sourceGlyphData!.width) / texture!.image.width,
            1.0 - sourceGlyphData!.y / texture!.image.height,
            texture!,
            font
        );

        return glyphData;
    }

    private async loadPage(pagePath: string): Promise<THREE.Texture> {
        let page = this.m_loadedPages.get(pagePath);
        if (page === undefined) {
            let pagePromise = this.m_loadingPages.get(pagePath);
            if (pagePromise === undefined) {
                pagePromise = FontCatalog.loadTexture(pagePath);
                this.m_loadingPages.set(pagePath, pagePromise);
                page = await pagePromise;
                page.wrapS = THREE.ClampToEdgeWrapping;
                page.wrapT = THREE.ClampToEdgeWrapping;
                page.minFilter = THREE.NearestFilter;
                page.needsUpdate = true;
                if (this.m_loadingPages.delete(pagePath)) {
                    this.m_loadedPages.set(pagePath, page);
                }
                this.m_loadingPages.delete(pagePath);
            } else {
                page = await pagePromise;
            }
        }
        return page;
    }

    private getAssetsPath(fontStyle: FontStyle, font: Font) {
        let fontStylePath = ASSETS_PATH;
        switch (fontStyle) {
            case FontStyle.Bold:
                if (font.bold !== undefined) {
                    fontStylePath = BOLD_ASSETS_PATH;
                }
                break;
            case FontStyle.Italic:
                if (font.italic !== undefined) {
                    fontStylePath = ITALIC_ASSETS_PATH;
                }
                break;
            case FontStyle.BoldItalic:
                if (font.boldItalic !== undefined) {
                    fontStylePath = BOLD_ITALIC_ASSETS_PATH;
                } else if (font.italic !== undefined) {
                    fontStylePath = ITALIC_ASSETS_PATH;
                } else if (font.bold !== undefined) {
                    fontStylePath = BOLD_ASSETS_PATH;
                }
                break;
        }
        return `${this.url}/${this.name}${fontStylePath}${font.name!}`;
    }
}
