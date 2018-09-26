/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { TextMaterialParameters } from "@here/materials";
import { assert, LoggerManager } from "@here/utils";
import * as THREE from "three";

import { FontCatalog, TextStyle } from "./FontCatalog";
import { GLYPH_CACHE_TEXTURE_SIZE, GlyphTextureCache } from "./GlyphTextureCache";
import { BoxBufferMesh, TextBuffer } from "./TextBuffer";

const logger = LoggerManager.instance.create("TextRenderer");

/**
 * General render order for [[TextElement]]s. Selects the scene to render from.
 * @see [[SceneSet]]
 */
export const DEFAULT_TEXT_RENDER_ORDER = 0;

// Render the text in front of the icons (icon renderOrder = 0). Render the FG text after the BG
// (outline) text.
export const BG_TEXT_RENDER_ORDER = DEFAULT_TEXT_RENDER_ORDER + 0.1;
const FG_TEXT_RENDER_ORDER = BG_TEXT_RENDER_ORDER + 0.000000001;

/**
 * Name of the default [[TextStyle]] used when no other is specified.
 */
export const DEFAULT_STYLE_NAME = "default";

/**
 * Name of the default [[FontCatalog]] used when no other is specified.
 */
export const DEFAULT_FONT_CATALOG_NAME = "default";

/*
 * This container aggregates geometry, style and buffer of a [[TextStyle]].
 */
export class TextRenderBuffer {
    /**
     * Creates a new `TextRenderBuffer`.
     *
     * @param textBuffer [[TextBuffer]] which will hold the box data for all glyphs to be rendered.
     * @param textStyle [[TextStyle]] to be used when rendering this `TextRenderBuffer`.
     * @param renderOrder Optional renderOrder of this buffer.
     */
    constructor(
        readonly textBuffer: TextBuffer,
        readonly textStyle: TextStyle,
        readonly renderOrder = DEFAULT_TEXT_RENDER_ORDER
    ) {}

    /**
     * Resets the [[TextBuffer]] stored in this `TextRenderBuffer`.
     */
    reset(): void {
        this.textBuffer.reset();
    }

    /**
     * Clears the [[BufferGeometry]] stored in this `TextRenderBuffer`.
     */
    dispose(): void {
        this.textBuffer.dispose();
    }

    /**
     * Updates the [[BufferGeometry]] stored in this `TextRenderBuffer`.
     */
    updateBufferGeometry(): void {
        this.textBuffer.updateBufferGeometry();
    }

    /**
     * Check if the buffer is empty. If it is empty, the memory usage is minimized to reduce
     * footprint.
     */
    cleanUp(): void {
        this.textBuffer.cleanUp();
    }

    /**
     * Determine if the mesh is empty.
     */
    get isEmpty(): boolean {
        return this.textBuffer.isEmpty;
    }
}

/**
 * Type for materials that can be used to render a [[TextRenderBuffer]].
 */
export type TextMaterialConstructor = new (params: TextMaterialParameters) => THREE.Material;

/**
 * The `SceneSet` manages a [[Scene]] for every TextRenderBuffer with a specific renderOrder. The
 * integer part of the renderOrder is taken as the index to the set. Within that set, the
 * `renderOrder` of the elements are handled by ThreeJS, but may not be effective in tilted map
 * views.
 */
export class SceneSet {
    readonly scenes: Map<number, THREE.Scene> = new Map();
    readonly sortedScenes: THREE.Scene[] = [];
    /**
     * Return the [[Scene]] for the specified `renderOrder`.
     *
     * @param renderOrder RenderOrder index of the scene. The integer part of the renderOrder is
     *              taken as the index to the set.
     * @returns The [[Scene]] for the index. A [[Scene]] is created if it does not exist.
     */
    getScene(renderOrder = 0): THREE.Scene {
        const renderOrderInt = Math.floor(renderOrder);
        let scene = this.scenes.get(renderOrderInt);
        if (scene === undefined) {
            scene = new THREE.Scene();
            this.scenes.set(renderOrderInt, scene);
            this.sortedScenes.length = 0;
            const scenes = new Map([...this.scenes.entries()].sort());
            scenes.forEach(myScene => {
                this.sortedScenes.push(myScene);
            });
        }

        return scene;
    }
}

/**
 * Class responsible of managing and executing text rendering.
 */
export class TextRenderer {
    /**
     * Separate [[SceneSet]] only used for text rendering. Every scene is rendered individually.
     */
    readonly sceneSet = new SceneSet();

    /**
     * Map holding bindings between the different [[TextRenderBuffer]] used to render all the
     * supported [[TextStyle]]s.
     */
    readonly renderBuffers: Map<string, Map<number, TextRenderBuffer>>;

    /**
     * Map holding bindings between the different [[GlyphTextureCache]] used to render all the
     * supported [[FontCatalog]]s.
     */
    readonly glyphCaches: Map<string, GlyphTextureCache>;

    /**
     * Array of supported [[FontCatalog]]s by this `TextRenderer`.
     */
    fontCatalogs: string[] = [];

    private m_defaultRenderBuffer?: Map<number, TextRenderBuffer>;
    private m_defaultGlyphCache?: GlyphTextureCache;

    /**
     * Creates a new `TextRenderer`.
     *
     * @param styles Array of supported [[TextStyles]] by this `TextRenderer`.
     * @param materialConstructor Material used to render text.
     */
    constructor(
        readonly styles?: TextStyle[],
        readonly materialConstructor?: TextMaterialConstructor
    ) {
        this.renderBuffers = new Map();
        this.glyphCaches = new Map();

        if (styles !== undefined && materialConstructor !== undefined) {
            this.addFontCatalogStyles(styles, materialConstructor);
        }
    }

    /**
     * Returns the [[TextRenderBuffer]] for the default [[TextStyle]].
     *
     * @param renderOrder Optional renderOrder defaults to `0`.
     */
    defaultTextRenderBuffer(renderOrder = DEFAULT_TEXT_RENDER_ORDER): TextRenderBuffer | undefined {
        if (
            this.m_defaultRenderBuffer !== undefined &&
            this.m_defaultRenderBuffer.get(renderOrder) !== undefined
        ) {
            return this.m_defaultRenderBuffer.get(renderOrder);
        }
        this.m_defaultRenderBuffer = this.renderBuffers.get(DEFAULT_STYLE_NAME);
        if (this.m_defaultRenderBuffer !== undefined) {
            return this.m_defaultRenderBuffer.get(renderOrder);
        }
        return undefined;
    }

    /**
     * Returns the [[GlyphTextureCache]] for the default [[Font]].
     */
    get defaultGlyphTextureCache(): GlyphTextureCache | undefined {
        if (this.m_defaultGlyphCache) {
            return this.m_defaultGlyphCache;
        }
        this.m_defaultGlyphCache = this.glyphCaches.get(DEFAULT_FONT_CATALOG_NAME);
        return this.m_defaultGlyphCache;
    }

    /**
     * Returns an array containing all [[TextRenderBuffer]]s stored in this `TextRenderer`.
     */
    get buffers(): TextBuffer[] {
        const buffers: TextBuffer[] = [];
        this.renderBuffers.forEach(textObject => {
            textObject.forEach(buffer => {
                buffers.push(buffer.textBuffer);
            });
        });
        return buffers;
    }

    /**
     * Returns the [[TextRenderBuffer]] used by a certain [[TextStyle]].
     *
     * @param style `String` holding the [[TextStyle]]'s name.
     * @param renderOrder Optional renderOrder.
     */
    getTextRendererBufferForStyle(
        style: string | undefined,
        renderOrder = DEFAULT_TEXT_RENDER_ORDER
    ): TextRenderBuffer | undefined {
        if (style === undefined) {
            return this.defaultTextRenderBuffer(renderOrder);
        }

        const renderBuffer = this.renderBuffers.get(style);

        if (renderBuffer !== undefined) {
            const buffer = renderBuffer.get(renderOrder);
            if (buffer === undefined) {
                return this.addOrderedTextBuffer(renderBuffer, renderOrder);
            }
            return buffer;
        }

        if (this.m_defaultRenderBuffer !== undefined) {
            return this.m_defaultRenderBuffer.get(renderOrder);
        }
        return undefined;
    }

    /**
     * Returns the [[GlyphTextureCache]] used by a certain [[FontCatalog]].
     *
     * @param font `String` holding the [[FontCatalog]]'s name.
     */
    getGlyphTextureCacheForFontCatalog(fontCatalog?: string): GlyphTextureCache | undefined {
        if (fontCatalog === undefined) {
            return this.defaultGlyphTextureCache;
        }

        const glyphCache = this.glyphCaches.get(fontCatalog);

        if (glyphCache !== undefined) {
            return glyphCache;
        }

        return this.defaultGlyphTextureCache;
    }

    /**
     * Clears the [[TextBuffer]] for all the [[TextRenderBuffer]]s in this `TextRenderer`.
     */
    dispose(): void {
        this.renderBuffers.forEach(renderBuffer => {
            renderBuffer.forEach(buffer => {
                buffer.dispose();
            });
        });
    }

    /**
     * Resets the [[BufferGeometry]] for all the [[TextRenderBuffer]]s in this `TextRenderer`.
     */
    reset(): void {
        this.renderBuffers.forEach(renderBuffer => {
            renderBuffer.forEach(buffer => {
                buffer.reset();
            });
        });
    }

    /**
     * Updates the [[BufferGeometry]] for all the [[TextRenderBuffer]]s in this `TextRenderer`.
     */
    update(): void {
        this.renderBuffers.forEach(renderBuffer => {
            renderBuffer.forEach(buffer => {
                buffer.updateBufferGeometry();
            });
        });
    }

    /**
     * Renders all the [[TextRenderBuffers]] stored in this `TextRenderer`.
     *
     * @param renderer [[WebGLRenderer]] used for rendering.
     * @param camera Camera used for rendering.
     * @param animationRunning `true` if camera is moving or an animation is running. If set to
     *          `true` expensive operations should not be executed.
     */
    render(
        renderer: THREE.WebGLRenderer,
        camera: THREE.OrthographicCamera,
        animationRunning: boolean
    ): void {
        for (const scene of this.sceneSet.sortedScenes) {
            // Since clearing the depth buffer and rendering the mesh is so expensive, we check if
            // there is something to be rendered in the scenes. It can be assumed that only meshes
            // from BoxBuffers or TextBuffers are in those scenes.

            let hasContent = false;
            if (scene.children.length > 0) {
                for (const node of scene.children) {
                    if (node.type === "BoxBufferMesh") {
                        const mesh = node as BoxBufferMesh;
                        mesh.visible = !mesh.isEmpty;
                        hasContent = hasContent || mesh.visible;
                    }
                }
            }
            if (!hasContent) {
                // Nothing to render -> skip this scene
                continue;
            }
            renderer.clearDepth();
            renderer.render(scene, camera);
        }

        if (!animationRunning) {
            this.renderBuffers.forEach(renderBuffer => {
                renderBuffer.forEach(buffer => {
                    buffer.cleanUp();
                });
            });
        }
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * [[TextElement]]s are found, the order of the results is unspecified.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     */
    pickTextElements(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void
    ) {
        for (const renderBuffer of this.renderBuffers.values()) {
            renderBuffer.forEach(buffer => {
                buffer.textBuffer.pickBoxes(screenPosition, pickCallback);
            });
        }
    }

    private addFontCatalogStyles(
        styles: TextStyle[],
        materialConstructor: TextMaterialConstructor
    ): void {
        const usedFontCatalogs = new Set<FontCatalog>();
        styles.forEach(style => {
            if (style.fontCatalog === undefined) {
                logger.warn(`No 'fontCatalog' defined in style:`, style);
                return;
            }
            usedFontCatalogs.add(style.fontCatalog);
        });
        usedFontCatalogs.forEach(fontCatalog => {
            const textCache: GlyphTextureCache = new GlyphTextureCache(fontCatalog);
            this.glyphCaches.set(fontCatalog.name, textCache);
            this.fontCatalogs.push(fontCatalog.name);
        });

        styles.forEach(style => {
            if (style.fontCatalog === undefined) {
                logger.warn(`No 'fontCatalog' defined in style:`, style);
            }
            if (style.name === undefined) {
                logger.warn(`No 'name' defined in style:`, style);
            }
            if (style.fontCatalog === undefined || style.name === undefined) {
                return;
            }

            const fontCatalogTexture = this.glyphCaches.get(style.fontCatalog.name);
            if (fontCatalogTexture === undefined) {
                logger.error(
                    `GlyphCacheTexture not properly set up for fontCatalog: `,
                    style.fontCatalog.name
                );
                return;
            }

            const params: TextMaterialParameters = {
                texture: fontCatalogTexture.texture,
                textureSize: GLYPH_CACHE_TEXTURE_SIZE
            };
            const textMaterial = new materialConstructor(params);
            const outlineParams: TextMaterialParameters = {
                texture: fontCatalogTexture.texture,
                textureSize: GLYPH_CACHE_TEXTURE_SIZE,
                bgColor: style.bgColor,
                bgFactor: style.bgFactor,
                bgAlpha: style.bgAlpha
            };
            const outlineMaterial = new materialConstructor(outlineParams);

            const textBuffer: TextBuffer = new TextBuffer(
                textMaterial,
                outlineMaterial,
                DEFAULT_TEXT_RENDER_ORDER
            );
            const buffers = new Map<number, TextRenderBuffer>();
            const textRenderBuffer = new TextRenderBuffer(
                textBuffer,
                style,
                DEFAULT_TEXT_RENDER_ORDER
            );

            buffers.set(DEFAULT_TEXT_RENDER_ORDER, textRenderBuffer);
            this.renderBuffers.set(style.name, buffers);

            this.initTextBuffer(textRenderBuffer, DEFAULT_TEXT_RENDER_ORDER);
        });
    }

    private addOrderedTextBuffer(
        renderBuffer: Map<number, TextRenderBuffer>,
        renderOrder: number
    ): TextRenderBuffer {
        const defaultRenderBuffer = renderBuffer.get(0);
        assert(defaultRenderBuffer !== undefined);

        const clonedTextBuffer = defaultRenderBuffer!.textBuffer.clone();

        const textRenderBuffer = new TextRenderBuffer(
            clonedTextBuffer,
            defaultRenderBuffer!.textStyle,
            defaultRenderBuffer!.renderOrder
        );

        renderBuffer.set(renderOrder, textRenderBuffer);

        this.initTextBuffer(textRenderBuffer, renderOrder);

        return textRenderBuffer;
    }

    private initTextBuffer(textRenderBuffer: TextRenderBuffer, renderOrder: number) {
        const mesh = textRenderBuffer.textBuffer.mesh;
        const outlineMesh = textRenderBuffer.textBuffer.outlineMesh;
        mesh.frustumCulled = false;
        outlineMesh.frustumCulled = false;

        mesh.renderOrder = FG_TEXT_RENDER_ORDER + renderOrder;
        outlineMesh.renderOrder = BG_TEXT_RENDER_ORDER + renderOrder;

        const scene = this.sceneSet.getScene(renderOrder);
        assert(scene !== undefined);
        if (scene !== undefined) {
            scene.add(mesh, outlineMesh);
        }
    }
}
