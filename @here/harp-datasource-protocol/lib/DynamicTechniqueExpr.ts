/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, Expr, JsonExpr, Value } from "./Expr";
import { isInterpolatedPropertyDefinition } from "./InterpolatedProperty";
import { InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import { BaseInterpolator, createInterpolator } from "./Interpolators";

/**
 * Runtime representation of dynamic technique attribute.
 *
 * [[Expr]] and [[BaseInterpolator]] instances are created lazily on first use.
 */
export interface DynamicTechniqueExpr {
    _cacheKey?: string;
    transferrableExpr?: JsonExpr;
    interpolated?: InterpolatedPropertyDefinition<unknown>;

    resolver?: DynamicTechniqueAttributeResolver;
    executableExpr?: Expr;
    interpolator?: BaseInterpolator;

    /**
     * Cached last value.
     */
    lastVisitedFrameNumber?: number;
    lastUpdateFrameNumber?: number;
    lastValue?: Value;
}

export function isDynamicTechniqueExpr(
    v: any & Partial<DynamicTechniqueExpr>
): v is DynamicTechniqueExpr {
    return (
        v &&
        (Array.isArray(v.transferrableExpr) ||
            isInterpolatedPropertyDefinition(v.interpolated) ||
            typeof v.resolver === "function")
    );
}

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
    pixel2World: number;

    /**
     * Used for fading feature.
     */
    cameraFar: number;
}

export type DynamicTechniqueAttributeResolver = (sceneState: SceneState) => Value;

/**
 * Evaluate technique attr _without_ default value.
 *
 * @returns actual value or `undefined`
 */
export function evaluateTechniqueAttr<T = Value>(
    attrValue: T | DynamicTechniqueExpr | undefined,
    env: Env
): T | undefined;

/**
 * Evaluate technique attr _with_ default value.
 *
 * @returns actual value or `defaultValue`
 */
export function evaluateTechniqueAttr<T = Value>(
    attrValue: T | DynamicTechniqueExpr | undefined,
    env: Env,
    defaultValue: T
): T;

export function evaluateTechniqueAttr<T = Value>(
    attrValue: T | DynamicTechniqueExpr | undefined,
    env: Env,
    defaultValue?: T
): T | undefined {
    let evaluated: Value | undefined;
    if (isDynamicTechniqueExpr(attrValue)) {
        if (attrValue.transferrableExpr !== undefined) {
            if (attrValue.executableExpr === undefined) {
                attrValue.executableExpr = Expr.fromJSON(attrValue.transferrableExpr);
            }
            evaluated = attrValue.executableExpr.evaluate(env);
        } else if (attrValue.interpolated !== undefined) {
            if (attrValue.interpolator === undefined) {
                attrValue.interpolator = createInterpolator(attrValue.interpolated);
            }

            if (attrValue.interpolator !== undefined) {
                const fooSceneState: SceneState = {
                    pixel2World: 1,
                    zoomLevel: Number(env.lookup("zoomLevel")) || 15, // TODO !!!!
                    time: 0,
                    frameNumber: 0,
                    cameraFar: 1000
                };
                evaluated = attrValue.interpolator.evaluate(fooSceneState);
            }
        }
    } else {
        evaluated = (attrValue as unknown) as Value;
    }
    if (evaluated === undefined) {
        return defaultValue;
    } else {
        return (evaluated as unknown) as T;
    }
}
