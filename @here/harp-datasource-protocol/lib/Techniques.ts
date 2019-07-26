/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BaseTechniqueParams,
    BasicExtrudedLineTechniqueParams,
    DashedLineTechniqueParams,
    ExtrudedPolygonTechniqueParams,
    FillTechniqueParams,
    isTextureBuffer,
    LineTechniqueParams,
    MarkerTechniqueParams,
    PointTechniqueParams,
    PolygonalTechniqueParams,
    SegmentsTechniqueParams,
    ShaderTechniqueParams,
    SolidLineTechniqueParams,
    StandardExtrudedLineTechniqueParams,
    StandardTechniqueParams,
    TerrainTechniqueParams,
    TextTechniqueParams,
    TextureCoordinateType
} from "./TechniqueParams";

import { RemoveInterpolatedPropDef, RemoveJsonExpr } from "./DecodedTechnique";
import { DynamicTechniqueExpr } from "./DynamicTechniqueExpr";
import { JsonExpr } from "./Expr";
import {
    mergeTechniqueDescriptor,
    TechniqueDescriptor,
    TechniqueDescriptorRegistry
} from "./TechniqueDescriptor";
/**
 * Names of the supported texture properties.
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

export type MakeTechniqueAttrs<T> = {
    [P in keyof T]?: (T[P] | JsonExpr) extends T[P]
        ? RemoveInterpolatedPropDef<RemoveJsonExpr<T[P]>> | DynamicTechniqueExpr
        : T[P];
} & { _cacheKey: string };

export const techniqueDescriptors: TechniqueDescriptorRegistry = {};

export const baseTechniqueParamsDescriptor: TechniqueDescriptor<BaseTechniqueParams> = {
    featurePropNames: [],
    techniquePropNames: ["renderOrder"],
    dynamicPropNames: ["fadeFar", "fadeNear"]
};

export const pointTechniquePropTypes = mergeTechniqueDescriptor<PointTechniqueParams>(
    baseTechniqueParamsDescriptor,
    {
        techniquePropNames: ["texture", "enablePicking"],
        dynamicPropNames: ["color", "transparent", "opacity"]
    }
);

/**
 * Runtime representation of [[SquaresStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SquaresTechnique extends MakeTechniqueAttrs<PointTechniqueParams> {
    name: "squares";
}

export const squaresTechniquePropTypes = mergeTechniqueDescriptor<SquaresTechnique>(
    baseTechniqueParamsDescriptor,
    pointTechniquePropTypes
);
techniqueDescriptors.squares = squaresTechniquePropTypes;

/**
 * Runtime representation of [[CirclesStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface CirclesTechnique extends MakeTechniqueAttrs<PointTechniqueParams> {
    name: "circles";
}

export const circlesTechniquePropTypes = mergeTechniqueDescriptor<CirclesTechnique>(
    baseTechniqueParamsDescriptor,
    pointTechniquePropTypes
);
techniqueDescriptors.circles = circlesTechniquePropTypes;

/**
 * Runtime representation of [[PoiStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface PoiTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "labeled-icon";
}

/**
 * Runtime representation of [[LineMarkerStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface LineMarkerTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "line-marker";
}

/**
 * Runtime representation of [[SegmentsStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SegmentsTechnique extends MakeTechniqueAttrs<SegmentsTechniqueParams> {
    name: "segments";
}

const polygonalTechniqueDescriptor: TechniqueDescriptor<PolygonalTechniqueParams> = {
    featurePropNames: [],
    techniquePropNames: [],
    dynamicPropNames: [
        "polygonOffset",
        "polygonOffsetFactor",
        "polygonOffsetUnits",
        "lineColor",
        "lineFadeNear",
        "lineFadeFar"
    ]
};
/**
 * Runtime representation of [[BasicExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface BasicExtrudedLineTechnique
    extends MakeTechniqueAttrs<BasicExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of [[StandardExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface StandardExtrudedLineTechnique
    extends MakeTechniqueAttrs<StandardExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of [[SolidLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SolidLineTechnique extends MakeTechniqueAttrs<SolidLineTechniqueParams> {
    name: "solid-line";
}

export const solidLineTechniqueDescriptor = mergeTechniqueDescriptor<SolidLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        techniquePropNames: ["clipping", "secondaryRenderOrder"],
        dynamicPropNames: ["color", "opacity", "transparent", "lineWidth", "secondaryColor"]
    }
);
techniqueDescriptors["solid-line"] = solidLineTechniqueDescriptor;

/**
 * Runtime representation of [[DashedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface DashedLineTechnique extends MakeTechniqueAttrs<DashedLineTechniqueParams> {
    name: "dashed-line";
}

export const dashedLineTechniqueDescriptor = mergeTechniqueDescriptor<DashedLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        techniquePropNames: ["clipping"],
        dynamicPropNames: ["color", "opacity", "transparent", "lineWidth", "dashSize", "gapSize"]
    }
);

techniqueDescriptors["dashed-line"] = dashedLineTechniqueDescriptor;

/**
 * Runtime representation of [[LineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface LineTechnique extends MakeTechniqueAttrs<LineTechniqueParams> {
    name: "line";
}

export const lineTechniqueDescriptor = mergeTechniqueDescriptor<LineTechnique>(
    baseTechniqueParamsDescriptor,
    {
        // TODO, check, which are really dynamic !
        dynamicPropNames: ["color", "lineWidth", "opacity", "transparent"]
    }
);

techniqueDescriptors.line = lineTechniqueDescriptor;

/**
 * Runtime representation of [[FillStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface FillTechnique extends MakeTechniqueAttrs<FillTechniqueParams> {
    name: "fill";
}

const fillTechniqueDescriptor = mergeTechniqueDescriptor<FillTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        dynamicPropNames: ["color", "opacity", "transparent", "lineWidth"]
    }
);
techniqueDescriptors.fill = fillTechniqueDescriptor;

/**
 * Technique used to render a mesh geometry.
 */
export interface StandardTechnique extends MakeTechniqueAttrs<StandardTechniqueParams> {
    name: "standard";
}
const standardTechniqueDescriptor = mergeTechniqueDescriptor<StandardTechnique>(
    baseTechniqueParamsDescriptor,
    {
        featurePropNames: ["color", "vertexColors"],
        techniquePropNames: [
            "map",
            "mapProperties",
            "normalMap",
            "normalMapProperties",
            "displacementMap",
            "displacementMapProperties",
            "roughnessMap",
            "roughnessMapProperties",
            "emissiveMap",
            "emissiveMapProperties",
            "bumpMap",
            "bumpMapProperties",
            "metalnessMap",
            "metalnessMapProperties",
            "alphaMap",
            "alphaMapProperties"
        ],
        dynamicPropNames: [
            "wireframe",
            "roughness",
            "metalness",
            "alphaTest",
            "depthTest",
            "transparent",
            "opacity",
            "emissive",
            "emissiveIntensity",
            "refractionRatio"
        ]
    }
);
techniqueDescriptors.standard = standardTechniqueDescriptor;

/**
 * Runtime representation of [[ExtrudedPolygonStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface ExtrudedPolygonTechnique
    extends MakeTechniqueAttrs<ExtrudedPolygonTechniqueParams> {
    name: "extruded-polygon";
}

const extrudedPolygonTechniqueDescriptor = mergeTechniqueDescriptor<ExtrudedPolygonTechnique>(
    baseTechniqueParamsDescriptor,
    standardTechniqueDescriptor,
    {
        featurePropNames: [
            "height",
            "minHeight",
            "color",
            "defaultColor",
            "defaultHeight",
            "constantHeight",
            "boundaryWalls",
            "footprint",
            "maxSlope"
        ],
        techniquePropNames: ["enableDepthPrePass", "lineColorMix", "animateExtrusionDuration"],
        dynamicPropNames: [
            "animateExtrusion",
            "opacity",
            "transparent",
            "lineWidth",
            "lineColor",
            "lineFadeNear",
            "lineFadeFar"
        ]
    }
);
techniqueDescriptors["extruded-polygon"] = extrudedPolygonTechniqueDescriptor;
/**
 * Runtime representation of [[TextStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface TextTechnique extends MakeTechniqueAttrs<TextTechniqueParams> {
    name: "text";
}

const textTechniqueDescriptor = mergeTechniqueDescriptor<TextTechnique>(
    baseTechniqueParamsDescriptor,
    {
        featurePropNames: ["useAbbreviation", "useIsoCode"],
        techniquePropNames: [
            "minZoomLevel",
            "maxZoomLevel",
            "distanceScale",
            "mayOverlap",
            "reserveSpace",
            "textFadeTime",
            "xOffset",
            "yOffset",
            "style",
            "fontName",
            "fontStyle",
            "fontVariant",
            "rotation",
            "tracking",
            "leading",
            "maxLines",
            "lineWidth",
            "canvasRotation",
            "lineRotation",
            "wrappingMode",
            "hAlignment",
            "vAlignment"
        ],
        dynamicPropNames: [
            "backgroundColor",
            "backgroundSize",
            "backgroundOpacity",
            "color",
            "opacity",
            "priority",
            "size"
        ]
    }
);
techniqueDescriptors.text = textTechniqueDescriptor;

export interface ShaderTechnique extends MakeTechniqueAttrs<ShaderTechniqueParams> {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "shader";
}

const shaderTechniqueDescriptor = mergeTechniqueDescriptor<ShaderTechnique>(
    baseTechniqueParamsDescriptor,
    {
        featurePropNames: [],
        techniquePropNames: ["primitive"],
        dynamicPropNames: ["params"]
    }
);

techniqueDescriptors.shader = shaderTechniqueDescriptor;

/**
 * Technique used to render a terrain geometry with textures.
 */
export interface TerrainTechnique extends MakeTechniqueAttrs<TerrainTechniqueParams> {
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

    /**
     * Optimization: Unique [[Technique]] index of [[Style]] from which technique was derived.
     * @hidden
     */
    _styleSetIndex: number;
}

/**
 * For efficiency, [[StyleSetEvaluator]] returns [[Techniques]] additional params as defined in
 * [[IndexedTechniqueParams]].
 */
export type IndexedTechnique = Technique & IndexedTechniqueParams;

export interface TechniqueLike {
    name: IndexedTechnique["name"];
}

/**
 * Type guard to check if an object is an instance of [[CirclesTechnique]].
 */
export function isCirclesTechnique(technique: TechniqueLike): technique is CirclesTechnique {
    return technique.name === "circles";
}

/**
 * Type guard to check if an object is an instance of [[SquaresTechnique]].
 */
export function isSquaresTechnique(technique: TechniqueLike): technique is SquaresTechnique {
    return technique.name === "squares";
}

/**
 * Type guard to check if an object is an instance of [[PoiTechnique]].
 */
export function isPoiTechnique(technique: TechniqueLike): technique is PoiTechnique {
    return technique.name === "labeled-icon";
}

/**
 * Type guard to check if an object is an instance of [[LineMarkerTechnique]].
 */
export function isLineMarkerTechnique(technique: TechniqueLike): technique is LineMarkerTechnique {
    return technique.name === "line-marker";
}

/**
 * Type guard to check if an object is an instance of [[DashedLineTechnique]].
 */
export function isDashedLineTechnique(technique: TechniqueLike): technique is DashedLineTechnique {
    return technique.name === "dashed-line";
}

/**
 * Type guard to check if an object is an instance of [[LineTechnique]].
 */
export function isLineTechnique(technique: TechniqueLike): technique is LineTechnique {
    return technique.name === "line";
}

/**
 * Type guard to check if an object is an instance of [[SolidLineTechnique]].
 */
export function isSolidLineTechnique(technique: TechniqueLike): technique is SolidLineTechnique {
    return technique.name === "solid-line";
}

/**
 * Type guard to check if an object is an instance of [[SegmentsTechnique]].
 */
export function isSegmentsTechnique(technique: TechniqueLike): technique is SegmentsTechnique {
    return technique.name === "segments";
}

/**
 * Type guard to check if an object is an instance of [[BasicExtrudedLineTechnique]]
 * or [[StandardExtrudedLineTechnique]].
 */
export function isExtrudedLineTechnique(
    technique: TechniqueLike
): technique is BasicExtrudedLineTechnique | StandardExtrudedLineTechnique {
    return technique.name === "extruded-line";
}

/**
 * Type guard to check if an object is an instance of [[BasicExtrudedLineTechnique]].
 */
export function isBasicExtrudedLineTechnique(
    technique: TechniqueLike
): technique is BasicExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "basic";
}

/**
 * Type guard to check if an object is an instance of [[StandardExtrudedLineTechnique]].
 */
export function isStandardExtrudedLineTechnique(
    technique: TechniqueLike
): technique is StandardExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "standard";
}

/**
 * Type guard to check if an object is an instance of [[FillTechnique]].
 */
export function isFillTechnique(technique: TechniqueLike): technique is FillTechnique {
    return technique.name === "fill";
}

/**
 * Type guard to check if an object is an instance of [[ExtrudedPolygonTechnique]].
 */
export function isExtrudedPolygonTechnique(
    technique: TechniqueLike
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
export function isTextTechnique(technique: TechniqueLike): technique is TextTechnique {
    return technique.name === "text";
}

/**
 * Type guard to check if an object is an instance of [[ShaderTechnique]].
 */
export function isShaderTechnique(technique: TechniqueLike): technique is ShaderTechnique {
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
export function addBuffersToTransferList(technique: IndexedTechnique, transferList: ArrayBuffer[]) {
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
 * @param imageName base name of the marker icon.
 * @param technique the technique describing POI or line marker.
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
