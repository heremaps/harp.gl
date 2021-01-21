/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

import { Env } from "./Env";
import { Expr, ExprScope, Value } from "./Expr";
import { Pixels } from "./Pixels";
import { RGBA } from "./RGBA";
import { parseStringEncodedNumeral } from "./StringEncodedNumeral";

const logger = LoggerManager.instance.create("PropertyValue");

/**
 * Get the value of the specified property in given `env`.
 *
 * @param property - Property of a technique.
 * @param env - The {@link Env} used to evaluate the property
 * @param cache - An optional expression cache.
 */
export function getPropertyValue(
    property: Value | undefined,
    env: Env,
    cache?: Map<Expr, Value>
): any {
    if (Expr.isExpr(property)) {
        try {
            let r = property.evaluate(env, ExprScope.Dynamic, cache);

            if (typeof r === "string") {
                r = RGBA.parse(r) ?? Pixels.parse(r) ?? r;
            }

            if (r instanceof RGBA) {
                return r.getHex();
            } else if (r instanceof Pixels) {
                return r.value * (Number(env.lookup("$pixelToMeters")) ?? 1);
            }
            return r;
        } catch (error) {
            logger.error(
                "failed to evaluate expression",
                JSON.stringify(property),
                "error",
                String(error)
            );
            return null;
        }
    }

    if (property === null || typeof property === "undefined") {
        return null;
    } else if (typeof property !== "string") {
        // Property in numeric or array, etc. format
        return property;
    } else {
        // Non-interpolated string encoded numeral parsing
        const pixelToMeters = (env.lookup("$pixelToMeters") as number) || 1;
        const value = parseStringEncodedNumeral(property, pixelToMeters);
        return value !== undefined ? value : property;
    }
}
