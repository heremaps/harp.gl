/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, Expr, JsonExpr, Value } from "./Expr";
import { isInterpolatedProperty } from "./InterpolatedProperty";
import { InterpolatedProperty, InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";

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

// TODO: Can be removed, when all when interpolators are implemented as [[Expr]]s
export type RemoveInterpolatedPropDef<T> = (T | InterpolatedPropertyDefinition<any>) extends T
    ? Exclude<T, InterpolatedPropertyDefinition<any>>
    : T;
export type RemoveJsonExpr<T> = (T | JsonExpr) extends T ? Exclude<T, JsonExpr> : T;

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
        ? RemoveInterpolatedPropDef<RemoveJsonExpr<T[P]>> | Expr | InterpolatedProperty<number>
        : T[P];
} & { _cacheKey?: string };

export function isDynamicTechniqueExpr(x: any): x is DynamicTechniqueAttr {
    return x instanceof Expr || isInterpolatedProperty(x) || typeof x === "function";
}

export interface IDynamicTechniqueHandler {
    evaluateDynamicAttr<T>(attrValue: T | DynamicTechniqueAttr<T> | undefined): T | undefined;
    evaluateDynamicAttr<T>(attrValue: T | DynamicTechniqueAttr<T> | undefined, defaultValue: T): T;
    evaluateDynamicAttr<T>(
        attrValue: T | DynamicTechniqueAttr<T> | undefined,
        // tslint:disable-next-line:unified-signatures
        defaultValue?: T
    ): T | undefined;

    addDynamicAttrHandler<T = Value>(
        attrValue: Value | DynamicTechniqueAttr<T>,
        callback: (v: T, sceneState: SceneState) => void
    ): void;

    getSharedExpr(expr: JsonExpr): Expr;
}
