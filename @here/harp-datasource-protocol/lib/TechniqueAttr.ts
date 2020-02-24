/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import { Env, Expr, ExprScope, MapEnv, Value } from "./Expr";
import { getPropertyValue, isInterpolatedProperty } from "./InterpolatedProperty";
import { InterpolatedProperty } from "./InterpolatedPropertyDefs";

const logger = LoggerManager.instance.create("TechniqueAttr");

export interface AttrEvaluationContext {
    /**
     * Expression evaluation environment containing variable bindings.
     */
    env: MapEnv;

    /**
     * Storage level of tile containing this feature.
     *
     * To be removed, when interpolators will be based on [[Expr]].
     */
    storageLevel: number;

    /**
     * Zoom level of tile containing this feature.
     *
     * To be removed, when interpolators will be based on [[Expr]].
     */
    zoomLevel: number;

    /**
     * Optional, cache of expression results.
     *
     * @see [[Expr.evaluate]]
     */
    cachedExprResults?: Map<Expr, Value>;
}

/**
 * Evaluate feature attr _without_ default value.
 *
 * @returns actual value or `undefined`
 */
export function evaluateTechniqueAttr<T = Value>(
    context: Env | AttrEvaluationContext,
    attrValue: T | Expr | InterpolatedProperty | undefined
): T | undefined;

/**
 * Evaluate feature attr _with_ default value.
 *
 * @returns actual value or `defaultValue`
 */
export function evaluateTechniqueAttr<T = Value>(
    context: Env | AttrEvaluationContext,
    attrValue: T | Expr | InterpolatedProperty | undefined,
    defaultValue: T
): T;

export function evaluateTechniqueAttr<T = Value>(
    context: Env | AttrEvaluationContext,
    attrValue: T | Expr | InterpolatedProperty | undefined,
    defaultValue?: T
): T | undefined {
    const env = context instanceof Env ? context : context.env;

    let evaluated: Value | undefined;
    if (Expr.isExpr(attrValue)) {
        try {
            evaluated = attrValue.evaluate(
                env,
                ExprScope.Dynamic,
                !(context instanceof Env) ? context.cachedExprResults : undefined
            );
        } catch (error) {
            logger.error(`failed to evaluate expression '${JSON.stringify(attrValue)}': ${error}`);
            evaluated = undefined;
        }
    } else if (isInterpolatedProperty(attrValue)) {
        evaluated = getPropertyValue(attrValue, context instanceof Env ? context : context.env);
    } else {
        evaluated = (attrValue as unknown) as Value;
    }
    if (evaluated === undefined || evaluated === null) {
        return defaultValue;
    } else {
        return (evaluated as unknown) as T;
    }
}
