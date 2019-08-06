/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr, MapEnv, Value, ValueMap } from "./Expr";
import { getPropertyValue, isInterpolatedProperty } from "./InterpolatedProperty";
import { InterpolatedProperty } from "./InterpolatedPropertyDefs";

/**
 * Environment needed to evaluate technique properties dependent on feature attributes.
 */
export class FeatureEnv implements MapEnv {
    /**
     * Feature properties.
     */
    readonly env: MapEnv;

    /**
     * Storage level of tile containing this feature.
     */
    readonly storageLevel: number;

    /**
     * Optional, cache of expression results.
     *
     * @see [[Expr.evaluate]]
     */
    cachedExprResults?: Map<Expr, Value>;

    constructor(
        env: MapEnv | ValueMap,
        storageLevel: number,
        cachedExprResults?: Map<Expr, Value>
    ) {
        this.env = env instanceof MapEnv ? env : new MapEnv(env);
        this.storageLevel = storageLevel;
        this.cachedExprResults = cachedExprResults;
    }

    lookup(name: string): Value | undefined {
        return this.env.lookup(name);
    }

    unmap() {
        return this.env.unmap();
    }

    get entries() {
        return this.env.entries;
    }
    /**
     * Evaluate feature attr _without_ default value.
     *
     * @returns actual value or `undefined`
     */
    evaluate<T = Value>(attrValue: T | Expr | InterpolatedProperty<T> | undefined): T | undefined;

    /**
     * Evaluate feature attr _with_ default value.
     *
     * @returns actual value or `defaultValue`
     */
    evaluate<T = Value>(
        attrValue: T | Expr | InterpolatedProperty<T> | undefined,
        defaultValue: T
    ): T;

    evaluate<T = Value>(
        attrValue: T | Expr | InterpolatedProperty<T> | undefined,
        defaultValue?: T
    ): T | undefined {
        let evaluated: Value | undefined;
        if (attrValue instanceof Expr) {
            evaluated = attrValue.evaluate(this, this.cachedExprResults);
        } else if (isInterpolatedProperty(attrValue)) {
            evaluated = getPropertyValue(attrValue, this.storageLevel);
        } else {
            evaluated = (attrValue as unknown) as Value;
        }
        if (evaluated === undefined) {
            return defaultValue;
        } else {
            return (evaluated as unknown) as T;
        }
    }
}
