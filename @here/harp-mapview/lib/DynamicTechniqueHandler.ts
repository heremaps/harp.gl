/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    StringEncodedNumeralFormat,
    StringEncodedNumeralFormats,
    StringEncodedNumeralType,
    Technique,
    TechniqueDescriptor,
    techniqueDescriptors
} from "@here/harp-datasource-protocol";
import { DecodedTechnique } from "@here/harp-datasource-protocol/lib/DecodedTechnique";
import {
    DynamicTechniqueExpr,
    evaluateTechniqueAttr,
    isDynamicTechniqueExpr,
    SceneState
} from "@here/harp-datasource-protocol/lib/DynamicTechniqueExpr";
import { Env, Value } from "@here/harp-datasource-protocol/lib/Expr";
import { assert, LoggerManager } from "@here/harp-utils";
import { MapView } from "./MapView";

export const logger = LoggerManager.instance.create("DynamicTechniqueHandler");

const tmpColor = new THREE.Color();

export type DynamicValueResolverFactory = (
    value: Value | DynamicTechniqueExpr,
    mgr: DynamicTechniqueCache
) => DynamicTechniqueExpr | undefined;

export type TechniquePropNames<T> = T extends { name: any } ? keyof Omit<T, "name"> : keyof T;

export type DynamicTechniqueCustomAttrResolverRegistry = {
    [attrName in TechniquePropNames<Technique>]?: DynamicValueResolverFactory;
};

export type DynamicTechniqueAttrEntry = [string, DynamicTechniqueExpr];

export interface DynamicListenerEntry {
    lastUpdateFrameNumber: number;

    dynamicValue: DynamicTechniqueExpr;
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
    get pixel2World(): number {
        return this.mapView.pixelToWorld;
    }
    get cameraFar(): number {
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

    evaluateDynamicAttr<T>(attrValue: T | DynamicTechniqueExpr | undefined): T | undefined;
    evaluateDynamicAttr<T>(attrValue: T | DynamicTechniqueExpr | undefined, defaultValue: T): T;
    evaluateDynamicAttr<T>(
        attrValue: T | DynamicTechniqueExpr | undefined,
        defaultValue?: T
    ): T | undefined {
        return evaluateTechniqueAttr<T>(attrValue, this.env, defaultValue!);
    }

    getTechnique(technique: DecodedTechnique) {
        return this.getOrCreateTechnique(technique);
    }

    getOrCreateSharable<T>(cacheKey: string, create: () => T): T {
        return this.cache.genericCache.getOrCreate(cacheKey, create);
    }

    addDynamicAttrHandler(
        attr: Value | DynamicTechniqueExpr,
        callback: (v: Value, sceneState: SceneState) => void
    ) {
        if (attr === undefined) {
            return;
        }
        if (isDynamicTechniqueExpr(attr)) {
            this.dynamicExprListeners.push({
                lastUpdateFrameNumber: -1,
                dynamicValue: attr,
                callback
            });
        } else {
            callback(attr, this.sceneState);
        }
    }

    applyDynamicTechniqueChanges(sceneState: SceneState) {
        const currentFrameNumber = sceneState.frameNumber;

        for (const callabckEntry of this.dynamicExprListeners) {
            const expr = callabckEntry.dynamicValue;
            if (expr.lastVisitedFrameNumber !== currentFrameNumber) {
                const newValue = evaluateTechniqueAttr<Value>(expr, this.env);
                if (newValue !== expr.lastValue) {
                    expr.lastUpdateFrameNumber = currentFrameNumber;
                    expr.lastValue = newValue;
                }
                expr.lastVisitedFrameNumber = currentFrameNumber;
            }
            if (callabckEntry.lastUpdateFrameNumber === expr.lastUpdateFrameNumber) {
                continue;
            }

            callabckEntry.callback(callabckEntry.dynamicValue.lastValue, sceneState);
            callabckEntry.lastUpdateFrameNumber = currentFrameNumber;
        }
    }

    getOrCreateTechnique(technique: DecodedTechnique): Technique {
        return this.cache.genericCache.getOrCreate(`technique:${technique._cacheKey}`, () =>
            this.doCreateDynamicTechnique(technique)
        );
    }

    private doCreateDynamicTechnique(technique: DecodedTechnique): Technique {
        const techniqueDescriptor = techniqueDescriptors[technique.name!] as TechniqueDescriptor<
            Technique
        >;

        const result: Partial<Technique> = {
            name: technique.name
        };
        for (const attrName in technique) {
            if (!technique.hasOwnProperty(attrName)) {
                continue;
            }

            const value: Value | DynamicTechniqueExpr = (technique as any)[attrName];
            const processedValue = this.preprocessAttrValue(attrName, value);

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

            if (value !== undefined) {
                (result as any)[attrName] = processedValue;
            }
        }
        return result as Technique;
    }

    private preprocessAttrValue(
        attrName: string,
        value: Value | DynamicTechniqueExpr
    ): Value | DynamicTechniqueExpr | undefined {
        const evaluatorFactory:
            | DynamicValueResolverFactory
            | undefined = (builtinDynamicAttrEvaluatorRegistry as any)[attrName];

        if (evaluatorFactory !== undefined) {
            value = evaluatorFactory(value, this.cache);
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
        if (isDynamicTechniqueExpr(value)) {
            return this.cache.dynamicTechniqueExpressions.getOrCreate(
                value._cacheKey || THREE.Math.generateUUID(),
                () => {
                    return { ...(value as DynamicTechniqueExpr) };
                }
            );
        } else {
            return value;
        }
    }

    private getOrCreateStringEncodedNumeral(
        value: string,
        format: StringEncodedNumeralFormat
    ): Value | DynamicTechniqueExpr | undefined {
        const decoded = format.decoder(value);
        switch (format.type) {
            case StringEncodedNumeralType.Meters:
                return decoded[0];
            case StringEncodedNumeralType.Pixels:
                const decodedVal = decoded[0];
                const cacheKey = `$sen:${value}`;
                return this.cache.dynamicTechniqueExpressions.getOrCreate(cacheKey, () => {
                    return {
                        _cacheKey: `$sen:${value}`,
                        resolver: sceneState => decodedVal * sceneState.pixel2World
                    };
                });
            case StringEncodedNumeralType.Hex:
            case StringEncodedNumeralType.RGB:
            case StringEncodedNumeralType.HSL:
                return tmpColor.setHSL(decoded[0], decoded[1], decoded[2]).getHex();
            default:
                return decoded[0];
        }
    }
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
    dynamicTechniqueExpressions = new UnboundedCache<string, DynamicTechniqueExpr | undefined>();
    genericCache = new UnboundedCache<string, any>();

    reset() {
        this.dynamicTechniqueExpressions.clear();
        this.genericCache.clear();
    }
}

export const builtinDynamicAttrEvaluatorRegistry: DynamicTechniqueCustomAttrResolverRegistry = {};
