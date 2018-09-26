/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

import "@here/fetch";
import { LoggerManager } from "@here/utils";

import { GlyphDirection, GlyphInfo } from "./Glyph";

const logger = LoggerManager.instance.create("FontCatalog");

const REPLACEMENT_CHAR_PATH = "./resources/replacementCharacter.png";
const CATALOG_PATH = "_FontCatalog.json";
const BOLD_ASSETS_PATH = "_BoldAssets/";
const ASSETS_PATH = "_Assets/";
const OBLIQUE_ANGLE = 0.174533;

// TODO: Review/Remove/Add any additional needed ranges (HARP-3330).
// Scripts described here: https://en.wikipedia.org/wiki/Right-to-left#List_of_RTL_scripts
const RTLUnicodeRanges = [
    "Hebrew",
    "Alphabetic_Presentation_Forms",
    "Arabic",
    "Arabic_Supplement",
    "Arabic_Extended-A",
    "Arabic_Presentation_Forms-A",
    "Arabic_Presentation_Forms-B",
    "Arabic_Mathematical_Alphabetic_Symbols",
    "Indic_Siyaq_Numbers",
    "Rumi_Numeral_Symbols",
    "Syriac",
    "Syriac_Supplement",
    "Samaritan",
    "Mandaic",
    "Thaana",
    "Mende_Kikakui",
    "NKo",
    "Adlam",
    "Hanifi_Rohingya"
];
// ASCII punctuation is considered to have neutral directionality:
// https://en.wikipedia.org/wiki/Basic_Latin_(Unicode_block)#Table_of_characters
const NeutralBidirectionalRanges = [[32, 47], [58, 64], [91, 96], [123, 126]];
// Latin and arabic numerals are considered to have weak directionality:
// https://en.wikipedia.org/wiki/Basic_Latin_(Unicode_block)#Table_of_characters
// https://en.wikipedia.org/wiki/Arabic_(Unicode_block)#Block
const WeakBidirectionalRanges = [[48, 57], [1632, 1641], [1776, 1785]];

function getGlyphDir(codepoint: number, range: string): GlyphDirection {
    // Test for neutral and weak characters first (they're inside LTR/RTL ranges).
    for (const weakRange of WeakBidirectionalRanges) {
        if (codepoint >= weakRange[0] && codepoint <= weakRange[1]) {
            return GlyphDirection.Weak;
        }
    }
    for (const neutralRange of NeutralBidirectionalRanges) {
        if (codepoint >= neutralRange[0] && codepoint <= neutralRange[1]) {
            return GlyphDirection.Neutral;
        }
    }

    // Check for RTL/LTR.
    const rtl = RTLUnicodeRanges.find(element => {
        return element === range;
    });
    if (rtl !== undefined) {
        return GlyphDirection.RTL;
    } else {
        return GlyphDirection.LTR;
    }
}

// Weak unicode bidirectional characters.

interface Char {
    id: number;
    index: number;
    char: string;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    chnl: number;
    x: number;
    y: number;
    page: number;
}

async function loadTexture(assetUrl: string): Promise<THREE.Texture> {
    const texturePromise = new Promise(resolve => {
        new THREE.TextureLoader().load(assetUrl, resolve);
    });

    const result = await texturePromise;
    return result as THREE.Texture;
}

async function loadJSON(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} Status Text:  ${response.statusText}`);
    }
    const rawJSON = await response.text();
    const json = JSON.parse(rawJSON);

    return json;
}

/**
 * Offset applied to bold glyphs (to avoid conflicting with the regular version of the same glyph,
 * both sharing the same code point).
 */
export const BOLD_CODEPOINT_OFFSET = 0x80000000;

/**
 * Description of a font (as well as a possible bold variant).
 */
export interface Font {
    name: string;
    bold?: string;
}

/*
 * Horizontal alignment options.
 */
export enum TextHorizontalAlignment {
    Left = 1.0,
    Center = 0.5,
    Right = 0.0
}

/*
 * Vertical alignment options.
 */
export enum TextVerticalAlignment {
    Above = 0.0,
    Center = 0.5,
    Below = 1.0
}

/*
 * Horizontal alignment options (string representation).
 */
export enum TextHorizontalAlignmentStrings {
    Left = "Left",
    Center = "Center",
    Right = "Right"
}

/*
 * Vertical alignment options (string representation).
 */
export enum TextVerticalAlignmentStrings {
    Above = "Above",
    Center = "Center",
    Below = "Below"
}

/**
 * Continuous range of unicode code points that share similar origin/use.
 */
export interface UnicodeRange {
    name: string;
    min: number;
    max: number;
    fonts: string[];
}

/**
 * Collection of continuous unicode code points supported by a font.
 */
export interface FontUnicodeSubranges {
    font: string;
    subranges: Array<{ min: number; max: number }>;
}

/**
 * Class designed to load a FontCatalog JSON file describing all the fonts, unicode ranges and
 * glyphs supported by said FontCatalog.
 */
export class FontCatalogInfo {
    /**
     * Creates a `FontCatalogInfo` from the given url.
     *
     * @param url The URL of the font catalog file.
     */
    static async load(url: string): Promise<FontCatalogInfo> {
        const fontCatalog = await loadJSON(url);

        const fontCatalogInfo = new FontCatalogInfo(
            fontCatalog.name,
            fontCatalog.fonts,
            fontCatalog.supportedRanges,
            fontCatalog.supportedSubranges
        );

        return fontCatalogInfo;
    }

    /**
     * Creates an empty `FontCatalogInfo`.
     */
    constructor(
        readonly name: string,
        readonly fonts: Font[],
        readonly supportedRanges: UnicodeRange[],
        readonly supportedSubranges: FontUnicodeSubranges[]
    ) {}
}

/**
 * Declares an interface with all the text styling properties that take part in font rendering.
 */
export interface TextStyle {
    /**
     * Text color.
     */
    color?: string;

    /**
     * Renders all characters in this `TextElement` as uppercase.
     */
    allCaps?: boolean;

    /**
     * If `allCaps` is `true`, it will render characters which were lowercase slightly smaller.
     */
    smallCaps?: boolean;

    /*
     * Bold style modifier.
     */
    bold?: boolean;

    /*
     * Oblique style modifier.
     */
    oblique?: boolean;

    /**
     * Text background mode.
     */
    bgMode?: string;

    /**
     * Text background color.
     */
    bgColor?: string;

    /**
     * Text background size value.
     */
    bgFactor?: number;

    /**
     * Text background alpha value.
     */
    bgAlpha?: number;

    /**
     * Horizontal separation between glyphs.
     */
    tracking?: number;

    /**
     * Name of the [[FontCatalog]] used by this `TextStyle`.
     */
    fontCatalogName?: string;

    /**
     * [[FontCatalog]] used to render glyphs with this `TextStyle`.
     */
    fontCatalog?: FontCatalog;

    /**
     * `TextStyle`'s name.
     */
    name?: string;
}

/**
 * Class in charge of loading fonts and managing all the glyphs supported by it.
 */
export class FontCatalog {
    /**
     * Replacement [[Glyph]] used when a `FontCatalog` doesn't support a particular code point.
     */
    static replacementGlyph: GlyphInfo;

    /**
     * Creates a `FontCatalog` from the given url.
     *
     * @param url The URL of the font catalog file.
     * @param name The font catalog's name.
     * @param callback Callback used when a font finishes loading.
     */
    static async load(url: string, name: string, callback: () => void): Promise<FontCatalog> {
        const fontCatalogInfo = await FontCatalogInfo.load(url);
        return new FontCatalog(fontCatalogInfo, name, url, callback);
    }

    /**
     * Returns an array of `Vector2` positions describing the 2D glyph's quad geometry.
     *
     * @param glyph [[GlyphInfo]] which to get the corners for.
     * @param transform Transformation matrix applied to this glyph.
     * @param corners Array of `Vector2` where the corner information will be stored.
     * @param secondaryUVs If `true`, the secondary uvs are copied into the vertex attribute instead
     * of the primary ones.
     * @param verticalAlignment Vertical alignment configuration for this glyph.
     * @param mirrored Should this glyph be mirrored (in the vertical axis)?
     * @param oblique Should this glyph be slanted?
     * @param smallCaps Is this glyph a scaled-down uppercase glyph?
     */
    static getGlyphCorners(
        glyph: GlyphInfo,
        transform: THREE.Matrix4,
        corners: THREE.Vector2[] = [],
        secondaryUVs: boolean = true,
        verticalAlignment: TextVerticalAlignment,
        mirrored: boolean,
        oblique: boolean = false,
        smallCaps: boolean = false
    ): THREE.Vector2[] {
        for (let i = 0; i < 4; ++i) {
            if (corners[i] === undefined) {
                corners[i] = new THREE.Vector2();
            }
        }

        const glyphVerticalAlignment =
            (glyph.metrics.capHeight! / glyph.metrics.unitsPerEm!) * glyph.size * verticalAlignment;
        const penY = glyph.lineHeight - glyphVerticalAlignment;

        let left = 0;
        let right = 0;
        let bottom = 0;
        let top = 0;

        if (secondaryUVs) {
            const smallCapsScale = smallCaps
                ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                : 1.0;
            const smallCapsOffsetY = smallCaps
                ? (glyph.metrics.xHeight! / glyph.metrics.unitsPerEm!) * glyph.size * 0.5
                : 0.0;

            const width = glyph.width * smallCapsScale;
            const height = glyph.height * smallCapsScale;
            const offsetX = glyph.offsetX * smallCapsScale;
            const offsetY = glyph.offsetY * smallCapsScale + smallCapsOffsetY;

            left = offsetX;
            bottom = penY - offsetY - height;
            right = left + width;
            top = bottom + height;
        } else {
            left = 0;
            bottom = 0;
            right = glyph.width;
            top = glyph.height;
        }

        const obliqueOffset = oblique && secondaryUVs ? Math.tan(OBLIQUE_ANGLE) * glyph.size : 0;
        const v = new THREE.Vector3();

        corners[0].copy(v.set(mirrored ? right : left, bottom, 0).applyMatrix4(transform) as any);
        corners[1].copy(v.set(mirrored ? left : right, bottom, 0).applyMatrix4(transform) as any);
        corners[2].copy(v
            .set((mirrored ? right : left) + obliqueOffset, top, 0)
            .applyMatrix4(transform) as any);
        corners[3].copy(v
            .set((mirrored ? left : right) + obliqueOffset, top, 0)
            .applyMatrix4(transform) as any);

        return corners;
    }

    private readonly m_loadingJson = new Set();
    private readonly m_loadedJson = new Map<string, any>();
    private readonly m_loadingTextures = new Set();
    private readonly m_loadedTextures = new Map<string, THREE.Texture>();
    private readonly m_loadedGlyphs = new Map<number, GlyphInfo>();

    /**
     * Creates a `FontCatalog` from the loaded [[FontCatalogInfo]].
     *
     * @param info [[FontCatalogInfo]] object holding the `FontCatalog`'s description.
     * @param name `FontCatalog`'s name.
     * @param m_url `FontCatalog`'s url.
     * @param m_callback Callback used when a font finishes loading.
     */
    constructor(
        readonly info: FontCatalogInfo,
        public name: string,
        private m_url: string,
        private m_callback: () => void
    ) {
        // Initialize the replacementGlyph if needed.
        if (FontCatalog.replacementGlyph === undefined) {
            FontCatalog.replacementGlyph = {
                codepoint: 65533,
                direction: GlyphDirection.LTR,
                advanceX: 32,
                offsetX: -3,
                offsetY: 14,
                width: 37,
                height: 37,
                s0: 0.0,
                t0: 1.0,
                s1: 1.0,
                t1: 0.0,
                s2: 0.0,
                t2: 0.0,
                s3: 0.0,
                t3: 0.0,
                page: 0,
                texture: THREE.Texture.DEFAULT_IMAGE,
                emulateBold: false,
                size: 32,
                base: 38,
                lineHeight: 44,
                metrics: {
                    unitsPerEm: 1.0,
                    capHeight: 1.0
                }
            };

            const texturePromise = new Promise(resolve => {
                new THREE.TextureLoader().load(REPLACEMENT_CHAR_PATH, resolve);
            });
            texturePromise
                .then(result => {
                    logger.log("Loaded texture: " + REPLACEMENT_CHAR_PATH);
                    const texture = result as THREE.Texture;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.minFilter = THREE.NearestFilter;
                    texture.needsUpdate = true;
                    FontCatalog.replacementGlyph.texture = texture;
                })
                .catch((error: Error) => {
                    logger.error("Failed to load texture: " + REPLACEMENT_CHAR_PATH, error);
                });
        }
    }

    /**
     * Returns the [[GlyphInfo]] for a character's codepoint.
     *
     * @param codePoint Character's Unicode codepoint.
     * @param bold Bold variant?
     */
    getGlyph(codePoint: number, bold?: boolean): GlyphInfo | undefined {
        let cp = codePoint;
        if (bold === true) {
            cp += BOLD_CODEPOINT_OFFSET;
        }

        let glyph = this.m_loadedGlyphs.get(cp);
        if (glyph !== undefined) {
            return glyph;
        } else {
            // Look for the unicode range containing this codepoint.
            let glyphRange: UnicodeRange | undefined;
            let fontName: string;
            for (const range of this.info.supportedRanges) {
                if (codePoint >= range.min && codePoint <= range.max) {
                    glyphRange = range;
                    // TODO: Implement languange-biased font selection.
                    fontName = range.fonts[0];
                    break;
                }
            }
            // If we don't find the glyph in the supported ranges, return the default replacement
            // glyph.
            if (glyphRange === undefined) {
                return FontCatalog.replacementGlyph;
            }

            // Identify the font used for this range (and if it supports bold variants).
            const font = this.info.fonts.find(element => {
                return element.name === fontName;
            });
            if (font === undefined) {
                return FontCatalog.replacementGlyph;
            }
            const boldSupported = font.bold !== undefined;
            const boldEmulation = bold === true && !boldSupported;

            // Check if the glyph assets are ready and try loading it.
            const catalogIdx = this.m_url.lastIndexOf(CATALOG_PATH);
            const fontAssetsPath =
                this.m_url.substr(0, catalogIdx) +
                (bold ? (boldSupported ? BOLD_ASSETS_PATH : ASSETS_PATH) : ASSETS_PATH) +
                glyphRange.fonts[0];
            glyph = this.loadGlyph(codePoint, glyphRange, fontAssetsPath, boldEmulation);
            if (glyph !== undefined) {
                this.m_loadedGlyphs.set(cp, glyph);
            }
        }
        return glyph;
    }

    /**
     * `true` if any of the resources used by this `FontCatalog` is still loading.
     */
    get loading(): boolean {
        return this.m_loadingJson.size > 0 || this.m_loadingTextures.size > 0;
    }

    private loadGlyph(
        codepoint: number,
        range: UnicodeRange,
        assetPath: string,
        boldEmulation: boolean
    ): GlyphInfo | undefined {
        // Check if the needed json file is downloaded.
        const loadedJson = this.m_loadedJson.get(assetPath + "/" + range.name + ".json");
        if (loadedJson === undefined) {
            // Trigger the download of this resource only once.
            this.loadJson(codepoint, range.name, assetPath);
            return undefined;
        }

        // Check if the needed texture file is downloaded.
        const glyphData = (loadedJson.chars as Char[]).find(char => char.id === codepoint);
        if (glyphData === undefined) {
            // If we don't find the glyph in the range supported charset, return the default
            // replacement glyph.
            return FontCatalog.replacementGlyph;
        }
        const texturePath = assetPath + "/" + loadedJson.pages[glyphData.page];
        const loadedTexture = this.m_loadedTextures.get(texturePath);
        if (loadedTexture === undefined) {
            this.loadTexture(texturePath);
            return undefined;
        }

        // If both the json and texture are downloaded, assemble the GlyphInfo struct for this
        // codepoint and return it.
        return {
            codepoint: glyphData.id,
            direction: getGlyphDir(codepoint, range.name),
            advanceX: glyphData.xadvance,
            offsetX: glyphData.xoffset,
            offsetY: glyphData.yoffset,
            width: glyphData.width,
            height: glyphData.height,
            s0: glyphData.x / loadedTexture.image.width,
            t0: 1.0 - glyphData.y / loadedTexture.image.height,
            s1: (glyphData.x + glyphData.width) / loadedTexture.image.width,
            t1: 1.0 - (glyphData.y + glyphData.height) / loadedTexture.image.height,
            s2: 0.0,
            t2: 0.0,
            s3: 0.0,
            t3: 0.0,
            page: glyphData.page,
            texture: loadedTexture,
            emulateBold: boldEmulation,
            size: loadedJson.info.size,
            base: loadedJson.common.base,
            lineHeight: loadedJson.common.lineHeight,
            metrics: loadedJson.metrics
        };
    }

    private loadJson(codePoint: number, range: string, assetPath: string) {
        const path = assetPath + "/" + range + ".json";
        // Trigger the download of this resource only once.
        if (!this.m_loadingJson.has(path)) {
            logger.log("Loading font json: " + path);
            this.m_loadingJson.add(path);
            loadJSON(path)
                .then(json => {
                    logger.log("Loaded font json: " + path);
                    this.m_loadingJson.delete(path);
                    this.m_loadedJson.set(path, json);

                    // When finished loading the json, trigger the download for the glyph's
                    // texture.
                    const glyphData = (json.chars as Char[]).find(char => char.id === codePoint);
                    if (glyphData === undefined) {
                        logger.error(`Codepoint ${codePoint} not found in FontCatalog assets.`);
                    } else {
                        const texturePath = assetPath + "/" + json.pages[glyphData.page];
                        this.loadTexture(texturePath);
                    }
                })
                .catch((error: Error) => {
                    logger.error("Failed to load font. ", error);
                });
        }
    }

    private loadTexture(path: string) {
        // Trigger the download of this resource only once.
        if (!this.m_loadingTextures.has(path)) {
            logger.log("Loading font texture: " + path);
            this.m_loadingTextures.add(path);
            loadTexture(path)
                .then(texture => {
                    logger.log("Loaded font texture: " + path);

                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.minFilter = THREE.NearestFilter;
                    texture.needsUpdate = true;

                    this.m_loadingTextures.delete(path);
                    this.m_loadedTextures.set(path, texture);

                    this.m_callback();
                })
                .catch((error: Error) => {
                    logger.error("Failed to load texture. ", error);
                });
        }
    }
}
