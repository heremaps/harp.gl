/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions

import { assert } from "chai";

import * as THREE from "three";

import {
    AmbientLight,
    ColorUtils,
    Env,
    Expr,
    ExprScope,
    JsonArray,
    JsonExpr,
    MapEnv,
    parseStringEncodedColor,
    Value
} from "@here/harp-datasource-protocol";
import { disableBlending, enableBlending } from "@here/harp-materials";
import { getOptionValue } from "@here/harp-utils";

type Compiler<S, D> = (src: S | JsonExpr, defaultValue: D) => D | Expr;

interface SourceAttrDescriptor<T> {
    defaultValue: T;
    isValid: (v: Value) => boolean;
    compiler?: Compiler<Value, T>;
}

type Dynamic<T> = {
    [P in keyof T]?: T[P] | JsonArray;
};

type PropertyMapping<S, C> =
    | (keyof S & keyof C)
    | [keyof S, keyof C]
    | [keyof S, (target: C, v: Value) => void]
    | [Array<keyof S>, (target: C, v: Value[]) => void];

interface TargetDescriptor<T, C> {
    propertyMapping: Array<PropertyMapping<T, C>>;
    targetFactory: (...p: any[]) => C;
}

export interface SourceDescriptor<T> {
    objects?: {
        [name: string]: TargetDescriptor<T, any>;
    };
    attrs: {
        [P in keyof T]?: SourceAttrDescriptor<T[P]>;
    };
}

//
// compilers
//
export function metricStringEncodedNumeralCompiler(value: number | string): number | Expr {
    if (typeof value === "number") {
        return value;
    } else {
        throw new Error("numeric string encoded numerals not supported yet");
        // return new Expr(/*convert string encoded numeral to expr*/);
    }
}

function fadingParamCompiler(value: Value | Expr): Expr {
    if (value instanceof Expr) {
        value = value.toJSON();
    }
    return Expr.fromJSON(["*", ["get", "$maxVisibilityRange"], value as any]);
}

function colorCompiler(value: Value, defaultValue: number): number | Expr {
    // parse color as from string to efficient internal value ... or Expr
    if (typeof value === "number") {
        // remove alpha!
        return value;
    } else if (typeof value === "string") {
        const parsed = parseStringEncodedColor(value);
        if (typeof parsed !== "undefined") {
            return parsed;
        }
    }
    return defaultValue;
}

function numberValidator(v: Value): boolean {
    return typeof v === "number" && !isNaN(v);
}

function colorValidator(v: Value): boolean {
    return typeof v === "number" || typeof v === "string";
}

export function normalizedNumberValidator(v: Value): boolean {
    return typeof v === "number" && v >= 0 && v <= 1;
}

function applyColorAndOpacity(
    material: { color: THREE.Color; opacity: number },
    v: [number, number]
) {
    const [color, opacity] = v;
    const newOpacity = ColorUtils.getAlphaFromHex(color) * opacity;
    if (newOpacity !== material.opacity) {
        if (material.opacity === 1) {
            if ((material as any).blending !== undefined) {
                enableBlending(material);
            }
        } else if (newOpacity === 1) {
            if ((material as any).blending !== undefined) {
                disableBlending(material);
            }
        }
        material.opacity = newOpacity;
    }
    material.color.set(ColorUtils.removeAlphaFromHex(color));
}

function makeDefaultApplicator<C>(target: C, propertyName: keyof C) {
    if (target[propertyName] instanceof THREE.Color) {
        return (actualTarget: C, value: any) => {
            const theColor = (actualTarget[propertyName] as unknown) as THREE.Color;
            theColor.set(value);
        };
    } else {
        return (actualTarget: C, value: any) => {
            actualTarget[propertyName] = value;
        };
    }
}

function compile<T>(
    value: Value | Expr | undefined,
    attrDescriptor: SourceAttrDescriptor<T>
): T | Expr | undefined {
    if (value === null || typeof value === "undefined") {
        return attrDescriptor.defaultValue;
    }

    if (Array.isArray(value)) {
        return Expr.fromJSON(value);
    }
    if (value instanceof Expr) {
        return value;
    }
    if (attrDescriptor.compiler !== undefined) {
        return attrDescriptor.compiler(value, attrDescriptor.defaultValue);
    } else {
        return (value as unknown) as T;
    }
}

function evaluate<T>(
    value: T | Expr,
    attrDescriptor: SourceAttrDescriptor<T>,
    env: Env,
    cache?: Map<Expr, Value>
): T {
    if (value instanceof Expr) {
        value = value.evaluate(env, ExprScope.Dynamic, cache) as any;
    }
    if (
        value === null ||
        typeof value === "undefined" ||
        !attrDescriptor.isValid((value as unknown) as Value)
    ) {
        return attrDescriptor.defaultValue;
    }
    return value as T;
}

interface DynamicAttrEntrySingle<C> {
    targetPropName?: keyof C;
    applicator?: (target: C, v: Value) => void;
    sourceAttrExpr: Expr;
    lastValue: Value;
    attrDescriptor: SourceAttrDescriptor<any>;
}
interface DynamicAttrEntryMulti<C> {
    applicator: (target: C, v: Value[]) => void;
    sourceAttrExprs: Array<Value | Expr>;
    lastValues: Value[];
    attrDescriptors: Array<SourceAttrDescriptor<any>>;
}

function isDynamicAttrEntrySingle<C>(v: any): v is DynamicAttrEntrySingle<C> {
    return v && typeof v.sourceAttrExpr !== "undefined";
}

/**
 * Result of `createDynamicObject` call.
 *
 * May be used to memoize all potentially
 */
interface DynamicObjectEntry<T> {
    target: T;
    update?: (env: Env, cache?: Map<Expr, Value>) => void;
    expressions: Set<Expr>;
    dynamicAttrs: Array<DynamicAttrEntrySingle<T> | DynamicAttrEntryMulti<T>>;
}

function createDynamicObject<T, C, P>(
    source: Dynamic<T>,
    sourceDescriptor: SourceDescriptor<T>,
    targetDescriptor: TargetDescriptor<T, C>,
    env: Env,
    cache?: Map<Expr, Value>
): DynamicObjectEntry<C> {
    const constructorArgs: any = {};

    const dynamicAttrs: Array<DynamicAttrEntrySingle<C> | DynamicAttrEntryMulti<C>> = [];

    const staticAggregateAttrs: Array<DynamicAttrEntryMulti<C>> = [];

    let update: ((env: Env) => void) | undefined;
    const expressions: Set<Expr> = new Set();

    targetDescriptor.propertyMapping.forEach((propMapping, i) => {
        // forEach preferred for proper closure
        let srcPropsNames: keyof T | Array<keyof T> | undefined;
        let applicator: ((target: C, v: Value) => void) | undefined;
        let targetPropName: keyof C | undefined;
        if (typeof propMapping === "string") {
            // basic 1-1 mapping, where source and target prop name matches!
            srcPropsNames = propMapping;
            targetPropName = propMapping;
        } else if (Array.isArray(propMapping)) {
            if (typeof propMapping[0] === "string" && typeof propMapping[1] === "string") {
                // basic 1-1 mapping, where target and src prop name differs
                srcPropsNames = propMapping[0];
                targetPropName = propMapping[1];
            } else if (typeof propMapping[1] === "function") {
                applicator = propMapping[1];

                srcPropsNames = propMapping[0];
            }
        }
        if (typeof srcPropsNames === "string" && typeof targetPropName !== "undefined") {
            const originalAttrValue: Value | Expr | undefined = source[srcPropsNames] as any;
            const attrDescriptor: SourceAttrDescriptor<any> = sourceDescriptor.attrs[
                srcPropsNames
            ]! || {
                defaultValue: undefined,
                isValid: () => true
            };
            if (attrDescriptor === undefined) {
                return;
            }
            const compiledValue = compile(originalAttrValue, attrDescriptor);
            const initialValue: Value = evaluate(compiledValue, attrDescriptor, env, cache) as any;
            if (typeof initialValue !== "undefined") {
                constructorArgs[targetPropName] = initialValue;
            }
            if (compiledValue instanceof Expr) {
                dynamicAttrs.push({
                    targetPropName,
                    applicator,
                    sourceAttrExpr: compiledValue,
                    lastValue: initialValue,
                    attrDescriptor
                });
                expressions.add(compiledValue);
            }
        } else if (Array.isArray(srcPropsNames)) {
            const attrState: DynamicAttrEntryMulti<C> = {
                applicator: (propMapping as any)[1] as any,
                sourceAttrExprs: [],
                attrDescriptors: [],
                lastValues: []
            };
            let dynamic = false;
            for (const propName of srcPropsNames) {
                const originalAttrValue: Value | Expr | undefined = source[propName] as any;
                const attrDescriptor = sourceDescriptor.attrs[propName]!;
                if (!attrDescriptor) {
                    return;
                }
                const compiledValue = compile(originalAttrValue, attrDescriptor);
                const initialValue: Value = evaluate(
                    compiledValue,
                    attrDescriptor,
                    env,
                    cache
                ) as any;
                attrState.lastValues.push(initialValue);
                attrState.sourceAttrExprs.push(compiledValue as Expr | Value);
                attrState.attrDescriptors.push(attrDescriptor);

                if (compiledValue instanceof Expr) {
                    dynamic = true;
                    expressions.add(compiledValue);
                }
            }
            if (dynamic) {
                dynamicAttrs.push(attrState);
            } else {
                staticAggregateAttrs.push(attrState);
            }
        }
    });
    const target: C = targetDescriptor.targetFactory(constructorArgs);

    staticAggregateAttrs.forEach(attrState => {
        attrState.applicator(target, attrState.lastValues);
    });

    if (dynamicAttrs.length > 0) {
        update = applyDynamicObjectAttributes.bind(undefined, target, dynamicAttrs);
    }
    return { target, update, expressions, dynamicAttrs };
}

function applyDynamicObjectAttributes<C>(
    target: C,
    dynamicAttrs: Array<DynamicAttrEntrySingle<C> | DynamicAttrEntryMulti<C>>,
    env: Env,
    cache?: Map<Expr, Value>
) {
    for (const attrState of dynamicAttrs) {
        if (isDynamicAttrEntrySingle<C>(attrState)) {
            let applicator = attrState.applicator;
            if (!applicator) {
                assert(attrState.targetPropName !== undefined);
                applicator = attrState.applicator = makeDefaultApplicator(
                    target,
                    attrState.targetPropName as keyof C
                );
            }
            // console.log("#update/single", attrState, newValue);
            const newValue = evaluate(
                attrState.sourceAttrExpr,
                attrState.attrDescriptor,
                env,
                cache
            );
            if (newValue !== attrState.lastValue) {
                applicator!(target, newValue);
                attrState.lastValue = newValue;
            }
        } else {
            const multiAttrState = attrState as DynamicAttrEntryMulti<C>;
            // console.log("#update/m", attrState);
            let needUpdate = false;
            for (let i = 0; i < multiAttrState.sourceAttrExprs.length; ++i) {
                const newValue = evaluate<Value>(
                    multiAttrState.sourceAttrExprs[i],
                    multiAttrState.attrDescriptors[i],
                    env,
                    cache
                );
                if (newValue !== multiAttrState.lastValues[i]) {
                    multiAttrState.lastValues[i] = newValue;
                    needUpdate = true;
                }
            }
            if (needUpdate) {
                multiAttrState.applicator(target, multiAttrState.lastValues);
            }
        }
    }
}

describe("DynamicObject", function() {
    describe("PoC - solid-line technique", function() {
        interface SampleTechniqueParams {
            lineWidth?: number;
            fadeFar?: number;
            color?: number | string;
            opacity?: number;
        }
        class SampleTechniqueMaterial {
            lineWidth: number;
            fadeFar: number;
            color: THREE.Color;
            opacity: number;

            constructor(params: Partial<SampleTechniqueParams>) {
                this.lineWidth = getOptionValue(params.lineWidth, DEFAULT_LINE_WIDTH);
                this.fadeFar = getOptionValue(params.fadeFar, DEFAULT_FADE_FAR);
                this.color = new THREE.Color(getOptionValue(params.color, DEFAULT_COLOR));

                this.opacity = getOptionValue(params.opacity, 1);
            }
        }
        const DEFAULT_COLOR = 0xff0000;
        const DEFAULT_LINE_WIDTH = 1;
        const DEFAULT_FADE_FAR = -1;

        const myObjectStyleDescriptor: SourceDescriptor<SampleTechniqueParams> = {
            attrs: {
                lineWidth: {
                    defaultValue: DEFAULT_LINE_WIDTH,
                    isValid: numberValidator
                },
                fadeFar: {
                    defaultValue: DEFAULT_FADE_FAR,
                    isValid: numberValidator,
                    compiler: fadingParamCompiler
                },
                color: {
                    defaultValue: DEFAULT_COLOR,
                    isValid: colorValidator,
                    compiler: colorCompiler
                },
                opacity: {
                    defaultValue: 1,
                    isValid: normalizedNumberValidator
                }
            }
        };

        const myObjectTargetDescriptor: TargetDescriptor<
            SampleTechniqueParams,
            SampleTechniqueMaterial
        > = {
            propertyMapping: [
                // single entry means, 1-1 property mapping
                "lineWidth",
                "fadeFar",
                // [...nanmes], callback means aggregate names and call callback to apply
                // aggregate to target object
                [["color", "opacity"], applyColorAndOpacity]
            ],
            targetFactory: p => new SampleTechniqueMaterial(p)
        };

        function createMyObject(params: Dynamic<SampleTechniqueParams>, env?: Env) {
            return createDynamicObject(
                params,
                myObjectStyleDescriptor,
                myObjectTargetDescriptor,
                env || new MapEnv({})
            );
        }

        describe("#createDynamicObject - static style handling", function() {
            it("creates static object from defaults", function() {
                const { target, update } = createMyObject({});
                assert.instanceOf(target, SampleTechniqueMaterial);
                assert.deepEqual(target, {
                    lineWidth: DEFAULT_LINE_WIDTH,
                    fadeFar: DEFAULT_FADE_FAR,
                    color: new THREE.Color(DEFAULT_COLOR),
                    opacity: 1
                });
                assert.isUndefined(update);
            });
            it("creates static object with basic and aggregated props", function() {
                const { target, update } = createMyObject({
                    lineWidth: 33,
                    color: "#ff00ff80",
                    opacity: 0.5
                });
                assert.instanceOf(target, SampleTechniqueMaterial);
                assert.deepEqual(target, {
                    lineWidth: 33,
                    fadeFar: DEFAULT_FADE_FAR,
                    color: new THREE.Color(0xff00ff),
                    opacity: (0.5 * 0x80) / 255
                });
                assert.isUndefined(update);
            });
            it("creates static object with mapped prop names", function() {
                interface SolidLineExtParams extends SampleTechniqueParams {
                    secondaryLineWidth?: number;
                    secondaryColor?: number | string;
                }
                const myObjectExtStyleDescriptor: SourceDescriptor<SolidLineExtParams> = {
                    attrs: {
                        ...myObjectStyleDescriptor.attrs,
                        secondaryLineWidth: myObjectStyleDescriptor.attrs.lineWidth,
                        secondaryColor: myObjectStyleDescriptor.attrs.color
                    }
                };
                const myObjectExtDescriptor: TargetDescriptor<
                    SolidLineExtParams,
                    SampleTechniqueMaterial
                > = {
                    propertyMapping: [
                        // [sourceName, targetName] means that `sourceName` will be applied to
                        // `targetname` in target, like with our `secondaryLineWidth`
                        ["secondaryLineWidth", "lineWidth"],
                        ["secondaryColor", "color"],
                        "opacity"
                    ],
                    targetFactory: v => new SampleTechniqueMaterial(v)
                };

                const { target, update } = createDynamicObject(
                    {
                        lineWidth: 5,
                        secondaryLineWidth: 10,
                        secondaryColor: 0x00ff00,
                        opacity: 0.5
                    },
                    myObjectExtStyleDescriptor,
                    myObjectExtDescriptor,
                    new MapEnv({})
                );

                assert.instanceOf(target, SampleTechniqueMaterial);
                assert.equal(target.lineWidth, 10);
                assert.deepEqual(target.color, new THREE.Color(0x00ff00));
                assert.equal(target.opacity, 0.5);
                assert.isUndefined(update);
            });
        });

        describe("#createDynamicObject - dynamic attributes", function() {
            it("basic dynamic attribute support", function() {
                const { target, update } = createDynamicObject(
                    { lineWidth: ["*", ["get", "number"], 3] },
                    myObjectStyleDescriptor,
                    myObjectTargetDescriptor,
                    new MapEnv({
                        number: 1
                    })
                );
                assert.instanceOf(target, SampleTechniqueMaterial);
                assert.equal(target.lineWidth, 3);
                assert.isFunction(update);

                update!(new MapEnv({ number: 4 }));
                assert.equal(target.lineWidth, 12);
            });

            it("compiled attributes support", function() {
                const { target, update } = createDynamicObject(
                    { fadeFar: 0.5 },
                    myObjectStyleDescriptor,
                    myObjectTargetDescriptor,
                    new MapEnv({ $maxVisibilityRange: 100 })
                );
                assert.instanceOf(target, SampleTechniqueMaterial);
                assert.equal(target.fadeFar, 50);
                assert.isFunction(update);

                update!(new MapEnv({ $maxVisibilityRange: 120 }));
                assert.equal(target.fadeFar, 60);
            });
        });
    });

    describe("PoC - THREE.Light", function() {
        type AddExpr<T extends object> = {
            [P in keyof T]: T[P] | Expr;
        };

        type DynamicAmbientLightStyle = AddExpr<AmbientLight>;
        const ambientLightStyleDescriptor: SourceDescriptor<DynamicAmbientLightStyle> = {
            attrs: {
                color: {
                    defaultValue: "0xffffff",
                    isValid: colorValidator,
                    compiler: colorCompiler
                },
                intensity: {
                    defaultValue: 1,
                    isValid: normalizedNumberValidator
                }
            }
        };
        const ambientLightObjectDescriptor: TargetDescriptor<
            AddExpr<DynamicAmbientLightStyle>,
            THREE.AmbientLight
        > = {
            propertyMapping: ["name", "color", "intensity"],
            targetFactory: p => {
                const r = new THREE.AmbientLight(p.color, p.intensity);
                if (p.name !== undefined) {
                    r.name = p.name;
                }
                return r;
            }
        };
        it("light from static attributes", function() {
            const { target } = createDynamicObject(
                {
                    name: "foo",
                    color: "#00f",
                    intensity: 0.5
                },
                ambientLightStyleDescriptor,
                ambientLightObjectDescriptor,
                new MapEnv({})
            );

            assert.instanceOf(target, THREE.AmbientLight);
            assert.equal(target.name, "foo");
            assert.equal(target.intensity, 0.5);

            assert.deepEqual(target.color, new THREE.Color("#00f"));
        });

        it("light with dynamic attributes", function() {
            const { target, update } = createDynamicObject(
                {
                    color: "#ffb",
                    intensity: [
                        "case",
                        ["all", ["<", ["get", "$hourOfDay"], 18], [">", ["get", "$hourOfDay"], 6]],
                        1,
                        0
                    ]
                },
                ambientLightStyleDescriptor,
                ambientLightObjectDescriptor,
                new MapEnv({ $hourOfDay: 5 })
            );

            assert.instanceOf(target, THREE.AmbientLight);
            assert.isFunction(update);
            assert.deepEqual(target.color, new THREE.Color("#ffb"));

            assert.equal(target.intensity, 0);
            update!(new MapEnv({ $hourOfDay: 10 }));
            assert.equal(target.intensity, 1);
            update!(new MapEnv({ $hourOfDay: 19 }));
            assert.equal(target.intensity, 0);
        });
    });

    //describe("PoC - TextRenderStyle");
});

/**
 * TileGeometryCreator
 *
 *   createObject()
 *     creates main material
 *     creates auxiliary materials
 *
 *
 *   createTextElements()
 *
 *
 * createLights()
 *
 *
 *
 *
 */
