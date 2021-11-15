/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";

import { CallExpr, LookupExpr, ObjectLiteralExpr, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

interface KeyValObj {
    [key: string]: Value;
}
interface LookupEntry {
    keys: KeyValObj;
    attributes: KeyValObj;
}

type LookupArray = LookupEntry[];
type LookupMap = Map<string, KeyValObj>;

function joinKeyValues(keys: string[]): string {
    return keys.join("&");
}

function stringifyKeyValue(key: string, value: Value): string {
    return key + "=" + JSON.stringify(value);
}

/**
 * Joins the strings of each given array.
 * @param combinations Array of string arrays that must be joined.
 * @returns The joined strings sorted from longest to shortest (in number of substrings).
 */
function joinCombinations(combinations: string[][]): string[] {
    // sort from longest (more specific) to shortest (more generic).
    combinations.sort((lhs, rhs) => rhs.length - lhs.length);
    const result = combinations.map((keys: string[]) => joinKeyValues(keys));
    // Add the empty combination which will match a default table entry (an entry without keys) if
    // it exists.
    result.push("");
    return result;
}
/**
 * Gets all combinations of all lengths of a list of strings.
 * @param input An array containing all strings.
 * @param index Start index of the strings in `input` that will be considered.
 * @returns An array of all combinations. The strings within each combination are in the inverse
 * order of the input array.
 */
function getAllCombinations(input: string[], index: number = 0): string[][] {
    if (index >= input.length) {
        return [];
    }

    const combinations = getAllCombinations(input, index + 1);

    const initLength = combinations.length;
    for (let i = 0; i < initLength; i += 1) {
        combinations.push([...combinations[i], input[index]]);
    }
    combinations.push([input[index]]);
    return combinations;
}

/**
 * Make all combinations of all lengths with the search keys of the given lookup expression.
 * @param lookupExpr The lookup expression.
 * @param context The context to evaluate expressions.
 * @returns All combinations, sorted from longest(more specific) to shortest (more generic).
 */
function getKeyCombinations(lookupExpr: LookupExpr, context: ExprEvaluatorContext): string[] {
    const keys = lookupExpr.args.slice(1);
    const result = [];
    for (let i = 0; i < keys.length; i += 2) {
        const value = context.evaluate(keys[i + 1]);
        // ignore keys whose values evaluate to null.
        if (value === null) {
            continue;
        }
        const key = context.evaluate(keys[i]) as string;
        result.push(stringifyKeyValue(key, value));
    }
    // Reverse sort, getAllCombinations reverses the order.
    result.sort().reverse();

    return joinCombinations(getAllCombinations(result));
}

/**
 * Creates a map from the lookup entries in a given array.
 * @param lookupArray The array to transform.
 * @returns The resulting map.
 */
function createLookupMap(lookupArray: LookupArray): LookupMap {
    const map = new Map();
    for (const entry of lookupArray) {
        if (typeof entry !== "object") {
            throw new Error(`Invalid lookup table entry type (${typeof entry})`);
        }
        if (!entry.keys) {
            throw new Error(`Lookup table entry has no 'keys' property.`);
        }
        if (!entry.attributes) {
            throw new Error(`Lookup table entry has no 'attributes' property.`);
        }
        const key = joinKeyValues(
            Object.getOwnPropertyNames(entry.keys)
                .sort()
                .map(key => stringifyKeyValue(key, entry.keys[key]))
        );
        map.set(key, entry.attributes);
    }
    return map;
}

/**
 * Searches matches of the given keys in a map.
 * @param keys Keys to search in the map.
 * @param map The lookup map.
 * @returns The first match (in the order in which keys are given) or null if no match found.
 */
function searchLookupMap(keys: string[], map: LookupMap): KeyValObj | null {
    for (const key of keys) {
        const matchAttributes = map.get(key);
        if (matchAttributes) {
            return matchAttributes;
        }
    }
    return null;
}

const operators = {
    length: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (Array.isArray(value) || typeof value === "string") {
                return value.length;
            }
            throw new Error(`invalid operand '${value}' for operator 'length'`);
        }
    },
    coalesce: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            for (const childExpr of call.args) {
                const value = context.evaluate(childExpr);
                if (value !== null) {
                    return value;
                }
            }
            return null;
        }
    },
    lookup: {
        call: (context: ExprEvaluatorContext, lookup: LookupExpr) => {
            // Argument types are checked on parsing, see LookupExpr.parseArray().
            assert(lookup.args.length > 0, "missing lookup table");

            const keyCombinations = getKeyCombinations(lookup, context);
            let table = context.evaluate(lookup.args[0]) as LookupArray | LookupMap;
            assert(Array.isArray(table) || table instanceof Map, "wrong lookup table type");

            if (Array.isArray(table)) {
                // Transform the lookup table into a map to speedup lookup, since the same table
                // might be used by multiple lookup expressions.
                table = createLookupMap(table);
                const lookupMapExpr = new ObjectLiteralExpr(table);
                // Replace the lookup table argument with the map. Next calls to the same expression
                // (e.g. re-evaluations due to data dependencies) will use the map.
                lookup.args[0] = lookupMapExpr;
            }

            return searchLookupMap(keyCombinations, table);
        }
    }
};

export const MiscOperators: OperatorDescriptorMap = operators;
export type MiscOperatorNames = keyof typeof operators;
