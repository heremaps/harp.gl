/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    DynamicTechniqueAttr,
    getPropertyValue,
    InterpolatedProperty,
    isInterpolatedProperty,
    SceneState,
    SceneStateEnv,
    StringEncodedNumeralFormat,
    StringEncodedNumeralFormats,
    StringEncodedNumeralType,
    Technique,
    TechniqueDescriptor,
    techniqueDescriptors
} from "@here/harp-datasource-protocol";
import { DecodedTechnique } from "@here/harp-datasource-protocol/lib/DecodedTechnique";
import { Env, Expr, isJsonExpr, JsonExpr, Value } from "@here/harp-datasource-protocol/lib/Expr";
import {
    ExprEvaluator,
    ExprEvaluatorContext,
    OperatorDescriptorMap
} from "@here/harp-datasource-protocol/lib/ExprEvaluator";
import { ExprPool } from "@here/harp-datasource-protocol/lib/ExprPool";
import { LoggerManager } from "@here/harp-utils";
import { MapView } from "./MapView";

export const logger = LoggerManager.instance.create("DynamicTechniqueHandler");

const tmpColor = new THREE.Color();

export type DynamicValueResolver<T = Value> = (sceneState: SceneState) => T;

export type DynamicValueResolverFactory = (
    value: Value | JsonExpr | InterpolatedProperty<unknown>,
    mgr: DynamicTechniqueCache
) => DynamicTechniqueAttr | undefined;

export type TechniquePropNames<T> = T extends { name: any } ? keyof Omit<T, "name"> : keyof T;

export type DynamicTechniqueCustomAttrResolverRegistry = {
    [attrName in TechniquePropNames<Technique>]?: DynamicValueResolverFactory;
};

export interface DynamicListenerEntry {
    lastUpdateFrameNumber: number;

    dynamicValue: DynamicTechniqueAttr;
    callback: (v: Value | undefined, sceneState: SceneState) => void;
}

export class MapViewSeneState implements SceneState {
    constructor(readonly mapView: MapView) {}
    get time(): number {
        return 0;
    }
    get frameNumber(): number {
        return this.mapView.frameNumber;
    }
    get zoomLevel(): number {
        return this.mapView.zoomLevel;
    }
    get pixelToMeters(): number {
        return this.mapView.pixelToWorld;
    }
    get maxVisibility(): number {
        return this.mapView.camera.far;
    }
}

/**
 * Manages dynamic attributes of Tile objects created from techniques:
 *  - technique itself
 *  - materials
 *  - objects
 *
 * One per tile.
 *
 * Should be connected to other [[DynamicTechniqueHandler]] via [[cache]] attribute, by which it
 * will share techniques/expression evaluatorss/materials etc.
 */
export class DynamicTechniqueHandler {
    dynamicExprListeners: DynamicListenerEntry[] = [];
    env: Env;

    constructor(readonly cache: DynamicTechniqueCache, readonly sceneState: SceneState) {
        this.env = new SceneStateEnv(sceneState);
    }

    reset() {
        this.dynamicExprListeners = [];
    }

    evaluateDynamicAttr<T>(attrValue: T | DynamicTechniqueAttr<T> | undefined): T | undefined;
    evaluateDynamicAttr<T>(attrValue: T | DynamicTechniqueAttr<T> | undefined, defaultValue: T): T;
    evaluateDynamicAttr<T>(
        attrValue: T | DynamicTechniqueAttr<T> | undefined,
        defaultValue?: T
    ): T | undefined {
        let evaluated: Value | undefined;
        if (attrValue instanceof Expr) {
            evaluated = attrValue.evaluate(this.env, this.cache.cachedFrameExprResults);
        } else if (isInterpolatedProperty(attrValue)) {
            evaluated = getPropertyValue(attrValue, this.sceneState.zoomLevel);
        } else {
            evaluated = (attrValue as unknown) as Value;
        }
        if (evaluated === undefined) {
            return defaultValue;
        } else {
            return (evaluated as unknown) as T;
        }
    }

    getTechnique(technique: DecodedTechnique) {
        return this.getOrCreateTechnique(technique);
    }

    getSharedExpr(expr: JsonExpr): Expr {
        return new FrameCachedExpr(Expr.fromJSON(expr).intern(this.cache.exprPool));
    }
    getOrCreateSharable<T>(cacheKey: string, create: () => T): T {
        return this.cache.genericCache.getOrCreate(cacheKey, create);
    }

    addDynamicAttrHandler<T = Value>(
        attrValue: Value | DynamicTechniqueAttr<T> | undefined,
        callback: (v: T, sceneState: SceneState) => void
    ) {
        if (attrValue === undefined) {
            return;
        }
        if (attrValue instanceof Expr || isInterpolatedProperty(attrValue)) {
            this.dynamicExprListeners.push({
                lastUpdateFrameNumber: -1,
                dynamicValue: attrValue,
                callback: callback as any
            });
        } else {
            callback((attrValue as unknown) as T, this.sceneState);
        }
    }

    applyDynamicTechniqueChanges(sceneState: SceneState) {
        const currentFrameNumber = sceneState.frameNumber;

        if (this.cache.cachedFrameExprResultsFrameNumber !== sceneState.frameNumber) {
            this.cache.cachedFrameExprResults.clear();
            this.cache.cachedFrameExprResultsFrameNumber = sceneState.frameNumber;
        }
        for (const callabckEntry of this.dynamicExprListeners) {
            const expr = callabckEntry.dynamicValue;
            const newValue = this.evaluateDynamicAttr(expr);

            callabckEntry.callback(newValue, sceneState);
            callabckEntry.lastUpdateFrameNumber = currentFrameNumber;
        }
    }

    getOrCreateTechnique(technique: DecodedTechnique): Technique {
        return this.cache.genericCache.getOrCreate(`technique:${technique._cacheKey}`, () =>
            this.doCreateDynamicTechnique(technique)
        );
    }

    private doCreateDynamicTechnique(technique: DecodedTechnique): Technique {
        // const techniqueDescriptor = techniqueDescriptors[technique.name!] as TechniqueDescriptor<
        //    Technique
        // >;

        const result: Partial<Technique> = {
            name: technique.name
        };
        for (const attrName in technique) {
            if (!technique.hasOwnProperty(attrName)) {
                continue;
            }

            const value: Value | JsonExpr | InterpolatedProperty<unknown> = (technique as any)[
                attrName
            ];
            const processedValue = this.preprocessAttrValue(attrName, value);

            /*
            if (isDynamicTechniqueExpr(processedValue)) {
                // TODO: this should be assert, because
                // SSE should filter them in decoding phase
                if (
                    techniqueDescriptor !== undefined &&
                    !techniqueDescriptor.dynamicPropNames.includes(attrName as any)
                ) {
                    logger.warn(
                        `attribute ${attrName} cannot be dynamic in ${technique.name}, ignored`
                    );
                    continue;
                }
            }
            */

            if (value !== undefined) {
                (result as any)[attrName] = processedValue;
            }
        }
        return result as Technique;
    }

    private preprocessAttrValue(
        attrName: string,
        value: Value | JsonExpr | InterpolatedProperty<unknown>
    ): Value | DynamicTechniqueAttr | undefined {
        const evaluatorFactory:
            | DynamicValueResolverFactory
            | undefined = (builtinDynamicAttrEvaluatorRegistry as any)[attrName];

        if (evaluatorFactory !== undefined) {
            value = evaluatorFactory(value, this.cache) as any;
        }

        if (typeof value === "string") {
            const matchedFormat = StringEncodedNumeralFormats.find(format =>
                format.regExp.test(value as string)
            );
            if (matchedFormat !== undefined) {
                return this.getOrCreateStringEncodedNumeral(value, matchedFormat);
            } else {
                return value;
            }
        }
        if (isJsonExpr(value)) {
            return Expr.fromJSON(value).intern(this.cache.exprPool);
        } else {
            return value;
        }
    }

    private getOrCreateStringEncodedNumeral(
        value: string,
        format: StringEncodedNumeralFormat
    ): Value | DynamicTechniqueAttr | undefined {
        const decoded = format.decoder(value);
        switch (format.type) {
            case StringEncodedNumeralType.Meters:
                return decoded[0];
            case StringEncodedNumeralType.Pixels:
                const decodedVal = decoded[0];
                return this.getSharedExpr(["pixel2world", decodedVal]);
            case StringEncodedNumeralType.Hex:
            case StringEncodedNumeralType.RGB:
            case StringEncodedNumeralType.HSL:
                return tmpColor.setHSL(decoded[0], decoded[1], decoded[2]).getHex();
            default:
                return decoded[0];
        }
    }
}

class FrameCachedExpr extends Expr {
    lastUpdatedFrameNumber: number = -1;
    cachedValue: Value | undefined;

    constructor(readonly target: Expr) {
        super();
    }

    evaluate(env: Env, cache?: Map<Expr, Value>): Value {
        if (env instanceof SceneStateEnv) {
            return null;
        }
        const sceneStateEnv = env as SceneStateEnv;
        if (this.lastUpdatedFrameNumber !== sceneStateEnv.sceneState.frameNumber) {
            this.cachedValue = this.target.evaluate(env, cache);
            this.lastUpdatedFrameNumber = sceneStateEnv.sceneState.frameNumber;
        }

        return this.cachedValue || null;
    }

    accept<Result>(): Result {
        throw new Error("Method not implemented.");
    }
}

const sceneOperators = {
    pixel2World: (context: ExprEvaluatorContext, args: Expr[]) => {
        const sceneEnv = context.env as SceneStateEnv;

        const v = context.evaluate(args[0]);
        return Number(v) * sceneEnv.sceneState.pixelToMeters;
    }
};

export const SceneOperators: OperatorDescriptorMap = sceneOperators;
export type SceneOperatorsNames = keyof typeof sceneOperators;

ExprEvaluator.defineOperators(SceneOperators);

export class UnboundedCache<Key, Target> {
    cache = new Map<Key, Target>();

    clear() {
        this.cache.clear();
    }

    getOrCreate(key: Key, create: () => Target): Target {
        const existing = this.cache.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const newOne = create();
        this.cache.set(key, newOne);
        return newOne;
    }
}

/**
 * One per mapview and/or datasource.
 */
export class DynamicTechniqueCache {
    genericCache = new UnboundedCache<string, any>();

    exprPool = new ExprPool();
    cachedFrameExprResults = new Map<Expr, Value>();
    cachedFrameExprResultsFrameNumber = -1;

    reset() {
        this.cachedFrameExprResults.clear();
        this.genericCache.clear();
    }
}

export const builtinDynamicAttrEvaluatorRegistry: DynamicTechniqueCustomAttrResolverRegistry = {};
