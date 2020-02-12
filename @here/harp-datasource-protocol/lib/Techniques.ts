/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BaseTechniqueParams,
    BasicExtrudedLineTechniqueParams,
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

import { Expr, JsonExpr } from "./Expr";
import { InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import {
    AttrScope,
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

/**
 * Names of the properties controlling transparency.
 */
export const TRANSPARENCY_PROPERTY_KEYS = ["opacity", "transparent"];

// TODO: Can be removed, when all when interpolators are implemented as [[Expr]]s
export type RemoveInterpolatedPropDef<T> = T | InterpolatedPropertyDefinition<any> extends T
    ? Exclude<T, InterpolatedPropertyDefinition<any>>
    : T;
export type RemoveJsonExpr<T> = T | JsonExpr extends T ? Exclude<T, JsonExpr> : T;

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

export const techniqueDescriptors: TechniqueDescriptorRegistry = {};

export const baseTechniqueParamsDescriptor: TechniqueDescriptor<BaseTechniqueParams> = {
    // TODO: Choose which techniques should support color with transparency.
    // For now we chosen all, but it maybe not suitable for text or line marker techniques.
    attrTransparencyColor: "color",
    attrScopes: {
        renderOrder: AttrScope.TechniqueGeometry,
        renderOrderOffset: AttrScope.TechniqueGeometry,
        enabled: AttrScope.TechniqueGeometry,
        kind: AttrScope.TechniqueGeometry,
        transient: AttrScope.TechniqueGeometry,
        fadeFar: AttrScope.TechniqueRendering,
        fadeNear: AttrScope.TechniqueRendering
    }
};

export const pointTechniquePropTypes = mergeTechniqueDescriptor<PointTechniqueParams>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            texture: AttrScope.TechniqueGeometry,
            enablePicking: AttrScope.TechniqueGeometry,
            color: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueGeometry
        }
    }
);

/**
 * Runtime representation of [[SquaresStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[PointTechniqueParams]].
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
 * For technique parameters see [[PointTechniqueParams]].
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
 * For technique parameters see [[MarkerTechniqueParams]].
 */
export interface PoiTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "labeled-icon";
}

/**
 * Runtime representation of [[LineMarkerStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[MarkerTechniqueParams]].
 */
export interface LineMarkerTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "line-marker";
}

const lineMarkerTechniquePropTypes = mergeTechniqueDescriptor<LineMarkerTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            text: AttrScope.FeatureGeometry,
            label: AttrScope.FeatureGeometry,
            useAbbreviation: AttrScope.FeatureGeometry,
            useIsoCode: AttrScope.FeatureGeometry,
            priority: AttrScope.TechniqueGeometry,
            textMinZoomLevel: AttrScope.TechniqueGeometry,
            textMaxZoomLevel: AttrScope.TechniqueGeometry,
            iconMinZoomLevel: AttrScope.TechniqueGeometry,
            iconMaxZoomLevel: AttrScope.TechniqueGeometry,
            distanceScale: AttrScope.TechniqueGeometry,
            textMayOverlap: AttrScope.TechniqueGeometry,
            iconMayOverlap: AttrScope.TechniqueGeometry,
            textReserveSpace: AttrScope.TechniqueGeometry,
            iconReserveSpace: AttrScope.TechniqueGeometry,
            renderTextDuringMovements: AttrScope.TechniqueGeometry,
            alwaysOnTop: AttrScope.TechniqueGeometry,
            textIsOptional: AttrScope.TechniqueGeometry,
            showOnMap: AttrScope.TechniqueGeometry,
            stackMode: AttrScope.TechniqueGeometry,
            minDistance: AttrScope.TechniqueGeometry,
            iconIsOptional: AttrScope.TechniqueGeometry,
            iconFadeTime: AttrScope.TechniqueGeometry,
            textFadeTime: AttrScope.TechniqueGeometry,
            xOffset: AttrScope.TechniqueGeometry,
            yOffset: AttrScope.TechniqueGeometry,
            iconXOffset: AttrScope.TechniqueGeometry,
            iconYOffset: AttrScope.TechniqueGeometry,
            iconScale: AttrScope.TechniqueGeometry,
            screenHeight: AttrScope.TechniqueGeometry,
            screenWidth: AttrScope.TechniqueGeometry,
            poiTable: AttrScope.TechniqueGeometry,
            poiName: AttrScope.FeatureGeometry,
            poiNameField: AttrScope.TechniqueGeometry,
            imageTexture: AttrScope.FeatureGeometry,
            imageTextureField: AttrScope.TechniqueGeometry,
            imageTexturePrefix: AttrScope.TechniqueGeometry,
            imageTexturePostfix: AttrScope.TechniqueGeometry,
            style: AttrScope.TechniqueGeometry,
            fontName: AttrScope.TechniqueGeometry,
            fontStyle: AttrScope.TechniqueGeometry,
            fontVariant: AttrScope.TechniqueGeometry,
            rotation: AttrScope.TechniqueGeometry,
            tracking: AttrScope.TechniqueGeometry,
            leading: AttrScope.TechniqueGeometry,
            maxLines: AttrScope.TechniqueGeometry,
            lineWidth: AttrScope.TechniqueGeometry,
            canvasRotation: AttrScope.TechniqueGeometry,
            lineRotation: AttrScope.TechniqueGeometry,
            wrappingMode: AttrScope.TechniqueGeometry,
            hAlignment: AttrScope.TechniqueGeometry,
            vAlignment: AttrScope.TechniqueGeometry,
            backgroundColor: AttrScope.TechniqueRendering,
            backgroundSize: AttrScope.TechniqueRendering,
            backgroundOpacity: AttrScope.TechniqueRendering,
            color: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            size: AttrScope.TechniqueRendering
        }
    }
);
techniqueDescriptors["line-marker"] = lineMarkerTechniquePropTypes;
techniqueDescriptors["labeled-icon"] = lineMarkerTechniquePropTypes;

/**
 * Runtime representation of [[SegmentsStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[SegmentsTechniqueParams]].
 */
export interface SegmentsTechnique extends MakeTechniqueAttrs<SegmentsTechniqueParams> {
    name: "segments";
}

const polygonalTechniqueDescriptor: TechniqueDescriptor<PolygonalTechniqueParams> = {
    attrScopes: {
        polygonOffset: AttrScope.TechniqueRendering,
        polygonOffsetFactor: AttrScope.TechniqueRendering,
        polygonOffsetUnits: AttrScope.TechniqueRendering,
        lineColor: AttrScope.TechniqueRendering,
        lineFadeFar: AttrScope.TechniqueRendering,
        lineFadeNear: AttrScope.TechniqueRendering
    }
};
/**
 * Runtime representation of [[BasicExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[BasicExtrudedLineTechniqueParams]].
 */
export interface BasicExtrudedLineTechnique
    extends MakeTechniqueAttrs<BasicExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of [[StandardExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[StandardExtrudedLineTechniqueParams]].
 */
export interface StandardExtrudedLineTechnique
    extends MakeTechniqueAttrs<StandardExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of [[SolidLineStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[SolidLineTechniqueParams]].
 */
export interface SolidLineTechnique extends MakeTechniqueAttrs<SolidLineTechniqueParams> {
    name: "solid-line" | "dashed-line";
}

export const solidLineTechniqueDescriptor = mergeTechniqueDescriptor<SolidLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrScopes: {
            clipping: AttrScope.TechniqueGeometry,
            secondaryRenderOrder: AttrScope.TechniqueGeometry,
            color: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            lineWidth: AttrScope.TechniqueRendering,
            secondaryWidth: AttrScope.TechniqueRendering,
            secondaryColor: AttrScope.TechniqueRendering,
            dashSize: AttrScope.TechniqueRendering,
            gapSize: AttrScope.TechniqueRendering
        }
    }
);
techniqueDescriptors["solid-line"] = solidLineTechniqueDescriptor;
// TODO: Remove deprecated "dashed-line" support in future releases.
techniqueDescriptors["dashed-line"] = solidLineTechniqueDescriptor;

/**
 * Runtime representation of [[LineStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[LineTechniqueParams]].
 */
export interface LineTechnique extends MakeTechniqueAttrs<LineTechniqueParams> {
    name: "line";
}

export const lineTechniqueDescriptor = mergeTechniqueDescriptor<LineTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            // TODO, check, which are really dynamic !
            color: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            lineWidth: AttrScope.FeatureGeometry
        }
    }
);

techniqueDescriptors.line = lineTechniqueDescriptor;

/**
 * Runtime representation of [[FillStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[FillTechniqueParams]].
 */
export interface FillTechnique extends MakeTechniqueAttrs<FillTechniqueParams> {
    name: "fill";
}

const fillTechniqueDescriptor = mergeTechniqueDescriptor<FillTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrScopes: {
            color: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            lineWidth: AttrScope.TechniqueRendering
        }
    }
);
techniqueDescriptors.fill = fillTechniqueDescriptor;

/**
 * Technique used to render a mesh geometry.
 * For technique parameters see [[StandardTechniqueParams]].
 */
export interface StandardTechnique extends MakeTechniqueAttrs<StandardTechniqueParams> {
    name: "standard";
}
const standardTechniqueDescriptor = mergeTechniqueDescriptor<StandardTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            color: AttrScope.FeatureGeometry,
            vertexColors: AttrScope.FeatureGeometry,
            wireframe: AttrScope.TechniqueRendering,
            roughness: AttrScope.TechniqueRendering,
            metalness: AttrScope.TechniqueRendering,
            alphaTest: AttrScope.TechniqueRendering,
            depthTest: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            emissive: AttrScope.TechniqueRendering,
            emissiveIntensity: AttrScope.TechniqueRendering,
            refractionRatio: AttrScope.TechniqueRendering,
            map: AttrScope.TechniqueGeometry,
            mapProperties: AttrScope.TechniqueGeometry,
            normalMap: AttrScope.TechniqueGeometry,
            normalMapProperties: AttrScope.TechniqueGeometry,
            displacementMap: AttrScope.TechniqueGeometry,
            displacementMapProperties: AttrScope.TechniqueGeometry,
            roughnessMap: AttrScope.TechniqueGeometry,
            roughnessMapProperties: AttrScope.TechniqueGeometry,
            emissiveMap: AttrScope.TechniqueGeometry,
            emissiveMapProperties: AttrScope.TechniqueGeometry,
            bumpMap: AttrScope.TechniqueGeometry,
            bumpMapProperties: AttrScope.TechniqueGeometry,
            metalnessMap: AttrScope.TechniqueGeometry,
            metalnessMapProperties: AttrScope.TechniqueGeometry,
            alphaMap: AttrScope.TechniqueGeometry,
            alphaMapProperties: AttrScope.TechniqueGeometry
        }
    }
);
techniqueDescriptors.standard = standardTechniqueDescriptor;

/**
 * Runtime representation of [[ExtrudedPolygonStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[ExtrudedPolygonTechniqueParams]].
 */
export interface ExtrudedPolygonTechnique
    extends MakeTechniqueAttrs<ExtrudedPolygonTechniqueParams> {
    name: "extruded-polygon";
}

const extrudedPolygonTechniqueDescriptor = mergeTechniqueDescriptor<ExtrudedPolygonTechnique>(
    baseTechniqueParamsDescriptor,
    standardTechniqueDescriptor,
    {
        attrScopes: {
            height: AttrScope.FeatureGeometry,
            floorHeight: AttrScope.FeatureGeometry,
            color: AttrScope.FeatureGeometry,
            defaultColor: AttrScope.FeatureGeometry,
            defaultHeight: AttrScope.FeatureGeometry,
            constantHeight: AttrScope.FeatureGeometry,
            boundaryWalls: AttrScope.FeatureGeometry,
            footprint: AttrScope.FeatureGeometry,
            maxSlope: AttrScope.FeatureGeometry,
            enableDepthPrePass: AttrScope.TechniqueGeometry,
            animateExtrusionDuration: AttrScope.TechniqueGeometry,
            animateExtrusion: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            lineWidth: AttrScope.TechniqueRendering,
            lineFadeNear: AttrScope.TechniqueRendering,
            lineFadeFar: AttrScope.TechniqueRendering,
            lineColorMix: AttrScope.TechniqueGeometry,
            lineColor: AttrScope.TechniqueRendering
        }
    }
);
techniqueDescriptors["extruded-polygon"] = extrudedPolygonTechniqueDescriptor;
/**
 * Runtime representation of [[TextStyle]] as parsed by [[StyleSetEvaluator]].
 * For technique parameters see [[TextTechniqueParams]].
 */
export interface TextTechnique extends MakeTechniqueAttrs<TextTechniqueParams> {
    name: "text";
}

const textTechniqueDescriptor = mergeTechniqueDescriptor<TextTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            text: AttrScope.FeatureGeometry,
            label: AttrScope.FeatureGeometry,
            useAbbreviation: AttrScope.FeatureGeometry,
            useIsoCode: AttrScope.FeatureGeometry,

            minZoomLevel: AttrScope.TechniqueGeometry,
            maxZoomLevel: AttrScope.TechniqueGeometry,
            distanceScale: AttrScope.TechniqueGeometry,
            mayOverlap: AttrScope.TechniqueGeometry,
            reserveSpace: AttrScope.TechniqueGeometry,
            textFadeTime: AttrScope.TechniqueGeometry,
            xOffset: AttrScope.TechniqueGeometry,
            yOffset: AttrScope.TechniqueGeometry,
            style: AttrScope.TechniqueGeometry,
            fontName: AttrScope.TechniqueGeometry,
            fontStyle: AttrScope.TechniqueGeometry,
            fontVariant: AttrScope.TechniqueGeometry,
            rotation: AttrScope.TechniqueGeometry,
            tracking: AttrScope.TechniqueGeometry,
            leading: AttrScope.TechniqueGeometry,
            maxLines: AttrScope.TechniqueGeometry,
            lineWidth: AttrScope.TechniqueGeometry,
            canvasRotation: AttrScope.TechniqueGeometry,
            lineRotation: AttrScope.TechniqueGeometry,
            wrappingMode: AttrScope.TechniqueGeometry,
            hAlignment: AttrScope.TechniqueGeometry,
            vAlignment: AttrScope.TechniqueGeometry,
            backgroundColor: AttrScope.TechniqueRendering,
            backgroundSize: AttrScope.TechniqueRendering,
            backgroundOpacity: AttrScope.TechniqueRendering,
            color: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            priority: AttrScope.TechniqueRendering,
            size: AttrScope.TechniqueRendering
        }
    }
);
techniqueDescriptors.text = textTechniqueDescriptor;

/**
 * Special technique for user-defined shaders.
 * For technique parameters see [[ShaderTechniqueParams]].
 */
export interface ShaderTechnique extends MakeTechniqueAttrs<ShaderTechniqueParams> {
    name: "shader";
}

const shaderTechniqueDescriptor = mergeTechniqueDescriptor<ShaderTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            primitive: AttrScope.TechniqueGeometry,
            params: AttrScope.TechniqueRendering
        }
    }
);

techniqueDescriptors.shader = shaderTechniqueDescriptor;

/**
 * Technique used to render a terrain geometry with textures.
 * For technique parameters see [[TerrainTechniqueParams]].
 */
export interface TerrainTechnique extends MakeTechniqueAttrs<TerrainTechniqueParams> {
    name: "terrain";
}

/**
 * Technique to avoid label rendering on top of certain line geometries.
 * For technique parameters see [[BaseTechniqueParams]].
 */
export interface LabelRejectionLineTechnique extends MakeTechniqueAttrs<BaseTechniqueParams> {
    name: "label-rejection-line";
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
 * Additional params used for optimized usage of `Techniques`.
 */
export interface IndexedTechniqueParams {
    /**
     * Optimization: Index into table in [[StyleSetEvaluator]] or in [[DecodedTile]].
     * @hidden
     */
    _index: number;

    /**
     * Unique technique key derived from all dynamic expressions that were input to this particular
     * technique instance.
     * @hidden
     */
    _key: string;

    /**
     * Optimization: Unique [[Technique]] index of [[Style]] from which technique was derived.
     * @hidden
     */
    _styleSetIndex: number;

    /**
     * The styleSet associated to this [[Technique]].
     * @hidden
     */
    _styleSet?: string;

    /**
     * The category used to assign render orders to objects created using this [[Technique]].
     * @hidden
     */
    _category?: string;

    /**
     * The category used to assign render orders to secondary objects
     * created using this [[Technique]].
     * @hidden
     */
    _secondaryCategory?: string;
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
 * Type guard to check if an object is an instance of [[LineTechnique]].
 */
export function isLineTechnique(technique: Technique): technique is LineTechnique {
    return technique.name === "line";
}

/**
 * Type guard to check if an object is an instance of [[SolidLineTechnique]].
 */
export function isSolidLineTechnique(technique: Technique): technique is SolidLineTechnique {
    return technique.name === "solid-line" || technique.name === "dashed-line";
}

/**
 * Type guard to check if an object is an instance of [[SolidLineTechnique]] and is a kind that
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

export function isLabelRejectionLineTechnique(
    technique: Technique
): technique is LabelRejectionLineTechnique {
    return technique.name === "label-rejection-line";
}

/**
 * Check if vertex normals should be generated for this technique (if no normals are in the data).
 * @param technique Technique to check.
 */
export function needsVertexNormals(technique: Technique): boolean {
    return (
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
