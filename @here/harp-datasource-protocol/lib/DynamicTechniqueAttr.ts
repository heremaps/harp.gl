/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, Expr, JsonExpr, Value } from "./Expr";
import { isInterpolatedProperty } from "./InterpolatedProperty";
import { InterpolatedProperty, InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import { IndexedTechniqueParams } from "./Techniques";

export interface SceneState {
    /**
     * Time as received in `requestAnimationFrame` callback..
     *
     * Interpolators may use it cache last values, if they expect many invocations per because they
     * were used by several objects.
     */
    time: number;

    /**
     * Frame number.
     *
     * Interpolators may use it cache last values, if they expect many invocations per because they
     * were used by several object.
     */
    frameNumber: number;
    zoomLevel: number;
    pixelToMeters: number;

    /**
     * Used for fading feature.
     */
    maxVisibility: number;
}

export class SceneStateEnv extends Env {
    constructor(readonly sceneState: SceneState) {
        super();
    }
    lookup(name: string): Value {
        return (this.sceneState as any)[name] as Value;
    }
    unmap(): any {
        return { ...this.sceneState };
    }
}

export type RemoveType<T, R> = (T | R) extends T ? Exclude<T, R> : T;

// TODO: Can be removed, when all when interpolators are implemented as [[Expr]]s
export type RemoveInterpolatedPropDefinition<T> = RemoveType<
    T,
    InterpolatedPropertyDefinition<any>
>;
export type RemoveInterpolatedProperty<T> = (T | InterpolatedProperty<any>) extends T
    ? Exclude<T, InterpolatedProperty<any>>
    : T;
export type RemoveJsonExpr<T> = (T | JsonExpr) extends T ? Exclude<T, JsonExpr> : T;
export type RemoveExpr<T> = (T | Expr) extends T ? Exclude<T, Expr> : T;

export type DynamicTechniqueAttr<T = Value> = Expr | InterpolatedProperty<T>;

/**
 * Make runtime representation of technique attributes from JSON-compatible typings.
 *
 * Translates
 *  - InterpolatedPropertyDefinition -> InterpolatedProperty
 *  - JsonExpr -> Expr
 */

export type MakeTechniqueAttrs<T> = {
    [P in keyof T]: (T[P] | JsonExpr) extends T[P]
        ?
              | RemoveInterpolatedPropDefinition<RemoveJsonExpr<T[P]>>
              | Expr
              | InterpolatedProperty<unknown>
        : T[P];
};
export type MakeTechnique<T> = MakeTechniqueAttrs<T> & Partial<IndexedTechniqueParams>;

export function isDynamicTechniqueExpr(x: any): x is DynamicTechniqueAttr {
    return x instanceof Expr || isInterpolatedProperty(x) || typeof x === "function";
}

export interface IDynamicTechniqueHandler {
    addDynamicAttrHandler<T>(
        attrValue: T | DynamicTechniqueAttr<T>,
        defaultValue: T | undefined,
        callback: (v: T, sceneState: SceneState) => void
    ): void;

    getSharedExpr(expr: JsonExpr): Expr;
}
