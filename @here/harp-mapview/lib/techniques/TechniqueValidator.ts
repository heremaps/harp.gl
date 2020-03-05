/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BaseTechniqueParams,
    baseTechniqueParamsDescriptor,
    Expr,
    ExtrudedPolygonTechnique,
    HeightBasedColors,
    IndexedTechnique,
    isTextureBuffer,
    MakeTechniqueAttrs,
    PointTechniqueParams,
    StandardTechniqueParams,
    Technique,
    TerrainTechnique,
    TextTechnique,
    Value
} from "@here/harp-datasource-protocol";
import { TechniquePropNames } from "@here/harp-datasource-protocol/lib/TechniqueDescriptor";
import { DefaultTextStyle } from "@here/harp-text-canvas";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";

// type Compiler<S, D> = (src: S | JsonExpr, defaultValue: D) => D | Expr;

interface SourceAttrDescriptor<T> {
    defaultValue: T;
    isValid: (v: Value) => boolean;

    // TODO: this is for stringEncodedNumerals so they are compiled while technique
    // being normalized
    //compiler?: Compiler<Value, T>;
}

export type SourceDescriptor<T> = {
    [P in TechniquePropNames<T>]?: SourceAttrDescriptor<T[P]>;
};

/**
 * Validate technique according to `sourceDescriptor`.
 *
 * Copies only `name`, internal properties (prefixed with `_`) and properties specified in
 * `sourceDescriptor`.
 *
 * Ensures that resulting technique has stable shape with all properties
 * being either `Expr` or valid values (checked with `isValid` with fallback)
 * to `defaultValue`.
 */
export function normalizeTechnique<T extends Technique>(
    technique: T & IndexedTechnique,
    sourceDescriptor: SourceAttrDescriptor<T>
): T & IndexedTechnique {
    const result: any = {
        name: technique.name,
        _index: technique._index,
        _styleSetIndex: technique._styleSetIndex,
        _category: technique._category,
        _secondaryCategory: technique._secondaryCategory
    };
    for (const propName in sourceDescriptor) {
        if (!sourceDescriptor.hasOwnProperty(propName)) {
            continue;
        }
        const descriptor = (sourceDescriptor as any)[propName] as SourceAttrDescriptor<any>;
        const actual = (technique as any)[propName as keyof T];
        if (actual === undefined || actual === null) {
            result[propName] = descriptor.defaultValue;
        } else if (Expr.isExpr(actual)) {
            result[propName] = actual;
        } else if (!descriptor.isValid(actual as any)) {
            result[propName] = descriptor.defaultValue;
        } else {
            result[propName] = actual;
        }
    }
    return result as T & IndexedTechnique;
}

export function numberValidator(v: Value): boolean {
    return typeof v === "number" && !isNaN(v);
}

export function booleanValidator(v: Value): boolean {
    return typeof v === "boolean";
}

export function stringValidator(v: Value): boolean {
    return typeof v === "string";
}

export function nonEmptyStringValidator(v: Value): boolean {
    return typeof v === "string" && v.length > 0;
}

export function colorValidator(v: Value): boolean {
    return typeof v === "number" || typeof v === "string";
}

export function textureValidator(v: Value): boolean {
    return typeof v === "string" || isTextureBuffer(v);
}

export function normalizedNumberValidator(v: Value): boolean {
    return typeof v === "number" && v >= 0 && v <= 1;
}

export function texturePropertiesValidator(v: Value): boolean {
    return typeof v === "object" && v !== null;
}

const techniqueHandlerBaseParamsDescriptor: SourceDescriptor<MakeTechniqueAttrs<
    BaseTechniqueParams
>> = {
    id: {
        // TODO: do we really use it ?
        defaultValue: undefined,
        isValid: stringValidator
    },
    renderOrder: {
        // TODO: this is only world space related, should be factored out
        defaultValue: 0,
        isValid: numberValidator
    },
    renderOrderOffset: {
        // TODO: this is only world space related, should be factored out
        defaultValue: undefined,
        isValid: numberValidator
    },
    category: {
        defaultValue: undefined,
        isValid: stringValidator
    },
    transient: {
        // TODO: this is only world space related, should be factored out
        defaultValue: false,
        isValid: booleanValidator
    },
    fadeFar: {
        defaultValue: undefined,
        isValid: normalizedNumberValidator
    },
    fadeNear: {
        defaultValue: undefined,
        isValid: normalizedNumberValidator
    },
    kind: {
        // TODO: ???
        defaultValue: undefined,
        isValid: nonEmptyStringValidator
    },
    enabled: {
        defaultValue: undefined,
        isValid: booleanValidator
    }
};

const techniqueHandlerStandardParamsDescriptor: SourceDescriptor<MakeTechniqueAttrs<
    StandardTechniqueParams
>> = {
    ...baseTechniqueParamsDescriptor,
    color: {
        defaultValue: 0xffffff,
        isValid: colorValidator
    },
    vertexColors: {
        defaultValue: false,
        isValid: booleanValidator
    },
    wireframe: {
        defaultValue: false,
        isValid: booleanValidator
    },
    roughness: {
        defaultValue: 1.0,
        isValid: normalizedNumberValidator
    },
    metalness: {
        defaultValue: 0.0,
        isValid: normalizedNumberValidator
    },
    alphaTest: {
        defaultValue: undefined,
        isValid: booleanValidator
    },
    depthTest: {
        defaultValue: undefined,
        isValid: booleanValidator
    },
    transparent: {
        defaultValue: undefined,
        isValid: booleanValidator
    },
    opacity: {
        defaultValue: 1.0,
        isValid: normalizedNumberValidator
    },
    emissive: {
        defaultValue: undefined,
        isValid: colorValidator
    },
    emissiveIntensity: {
        defaultValue: 1.0,
        isValid: normalizedNumberValidator
    },
    refractionRatio: {
        defaultValue: 0.98,
        isValid: normalizedNumberValidator
    },
    textureCoordinateType: {
        defaultValue: undefined,
        // TODO: this is enum
        isValid: nonEmptyStringValidator
    },
    map: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    mapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    normalMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    normalMapType: {
        defaultValue: undefined,
        isValid: numberValidator
    },
    normalMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    displacementMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    displacementMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    roughnessMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    roughnessMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    emissiveMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    emissiveMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    bumpMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    bumpMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    metalnessMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    metalnessMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    },
    alphaMap: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    alphaMapProperties: {
        defaultValue: undefined,
        isValid: texturePropertiesValidator
    }
};

// TODO: move to TextTechniqueHandler when merging
export const textTechniqueRenderingPropTypes: SourceDescriptor<TextTechnique> = {
    ...techniqueHandlerBaseParamsDescriptor,
    minZoomLevel: {
        defaultValue: undefined,
        isValid: numberValidator
    },
    maxZoomLevel: {
        defaultValue: undefined,
        isValid: numberValidator
    },
    distanceScale: {
        defaultValue: DEFAULT_TEXT_DISTANCE_SCALE,
        isValid: numberValidator
    },
    mayOverlap: {
        defaultValue: false,
        isValid: booleanValidator
    },
    reserveSpace: {
        defaultValue: true,
        isValid: booleanValidator
    },
    textFadeTime: {
        defaultValue: undefined,
        isValid: numberValidator
    },
    xOffset: {
        defaultValue: 0,
        isValid: numberValidator
    },
    yOffset: {
        defaultValue: 0,
        isValid: numberValidator
    },
    style: {
        defaultValue: undefined,
        isValid: nonEmptyStringValidator
    },
    fontName: {
        defaultValue: "",
        isValid: nonEmptyStringValidator
    },
    fontStyle: {
        defaultValue: "Regular",
        // TODO: enum validator
        isValid: nonEmptyStringValidator
    },
    fontVariant: {
        defaultValue: "Regular",
        // TODO: enum validator
        isValid: nonEmptyStringValidator
    },
    rotation: {
        defaultValue: DefaultTextStyle.DEFAULT_ROTATION,
        isValid: numberValidator
    },
    tracking: {
        defaultValue: DefaultTextStyle.DEFAULT_TRACKING,
        isValid: numberValidator
    },
    leading: {
        defaultValue: DefaultTextStyle.DEFAULT_LEADING,
        isValid: numberValidator
    },
    maxLines: {
        defaultValue: DefaultTextStyle.DEFAULT_MAX_LINES,
        isValid: numberValidator
    },
    lineWidth: {
        defaultValue: 0,
        isValid: numberValidator
    },
    canvasRotation: {
        defaultValue: DefaultTextStyle.DEFAULT_CANVAS_ROTATION,
        isValid: numberValidator
    },
    lineRotation: {
        defaultValue: DefaultTextStyle.DEFAULT_LINE_ROTATION,
        isValid: numberValidator
    },
    wrappingMode: {
        defaultValue: "Word",
        isValid: nonEmptyStringValidator
    },
    hAlignment: {
        defaultValue: "Left",
        isValid: nonEmptyStringValidator
    },
    vAlignment: {
        defaultValue: "Above",
        isValid: nonEmptyStringValidator
    },
    backgroundColor: {
        defaultValue: DefaultTextStyle.DEFAULT_BACKGROUND_COLOR.getHex(),
        isValid: colorValidator
    },
    backgroundSize: {
        defaultValue: DefaultTextStyle.DEFAULT_FONT_SIZE.backgroundSize,
        isValid: numberValidator
    },
    backgroundOpacity: {
        defaultValue: DefaultTextStyle.DEFAULT_BACKGROUND_OPACITY,
        isValid: numberValidator
    },
    color: {
        defaultValue: DefaultTextStyle.DEFAULT_COLOR.getHex(),
        isValid: colorValidator
    },
    opacity: {
        defaultValue: DefaultTextStyle.DEFAULT_OPACITY,
        isValid: normalizedNumberValidator
    },
    priority: {
        defaultValue: 0,
        isValid: numberValidator
    },
    size: {
        defaultValue: DefaultTextStyle.DEFAULT_FONT_SIZE.size,
        isValid: numberValidator
    }
};

// TODO: move to ExtrudedTechniqueHandler when merging
export const extrudedPolygonTechniqueHandlerProps: SourceDescriptor<ExtrudedPolygonTechnique> = {
    ...techniqueHandlerStandardParamsDescriptor,
    animateExtrusion: {
        defaultValue: undefined,
        isValid: booleanValidator
    },
    animateExtrusionDuration: {
        defaultValue: 750, // TODO constant,
        isValid: numberValidator
    }
};

// TODO: move to TerrainTechniqueHandler when merging
function heightBasedColorsValidator(v: Value & Partial<HeightBasedColors>) {
    return v && Array.isArray(v.heightArray) && Array.isArray(v.colorArray);
}

export const terrainTechniqueHandlerDescriptor: SourceDescriptor<TerrainTechnique> = {
    ...techniqueHandlerStandardParamsDescriptor,
    heightBasedColors: {
        defaultValue: undefined,
        isValid: heightBasedColorsValidator
    },
    heightGradientInterpolation: {
        defaultValue: "Discrete",
        isValid: nonEmptyStringValidator
    },
    heightGradientWidth: {
        defaultValue: 128,
        isValid: numberValidator
    }
};

export const pointTechniqueHandlerDescriptor: SourceDescriptor<MakeTechniqueAttrs<
    PointTechniqueParams
>> = {
    ...baseTechniqueParamsDescriptor,
    texture: {
        defaultValue: undefined,
        isValid: textureValidator
    },
    enablePicking: {
        defaultValue: false,
        isValid: booleanValidator
    },
    size: {
        defaultValue: 10,
        isValid: numberValidator
    },
    color: {
        defaultValue: 0xffffff,
        isValid: colorValidator
    },
    transparent: {
        defaultValue: false,
        isValid: booleanValidator
    },
    opacity: {
        defaultValue: 1.0,
        isValid: normalizedNumberValidator
    }
};
