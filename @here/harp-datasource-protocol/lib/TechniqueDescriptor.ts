/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Technique } from "./Techniques";

export enum AttrScope {
    /**
     * Attributes that affect generation of feature geometry and thus must be resolved at decoding
     * time.
     *
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
     * They shouldn't have big variancy and evaluate to at least dozens of values as each
     * combination of these attributes consitute new technique and material.
     *
     * These attributes are available in decoding and rendering scope.
     */
    TechniqueGeometry,

    /**
     * Attributes that are common to whole group of features drawn with this technique.
     * Attributes that can be changed in resulting object/material from frame to frame. They are
     * usually implemented as uniforms.
     *
     * These attributes may be available only at rendering scope.
     */
    TechniqueRendering
}

/**
 * Extract  property names from [[Technique]]-like interface (excluding `name`) as union of string
 * literals.
 *
 * TechniquePropName<Base
 *
 */
export type TechniquePropNames<T> = T extends { name: any } ? keyof Omit<T, "name"> : keyof T;

export type TechniquePropScopes<T> = {
    [P in TechniquePropNames<T>]?: AttrScope;
};

export interface TechniqueDescriptor<T> {
    attrTransparencyColor?: string;
    attrScopes: TechniquePropScopes<T>;
}

type OneThatMatches<T, P> = T extends P ? T : never;
export type TechniqueByName<K extends Technique["name"]> = OneThatMatches<Technique, { name: K }>;

export type TechniqueDescriptorRegistry = {
    [P in Technique["name"]]?: TechniqueDescriptor<TechniqueByName<P>>;
};

export function mergeTechniqueDescriptor<T>(
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
