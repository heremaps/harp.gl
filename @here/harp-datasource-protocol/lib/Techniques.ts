/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr, JsonExpr } from "./Expr";
import { InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import {
    BaseTechniqueParams,
    BasicExtrudedLineTechniqueParams,
    ExtrudedPolygonTechniqueParams,
    FillTechniqueParams,
    isTextureBuffer,
    LineTechniqueParams,
    MarkerTechniqueParams,
    PointTechniqueParams,
    SegmentsTechniqueParams,
    ShaderTechniqueParams,
    SolidLineTechniqueParams,
    StandardExtrudedLineTechniqueParams,
    StandardTechniqueParams,
    TerrainTechniqueParams,
    TextTechniqueParams,
    TextureCoordinateType
} from "./TechniqueParams";
import { StylePriority } from "./Theme";

/**
 * Names of the supported texture properties.
 * @internal
 */
export const TEXTURE_PROPERTY_KEYS = [
    "map",
    "normalMap",
    "displacementMap",
    "roughnessMap",
    "emissiveMap",
    "alphaMap",
    "metalnessMap",
    "bumpMap"
];

// TODO: Can be removed, when all when interpolators are implemented as {@link Expr}s
type RemoveInterpolatedPropDef<T> = T | InterpolatedPropertyDefinition<any> extends T
    ? Exclude<T, InterpolatedPropertyDefinition<any>>
    : T;
type RemoveJsonExpr<T> = T | JsonExpr extends T ? Exclude<T, JsonExpr> : T;

/**
 * Make runtime representation of technique attributes from JSON-compatible typings.
 *
 * Translates
 *  - InterpolatedPropertyDefinition -> InterpolatedProperty
 *  - JsonExpr -> Expr
 */
export type MakeTechniqueAttrs<T> = {
    [P in keyof T]: T[P] | JsonExpr extends T[P]
        ? RemoveInterpolatedPropDef<RemoveJsonExpr<T[P]>> | Expr
        : T[P];
};

/**
 * Possible techniques that can be used to draw a geometry on the map.
 */
export type Technique =
    | SquaresTechnique
    | CirclesTechnique
    | PoiTechnique
    | LineMarkerTechnique
    | LineTechnique
    | SegmentsTechnique
    | SolidLineTechnique
    | FillTechnique
    | StandardTechnique
    | TerrainTechnique
    | BasicExtrudedLineTechnique
    | StandardExtrudedLineTechnique
    | ExtrudedPolygonTechnique
    | ShaderTechnique
    | TextTechnique
    | LabelRejectionLineTechnique;

/**
 * Runtime representation of `SquaresStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `PointTechniqueParams`.
 */
export interface SquaresTechnique extends MakeTechniqueAttrs<PointTechniqueParams> {
    name: "squares";
}

/**
 * Runtime representation of `CirclesStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `PointTechniqueParams`.
 */
export interface CirclesTechnique extends MakeTechniqueAttrs<PointTechniqueParams> {
    name: "circles";
}

/**
 * Runtime representation of `PoiStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `MarkerTechniqueParams`.
 */
export interface PoiTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "labeled-icon";
}

/**
 * Runtime representation of `LineMarkerStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `MarkerTechniqueParams`.
 */
export interface LineMarkerTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "line-marker";
}

/**
 * Runtime representation of `SegmentsStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `SegmentsTechniqueParams`.
 */
export interface SegmentsTechnique extends MakeTechniqueAttrs<SegmentsTechniqueParams> {
    name: "segments";
}

/**
 * Runtime representation of `BasicExtrudedLineStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `BasicExtrudedLineTechniqueParams`.
 */
export interface BasicExtrudedLineTechnique
    extends MakeTechniqueAttrs<BasicExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of `StandardExtrudedLineStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `StandardExtrudedLineTechniqueParams`.
 */
export interface StandardExtrudedLineTechnique
    extends MakeTechniqueAttrs<StandardExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of `SolidLineStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `SolidLineTechniqueParams`.
 */
export interface SolidLineTechnique extends MakeTechniqueAttrs<SolidLineTechniqueParams> {
    name: "solid-line" | "dashed-line";
}

/**
 * Runtime representation of `LineStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `LineTechniqueParams`.
 */
export interface LineTechnique extends MakeTechniqueAttrs<LineTechniqueParams> {
    name: "line";
}

/**
 * Runtime representation of `FillStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `FillTechniqueParams`.
 */
export interface FillTechnique extends MakeTechniqueAttrs<FillTechniqueParams> {
    name: "fill";
}

/**
 * Technique used to render a mesh geometry.
 * For technique parameters see `StandardTechniqueParams`.
 */
export interface StandardTechnique extends MakeTechniqueAttrs<StandardTechniqueParams> {
    name: "standard";
}

/**
 * Runtime representation of `ExtrudedPolygonStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `ExtrudedPolygonTechniqueParams`.
 */
export interface ExtrudedPolygonTechnique
    extends MakeTechniqueAttrs<ExtrudedPolygonTechniqueParams> {
    name: "extruded-polygon";
}

/**
 * Runtime representation of `TextStyle` as parsed by `StyleSetEvaluator`.
 * For technique parameters see `TextTechniqueParams`.
 */
export interface TextTechnique extends MakeTechniqueAttrs<TextTechniqueParams> {
    name: "text";
}

/**
 * Special technique for user-defined shaders.
 * For technique parameters see `ShaderTechniqueParams`.
 */
export interface ShaderTechnique extends MakeTechniqueAttrs<ShaderTechniqueParams> {
    name: "shader";
}

/**
 * Technique used to render a terrain geometry with textures.
 * For technique parameters see `TerrainTechniqueParams`.
 */
export interface TerrainTechnique extends MakeTechniqueAttrs<TerrainTechniqueParams> {
    name: "terrain";
}

/**
 * Technique to avoid label rendering on top of certain line geometries.
 * For technique parameters see `BaseTechniqueParams`.
 */
export interface LabelRejectionLineTechnique extends MakeTechniqueAttrs<BaseTechniqueParams> {
    name: "label-rejection-line";
}

/**
 * Names of the properties controlling transparency.
 * @internal
 */
export const TRANSPARENCY_PROPERTY_KEYS = ["opacity", "transparent"];

/**
 * Additional params used for optimized usage of `Techniques`.
 */
export interface IndexedTechniqueParams {
    /**
     * Optimization: Index into table in `StyleSetEvaluator` or in `DecodedTile`.
     * @hidden
     */
    _index: number;

    /**
     * Optimization: Unique `Technique` index of `Style` from which technique was derived.
     * @hidden
     */
    _styleSetIndex: number;

    /**
     * The styleSet associated to this `Technique`.
     * @hidden
     */
    _styleSet?: string;

    /**
     * The category used to assign render orders to objects created using this `Technique`.
     * @hidden
     */
    _category?: string;

    /**
     * The category used to assign render orders to secondary objects
     * created using this `Technique`.
     * @hidden
     */
    _secondaryCategory?: string;

    /**
     * `true` if any of the properties of this technique needs to access
     * the feature's state.
     *
     * @hidden
     */
    _usesFeatureState?: boolean;

    /**
     * Last computed state derived from [[Technique.kind]].
     */
    _kindState?: boolean;
}

/**
 * For efficiency, `StyleSetEvaluator` returns `Techniques` additional params as defined in
 * `IndexedTechniqueParams`.
 */
export type IndexedTechnique = Technique & IndexedTechniqueParams;

/**
 * Type guard to check if an object is an instance of `CirclesTechnique`.
 */
export function isCirclesTechnique(technique: Technique): technique is CirclesTechnique {
    return technique.name === "circles";
}

/**
 * Type guard to check if an object is an instance of `SquaresTechnique`.
 */
export function isSquaresTechnique(technique: Technique): technique is SquaresTechnique {
    return technique.name === "squares";
}

/**
 * Type guard to check if an object is an instance of `PoiTechnique`.
 */
export function isPoiTechnique(technique: Technique): technique is PoiTechnique {
    return technique.name === "labeled-icon";
}

/**
 * Type guard to check if an object is an instance of `LineMarkerTechnique`.
 */
export function isLineMarkerTechnique(technique: Technique): technique is LineMarkerTechnique {
    return technique.name === "line-marker";
}

/**
 * Type guard to check if an object is an instance of `LineTechnique`.
 */
export function isLineTechnique(technique: Technique): technique is LineTechnique {
    return technique.name === "line";
}

/**
 * Type guard to check if an object is an instance of `SolidLineTechnique`.
 */
export function isSolidLineTechnique(technique: Technique): technique is SolidLineTechnique {
    return technique.name === "solid-line" || technique.name === "dashed-line";
}

/**
 * Type guard to check if an object is an instance of `SolidLineTechnique` and is a kind that
 * has special dashes.
 * @note Lines with special dashes need line caps to render properly.
 */
export function isSpecialDashesLineTechnique(
    technique: Technique
): technique is SolidLineTechnique {
    return (
        (technique.name === "solid-line" || technique.name === "dashed-line") &&
        technique.dashes !== undefined &&
        technique.dashes !== "Square"
    );
}

/**
 * Type guard to check if an object is an instance of `SegmentsTechnique`.
 */
export function isSegmentsTechnique(technique: Technique): technique is SegmentsTechnique {
    return technique.name === "segments";
}

/**
 * Type guard to check if an object is an instance of `BasicExtrudedLineTechnique`
 * or `StandardExtrudedLineTechnique`.
 */
export function isExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique | StandardExtrudedLineTechnique {
    return technique.name === "extruded-line";
}

/**
 * Type guard to check if an object is an instance of `BasicExtrudedLineTechnique`.
 */
export function isBasicExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "basic";
}

/**
 * Type guard to check if an object is an instance of `StandardExtrudedLineTechnique`.
 */
export function isStandardExtrudedLineTechnique(
    technique: Technique
): technique is StandardExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "standard";
}

/**
 * Type guard to check if an object is an instance of `FillTechnique`.
 */
export function isFillTechnique(technique: Technique): technique is FillTechnique {
    return technique.name === "fill";
}

/**
 * Type guard to check if an object is an instance of `ExtrudedPolygonTechnique`.
 */
export function isExtrudedPolygonTechnique(
    technique: Technique
): technique is ExtrudedPolygonTechnique {
    return technique.name === "extruded-polygon";
}

/**
 * Type guard to check if an object is an instance of `StandardTechnique`.
 */
export function isStandardTechnique(technique: Technique): technique is StandardTechnique {
    return technique.name === "standard";
}

/**
 * Type guard to check if an object is an instance of `TerrainTechnique`.
 */
export function isTerrainTechnique(technique: Technique): technique is TerrainTechnique {
    return technique.name === "terrain";
}

/**
 * Type guard to check if an object is an instance of `TextTechnique`.
 */
export function isTextTechnique(technique: Technique): technique is TextTechnique {
    return technique.name === "text";
}

/**
 * Type guard to check if an object is an instance of `ShaderTechnique`.
 */
export function isShaderTechnique(technique: Technique): technique is ShaderTechnique {
    return technique.name === "shader";
}

export function isLabelRejectionLineTechnique(
    technique: Technique
): technique is LabelRejectionLineTechnique {
    return technique.name === "label-rejection-line";
}

/**
 * Check if vertex normals should be generated for this technique (if no normals are in the data).
 * @param technique - Technique to check.
 */
export function needsVertexNormals(technique: Technique): boolean {
    return (
        isExtrudedPolygonTechnique(technique) ||
        isFillTechnique(technique) ||
        isStandardTechnique(technique) ||
        isTerrainTechnique(technique) ||
        isStandardExtrudedLineTechnique(technique)
    );
}

/**
 * Get the texture coordinate type if the technique supports it.
 */
export function textureCoordinateType(technique: Technique): TextureCoordinateType | undefined {
    if (isStandardTechnique(technique)) {
        return technique.textureCoordinateType;
    } else if (isExtrudedPolygonTechnique(technique)) {
        return technique.textureCoordinateType;
    } else if (isTerrainTechnique(technique)) {
        return technique.textureCoordinateType;
    } else if (isShaderTechnique(technique)) {
        return technique.textureCoordinateType;
    } else {
        return undefined;
    }
}

/**
 * Add all the buffers of the technique to the transfer list.
 */
export function addBuffersToTransferList(technique: Technique, transferList: ArrayBuffer[]) {
    if (
        isStandardTechnique(technique) ||
        isExtrudedPolygonTechnique(technique) ||
        isTerrainTechnique(technique)
    ) {
        for (const texturePropertyKey of TEXTURE_PROPERTY_KEYS) {
            const textureProperty = (technique as any)[texturePropertyKey];
            if (isTextureBuffer(textureProperty)) {
                if (textureProperty.buffer instanceof ArrayBuffer) {
                    transferList.push(textureProperty.buffer);
                }
            }
        }
    }
}

/**
 * Compose full texture name for given image name with technique specified.
 * Some techniques allows to add prefix/postfix to icons names specified, this
 * function uses technique information to create fully qualified texture name.
 * @param imageName - base name of the marker icon.
 * @param technique - the technique describing POI or line marker.
 * @returns fully qualified texture name for loading from atlas (without extension).
 */
export function composeTechniqueTextureName(
    imageName: string,
    technique: PoiTechnique | LineMarkerTechnique
): string {
    let textureName = imageName;
    if (typeof technique.imageTexturePrefix === "string") {
        textureName = technique.imageTexturePrefix + textureName;
    }
    if (typeof technique.imageTexturePostfix === "string") {
        textureName = textureName + technique.imageTexturePostfix;
    }
    return textureName;
}

/**
 * Sets a technique's render order (or priority for screen-space techniques) depending on its
 * category and the priorities specified in a given theme.
 * @param technique- The technique whose render order or priority will be set.
 * @param theme - The theme from which the category priorities will be taken.
 */
export function setTechniqueRenderOrderOrPriority(
    technique: IndexedTechnique,
    priorities: StylePriority[],
    labelPriorities: string[]
) {
    if (
        isTextTechnique(technique) ||
        isPoiTechnique(technique) ||
        isLineMarkerTechnique(technique)
    ) {
        // for screen-space techniques the `category` is used to assign
        // priorities.
        if (labelPriorities && typeof technique._category === "string") {
            // override the `priority` when the technique uses `category`.
            const priority = labelPriorities.indexOf(technique._category);
            if (priority !== -1) {
                technique.priority = labelPriorities.length - priority;
            }
        }
    } else if (priorities && technique._styleSet !== undefined) {
        // Compute the render order based on the style category and styleSet.
        const computeRenderOrder = (category: string): number | undefined => {
            const priority = priorities?.findIndex(
                entry => entry.group === technique._styleSet && entry.category === category
            );

            return priority !== undefined && priority !== -1 ? (priority + 1) * 10 : undefined;
        };

        if (typeof technique._category === "string") {
            // override the renderOrder when the technique is using categories.
            const renderOrder = computeRenderOrder(technique._category);

            if (renderOrder !== undefined) {
                technique.renderOrder = renderOrder;
            }
        }

        if (typeof technique._secondaryCategory === "string") {
            // override the secondaryRenderOrder when the technique is using categories.
            const secondaryRenderOrder = computeRenderOrder(technique._secondaryCategory);

            if (secondaryRenderOrder !== undefined) {
                (technique as any).secondaryRenderOrder = secondaryRenderOrder;
            }
        }
    }
}
