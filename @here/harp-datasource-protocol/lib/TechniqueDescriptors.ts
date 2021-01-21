/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
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
    IndexedTechnique,
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

interface AttrDescriptor {
    /**
     * The evaluation scope of this attribute.
     */
    scope?: AttrScope;

    /**
     * Mark this attribute as automatic.
     *
     * @remarks
     * When set to `true`, the underlying material property
     * associated with this attribute is automatically kept in sync
     * with the value of the technique attribute.
     */
    automatic?: boolean;
}

type TechniqueAttrDescriptors<T> = {
    [P in TechniquePropNames<T>]?: AttrScope | AttrDescriptor;
};

export interface TechniqueDescriptor<T = Technique> {
    attrTransparencyColor?: string;
    attrDescriptors: TechniqueAttrDescriptors<T>;
}

type OneThatMatches<T, P> = T extends P ? T : never;
type TechniqueByName<K extends Technique["name"]> = OneThatMatches<Technique, { name: K }>;

type TechniqueDescriptorRegistry = {
    [P in Technique["name"]]?: TechniqueDescriptor<TechniqueByName<P>>;
};

/**
 * @internal
 */
function mergeTechniqueDescriptor<T>(
    ...descriptors: Array<Partial<TechniqueDescriptor<T>>>
): TechniqueDescriptor<T> {
    const result: TechniqueDescriptor<T> = {
        attrDescriptors: {}
    };
    for (const descriptor of descriptors) {
        if (descriptor.attrTransparencyColor !== undefined) {
            result.attrTransparencyColor = descriptor.attrTransparencyColor;
        }
        if (descriptor.attrDescriptors !== undefined) {
            result.attrDescriptors = { ...result.attrDescriptors, ...descriptor.attrDescriptors };
        }
    }
    return result;
}

const baseTechniqueParamsDescriptor: TechniqueDescriptor<BaseTechniqueParams> = {
    // TODO: Choose which techniques should support color with transparency.
    // For now we chosen all, but it maybe not suitable for text or line marker techniques.
    attrTransparencyColor: "color",
    attrDescriptors: {
        constantHeight: AttrScope.FeatureGeometry,
        enabled: AttrScope.FeatureGeometry,
        fadeFar: AttrScope.TechniqueRendering,
        fadeNear: AttrScope.TechniqueRendering,
        transparent: { scope: AttrScope.TechniqueRendering, automatic: true },
        side: { scope: AttrScope.TechniqueRendering, automatic: true }
    }
};

const pointTechniquePropTypes = mergeTechniqueDescriptor<PointTechniqueParams>(
    baseTechniqueParamsDescriptor,
    {
        attrDescriptors: {
            color: { scope: AttrScope.TechniqueRendering, automatic: true },
            size: { scope: AttrScope.TechniqueRendering, automatic: true },
            opacity: { scope: AttrScope.TechniqueRendering, automatic: true }
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
        attrDescriptors: {
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
    attrDescriptors: {
        polygonOffset: { scope: AttrScope.TechniqueRendering, automatic: true },
        polygonOffsetFactor: { scope: AttrScope.TechniqueRendering, automatic: true },
        polygonOffsetUnits: { scope: AttrScope.TechniqueRendering, automatic: true },
        depthTest: { scope: AttrScope.TechniqueRendering, automatic: true },
        transparent: { scope: AttrScope.TechniqueRendering, automatic: true },
        opacity: { scope: AttrScope.TechniqueRendering, automatic: true },
        color: { scope: AttrScope.TechniqueRendering, automatic: true },
        lineColor: AttrScope.TechniqueRendering,
        lineFadeFar: AttrScope.TechniqueRendering,
        lineFadeNear: AttrScope.TechniqueRendering
    }
};

const solidLineTechniqueDescriptor = mergeTechniqueDescriptor<SolidLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrDescriptors: {
            lineWidth: AttrScope.TechniqueRendering,
            secondaryWidth: AttrScope.TechniqueRendering,
            secondaryColor: AttrScope.TechniqueRendering,
            dashSize: AttrScope.TechniqueRendering,
            gapSize: AttrScope.TechniqueRendering,
            outlineColor: { scope: AttrScope.TechniqueRendering, automatic: true },
            caps: { scope: AttrScope.TechniqueRendering, automatic: true },
            drawRangeStart: { scope: AttrScope.TechniqueRendering, automatic: true },
            drawRangeEnd: { scope: AttrScope.TechniqueRendering, automatic: true },
            dashes: { scope: AttrScope.TechniqueRendering, automatic: true },
            dashColor: { scope: AttrScope.TechniqueRendering, automatic: true }
        }
    }
);

const lineTechniqueDescriptor = mergeTechniqueDescriptor<LineTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrDescriptors: {
            // TODO, check, which are really dynamic !
            color: { scope: AttrScope.TechniqueRendering, automatic: true },
            opacity: { scope: AttrScope.TechniqueRendering, automatic: true },
            lineWidth: AttrScope.FeatureGeometry
        }
    }
);

const fillTechniqueDescriptor = mergeTechniqueDescriptor<FillTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrDescriptors: {
            wireframe: { scope: AttrScope.TechniqueRendering, automatic: true },
            color: { scope: AttrScope.TechniqueRendering, automatic: true },
            opacity: { scope: AttrScope.TechniqueRendering, automatic: true },
            transparent: { scope: AttrScope.TechniqueRendering, automatic: true },
            lineWidth: AttrScope.TechniqueRendering
        }
    }
);

const standardTechniqueDescriptor = mergeTechniqueDescriptor<StandardTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrDescriptors: {
            color: AttrScope.FeatureGeometry,
            vertexColors: { scope: AttrScope.TechniqueRendering, automatic: true },
            wireframe: { scope: AttrScope.TechniqueRendering, automatic: true },
            roughness: { scope: AttrScope.TechniqueRendering, automatic: true },
            metalness: { scope: AttrScope.TechniqueRendering, automatic: true },
            alphaTest: { scope: AttrScope.TechniqueRendering, automatic: true },
            depthTest: { scope: AttrScope.TechniqueRendering, automatic: true },
            transparent: { scope: AttrScope.TechniqueRendering, automatic: true },
            opacity: { scope: AttrScope.TechniqueRendering, automatic: true },
            emissive: { scope: AttrScope.TechniqueRendering, automatic: true },
            emissiveIntensity: { scope: AttrScope.TechniqueRendering, automatic: true },
            refractionRatio: { scope: AttrScope.TechniqueRendering, automatic: true },
            normalMapType: { scope: AttrScope.TechniqueRendering, automatic: true }
        }
    }
);

const extrudedPolygonTechniqueDescriptor = mergeTechniqueDescriptor<ExtrudedPolygonTechnique>(
    baseTechniqueParamsDescriptor,
    standardTechniqueDescriptor,
    {
        attrDescriptors: {
            height: AttrScope.FeatureGeometry,
            floorHeight: AttrScope.FeatureGeometry,
            color: AttrScope.FeatureGeometry,
            defaultColor: AttrScope.FeatureGeometry,
            defaultHeight: AttrScope.FeatureGeometry,
            boundaryWalls: AttrScope.FeatureGeometry,
            footprint: AttrScope.FeatureGeometry,
            maxSlope: AttrScope.FeatureGeometry,
            animateExtrusion: AttrScope.TechniqueRendering,
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
        attrDescriptors: {
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
        attrDescriptors: {
            params: AttrScope.TechniqueRendering
        }
    }
);

const techniqueDescriptors: TechniqueDescriptorRegistry = {
    "extruded-polygon": extrudedPolygonTechniqueDescriptor,
    "line-marker": lineMarkerTechniquePropTypes,
    "labeled-icon": lineMarkerTechniquePropTypes,
    "solid-line": solidLineTechniqueDescriptor,
    "dashed-line": solidLineTechniqueDescriptor,
    terrain: standardTechniqueDescriptor,
    standard: standardTechniqueDescriptor,
    squares: squaresTechniquePropTypes,
    circles: circlesTechniquePropTypes,
    line: lineTechniqueDescriptor,
    segments: lineTechniqueDescriptor,
    fill: fillTechniqueDescriptor,
    text: textTechniqueDescriptor,
    shader: shaderTechniqueDescriptor
};

export function getTechniqueDescriptor(
    technique: string | IndexedTechnique | Technique
): TechniqueDescriptor | undefined {
    if (typeof technique !== "string") {
        technique = technique.name;
    }
    return (techniqueDescriptors as any)[technique];
}

export function getTechniqueAttributeDescriptor(
    technique: string | IndexedTechnique | Technique,
    attrName: string
): AttrDescriptor | undefined {
    const techniqueDescriptor = getTechniqueDescriptor(technique);
    const attrDescriptors = techniqueDescriptor?.attrDescriptors;
    const descriptor = attrDescriptors?.[attrName];
    if (typeof descriptor === undefined) {
        return undefined;
    } else if (typeof descriptor === "object") {
        return descriptor;
    }
    return { scope: descriptor };
}

const automaticAttributeCache: Map<string, string[]> = new Map();

export function getTechniqueAutomaticAttrs(
    technique: string | IndexedTechnique | Technique
): string[] {
    if (typeof technique !== "string") {
        technique = technique.name;
    }

    if (automaticAttributeCache.has(technique)) {
        return automaticAttributeCache.get(technique)!;
    }

    const descriptors: string[] = [];

    const attrDescriptors = getTechniqueDescriptor(technique)?.attrDescriptors;

    if (attrDescriptors === undefined) {
        return descriptors;
    }

    for (const attrName in attrDescriptors) {
        if (!attrDescriptors.hasOwnProperty(attrName)) {
            continue;
        }

        const descr = attrDescriptors[attrName];

        if (descr === undefined || typeof descr === "number") {
            continue;
        }

        if (descr.automatic === true) {
            descriptors.push(attrName);
        }
    }

    automaticAttributeCache.set(technique, descriptors);

    return descriptors;
}
