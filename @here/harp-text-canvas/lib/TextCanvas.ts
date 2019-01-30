/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { FontCatalog } from "./rendering/FontCatalog";
import { GlyphData } from "./rendering/GlyphData";
import { TextBufferObject } from "./rendering/TextBufferObject";
import { QUAD_VERTEX_MEMORY_FOOTPRINT, TextGeometry } from "./rendering/TextGeometry";
import { SdfTextMaterial } from "./rendering/TextMaterials";
import { FontVariant, TextLayoutStyle, TextRenderStyle } from "./rendering/TextStyle";
import { LineTypesetter } from "./typesetting/LineTypesetter";
import { PathTypesetter, PathTypesettingParameters } from "./typesetting/PathTypesetter";
import { TypesettingParameters } from "./typesetting/Typesetter";
import { createSdfTextMaterial } from "./utils/MaterialUtils";

const tempTextPosition = new THREE.Vector3();
const tempTextBounds = {
    array: [new THREE.Box2()],
    offset: 0
};
let tempVertexBuffer = new Float32Array();

interface TextPlacementParameters {
    input: string | GlyphData[];
    layer: TextCanvasLayer;
    textPath?: THREE.Path | THREE.CurvePath<THREE.Vector2>;
    textPathOverflow?: boolean;
    bounds?: THREE.Box2;
    individualBounds?: THREE.Box2[];
    computeTextBuffer?: boolean;
    letterCaseArray?: boolean[];
}

/**
 * Optional parameters passed on [[TextCanvas]].`measureText` function call.
 */
export interface MeasurementParameters {
    /**
     * Path where text should be placed on. Overrides the original position parameter.
     */
    path?: THREE.Path | THREE.CurvePath<THREE.Vector2>;

    /**
     * If `true`, text on a path will be placed even when its size its bigger than the path's size.
     */
    pathOverflow?: boolean;

    /**
     * Output per-character bounds.
     */
    outputCharacterBounds?: THREE.Box2[];

    /**
     * Array containing info on whether the glyphs are upper or lower case. Needed to support
     * `SmallCaps`.
     */
    letterCaseArray?: boolean[];
}

/**
 * Optional parameters passed on [[TextCanvas]].`addText` function call.
 */
export interface AdditionParameters {
    /**
     * Path where text should be placed on. Overrides the original position parameter.
     */
    path?: THREE.Path | THREE.CurvePath<THREE.Vector2>;

    /**
     * If `true`, text on a path will be placed even when its size its bigger than the path's size.
     */
    pathOverflow?: boolean;

    /**
     * Layer where text will be added.
     */
    layer?: number;

    /**
     * If `true`, the input position parameter will be updated to contain the position of the last
     * glyph added.
     */
    updatePosition?: boolean;

    /**
     * Object containing additional data intended to be retrieved during picking.
     */
    pickingData?: any;

    /**
     * Array containing info on whether the glyphs are upper or lower case. Needed to support
     * `SmallCaps`.
     */
    letterCaseArray?: boolean[];
}

/**
 * Optional parameters passed on [[TextCanvas]].`createTextBufferObject` function call.
 */
export interface TextBufferCreationParameters {
    /**
     * Path where text should be placed on. Overrides the original position parameter.
     */
    path?: THREE.Path | THREE.CurvePath<THREE.Vector2>;

    /**
     * If `true`, text on a path will be placed even when its size its bigger than the path's size.
     */
    pathOverflow?: boolean;

    /**
     * Output text bounding-box.
     */
    outputBounds?: boolean;

    /**
     * Output per-character bounds.
     */
    outputCharacterBounds?: boolean;
}

/**
 * Optional parameters passed on [[TextCanvas]].`addTextBufferObject` function call.
 */
export interface TextBufferAdditionParameters {
    layer?: number;
    position?: THREE.Vector3;
    scale?: number;
    rotation?: number;
    color?: THREE.Color;
    opacity?: number;
    backgroundColor?: THREE.Color;
    backgroundOpacity?: number;
    pickingData?: any;
}

/**
 * Default's [[TextCanvas]] layer identifier.
 */
export const DEFAULT_TEXT_CANVAS_LAYER = 0;

/**
 * [[TextCanvas]] rendering layer.
 */
export interface TextCanvasLayer {
    id: number;
    scene: THREE.Scene;
    geometry: TextGeometry;
}

/**
 * [[TextCanvas]] construction parameters.
 */
export interface TextCanvasParameters {
    /**
     * WebGLRenderer internally used by this `TextCanvas`.
     */
    renderer: THREE.WebGLRenderer;

    /**
     * Initial [[FontCatalog]].
     */
    fontCatalog: FontCatalog;

    /**
     * Maximum amount of glyphs this [[TextCanvas]] can render simultaneously.
     */
    maxGlyphCount: number;

    /**
     * Material used to render text.
     */
    material?: THREE.MeshMaterialType;

    /**
     * Material used to render text background.
     */
    backgroundMaterial?: THREE.MeshMaterialType;
}

/**
 * three.js text rendering engine which can manage and render high-quality, transformable, stylable
 * and properly layout SDF and MSDF text.
 */
export class TextCanvas {
    /**
     * Maximum amount of glyphs this [[TextCanvas]] can render simultaneously.
     */
    readonly maxGlyphCount: number;

    private m_renderer: THREE.WebGLRenderer;
    private m_fontCatalog: FontCatalog;

    private readonly m_defaultTextRenderStyle: TextRenderStyle;
    private m_currentTextRenderStyle: TextRenderStyle;
    private readonly m_defaultTextLayoutStyle: TextLayoutStyle;
    private m_currentTextLayoutStyle: TextLayoutStyle;

    private m_material: SdfTextMaterial | THREE.MeshMaterialType;
    private m_bgMaterial: SdfTextMaterial | THREE.MeshMaterialType;
    private m_ownsMaterial: boolean;
    private m_ownsBgMaterial: boolean;

    private m_defaultLayer: TextCanvasLayer;
    private m_layers: TextCanvasLayer[];

    private m_lineTypesetter: LineTypesetter;
    private m_pathTypesetter: PathTypesetter;

    /**
     * Constructs a new `TextCanvas`.
     *
     * @param params `TextCanvas` construction parameters.
     *
     * @returns New `TextCanvas`.
     */
    constructor(params: TextCanvasParameters) {
        this.m_renderer = params.renderer;
        this.m_fontCatalog = params.fontCatalog;
        this.maxGlyphCount = params.maxGlyphCount;

        if (params.material === undefined) {
            this.m_ownsMaterial = true;
            this.m_material = createSdfTextMaterial({ fontCatalog: params.fontCatalog });
        } else {
            this.m_ownsMaterial = false;
            this.m_material = params.material;
        }
        if (params.backgroundMaterial === undefined) {
            this.m_ownsBgMaterial = true;
            this.m_bgMaterial = createSdfTextMaterial({
                fontCatalog: params.fontCatalog,
                isBackground: true
            });
        } else {
            this.m_ownsBgMaterial = false;
            this.m_bgMaterial = params.backgroundMaterial;
        }

        this.m_defaultLayer = {
            id: DEFAULT_TEXT_CANVAS_LAYER,
            scene: new THREE.Scene(),
            geometry: new TextGeometry(this.m_material, this.m_bgMaterial, this.maxGlyphCount)
        };
        this.m_defaultLayer.scene.add(
            this.m_defaultLayer.geometry.backgroundMesh,
            this.m_defaultLayer.geometry.mesh
        );
        this.m_layers = [this.m_defaultLayer];

        this.m_defaultTextRenderStyle = new TextRenderStyle();
        this.m_currentTextRenderStyle = this.m_defaultTextRenderStyle;
        this.m_defaultTextLayoutStyle = new TextLayoutStyle();
        this.m_currentTextLayoutStyle = this.m_defaultTextLayoutStyle;

        this.m_lineTypesetter = new LineTypesetter();
        this.m_pathTypesetter = new PathTypesetter();
    }

    /**
     * Currently active [[FontCatalog]].
     */
    get fontCatalog(): FontCatalog {
        return this.m_fontCatalog;
    }
    set fontCatalog(value: FontCatalog) {
        this.m_fontCatalog = value;

        const material = this.m_material as THREE.RawShaderMaterial;
        material.uniforms.sdfTexture.value = this.m_fontCatalog.texture;
        material.uniforms.sdfParams.value = new THREE.Vector4(
            this.m_fontCatalog.textureSize.x,
            this.m_fontCatalog.textureSize.y,
            this.m_fontCatalog.size,
            this.m_fontCatalog.distanceRange
        );
        material.defines.MSDF = this.m_fontCatalog.type === "msdf" ? 1.0 : 0.0;

        const bgMaterial = this.m_bgMaterial as THREE.RawShaderMaterial;
        bgMaterial.uniforms.sdfTexture.value = this.m_fontCatalog.texture;
        bgMaterial.uniforms.sdfParams.value = new THREE.Vector4(
            this.m_fontCatalog.textureSize.x,
            this.m_fontCatalog.textureSize.y,
            this.m_fontCatalog.size,
            this.m_fontCatalog.distanceRange
        );
        bgMaterial.defines.MSDF = this.m_fontCatalog.type === "msdf" ? 1.0 : 0.0;
    }

    /**
     * Currently active text rendering material.
     */
    get material(): THREE.MeshMaterialType {
        return this.m_material;
    }
    set material(value: THREE.MeshMaterialType) {
        if (this.m_ownsMaterial) {
            this.m_material.dispose();
            this.m_ownsMaterial = false;
        }

        this.m_material = value;
        for (const layer of this.m_layers) {
            layer.geometry.mesh.material = this.m_material;
        }
    }

    /**
     * Currently active text background rendering material.
     */
    get backgroundMaterial(): THREE.MeshMaterialType {
        return this.m_bgMaterial;
    }
    set backgroundMaterial(value: THREE.MeshMaterialType) {
        if (this.m_ownsBgMaterial) {
            this.m_bgMaterial.dispose();
            this.m_ownsBgMaterial = false;
        }

        this.m_bgMaterial = value;
        for (const layer of this.m_layers) {
            layer.geometry.backgroundMesh.material = this.m_bgMaterial;
        }
    }

    /**
     * Currently active text rendering style.
     */
    get textRenderStyle(): TextRenderStyle {
        return this.m_currentTextRenderStyle;
    }
    set textRenderStyle(style: TextRenderStyle) {
        this.m_currentTextRenderStyle = style;
    }

    /**
     * Currently active text layout style.
     */
    get textLayoutStyle(): TextLayoutStyle {
        return this.m_currentTextLayoutStyle;
    }
    set textLayoutStyle(style: TextLayoutStyle) {
        this.m_currentTextLayoutStyle = style;
    }

    /**
     * Clears all the placed glyphs in this `TextCanvas` (as well as resetting the current style).
     */
    clear() {
        for (const layer of this.m_layers) {
            layer.geometry.clear();
        }
        this.m_currentTextRenderStyle = this.m_defaultTextRenderStyle;
    }

    /**
     * Renders the content of this `TextCanvas`.
     *
     * @param camera Orthographic camera.
     * @param target Optional render target.
     * @param clear Optional render target clear operation.
     */
    render(camera: THREE.OrthographicCamera, target?: THREE.WebGLRenderTarget, clear?: boolean) {
        this.m_fontCatalog.update(this.m_renderer);
        if (target !== undefined) {
            this.m_renderer.setRenderTarget(target);
        }
        if (clear === true) {
            this.m_renderer.clear(true);
        }
        for (const layer of this.m_layers) {
            layer.geometry.update();
            this.m_renderer.clear(false, true);
            this.m_renderer.render(layer.scene, camera, target);
        }
        this.m_renderer.setRenderTarget();
    }

    /**
     * Creates a new `TextCanvas` rendering layer and returns. If there was already a layer for the
     * input `layerId`, it just returns this one instead.
     *
     * @param layerId Desired layer identifier.
     *
     * @returns Created [[TextCanvasLayer]].
     */
    addLayer(layerId: number): TextCanvasLayer {
        let result = this.getLayer(layerId);
        if (result === undefined) {
            result = {
                id: layerId,
                scene: new THREE.Scene(),
                geometry: new TextGeometry(this.m_material, this.m_bgMaterial, this.maxGlyphCount)
            };
            result.scene.add(result.geometry.backgroundMesh, result.geometry.mesh);

            this.m_layers.push(result);
            this.m_layers.sort((a: TextCanvasLayer, b: TextCanvasLayer) => {
                return a.id - b.id;
            });
        }
        return result;
    }

    /**
     * Retrieves a specific `TextCanvas` rendering layer.
     *
     * @param layerId Desired layer identifier.
     *
     * @returns Selected [[TextCanvasLayer]].
     */
    getLayer(layerId: number): TextCanvasLayer | undefined {
        return this.m_layers.find(layer => layer.id === layerId);
    }

    /**
     * Retrieves all `TextCanvas` rendering layers.
     *
     * @returns Array of [[TextCanvasLayer]]s.
     */
    getAllLayers(): TextCanvasLayer[] {
        return this.m_layers;
    }

    /**
     * Returns the computed bounding box for the input text. The current [[TextRenderStyle]] and
     * [[TextLayoutStyle]] will influence the results of this function.
     *
     * @param text Input text. Provide an array of [[GlyphData]] for better performance.
     * @param outputBounds Output text bounding box.
     * @param params Optional measurement parameters.
     *
     * @returns Result of the measurement. If `false`, some error occurred during execution and the
     * input text couldn't be properly measured.
     */
    measureText(
        text: string | GlyphData[],
        outputBounds: THREE.Box2,
        params?: MeasurementParameters
    ): boolean {
        tempTextPosition.set(0, 0, 0);

        let path;
        let pathOverflow;
        let upperCaseArray;
        let outputCharacterBounds;
        if (params !== undefined) {
            path = params.path;
            pathOverflow = params.pathOverflow;
            outputCharacterBounds = params.outputCharacterBounds;
            if (params.path !== undefined) {
                const pathOrigin = params.path.getPoint(0);
                if (pathOrigin === null) {
                    return false;
                }
                tempTextPosition.set(pathOrigin.x, pathOrigin.y, 0.0);
            }
            if (params.letterCaseArray) {
                upperCaseArray = params.letterCaseArray;
            }
        }

        return this.placeText({
            input: text,
            layer: this.m_defaultLayer,
            textPath: path,
            textPathOverflow: pathOverflow,
            bounds: outputBounds,
            individualBounds: outputCharacterBounds,
            letterCaseArray: upperCaseArray
        });
    }

    /**
     * Adds the input text to this `TextCanvas` in the specified screen position. The current
     * [[TextRenderStyle]] and [[TextLayoutStyle]] will influence the results of this function.
     *
     * @param text Input text. Provide an array of [[GlyphData]] for better performance.
     * @param position Screen position.
     * @param params Optional addition parameters.
     *
     * @returns Result of the addition. If `false`, some error occurred during execution and the
     * input text couldn't be properly added.
     */
    addText(
        text: string | GlyphData[],
        position: THREE.Vector3,
        params?: AdditionParameters
    ): boolean {
        tempTextPosition.copy(position);

        let path;
        let pathOverflow;
        let upperCaseArray;
        let targetLayer = this.m_defaultLayer;
        if (params !== undefined) {
            path = params.path;
            pathOverflow = params.pathOverflow;
            if (params.layer !== undefined) {
                let tempLayer = this.getLayer(params.layer);
                if (tempLayer === undefined) {
                    tempLayer = this.addLayer(params.layer);
                }
                targetLayer = tempLayer;
            }
            if (params.path !== undefined) {
                tempTextPosition.set(0, 0, tempTextPosition.z);
            }
            if (params.letterCaseArray) {
                upperCaseArray = params.letterCaseArray;
            }
        }
        const prevDrawCount = targetLayer.geometry.drawCount;

        const result = this.placeText({
            input: text,
            textPath: path,
            textPathOverflow: pathOverflow,
            layer: targetLayer,
            letterCaseArray: upperCaseArray
        });
        if (result && params !== undefined) {
            if (params.updatePosition === true) {
                position.copy(tempTextPosition);
            }
            if (params.pickingData !== undefined) {
                targetLayer.geometry.addPickingData(
                    prevDrawCount,
                    targetLayer.geometry.drawCount,
                    params.pickingData
                );
            }
        } else if (!result) {
            (targetLayer.geometry as any).m_drawCount = prevDrawCount;
        }
        return result;
    }

    /**
     * Creates a new [[TextBufferObject]]. The computed text vertex buffer is equivalent to the
     * result of performing the `addText` function for the input text in the screen origin.
     *
     * @param text Input text.
     * @param params Optional creation parameters.
     *
     * @returns New [[TextBufferObject]] (or `undefined` if requested text glyphs couldn't be
     * retrieved from the current [[FontCatalog]]).
     */
    createTextBufferObject(
        text: string,
        params?: TextBufferCreationParameters
    ): TextBufferObject | undefined {
        tempTextPosition.set(0, 0, 0);

        const glyphArray = this.m_fontCatalog.getGlyphs(text, this.m_currentTextRenderStyle);
        if (glyphArray === undefined) {
            return undefined;
        }

        let path;
        let pathOverflow;
        let textBounds;
        let characterBounds;
        if (params !== undefined) {
            path = params.path;
            pathOverflow = params.pathOverflow;
            if (params.outputBounds === true) {
                textBounds = new THREE.Box2();
            }
            if (params.outputCharacterBounds === true) {
                characterBounds = [];
            }
        }

        this.placeText({
            input: glyphArray,
            layer: this.m_defaultLayer,
            computeTextBuffer: true,
            textPath: path,
            textPathOverflow: pathOverflow,
            bounds: textBounds,
            individualBounds: characterBounds
        });

        return new TextBufferObject(
            text,
            glyphArray,
            new Float32Array(tempVertexBuffer),
            this.m_currentTextRenderStyle,
            this.m_currentTextLayoutStyle,
            textBounds,
            characterBounds
        );
    }

    /**
     * Adds a previously created [[TextBufferObject]] to the `TextCanvas`. Additional parameters can
     * be provided to override the attributes stored in the buffer.
     *
     * @param textBufferObject [[TextBufferObject]] to add.
     * @param params Optional addition parameters.
     *
     * @returns Result of the addition. If `false`, some error occurred during execution and the
     * input text couldn't be properly added.
     */
    addTextBufferObject(
        textBufferObject: TextBufferObject,
        params?: TextBufferAdditionParameters
    ): boolean {
        let targetLayer = this.m_defaultLayer;
        let position;
        let scale;
        let rotation;
        let color;
        let opacity;
        let bgColor;
        let bgOpacity;

        if (params !== undefined) {
            if (params.layer !== undefined) {
                let tempLayer = this.getLayer(params.layer);
                if (tempLayer === undefined) {
                    tempLayer = this.addLayer(params.layer);
                }
                targetLayer = tempLayer;
            }
            position = params.position;
            scale = params.scale;
            rotation = params.rotation;
            color = params.color;
            opacity = params.opacity;
            bgColor = params.backgroundColor;
            bgOpacity = params.backgroundOpacity;
        }
        const prevDrawCount = targetLayer.geometry.drawCount;

        const result = targetLayer.geometry.addTextBufferObject(
            textBufferObject,
            position,
            scale,
            rotation,
            color,
            opacity,
            bgColor,
            bgOpacity
        );
        if (result && params !== undefined) {
            if (params.pickingData !== undefined) {
                targetLayer.geometry.addPickingData(
                    prevDrawCount,
                    targetLayer.geometry.drawCount,
                    params.pickingData
                );
            }
        } else if (!result) {
            (targetLayer.geometry as any).m_drawCount = prevDrawCount;
        }
        return result;
    }

    /**
     * Executes the `pickCallback` for all previously stored picking data for text covering the
     * specified screen position.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     */
    pickText(position: THREE.Vector2, callback: (pickData: any | undefined) => void): void {
        for (const layer of this.m_layers) {
            layer.geometry.pick(position, callback);
        }
    }

    // Places all glyphs for input text. Depending on parameters, it can store the resulting glyphs
    // in the current [[TextGeometry]] (or into a separate buffer) or compute the bounding box for
    // the input (as a whole or on a per-character basis).
    private placeText(params: TextPlacementParameters): boolean {
        if (params.input.length === 0 || this.m_currentTextLayoutStyle.maxLines! === 0) {
            if (params.bounds !== undefined) {
                params.bounds.min.set(0, 0);
                params.bounds.max.set(0, 0);
            }
            if (params.individualBounds !== undefined) {
                params.individualBounds.length = 0;
            }
            return true;
        }

        let glyphArray;
        let smallCapsTransformations: boolean[] | undefined;
        const smallCapsEnabled =
            this.m_currentTextRenderStyle.fontVariant === FontVariant.SmallCaps;
        if (typeof params.input !== "string") {
            glyphArray = params.input;
            if (params.letterCaseArray) {
                smallCapsTransformations = params.letterCaseArray;
            }
        } else {
            smallCapsTransformations = [];
            glyphArray = this.m_fontCatalog.getGlyphs(
                params.input,
                this.m_currentTextRenderStyle,
                smallCapsEnabled ? smallCapsTransformations : undefined
            );
            if (glyphArray === undefined) {
                return false;
            }
        }

        let glyphBounds;
        if (params.individualBounds !== undefined) {
            tempTextBounds.array = params.individualBounds;
            tempTextBounds.offset = 0;
            glyphBounds = tempTextBounds;
        }
        if (params.bounds !== undefined) {
            params.bounds.min.set(Infinity, Infinity);
            params.bounds.max.set(-Infinity, -Infinity);
        }
        if (params.computeTextBuffer === true) {
            tempVertexBuffer = new Float32Array(glyphArray.length * QUAD_VERTEX_MEMORY_FOOTPRINT);
        }

        const isPath = params.textPath !== undefined;
        const typesettingParams: TypesettingParameters | PathTypesettingParameters = {
            glyphs: glyphArray,
            fontCatalog: this.m_fontCatalog,
            textRenderStyle: this.m_currentTextRenderStyle,
            textLayoutStyle: this.m_currentTextLayoutStyle,
            position: tempTextPosition,
            geometry: params.layer.geometry,
            smallCapsArray: smallCapsEnabled ? smallCapsTransformations : undefined,
            globalBounds: params.bounds,
            individualBounds: glyphBounds,
            vertexBuffer: params.computeTextBuffer === true ? tempVertexBuffer : undefined
        };

        let result = true;
        if (isPath) {
            Object.assign(typesettingParams as PathTypesettingParameters, {
                path: params.textPath,
                pathOverflow: params.textPathOverflow === true
            });
            result = this.m_pathTypesetter.arrangeGlyphs(
                typesettingParams as PathTypesettingParameters
            );
        } else {
            result = this.m_lineTypesetter.arrangeGlyphs(typesettingParams);
        }
        if (glyphBounds !== undefined) {
            glyphBounds.array.length = glyphBounds.offset;
        }

        return result;
    }
}
