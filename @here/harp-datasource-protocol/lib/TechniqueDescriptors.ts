/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BaseTechniqueParams,
    PointTechniqueParams,
    PolygonalTechniqueParams
} from "./TechniqueParams";
import {
    CirclesTechnique,
    ExtrudedPolygonTechnique,
    FillTechnique,
    LineMarkerTechnique,
    LineTechnique,
    ShaderTechnique,
    SolidLineTechnique,
    SquaresTechnique,
    StandardTechnique,
    Technique,
    TextTechnique
} from "./Techniques";

export enum AttrScope {
    /**
     * Attributes that affect generation of feature geometry and thus must be resolved at decoding
     * time.
     *
     * @remarks
     * They may have huge variancy as they are implemented as vertex attributes or embedded in
     * generated meshes.
     *
     * These attributes are available only in decoding scope.
     */
    FeatureGeometry,

    /**
     * Attributes that are common to whole group of features drawn with this technique.
     * These attributes affect generated geometry and  thus must be resolved at decoding time.
     *
     * @remarks
     * They shouldn't have big variancy and evaluate to at least dozens of values as each
     * combination of these attributes consitute new technique and material.
     *
     * These attributes are available in decoding and rendering scope.
     */
    TechniqueGeometry,

    /**
     * Attributes that are common to whole group of features drawn with this technique.
     *
     * @remarks
     * Attributes that can be changed in resulting object/material from frame to frame. They are
     * usually implemented as uniforms.
     *
     * These attributes may be available only at rendering scope.
     */
    TechniqueRendering
}

/**
 * Extract  property names from `Technique`-like interface (excluding `name`) as union of string
 * literals.
 *
 * TechniquePropName<Base
 *
 */
type TechniquePropNames<T> = T extends { name: any } ? keyof Omit<T, "name"> : keyof T;

type TechniquePropScopes<T> = {
    [P in TechniquePropNames<T>]?: AttrScope;
};

export interface TechniqueDescriptor<T = Technique> {
    attrTransparencyColor?: string;
    attrScopes: TechniquePropScopes<T>;
}

type OneThatMatches<T, P> = T extends P ? T : never;
type TechniqueByName<K extends Technique["name"]> = OneThatMatches<Technique, { name: K }>;

export type TechniqueDescriptorRegistry = {
    [P in Technique["name"]]?: TechniqueDescriptor<TechniqueByName<P>>;
};

/**
 * @internal
 */
function mergeTechniqueDescriptor<T>(
    ...descriptors: Array<Partial<TechniqueDescriptor<T>>>
): TechniqueDescriptor<T> {
    const result: TechniqueDescriptor<T> = {
        attrScopes: {}
    };
    for (const descriptor of descriptors) {
        if (descriptor.attrTransparencyColor !== undefined) {
            result.attrTransparencyColor = descriptor.attrTransparencyColor;
        }
        if (descriptor.attrScopes !== undefined) {
            result.attrScopes = { ...result.attrScopes, ...descriptor.attrScopes };
        }
    }
    return result;
}

const baseTechniqueParamsDescriptor: TechniqueDescriptor<BaseTechniqueParams> = {
    // TODO: Choose which techniques should support color with transparency.
    // For now we chosen all, but it maybe not suitable for text or line marker techniques.
    attrTransparencyColor: "color",
    attrScopes: {
        enabled: AttrScope.FeatureGeometry,
        fadeFar: AttrScope.TechniqueRendering,
        fadeNear: AttrScope.TechniqueRendering
    }
};

const pointTechniquePropTypes = mergeTechniqueDescriptor<PointTechniqueParams>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            color: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering
        }
    }
);

const squaresTechniquePropTypes = mergeTechniqueDescriptor<SquaresTechnique>(
    baseTechniqueParamsDescriptor,
    pointTechniquePropTypes
);

const circlesTechniquePropTypes = mergeTechniqueDescriptor<CirclesTechnique>(
    baseTechniqueParamsDescriptor,
    pointTechniquePropTypes
);

const lineMarkerTechniquePropTypes = mergeTechniqueDescriptor<LineMarkerTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            text: AttrScope.FeatureGeometry,
            label: AttrScope.FeatureGeometry,
            useAbbreviation: AttrScope.FeatureGeometry,
            useIsoCode: AttrScope.FeatureGeometry,
            poiName: AttrScope.FeatureGeometry,
            imageTexture: AttrScope.FeatureGeometry,
            iconColor: AttrScope.TechniqueRendering,
            iconBrightness: AttrScope.TechniqueRendering,
            backgroundColor: AttrScope.TechniqueRendering,
            backgroundSize: AttrScope.TechniqueRendering,
            backgroundOpacity: AttrScope.TechniqueRendering,
            color: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            size: AttrScope.TechniqueRendering
        }
    }
);

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

const solidLineTechniqueDescriptor = mergeTechniqueDescriptor<SolidLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrScopes: {
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

const lineTechniqueDescriptor = mergeTechniqueDescriptor<LineTechnique>(
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
            refractionRatio: AttrScope.TechniqueRendering
        }
    }
);

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
            animateExtrusion: AttrScope.TechniqueRendering,
            opacity: AttrScope.TechniqueRendering,
            transparent: AttrScope.TechniqueRendering,
            lineWidth: AttrScope.TechniqueRendering,
            lineFadeNear: AttrScope.TechniqueRendering,
            lineFadeFar: AttrScope.TechniqueRendering,
            lineColor: AttrScope.TechniqueRendering
        }
    }
);

const textTechniqueDescriptor = mergeTechniqueDescriptor<TextTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            text: AttrScope.FeatureGeometry,
            label: AttrScope.FeatureGeometry,
            useAbbreviation: AttrScope.FeatureGeometry,
            useIsoCode: AttrScope.FeatureGeometry,
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

const shaderTechniqueDescriptor = mergeTechniqueDescriptor<ShaderTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            params: AttrScope.TechniqueRendering
        }
    }
);

/** @internal  */
export const techniqueDescriptors: TechniqueDescriptorRegistry = {
    "extruded-polygon": extrudedPolygonTechniqueDescriptor,
    "line-marker": lineMarkerTechniquePropTypes,
    "labeled-icon": lineMarkerTechniquePropTypes,
    "solid-line": solidLineTechniqueDescriptor,
    "dashed-line": solidLineTechniqueDescriptor,
    standard: standardTechniqueDescriptor,
    squares: squaresTechniquePropTypes,
    circles: circlesTechniquePropTypes,
    line: lineTechniqueDescriptor,
    fill: fillTechniqueDescriptor,
    text: textTechniqueDescriptor,
    shader: shaderTechniqueDescriptor
};
