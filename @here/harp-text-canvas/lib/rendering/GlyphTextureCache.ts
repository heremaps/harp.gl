/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LRUCache } from "@here/harp-lrucache";
import * as THREE from "three";

import { Font, FontMetrics } from "./FontCatalog";
import { GlyphData } from "./GlyphData";
import { GlyphClearMaterial, GlyphCopyMaterial } from "./TextMaterials";

/**
 * Maximum number of texture atlas pages we can copy from in a single go. This amount is determined
 * by the maximum number of texture units available on a pixel shader for all devices:
 * https://webglstats.com/webgl/parameter/MAX_TEXTURE_IMAGE_UNITS
 */
const MAX_NUM_COPY_PAGES = 8;

/**
 * Maximum texture size supported. This amount is determined by the maximum texture size supported
 * for all devices:
 * https://webglstats.com/webgl/parameter/MAX_TEXTURE_SIZE
 */
const MAX_TEXTURE_SIZE = 4096;

/**
 * @hidden
 * Information stored for every entry in a [[GlyphTextureCache]].
 */
export interface GlyphCacheEntry {
    glyphData: GlyphData;
    location: THREE.Vector2;
}

/**
 * @hidden
 * Unified glyph SDF bitmap storage for all fonts in a [[FontCatalog]].
 * Implemented as an abstraction layer on top of an LRUCache and WebGLRenderTarget.
 */
export class GlyphTextureCache {
    private readonly m_cacheWidth: number;
    private readonly m_cacheHeight: number;
    private readonly m_textureSize: THREE.Vector2;
    private readonly m_entryCache: LRUCache<string, GlyphCacheEntry>;

    private readonly m_scene: THREE.Scene;
    private readonly m_camera: THREE.OrthographicCamera;
    private readonly m_rt: THREE.WebGLRenderTarget;

    private readonly m_copyTextureSet: Set<THREE.Texture>;
    private readonly m_copyTransform: THREE.Matrix3;
    private readonly m_copyPositions: THREE.Vector2[];
    private m_copyMaterial?: GlyphCopyMaterial;
    private m_copyVertexBuffer: THREE.InterleavedBuffer;
    private readonly m_copyPositionAttribute: THREE.InterleavedBufferAttribute;
    private readonly m_copyUVAttribute: THREE.InterleavedBufferAttribute;
    private readonly m_copyGeometry: THREE.BufferGeometry;
    private m_copyMesh: THREE.Mesh;
    private m_copyGeometryDrawCount: number;

    private m_clearMaterial?: GlyphClearMaterial;
    private m_clearPositionAttribute: THREE.BufferAttribute;
    private readonly m_clearGeometry: THREE.BufferGeometry;
    private m_clearMesh: THREE.Mesh;
    private m_clearGeometryDrawCount: number;

    /**
     * Creates a `GlyphTextureCache` object.
     *
     * @param capacity - Cache's maximum glyph capacity.
     * @param entryWidth - Maximum entry width.
     * @param entryHeight - Maximum entry height.
     *
     * @returns New `GlyphTextureCache`.
     */
    constructor(
        readonly capacity: number,
        readonly entryWidth: number,
        readonly entryHeight: number
    ) {
        const nRows = Math.floor(Math.sqrt(capacity));
        this.m_cacheHeight = nRows * nRows < capacity ? nRows + 1 : nRows;
        this.m_cacheWidth = nRows * this.m_cacheHeight < capacity ? nRows + 1 : nRows;

        this.m_textureSize = new THREE.Vector2(
            this.m_cacheWidth * entryWidth,
            this.m_cacheHeight * entryHeight
        );
        if (this.m_textureSize.y > MAX_TEXTURE_SIZE || this.m_textureSize.x > MAX_TEXTURE_SIZE) {
            // eslint-disable-next-line no-console
            console.warn(
                "GlyphTextureCache texture size (" +
                    this.m_textureSize.x +
                    ", " +
                    this.m_textureSize.y +
                    ") exceeds WebGL's widely supported MAX_TEXTURE_SIZE (" +
                    MAX_TEXTURE_SIZE +
                    ").\n" +
                    "This could result in rendering errors on some devices.\n" +
                    "Please consider reducing its capacity or input assets size."
            );
        }

        this.m_entryCache = new LRUCache<string, GlyphCacheEntry>(capacity);
        this.initCacheEntries();

        this.m_scene = new THREE.Scene();
        this.m_camera = new THREE.OrthographicCamera(
            0,
            this.m_textureSize.x,
            this.m_textureSize.y,
            0
        );
        this.m_camera.position.z = 1;
        this.m_camera.updateMatrixWorld(false);
        this.m_rt = new THREE.WebGLRenderTarget(this.m_textureSize.x, this.m_textureSize.y, {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        });

        this.m_copyTextureSet = new Set<THREE.Texture>();
        this.m_copyTransform = new THREE.Matrix3();
        this.m_copyPositions = [];
        this.m_copyPositions.push(
            new THREE.Vector2(),
            new THREE.Vector2(),
            new THREE.Vector2(),
            new THREE.Vector2()
        );

        this.m_copyVertexBuffer = new THREE.InterleavedBuffer(new Float32Array(capacity * 20), 5);
        this.m_copyVertexBuffer.setUsage(THREE.DynamicDrawUsage);

        this.m_copyPositionAttribute = new THREE.InterleavedBufferAttribute(
            this.m_copyVertexBuffer,
            3,
            0
        );
        this.m_copyUVAttribute = new THREE.InterleavedBufferAttribute(
            this.m_copyVertexBuffer,
            2,
            3
        );
        this.m_copyGeometry = new THREE.BufferGeometry();
        this.m_copyGeometry.setAttribute("position", this.m_copyPositionAttribute);
        this.m_copyGeometry.setAttribute("uv", this.m_copyUVAttribute);

        const copyIndexBuffer = new THREE.BufferAttribute(new Uint32Array(capacity * 6), 1);
        copyIndexBuffer.setUsage(THREE.DynamicDrawUsage);
        this.m_copyGeometry.setIndex(copyIndexBuffer);
        this.m_copyMesh = new THREE.Mesh(this.m_copyGeometry);
        this.m_copyMesh.frustumCulled = false;
        this.m_copyGeometryDrawCount = 0;

        this.m_clearPositionAttribute = new THREE.BufferAttribute(
            new Float32Array(capacity * 8),
            2
        );
        this.m_clearPositionAttribute.setUsage(THREE.DynamicDrawUsage);
        this.m_clearGeometry = new THREE.BufferGeometry();
        this.m_clearGeometry.setAttribute("position", this.m_clearPositionAttribute);
        const clearIndexBuffer = new THREE.BufferAttribute(new Uint32Array(capacity * 6), 1);
        clearIndexBuffer.setUsage(THREE.DynamicDrawUsage);

        this.m_clearGeometry.setIndex(clearIndexBuffer);
        this.m_clearMesh = new THREE.Mesh(this.m_clearGeometry);
        this.m_clearMesh.frustumCulled = false;
        this.m_clearGeometryDrawCount = 0;

        this.m_scene.add(this.m_clearMesh, this.m_copyMesh);
    }

    /**
     * Release all allocated resources.
     */
    dispose(): void {
        this.m_entryCache.clear();
        this.m_scene.remove(this.m_clearMesh, this.m_copyMesh);
        this.m_rt.dispose();
        this.m_clearMaterial?.dispose();
        this.m_copyMaterial?.dispose();
        this.m_copyTextureSet.clear();
        this.m_clearGeometry.dispose();
        this.m_copyGeometry.dispose();
    }

    /**
     * Internal WebGL Texture.
     */
    get texture(): THREE.Texture {
        return this.m_rt.texture;
    }

    /**
     * Internal WebGL Texture size.
     */
    get textureSize(): THREE.Vector2 {
        return this.m_textureSize;
    }

    /**
     * Add a new entry to the GlyphTextureCache. If the limit of entries is hit, the least requested
     * entry will be replaced.
     *
     * @param hash - Entry's hash.
     * @param glyph - Entry's glyph data.
     */
    add(hash: string, glyph: GlyphData): void {
        const entry = this.m_entryCache.get(hash);
        if (entry !== undefined) {
            return;
        }

        const oldestEntry = this.m_entryCache.oldest;
        if (oldestEntry === null) {
            throw new Error("GlyphTextureCache is uninitialized!");
        }
        this.clearCacheEntry(oldestEntry.value);
        this.copyGlyphToCache(hash, glyph, oldestEntry.value.location);
    }

    /**
     * Checks if an entry is in the cache.
     *
     * @param hash - Entry's hash.
     *
     * @returns Test result.
     */
    has(hash: string): boolean {
        return this.m_entryCache.has(hash);
    }

    /**
     * Retrieves an entry from the cache.
     *
     * @param hash - Entry's hash.
     *
     * @returns Retrieval result.
     */
    get(hash: string): GlyphCacheEntry | undefined {
        return this.m_entryCache.get(hash);
    }

    /**
     * Clears the internal LRUCache.
     */
    clear(): void {
        this.m_copyGeometryDrawCount = 0;
        this.m_clearGeometryDrawCount = 0;
        this.m_entryCache.clear();
        this.m_copyTextureSet.clear();
        this.initCacheEntries();
    }

    /**
     * Updates the internal WebGLRenderTarget.
     * The update will copy the newly introduced glyphs since the previous update.
     *
     * @param renderer - WebGLRenderer.
     */
    update(renderer: THREE.WebGLRenderer): void {
        let oldRenderTarget: THREE.RenderTarget | null = null;

        const willClearGeometry = this.m_clearGeometryDrawCount > 0;
        const willCopyGeometry = this.m_copyGeometryDrawCount > 0;

        if (willClearGeometry || willCopyGeometry) {
            oldRenderTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(this.m_rt);
        }

        if (willClearGeometry) {
            if (!this.m_clearMaterial) {
                this.m_clearMaterial = new GlyphClearMaterial({
                    rendererCapabilities: renderer.capabilities
                });
                this.m_clearMesh.material = this.m_clearMaterial;
            }

            if (this.m_clearGeometry.index === null) {
                throw new Error("GlyphTextureCache clear geometry index is uninitialized!");
            }
            this.m_clearPositionAttribute.needsUpdate = true;
            this.m_clearPositionAttribute.updateRange.offset = 0;
            this.m_clearPositionAttribute.updateRange.count = this.m_clearGeometryDrawCount * 8;
            this.m_clearGeometry.index.needsUpdate = true;
            this.m_clearGeometry.index.updateRange.offset = 0;
            this.m_clearGeometry.index.updateRange.count = this.m_clearGeometryDrawCount * 6;
            this.m_clearGeometry.setDrawRange(0, this.m_clearGeometryDrawCount * 6);

            this.m_clearMesh.visible = true;
            this.m_copyMesh.visible = false;

            renderer.render(this.m_scene, this.m_camera);
            this.m_clearGeometryDrawCount = 0;
            this.m_clearMesh.visible = false;
        }

        if (willCopyGeometry) {
            if (!this.m_copyMaterial) {
                this.m_copyMaterial = new GlyphCopyMaterial({
                    rendererCapabilities: renderer.capabilities
                });
                this.m_copyMesh.material = this.m_copyMaterial;
            }

            if (this.m_copyGeometry.index === null) {
                throw new Error("GlyphTextureCache copy geometry index is uninitialized!");
            }
            this.m_copyVertexBuffer.needsUpdate = true;
            this.m_copyVertexBuffer.updateRange.offset = 0;
            this.m_copyVertexBuffer.updateRange.count = this.m_copyGeometryDrawCount * 20;
            this.m_copyGeometry.index.needsUpdate = true;
            this.m_copyGeometry.index.updateRange.offset = 0;
            this.m_copyGeometry.index.updateRange.count = this.m_copyGeometryDrawCount * 6;
            this.m_copyGeometry.setDrawRange(0, this.m_copyGeometryDrawCount * 6);

            this.m_copyMesh.visible = true;
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

                renderer.render(this.m_scene, this.m_camera);
            }
            this.m_copyTextureSet.clear();
            this.m_copyGeometryDrawCount = 0;
        }
        if (willClearGeometry || willCopyGeometry) {
            renderer.setRenderTarget(oldRenderTarget);
        }
    }

    private initCacheEntries() {
        const dummyMetrics: FontMetrics = {
            size: 0,
            distanceRange: 0,
            base: 0,
            lineHeight: 0,
            lineGap: 0,
            capHeight: 0,
            xHeight: 0
        };
        const dummyFont: Font = {
            name: "",
            metrics: dummyMetrics,
            charset: ""
        };

        const dummyGlyphData = new GlyphData(
            0,
            "",
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            THREE.Texture.DEFAULT_IMAGE,
            dummyFont
        );

        for (let i = 0; i < this.m_cacheHeight; i++) {
            for (let j = 0; j < this.m_cacheWidth; j++) {
                const dummyEntry: GlyphCacheEntry = {
                    glyphData: dummyGlyphData,
                    location: new THREE.Vector2(j, i)
                };
                this.m_entryCache.set(`Dummy_${i * this.m_cacheHeight + j}`, dummyEntry);
            }
        }
    }

    private copyGlyphToCache(hash: string, glyph: GlyphData, cacheLocation: THREE.Vector2) {
        this.m_copyTextureSet.add(glyph.texture);
        let copyTextureIndex = 0;
        for (const value of this.m_copyTextureSet.values()) {
            if (value === glyph.texture) {
                break;
            }
            copyTextureIndex++;
        }
        glyph.copyIndex = copyTextureIndex;

        this.m_copyTransform.set(
            1.0,
            0.0,
            cacheLocation.x * this.entryWidth - glyph.offsetX,
            0.0,
            1.0,
            cacheLocation.y * this.entryHeight - glyph.positions[0].y,
            0.0,
            0.0,
            0.0
        );
        for (let i = 0; i < 4; ++i) {
            this.m_copyPositions[i].set(glyph.positions[i].x, glyph.positions[i].y);
            this.m_copyPositions[i].applyMatrix3(this.m_copyTransform);
        }

        if (this.m_copyGeometryDrawCount >= this.capacity) {
            return;
        }
        const baseVertex = this.m_copyGeometryDrawCount * 4;
        const baseIndex = this.m_copyGeometryDrawCount * 6;

        for (let i = 0; i < 4; ++i) {
            this.m_copyPositionAttribute.setXYZ(
                baseVertex + i,
                this.m_copyPositions[i].x,
                this.m_copyPositions[i].y,
                glyph.copyIndex
            );
            this.m_copyUVAttribute.setXY(
                baseVertex + i,
                glyph.sourceTextureCoordinates[i].x,
                glyph.sourceTextureCoordinates[i].y
            );
        }

        if (this.m_copyGeometry.index === null) {
            throw new Error("GlyphTextureCache copy geometry index is uninitialized!");
        }
        this.m_copyGeometry.index.setX(baseIndex, baseVertex);
        this.m_copyGeometry.index.setX(baseIndex + 1, baseVertex + 1);
        this.m_copyGeometry.index.setX(baseIndex + 2, baseVertex + 2);
        this.m_copyGeometry.index.setX(baseIndex + 3, baseVertex + 2);
        this.m_copyGeometry.index.setX(baseIndex + 4, baseVertex + 1);
        this.m_copyGeometry.index.setX(baseIndex + 5, baseVertex + 3);

        ++this.m_copyGeometryDrawCount;

        const u0 = this.m_copyPositions[0].x / this.m_textureSize.x;
        const v0 = this.m_copyPositions[0].y / this.m_textureSize.y;
        const u1 = this.m_copyPositions[3].x / this.m_textureSize.x;
        const v1 = this.m_copyPositions[3].y / this.m_textureSize.y;
        glyph.dynamicTextureCoordinates[0].set(u0, v0);
        glyph.dynamicTextureCoordinates[1].set(u1, v0);
        glyph.dynamicTextureCoordinates[2].set(u0, v1);
        glyph.dynamicTextureCoordinates[3].set(u1, v1);

        glyph.isInCache = true;
        this.m_entryCache.set(hash, {
            glyphData: glyph,
            location: cacheLocation
        });
    }

    private clearCacheEntry(entry: GlyphCacheEntry) {
        entry.glyphData.isInCache = false;
        this.m_copyPositions[0].set(
            entry.location.x * this.entryWidth,
            entry.location.y * this.entryHeight
        );
        this.m_copyPositions[1].set(
            (entry.location.x + 1) * this.entryWidth,
            entry.location.y * this.entryHeight
        );
        this.m_copyPositions[2].set(
            entry.location.x * this.entryWidth,
            (entry.location.y + 1) * this.entryHeight
        );
        this.m_copyPositions[3].set(
            (entry.location.x + 1) * this.entryWidth,
            (entry.location.y + 1) * this.entryHeight
        );

        if (this.m_clearGeometryDrawCount >= this.capacity) {
            return;
        }
        const baseVertex = this.m_clearGeometryDrawCount * 4;
        const baseIndex = this.m_clearGeometryDrawCount * 6;

        for (let i = 0; i < 4; ++i) {
            this.m_clearPositionAttribute.setXY(
                baseVertex + i,
                this.m_copyPositions[i].x,
                this.m_copyPositions[i].y
            );
        }

        if (this.m_clearGeometry.index === null) {
            throw new Error("GlyphTextureCache clear geometry index is uninitialized!");
        }
        this.m_clearGeometry.index.setX(baseIndex, baseVertex);
        this.m_clearGeometry.index.setX(baseIndex + 1, baseVertex + 1);
        this.m_clearGeometry.index.setX(baseIndex + 2, baseVertex + 2);
        this.m_clearGeometry.index.setX(baseIndex + 3, baseVertex + 2);
        this.m_clearGeometry.index.setX(baseIndex + 4, baseVertex + 1);
        this.m_clearGeometry.index.setX(baseIndex + 5, baseVertex + 3);

        ++this.m_clearGeometryDrawCount;
    }
}
