/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoveExpr } from "./DynamicTechniqueAttr";
import { Expr, JsonExpr } from "./Expr";
import { InterpolatedProperty } from "./InterpolatedPropertyDefs";
import { IndexedTechnique, Technique } from "./Techniques";

/**
 * Make dependent type from particular [[Technique]] that maps dynamic attributes to transferable,
 * representation: [[DecodedTechniqueExpr]]
 */

export type MakeDecodedTechnique<T extends Technique> = {
    [P in keyof T]: (T[P] | Expr | InterpolatedProperty<any>) extends T[P]
        ? RemoveExpr<T[P]> | JsonExpr
        : T[P];
};

/**
 * Technique-dependent type that can be transfered through context boundaries.
 */
export type DecodedTechnique = MakeDecodedTechnique<Technique>;

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
    return (result as any) as DecodedTechnique;
}
