/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoveInterpolatedPropDef, RemoveJsonExpr } from "./DynamicTechniqueAttr";
import { Expr, JsonExpr } from "./Expr";
import { InterpolatedProperty, InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import { IndexedTechnique, Technique } from "./Techniques";

/**
 * Make dependent type from particular [[Technique]] that maps dynamic attributes to transferable,
 * representation: [[DecodedTechniqueExpr]]
 */

export type MakeDecodedTechnique<T extends Technique> = {
    [P in keyof T]?: (T[P] | JsonExpr | InterpolatedPropertyDefinition<any>) extends T[P]
        ? RemoveInterpolatedPropDef<RemoveJsonExpr<T[P]>> | JsonExpr | InterpolatedProperty<unknown>
        : T[P];
};

/**
 * Technique-dependent type that can be transfered through context boundaries.
 */
export type DecodedTechnique = MakeDecodedTechnique<Technique> & {
    _cacheKey: string;
} & IndexedTechnique;

/**
 * Create transferable representation of dynamic technique.
 */
export function makeDecodedTechnique(technique: IndexedTechnique): DecodedTechnique {
    const result: Partial<DecodedTechnique> = {};
    for (const attrName in technique) {
        if (!technique.hasOwnProperty(attrName)) {
            continue;
        }
        let attrValue: any = (technique as any)[attrName];
        if (attrValue instanceof Expr) {
            attrValue = attrValue.toJSON();
        }
        (result as any)[attrName] = attrValue;
    }
    result._cacheKey = `${technique._styleSetIndex}:${technique._key}`;
    return (result as any) as DecodedTechnique;
}
