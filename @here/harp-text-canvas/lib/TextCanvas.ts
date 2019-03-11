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
    textPath?: THREE.Path | THREE.CurvePath<THREE.Vector2>;
    bounds?: THREE.Box2;
    individualBounds?: THREE.Box2[];
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

    private readonly m_textScene: THREE.Scene;
    private m_textGeometry: TextGeometry;
    private m_material: SdfTextMaterial | THREE.MeshMaterialType;
    private m_bgMaterial: SdfTextMaterial | THREE.MeshMaterialType;
    private m_ownsMaterial: boolean;
    private m_ownsBgMaterial: boolean;

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

        this.m_textGeometry = new TextGeometry(
            this.m_material,
            this.m_bgMaterial,
            this.maxGlyphCount
        );
        this.m_textScene = new THREE.Scene();
        this.m_textScene.add(this.m_textGeometry.backgroundMesh, this.m_textGeometry.mesh);

        this.m_defaultTextStyle = DefaultTextStyle.initializeTextStyle();
        this.m_currentTextStyle = this.m_defaultTextStyle;
        this.m_defaultLayoutStyle = DefaultLayoutStyle.initializeLayoutStyle();
        this.m_currentLayoutStyle = this.m_defaultLayoutStyle;

        this.m_lineTypesetter = new LineTypesetter();
        this.m_pathTypesetter = new PathTypesetter();
    }

    /**
     * Count of glyphs currently in the `TextCanvas`.
     */
    get glyphCount(): number {
        return this.m_textGeometry.drawCount;
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
        this.m_textGeometry.mesh.material = this.m_material;
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
        this.m_textGeometry.backgroundMesh.material = this.m_bgMaterial;
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
        this.m_textGeometry.clear();
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
        this.m_textGeometry.update();
        this.m_renderer.render(this.m_textScene, camera, target, clear);
    }

    /**
     * Returns the computed bounding box for the input text. The current [[TextStyle]] and
     * [[LayoutStyle]] will influence the results of this function.
     *
     * @param text Input text.
     * @param outputBounds Output text bounding box.
     * @param outputCharacterBounds Output per-character bounds.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    measureText(
        text: string,
        outputBounds: THREE.Box2,
        outputCharacterBounds?: THREE.Box2[]
    ): boolean {
        tempTextPosition.set(0, 0, 0);
        return this.placeText({
            inputText: text,
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
     * @param updatePosition If `true`, the position will be set to match the end of the added text.
     * @param pickingData Object containing additional data intended to be retrieved during picking.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    addText(
        text: string,
        position: THREE.Vector3,
        updatePosition?: boolean,
        pickingData?: any
    ): boolean {
        tempTextPosition.copy(position);
        const pickingOffset = this.m_textGeometry.drawCount;

        const result = this.placeText({ inputText: text });
        if (result) {
            if (updatePosition === true) {
                position.copy(tempTextPosition);
            }
            if (pickingData !== undefined) {
                this.m_textGeometry.addPickingData(
                    pickingOffset,
                    this.m_textGeometry.drawCount,
                    pickingData
                );
            }
        }

        return result;
    }

    /**
     * Returns the computed bounding box for the input path text. The current [[TextStyle]] and
     * [[LayoutStyle]] will influence the results of this function.
     *
     * @param text Input text.
     * @param path Path text should be placed on.
     * @param outputBounds Output text bounding box.
     * @param outputCharacterBounds Output per-character bounds.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    measurePathText(
        text: string,
        path: THREE.Path | THREE.CurvePath<THREE.Vector2>,
        outputBounds: THREE.Box2,
        outputCharacterBounds?: THREE.Box2[]
    ): boolean {
        const pathOrigin = path.getPoint(0);
        if (pathOrigin === null) {
            return false;
        }
        tempTextPosition.set(pathOrigin.x, pathOrigin.y, 0.0);

        return this.placeText({
            inputText: text,
            textPath: path,
            bounds: outputBounds,
            individualBounds: outputCharacterBounds
        });
    }

    /**
     * Adds the input text to this `TextCanvas` following the specified path. The current
     * [[TextStyle]] and [[LayoutStyle]] will influence the results of this function.
     *
     * @param text Input text.
     * @param path Path text should be placed on.
     * @param pickingData Object containing additional data intended to be retrieved during picking.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    addPathText(
        text: string,
        path: THREE.Path | THREE.CurvePath<THREE.Vector2>,
        pickingData?: any
    ): boolean {
        tempTextPosition.set(0, 0, 0);
        const pickingOffset = this.m_textGeometry.drawCount;

        const result = this.placeText({
            inputText: text,
            textPath: path
        });
        if (result && pickingData !== undefined) {
            this.m_textGeometry.addPickingData(
                pickingOffset,
                this.m_textGeometry.drawCount,
                pickingData
            );
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
        this.m_textGeometry.pick(position, callback);
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
            geometry: this.m_textGeometry,
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
