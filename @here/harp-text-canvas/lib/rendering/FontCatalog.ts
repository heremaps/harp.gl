/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { GlyphData } from "./GlyphData";
import { GlyphTextureCache } from "./GlyphTextureCache";
import { DefaultTextStyle, FontStyle, FontVariant, TextStyle } from "./TextStyle";

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
     * @param url Asset url.
     * @param maxCodePointCount Maximum number of unique code points bitmaps this `FontCatalog`'s
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
            replacementJson,
            replacementTexture
        );
        return fontCatalogInfo;
    }

    private static loadTexture(url: string): Promise<THREE.Texture> {
        return new Promise(resolve => {
            new THREE.TextureLoader().load(url, resolve);
        }) as Promise<THREE.Texture>;
    }

    private static async loadJSON(url: string): Promise<any> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`${url} Status Text:  ${response.statusText}`);
        }
        const rawJSON = await response.text();
        return JSON.parse(rawJSON);
    }

    private m_glyphTextureCache: GlyphTextureCache;
    private m_replacementGlyph: GlyphData;
    private m_loadingJson: Map<string, Promise<any>>;
    private m_loadingPages: Map<string, Promise<THREE.Texture>>;
    private m_loadedJson: Map<string, any>;
    private m_loadedPages: Map<string, THREE.Texture>;

    /**
     * Creates a new FontCatalog.
     *
     * @param url FontCatalog's URL.
     * @param name FontCatalog's name.
     * @param type FontCatalog's type (sdf or msdf).
     * @param size FontCatalog's glyph size (pixels).
     * @param maxWidth FontCatalog's maximum glyph width (pixels).
     * @param maxHeight FontCatalog's maximum glyph height (pixels).
     * @param distanceRange Distance range used to generate the SDF bitmaps.
     * @param fonts Array of supported fonts.
     * @param unicodeBlocks Array of supported Unicode blocks.
     * @param maxCodePointCount Maximum number of unique code points bitmaps this `FontCatalog`'s
     * internal texture can store simultaneously.
     *
     * @returns New FontCatalog.
     */
    constructor(
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
        replacementJson: any,
        replacementTexture: THREE.Texture
    ) {
        const replacementFont = fonts.find(font => font.name === "Extra");
        this.m_replacementGlyph = new GlyphData(
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
            replacementFont!
        );

        this.m_glyphTextureCache = new GlyphTextureCache(
            maxCodePointCount,
            this.maxWidth + 1,
            this.maxHeight + 1
        );

        this.m_loadingJson = new Map<string, Promise<any>>();
        this.m_loadingPages = new Map<string, Promise<THREE.Texture>>();
        this.m_loadedJson = new Map<string, any>();
        this.m_loadedPages = new Map<string, THREE.Texture>();
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
        this.m_loadedJson.clear();
        this.m_loadedPages.clear();
    }

    /**
     * Removes all loaded (and loading) assets.
     */
    clear() {
        this.m_glyphTextureCache.clear();
        this.m_loadingJson.clear();
        this.m_loadingPages.clear();
        this.m_loadedJson.clear();
        this.m_loadedPages.clear();
    }

    /**
     * Updates the internal WebGLRenderTarget.
     * The update will copy the newly introduced glyphs since the previous update.
     *
     * @param renderer WebGLRenderer.
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
     * Loads the description file for a specific [[UnicodeBlock]]. This speeds up consequent calls
     * to `FontCatalog`.loadCharset() that require glyphs from this block to be loaded.
     *
     * @param block Requested [[UnicodeBlock]].
     * @param font [[Font]] to retrieve this Unicode block from.
     * @param fontStyle [[FontStyle]] assets to load.
     * @param loadPages If `true`, all pages in this Unicode block will also be loaded.
     *
     * @returns Loaded Unicode Block json.
     */
    async loadUnicodeBlock(
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
                    // tslint:disable-next-line:no-console
                    console.error(e);
                    this.m_loadingJson.delete(jsonPath);
                }
            } else {
                json = await jsonPromise;
            }
        }
        if (loadPages === true) {
            for (const page of json.pages) {
                const pagePath = `${assetsPath}/${page}`;
                await this.loadPage(pagePath);
            }
        }

        return json;
    }

    /**
     * Releases the description file for a specific [[UnicodeBlock]] (and all downloaded pages).
     * Safe to call when no assets for this block have been loaded.
     *
     * @param block Requested [[UnicodeBlock]].
     * @param font [[Font]] to remove this Unicode block from.
     * @param fontStyle [[FontStyle]] assets to remove.
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
     * Loads all the required assets needed to render all glyphs provided as input.
     * Character repetition will not be considered, and only styled assets (with applied font
     * selection, style and variants) will be loaded.
     *
     * @param input Input string.
     * @param style Style to apply to the input.
     */
    async loadCharset(input: string, style: TextStyle): Promise<void> {
        const fontName = style.font !== undefined ? style.font : "";
        const fontStyle =
            style.fontStyle !== undefined ? style.fontStyle : DefaultTextStyle.DEFAULT_FONT_STYLE;
        const fontVariant =
            style.fontVariant !== undefined
                ? style.fontVariant
                : DefaultTextStyle.DEFAULT_FONT_VARIANT;

        const charset = input.replace(/[\s\S](?=([\s\S]+))/g, (c, s) => {
            return s.indexOf(c) + 1 ? "" : c;
        });
        for (const sourceChar of charset) {
            const variantText =
                fontVariant === FontVariant.AllCaps || fontVariant === FontVariant.SmallCaps
                    ? sourceChar.toUpperCase()
                    : sourceChar;

            for (const char of variantText) {
                const codePoint = char.codePointAt(0)!;
                const font = this.getFont(codePoint, fontName);
                const hash = `${font.name}_${fontStyle}_${codePoint}`;
                if (font.charset.indexOf(String.fromCodePoint(codePoint)) === -1) {
                    const glyph = this.m_replacementGlyph.clone(codePoint);
                    this.m_glyphTextureCache.add(hash, glyph);
                    continue;
                }

                let charUnicodeBlock: UnicodeBlock | undefined;
                for (const block of this.unicodeBlocks) {
                    if (codePoint >= block.min && codePoint <= block.max) {
                        charUnicodeBlock = block;
                        break;
                    }
                }
                if (charUnicodeBlock === undefined) {
                    const glyph = this.m_replacementGlyph.clone(codePoint);
                    this.m_glyphTextureCache.add(hash, glyph);
                    continue;
                }

                const glyphData = await this.loadAssets(
                    codePoint,
                    fontStyle,
                    charUnicodeBlock,
                    font
                );
                this.m_glyphTextureCache.add(hash, glyphData);
            }
        }
    }

    /**
     * Retrieves the loaded [[GlyphData]] for a specific character.
     * Returns `undefined` if the assets for this glyph haven't been loaded yet.
     *
     * @param codePoint Character's Unicode code point.
     * @param font Font to get this glyph from.
     * @param fontStyle Specific font style to use.
     *
     * @returns [[GlyphData]] for this code point.
     */
    getGlyph(codePoint: number, font: Font, fontStyle: FontStyle): GlyphData | undefined {
        const hash = `${font.name}_${fontStyle}_${codePoint}`;
        const cacheEntry = this.m_glyphTextureCache.get(hash);
        return cacheEntry === undefined ? cacheEntry : cacheEntry.glyphData;
    }

    /**
     * Gets the best matched font for a specific character.
     *
     * @param codePoint Character's Unicode code point.
     * @param fontName Font name suggestion.
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

    private async loadAssets(
        codePoint: number,
        fontStyle: FontStyle,
        block: UnicodeBlock,
        font: Font
    ): Promise<GlyphData> {
        const json = await this.loadUnicodeBlock(block, font, fontStyle);

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
