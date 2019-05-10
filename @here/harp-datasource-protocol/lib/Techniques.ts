/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BasicExtrudedLineTechniqueParams,
    DashedLineTechniqueParams,
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

/**
 * Names of the supported texure properties.
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

/**
 * Runtime representation of [[SquaresStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SquaresTechnique extends PointTechniqueParams {
    name: "squares";
}

/**
 * Runtime representation of [[CirclesStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface CirclesTechnique extends PointTechniqueParams {
    name: "circles";
}

/**
 * Runtime representation of [[PoiStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface PoiTechnique extends MarkerTechniqueParams {
    name: "labeled-icon";
}

/**
 * Runtime representation of [[LineMarkerStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface LineMarkerTechnique extends MarkerTechniqueParams {
    name: "line-marker";
}

/**
 * Runtime representation of [[SegmentsStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SegmentsTechnique extends SegmentsTechniqueParams {
    name: "segments";
}

/**
 * Runtime representation of [[BasicExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface BasicExtrudedLineTechnique extends BasicExtrudedLineTechniqueParams {
    name: "extruded-line";
}

/**
 * Runtime representation of [[StandardExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface StandardExtrudedLineTechnique extends StandardExtrudedLineTechniqueParams {
    name: "extruded-line";
}

/**
 * Runtime representation of [[SolidLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SolidLineTechnique extends SolidLineTechniqueParams {
    name: "solid-line";
}

/**
 * Runtime representation of [[DashedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface DashedLineTechnique extends DashedLineTechniqueParams {
    name: "dashed-line";
}

/**
 * Runtime representation of [[LineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface LineTechnique extends LineTechniqueParams {
    name: "line";
}

/**
 * Runtime representation of [[FillStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface FillTechnique extends FillTechniqueParams {
    name: "fill";
}

/**
 * Runtime representation of [[ExtrudedPolygonStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface ExtrudedPolygonTechnique extends ExtrudedPolygonTechniqueParams {
    name: "extruded-polygon";
}

/**
 * Runtime representation of [[TextTechniqueStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface TextTechnique extends TextTechniqueParams {
    name: "text";
}

/**
 * Technique used to render a mesh geometry.
 */
export interface StandardTechnique extends StandardTechniqueParams {
    name: "standard";
}

export interface ShaderTechnique extends ShaderTechniqueParams {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "shader";
}

/**
 * Technique used to render a terrain geometry with textures.
 */
export interface TerrainTechnique extends TerrainTechniqueParams {
    name: "terrain";
}

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
    | DashedLineTechnique
    | FillTechnique
    | StandardTechnique
    | TerrainTechnique
    | BasicExtrudedLineTechnique
    | StandardExtrudedLineTechnique
    | ExtrudedPolygonTechnique
    | ShaderTechnique
    | TextTechnique;
/**
 * Additional params used for optimized usage of `Techniques`.
 */
export interface IndexedTechniqueParams {
    /**
     * Optimization: Index into table in [[StyleSetEvaluator]] or in [[DecodedTile]].
     * @hidden
     */
    _index: number;
}

/**
 * For efficiency, [[StyleSetEvaluator]] returns [[Techniques]] additional params as defined in
 * [[IndexedTechniqueParams]].
 */
export type IndexedTechnique = Technique & IndexedTechniqueParams;

/**
 * Type guard to check if an object is an instance of [[CirclesTechnique]].
 */
export function isCirclesTechnique(technique: Technique): technique is CirclesTechnique {
    return technique.name === "circles";
}

/**
 * Type guard to check if an object is an instance of [[SquaresTechnique]].
 */
export function isSquaresTechnique(technique: Technique): technique is SquaresTechnique {
    return technique.name === "squares";
}

/**
 * Type guard to check if an object is an instance of [[PoiTechnique]].
 */
export function isPoiTechnique(technique: Technique): technique is PoiTechnique {
    return technique.name === "labeled-icon";
}

/**
 * Type guard to check if an object is an instance of [[LineMarkerTechnique]].
 */
export function isLineMarkerTechnique(technique: Technique): technique is LineMarkerTechnique {
    return technique.name === "line-marker";
}

/**
 * Type guard to check if an object is an instance of [[DashedLineTechnique]].
 */
export function isDashedLineTechnique(technique: Technique): technique is DashedLineTechnique {
    return technique.name === "dashed-line";
}

/**
 * Type guard to check if an object is an instance of [[LineTechnique]].
 */
export function isLineTechnique(technique: Technique): technique is LineTechnique {
    return technique.name === "line";
}

/**
 * Type guard to check if an object is an instance of [[SolidLineTechnique]].
 */
export function isSolidLineTechnique(technique: Technique): technique is SolidLineTechnique {
    return technique.name === "solid-line";
}

/**
 * Type guard to check if an object is an instance of [[SegmentsTechnique]].
 */
export function isSegmentsTechnique(technique: Technique): technique is SegmentsTechnique {
    return technique.name === "segments";
}

/**
 * Type guard to check if an object is an instance of [[BasicExtrudedLineTechnique]]
 * or [[StandardExtrudedLineTechnique]].
 */
export function isExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique | StandardExtrudedLineTechnique {
    return technique.name === "extruded-line";
}

/**
 * Type guard to check if an object is an instance of [[BasicExtrudedLineTechnique]].
 */
export function isBasicExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "basic";
}

/**
 * Type guard to check if an object is an instance of [[StandardExtrudedLineTechnique]].
 */
export function isStandardExtrudedLineTechnique(
    technique: Technique
): technique is StandardExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "standard";
}

/**
 * Type guard to check if an object is an instance of [[FillTechnique]].
 */
export function isFillTechnique(technique: Technique): technique is FillTechnique {
    return technique.name === "fill";
}

/**
 * Type guard to check if an object is an instance of [[ExtrudedPolygonTechnique]].
 */
export function isExtrudedPolygonTechnique(
    technique: Technique
): technique is ExtrudedPolygonTechnique {
    return technique.name === "extruded-polygon";
}

/**
 * Type guard to check if an object is an instance of [[StandardTechnique]].
 */
export function isStandardTechnique(technique: Technique): technique is StandardTechnique {
    return technique.name === "standard";
}

/**
 * Type guard to check if an object is an instance of [[TerrainTechnique]].
 */
export function isTerrainTechnique(technique: Technique): technique is TerrainTechnique {
    return technique.name === "terrain";
}

/**
 * Type guard to check if an object is an instance of [[TextTechnique]].
 */
export function isTextTechnique(technique: Technique): technique is TextTechnique {
    return technique.name === "text";
}

/**
 * Type guard to check if an object is an instance of [[ShaderTechnique]].
 */
export function isShaderTechnique(technique: Technique): technique is ShaderTechnique {
    return technique.name === "shader";
}

/**
 * Check if vertex normals should be generated for this technique (if no normals are in the data).
 * @param technique Technique to check.
 */
export function needsVertexNormals(technique: Technique): boolean {
    return (
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
    } else {
        return undefined;
    }
}

/**
 * Add all the buffers of the technique to the transfer list.
 */
export function addBuffersToTransferList(technique: Technique, transferList: ArrayBuffer[] = []) {
    if (
        isStandardTechnique(technique) ||
        isExtrudedPolygonTechnique(technique) ||
        isTerrainTechnique(technique)
    ) {
        for (const texturePropertyKey of TEXTURE_PROPERTY_KEYS) {
            const textureProperty = (technique as any)[texturePropertyKey];
            if (isTextureBuffer(textureProperty)) {
                transferList.push(textureProperty.buffer);
            }
        }
    }
}
