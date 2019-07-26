/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Technique } from "./Techniques";

/**
 * Extract  property names from [[Technique]]-like interface (excluding `name`) as union of string
 * literals.
 *
 * TechniquePropName<Base
 *
 */
export type TechniquePropName<T> = T extends { name: any } ? keyof Omit<T, "name"> : keyof T;

export interface TechniqueDescriptor<T> {
    /**
     * Attributes that affect generation of feature geometry and thus must be resolved at decoding
     * time.
     *
     * They may have huge variancy as they are implemented as vertex attributes or embedded in
     * generated meshes.
     */
    featurePropNames: Array<TechniquePropName<T>>;
    /**
     * Attributes that affect generated technique instance and thus must be resolved at decoding
     * time.
     *
     * They shouldn't have big variancy and evaluate to at least dozens of values as each
     * combination of these attributes consitute new technique and material.
     */
    techniquePropNames: Array<TechniquePropName<T>>;

    /**
     * Attributes that can be changed in resulting object/material from frame to frame. They are
     * usually implemented as uniforms.
     *
     * They can be resolved at any time, including _every_ frame.
     */
    dynamicPropNames: Array<TechniquePropName<T>>;
}

type OneThatMatches<T, P> = T extends P ? T : never;
type TechniqueByName<K extends Technique["name"]> = OneThatMatches<Technique, { name: K }>;

export type TechniqueDescriptorRegistry = {
    [P in Technique["name"]]?: TechniqueDescriptor<TechniqueByName<P>>;
};

export function mergeTechniqueDescriptor<T>(
    ...descriptors: Array<Partial<TechniqueDescriptor<T>>>
): TechniqueDescriptor<T> {
    const result: TechniqueDescriptor<T> = {
        featurePropNames: [],
        techniquePropNames: [],
        dynamicPropNames: []
    };
    for (const descriptor of descriptors) {
        if (descriptor.featurePropNames !== undefined) {
            result.featurePropNames.push(...descriptor.featurePropNames);
        }
        if (descriptor.techniquePropNames !== undefined) {
            result.techniquePropNames.push(...descriptor.techniquePropNames);
        }
        if (descriptor.dynamicPropNames !== undefined) {
            result.dynamicPropNames.push(...descriptor.dynamicPropNames);
        }
    }
    return result;
}

export enum TechniqueAttrType {
    Feature,
    Technique,
    DynamicMaterial,
    Unknown
}

export function techniqueAttrType<T>(
    attrName: TechniquePropName<T>,
    techniqueDescritor: TechniqueDescriptor<T>
): TechniqueAttrType {
    return techniqueDescritor.techniquePropNames.includes(attrName)
        ? TechniqueAttrType.Technique
        : techniqueDescritor.techniquePropNames.includes(attrName)
        ? TechniqueAttrType.Feature
        : techniqueDescritor.dynamicPropNames.includes(attrName)
        ? TechniqueAttrType.DynamicMaterial
        : TechniqueAttrType.Unknown;
}
