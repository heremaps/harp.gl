/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { FontCatalog } from "./rendering/FontCatalog";
import { GlyphData } from "./rendering/GlyphData";
import { TextGeometry } from "./rendering/TextGeometry";
import { SdfTextMaterial } from "./rendering/TextMaterials";
import {
    DefaultLayoutStyle,
    DefaultTextStyle,
    FontStyle,
    FontVariant,
    LayoutStyle,
    TextStyle
} from "./rendering/TextStyle";
import { LineTypesetter } from "./typesetting/LineTypesetter";
import { PathTypesetter, PathTypesettingParameters } from "./typesetting/PathTypesetter";
import { TypesettingParameters } from "./typesetting/Typesetter";
import { createSdfTextMaterial } from "./utils/MaterialUtils";

const tempTextPosition = new THREE.Vector3();

interface TextPlacementParameters {
    inputText: string;
    layer: TextCanvasLayer;
    textPath?: THREE.Path | THREE.CurvePath<THREE.Vector2>;
    bounds?: THREE.Box2;
    individualBounds?: THREE.Box2[];
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
     * Output per-character bounds.
     */
    outputCharacterBounds?: THREE.Box2[];
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

    private readonly m_defaultTextStyle: TextStyle;
    private m_currentTextStyle: TextStyle;
    private readonly m_defaultLayoutStyle: LayoutStyle;
    private m_currentLayoutStyle: LayoutStyle;

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

        this.m_defaultTextStyle = DefaultTextStyle.initializeTextStyle();
        this.m_currentTextStyle = this.m_defaultTextStyle;
        this.m_defaultLayoutStyle = DefaultLayoutStyle.initializeLayoutStyle();
        this.m_currentLayoutStyle = this.m_defaultLayoutStyle;

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
    get style(): TextStyle {
        return this.m_currentTextStyle;
    }
    set style(style: TextStyle) {
        this.m_currentTextStyle = {
            ...this.m_defaultTextStyle,
            ...style
        };
    }

    /**
     * Currently active text layout style.
     */
    get layoutStyle(): LayoutStyle {
        return this.m_currentLayoutStyle;
    }
    set layoutStyle(style: LayoutStyle) {
        this.m_currentLayoutStyle = {
            ...this.m_defaultLayoutStyle,
            ...style
        };
    }

    /**
     * Clears all the placed glyphs in this `TextCanvas` (as well as resetting the current style).
     */
    clear() {
        for (const layer of this.m_layers) {
            layer.geometry.clear();
        }
        this.m_currentTextStyle = this.m_defaultTextStyle;
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
     * Returns the computed bounding box for the input text. The current [[TextStyle]] and
     * [[LayoutStyle]] will influence the results of this function.
     *
     * @param text Input text.
     * @param outputBounds Output text bounding box.
     * @param params Optional measurement parameters.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    measureText(text: string, outputBounds: THREE.Box2, params?: MeasurementParameters): boolean {
        let outputCharacterBounds;
        let path;

        if (params !== undefined) {
            path = params.path;
            outputCharacterBounds = params.outputCharacterBounds;

            if (params.path !== undefined) {
                const pathOrigin = params.path.getPoint(0);
                if (pathOrigin === null) {
                    return false;
                }
                tempTextPosition.set(pathOrigin.x, pathOrigin.y, 0.0);
            } else {
                tempTextPosition.set(0, 0, 0);
            }
        }

        return this.placeText({
            inputText: text,
            layer: this.m_defaultLayer,
            textPath: path,
            bounds: outputBounds,
            individualBounds: outputCharacterBounds
        });
    }

    /**
     * Adds the input text to this `TextCanvas` in the specified screen position. The current
     * [[TextStyle]] and [[LayoutStyle]] will influence the results of this function.
     *
     * @param text Input text.
     * @param position Screen position.
     * @param params Optional addition parameters.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    addText(text: string, position: THREE.Vector3, params?: AdditionParameters): boolean {
        tempTextPosition.copy(position);

        let path;
        let targetLayer = this.m_defaultLayer;

        if (params !== undefined) {
            path = params.path;

            if (params.layer !== undefined) {
                let tempLayer = this.getLayer(params.layer);
                if (tempLayer === undefined) {
                    tempLayer = this.addLayer(params.layer);
                }
                targetLayer = tempLayer;
            }

            if (params.path !== undefined) {
                tempTextPosition.set(0, 0, 0);
            }
        }
        const pickingOffset = targetLayer.geometry.drawCount;

        const result = this.placeText({
            inputText: text,
            textPath: path,
            layer: targetLayer
        });
        if (result && params !== undefined) {
            if (params.updatePosition === true) {
                position.copy(tempTextPosition);
            }
            if (params.pickingData !== undefined) {
                targetLayer.geometry.addPickingData(
                    pickingOffset,
                    targetLayer.geometry.drawCount,
                    params.pickingData
                );
            }
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

    // Adds a new layer to the TextCanvas when requested.
    private addLayer(layerId: number): TextCanvasLayer {
        const newLayer = {
            id: layerId,
            scene: new THREE.Scene(),
            geometry: new TextGeometry(this.m_material, this.m_bgMaterial, this.maxGlyphCount)
        };
        newLayer.scene.add(newLayer.geometry.backgroundMesh, newLayer.geometry.mesh);

        this.m_layers.push(newLayer);
        this.m_layers.sort((a: TextCanvasLayer, b: TextCanvasLayer) => {
            return a.id - b.id;
        });

        return newLayer;
    }

    // Places all glyphs for input text. Depending on parameters, it can store the resulting glyphs
    // in the current [[TextGeometry]] (or into a separate buffer) or compute the bounding box for
    // the input (as a whole or on a per-character basis).
    private placeText(params: TextPlacementParameters): boolean {
        if (params.inputText.length <= 0 || this.m_currentLayoutStyle.maxLines! === 0) {
            if (params.bounds !== undefined) {
                params.bounds.min.set(0, 0);
                params.bounds.max.set(0, 0);
            }
            if (params.individualBounds !== undefined) {
                params.individualBounds.length = 0;
            }
            return true;
        }

        const glyphArray: GlyphData[] = [];
        const transformationArray: boolean[] = [];
        if (
            !this.getGlyphData(
                params.inputText,
                this.m_currentTextStyle.font!,
                this.m_currentTextStyle.fontStyle!,
                this.m_currentTextStyle.fontVariant!,
                this.m_fontCatalog,
                glyphArray,
                transformationArray
            )
        ) {
            return false;
        }

        const glyphBounds =
            params.individualBounds !== undefined
                ? {
                      array: params.individualBounds,
                      offset: 0
                  }
                : undefined;
        if (params.bounds !== undefined) {
            params.bounds.min.set(Infinity, Infinity);
            params.bounds.max.set(-Infinity, -Infinity);
        }

        const isPath = params.textPath !== undefined;
        const typesettingParams: TypesettingParameters | PathTypesettingParameters = {
            glyphDataArray: glyphArray,
            glyphTransformationArray: transformationArray,
            fontCatalog: this.m_fontCatalog,
            textStyle: this.m_currentTextStyle,
            layoutStyle: this.m_currentLayoutStyle,
            position: tempTextPosition,
            geometry: params.layer.geometry,
            globalBounds: params.bounds,
            individualBounds: glyphBounds
        };

        let result = true;
        if (isPath) {
            Object.assign(typesettingParams as PathTypesettingParameters, {
                path: params.textPath
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

    // Retrieves all the glyphs corresponding for the input text and current set [[TextStyle]], as
    // well as information on which glyphs have been transformed (lowercase -> uppercase). As
    // retrieving this information can be a slow proccess, this should be done only once before
    // typesetting (which uses the results from this function to correctly arrange all glyphs).
    private getGlyphData(
        input: string,
        fontName: string,
        fontStyle: FontStyle,
        fontVariant: FontVariant,
        fontCatalog: FontCatalog,
        outputGlyphArray: GlyphData[],
        outputGlyphTransformationData: boolean[]
    ): boolean {
        for (const character of input) {
            const shouldTransform =
                fontVariant === FontVariant.AllCaps || fontVariant === FontVariant.SmallCaps;
            const transformedCharacter = shouldTransform ? character.toUpperCase() : character;
            for (const char of transformedCharacter) {
                const codePoint = shouldTransform ? char.codePointAt(0)! : char.codePointAt(0)!;
                const font = fontCatalog.getFont(codePoint, fontName);
                const glyphData = fontCatalog.getGlyph(codePoint, font, fontStyle);
                if (glyphData !== undefined) {
                    outputGlyphArray.push(glyphData);
                    outputGlyphTransformationData.push(codePoint !== character.codePointAt(0));
                } else {
                    return false;
                }
            }
        }

        return true;
    }
}
