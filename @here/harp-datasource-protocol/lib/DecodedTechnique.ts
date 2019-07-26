/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDynamicTechniqueExpr } from "./DynamicTechniqueExpr";
import { JsonExpr } from "./Expr";
import { InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import { IndexedTechnique, Technique } from "./Techniques";

/**
 * Transferable representation of dynamic technique expression.
 */
export interface DecodedTechniqueExpr {
    /**
     * Opaque cache key.
     *
     * Should be `unique` in space of one particular [[StyleSet]], so [[DynamicTechniqueManager]]
     * can reuse [[Technique]] instances from many [[DecodedTile]]s that belong to one [[StyleSet]].
     */
    _cacheKey: string;
    transferrableExpr?: JsonExpr;

    // TODO: remove, when interpolators are implemented as [[Expr]]s
    interpolated?: InterpolatedPropertyDefinition<unknown>;
}

// TODO: Can be removed, when all when interpolators are implemented as [[Expr]]s
export type RemoveInterpolatedPropDef<T> = (T | InterpolatedPropertyDefinition<any>) extends T
    ? Exclude<T, InterpolatedPropertyDefinition<any>>
    : T;
export type RemoveJsonExpr<T> = (T | JsonExpr) extends T ? Exclude<T, JsonExpr> : T;

/**
 * Make dependent type from particular [[Technique]] that maps dynamic attributes to transferable,
 * representation: [[DecodedTechniqueExpr]]
 */

export type MakeDecodedTechnique<T extends Technique> = {
    [P in keyof T]?: (T[P] | JsonExpr | InterpolatedPropertyDefinition<any>) extends T[P]
        ? RemoveInterpolatedPropDef<RemoveJsonExpr<T[P]>> | DecodedTechniqueExpr
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
        let attrValue = (technique as any)[attrName];
        if (isDynamicTechniqueExpr(attrValue)) {
            attrValue = {
                cacheKey: attrValue._cacheKey,
                transferrableExpr: attrValue.transferrableExpr,
                interpolated: attrValue.interpolated
            };
        }
        (result as any)[attrName] = attrValue;
    }
    return (result as any) as DecodedTechnique;
}
