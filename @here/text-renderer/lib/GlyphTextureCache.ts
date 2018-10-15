import { LRUCache } from "@here/lrucache";
import { GlyphCopyMaterial } from "@here/materials";
import * as THREE from "three";

import { BOLD_CODEPOINT_OFFSET, FontCatalog, TextVerticalAlignment } from "./FontCatalog";
import { GlyphDirection, GlyphInfo } from "./Glyph";
import { TextBackgroundMode, TextBuffer } from "./TextBuffer";
import { TextRenderBuffer } from "./TextRenderer";

/**
 * Maximum number of texture atlas pages we can copy from in a single go. This amount is determined
 * by the maximum number of texture units available on a pixel shader for all devices:
 * https://webglstats.com/webgl/parameter/MAX_TEXTURE_IMAGE_UNITS
 */
const MAX_NUM_COPY_PAGES = 8;

const tempOffset = new THREE.Vector3(0, 0, 0);
const tempTransform = new THREE.Matrix4();
const tempCorners = new Array<THREE.Vector2>();

/**
 * Struct holding the info of an [[GlyphTextureCache]] entry.
 */
export interface GlyphCacheEntry {
    /**
     * Glyph data.
     */
    glyphInfo: GlyphInfo;

    /**
     * Glyph's 2D position in the cache.
     */
    location: THREE.Vector2;
}

/**
 * Maximum number of entries that a [[GlyphTextureCache]] can hold references to.
 */
export const GLYPH_CACHE_SIZE = 1024;

/**
 * Number of entries in a row of a [[GlyphTextureCache]].
 */
export const GLYPH_CACHE_WIDTH = Math.sqrt(GLYPH_CACHE_SIZE);

/**
 * Dimensions of the texture used by a [[GlyphTextureCache]].
 */
export const GLYPH_CACHE_TEXTURE_SIZE = 2048;

/**
 * Dimensions of each of the entries in a [[GlyphTextureCache]].
 */
export const GLYPH_CACHE_ENTRY_WIDTH = GLYPH_CACHE_TEXTURE_SIZE / GLYPH_CACHE_WIDTH;

/**
 * LRU texture cache designed to store the bitmap information of all required glyphs for a [[Font]].
 */
export class GlyphTextureCache {
    private m_glyphCache: LRUCache<number, GlyphCacheEntry>;

    private m_scene: THREE.Scene = new THREE.Scene();
    private m_camera: THREE.OrthographicCamera;
    private m_rt: THREE.WebGLRenderTarget;
    private m_clearColor: THREE.Color;

    private m_renderBuffer: TextRenderBuffer;

    private m_copyMaterial: GlyphCopyMaterial;
    private m_copyTextureSet: Set<THREE.Texture>;

    constructor(readonly fontCatalogAsset: FontCatalog) {
        this.m_glyphCache = new LRUCache<number, GlyphCacheEntry>(GLYPH_CACHE_SIZE);
        this.initCacheEntries();

        this.m_camera = new THREE.OrthographicCamera(
            0,
            GLYPH_CACHE_TEXTURE_SIZE,
            GLYPH_CACHE_TEXTURE_SIZE,
            0
        );
        this.m_camera.position.z = 1;
        this.m_camera.updateMatrixWorld(false);
        this.m_rt = new THREE.WebGLRenderTarget(GLYPH_CACHE_TEXTURE_SIZE, GLYPH_CACHE_TEXTURE_SIZE);
        this.m_clearColor = new THREE.Color(0, 0, 0);
        this.m_copyMaterial = new GlyphCopyMaterial();
        this.m_copyTextureSet = new Set<THREE.Texture>();

        const textBuffer: TextBuffer = new TextBuffer(this.m_copyMaterial, this.m_copyMaterial);

        this.m_renderBuffer = new TextRenderBuffer(textBuffer, {
            fontCatalog: fontCatalogAsset,
            fontCatalogName: fontCatalogAsset.name
        });

        this.m_scene.add(this.m_renderBuffer.textBuffer.mesh);
    }

    /**
     * Number of entries in the cache.
     */
    get size(): number {
        return this.m_glyphCache.size;
    }

    /**
     * Maximum possible number of entries in the cache.
     */
    get capacity(): number {
        return this.m_glyphCache.capacity;
    }

    /**
     * Texture holding the bitmap info for all the glyphs in the cache.
     */
    get texture(): THREE.Texture {
        return this.m_rt.texture;
    }

    /**
     * Add a new glyph to the cache. If it was already present in it, it will get promoted
     * (updating its priority inside the internal [[LRUCache]]).
     *
     * @param codepoint Glyph's unicode value.
     * @param bold Glyph's bold style.
     */
    add(codepoint: number, bold?: boolean): void {
        let cp = codepoint;
        if (bold === true) {
            cp += BOLD_CODEPOINT_OFFSET;
        }

        const entry = this.m_glyphCache.get(cp);
        if (entry !== undefined) {
            return;
        }

        const oldestEntry = this.m_glyphCache.oldest;
        if (
            this.m_renderBuffer === undefined ||
            this.m_renderBuffer.textStyle.fontCatalog === undefined ||
            oldestEntry === null
        ) {
            throw new Error("GlyphTextureCache not properly initialized.");
        }

        const glyph = this.m_renderBuffer.textStyle.fontCatalog.getGlyph(cp)!;

        this.m_copyTextureSet.add(glyph.texture);
        let copyTextureIndex = 0;
        for (const value of this.m_copyTextureSet.values()) {
            if (value === glyph.texture) {
                break;
            }
            copyTextureIndex++;
        }
        glyph.page = copyTextureIndex;

        tempTransform.identity();
        tempOffset.set(
            oldestEntry.value.location.x * GLYPH_CACHE_ENTRY_WIDTH,
            oldestEntry.value.location.y * GLYPH_CACHE_ENTRY_WIDTH,
            0
        );
        tempTransform.setPosition(tempOffset);
        this.m_renderBuffer.textBuffer.addGlyph(
            glyph,
            this.m_clearColor,
            1.0,
            0,
            tempTransform,
            tempCorners,
            false,
            TextVerticalAlignment.Center,
            false,
            false,
            false,
            TextBackgroundMode.Outline
        );

        // Update the new UVs to match our new texture.
        glyph.s2 = tempCorners[0].x / GLYPH_CACHE_TEXTURE_SIZE;
        glyph.t2 = tempCorners[3].y / GLYPH_CACHE_TEXTURE_SIZE;
        glyph.s3 = tempCorners[3].x / GLYPH_CACHE_TEXTURE_SIZE;
        glyph.t3 = tempCorners[0].y / GLYPH_CACHE_TEXTURE_SIZE;

        // Add it to the cache.
        this.m_glyphCache.set(cp, {
            glyphInfo: glyph,
            location: oldestEntry.value.location
        });
    }

    /**
     * Returns the value of a cache entry for a given glyph.
     *
     * @param codepoint Glyph's unicode value.
     * @param bold Glyphs's bold style.
     *
     * @returns [[GlyphCacheEntry]] holding the glyph data and location, or `undefined` if the given
     * glyph is not in the cache.
     */
    get(codepoint: number, bold?: boolean): GlyphCacheEntry | undefined {
        let cp = codepoint;
        if (bold === true) {
            cp += BOLD_CODEPOINT_OFFSET;
        }

        return this.m_glyphCache.get(cp);
    }

    /**
     * Tests if a glyph is in the cache.
     *
     * @param codepoint Glyph's unicode value.
     * @param bold Glyphs's bold style.
     *
     * @returns `boolean` with the result of the test.
     */
    has(codepoint: number, bold?: boolean): boolean {
        let cp = codepoint;
        if (bold === true) {
            cp += BOLD_CODEPOINT_OFFSET;
        }

        return this.m_glyphCache.has(cp);
    }

    /**
     * Deletes a glyph inside the cache.
     *
     * @param codepoint Glyph's unicode value.
     * @param bold Glyphs's bold style.
     *
     * @returns `boolean` representing if the character has been successfully removed.
     */
    delete(codepoint: number, bold?: boolean): boolean {
        let cp = codepoint;
        if (bold === true) {
            cp += BOLD_CODEPOINT_OFFSET;
        }

        return this.m_glyphCache.delete(cp);
    }

    /**
     * Clears all the entries in the cache and the texture used to store the bitmap glyphs.
     */
    clear(): void {
        this.m_glyphCache.clear();
        this.m_copyTextureSet.clear();
        this.initCacheEntries();
    }

    /**
     * Clears the [[TextBuffer]] for the [[TextRenderBuffer]]s in this `GlyphTextureCache`.
     */
    disposeBuffer(): void {
        if (this.m_renderBuffer !== undefined) {
            this.m_renderBuffer.dispose();
            this.m_copyTextureSet.clear();
        }
    }

    /**
     * Resets the [[BufferGeometry]] for the [[TextRenderBuffer]]s in this `GlyphTextureCache`.
     */
    resetBuffer(): void {
        if (this.m_renderBuffer !== undefined) {
            this.m_renderBuffer.reset();
            this.m_copyTextureSet.clear();
        }
    }

    /**
     * Updates the [[BufferGeometry]] for the [[TextRenderBuffer]]s in this `GlyphTextureCache`.
     */
    updateBuffer(): void {
        if (this.m_renderBuffer !== undefined) {
            this.m_renderBuffer.updateBufferGeometry();
        }
    }

    /**
     * Clears the texture used to store the bitmap glyphs.
     *
     * @param renderer WebGLRenderer used to clear the internal texture.
     */
    clearTexture(renderer: THREE.WebGLRenderer): void {
        const defaultRT = renderer.getRenderTarget();
        const defaultClearColor = renderer.getClearColor();
        renderer.setRenderTarget(this.m_rt);
        renderer.setClearColor(this.m_clearColor);
        renderer.clear(true);
        renderer.setRenderTarget(defaultRT);
        renderer.setClearColor(defaultClearColor);
    }

    /**
     * Copies all the newly introduced glyphs into the internal texture.
     *
     * @param renderer WebGLRenderer used to clear the internal texture.
     */
    updateTexture(renderer: THREE.WebGLRenderer): void {
        const srcPages = Array.from(this.m_copyTextureSet);
        const nCopies = Math.ceil(this.m_copyTextureSet.size / MAX_NUM_COPY_PAGES);
        for (let copyIndex = 0; copyIndex < nCopies; copyIndex++) {
            const pageOffset = copyIndex * MAX_NUM_COPY_PAGES;
            this.m_copyMaterial.uniforms.pageOffset.value = pageOffset;
            for (let i = 0; i < MAX_NUM_COPY_PAGES; i++) {
                const pageIndex = pageOffset + i;
                if (pageIndex < this.m_copyTextureSet.size) {
                    this.m_copyMaterial.uniforms["page" + i].value = srcPages[pageIndex];
                }
            }
            renderer.render(this.m_scene, this.m_camera, this.m_rt);
        }
        this.m_copyTextureSet.clear();
    }

    private initCacheEntries() {
        for (let i = 0; i < GLYPH_CACHE_WIDTH; i++) {
            for (let j = 0; j < GLYPH_CACHE_WIDTH; j++) {
                const dummyGlyph: GlyphCacheEntry = {
                    glyphInfo: {
                        codepoint: 0,
                        direction: GlyphDirection.LTR,
                        advanceX: 0,
                        offsetX: 0,
                        offsetY: 0,
                        width: 0,
                        height: 0,
                        s0: 0,
                        t0: 0,
                        s1: 0,
                        t1: 0,
                        s2: 0,
                        t2: 0,
                        s3: 0,
                        t3: 0,
                        page: 0,
                        texture: THREE.Texture.DEFAULT_IMAGE,
                        emulateBold: false,
                        size: 0,
                        lineHeight: 0,
                        base: 0,
                        metrics: {}
                    },
                    location: new THREE.Vector2(j, i)
                };
                this.m_glyphCache.set(-(i * GLYPH_CACHE_WIDTH + j + 1), dummyGlyph);
            }
        }
    }
}
