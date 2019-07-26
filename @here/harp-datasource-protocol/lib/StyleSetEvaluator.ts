/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

import { DecodedTechnique, makeDecodedTechnique } from "./DecodedTechnique";
import { DynamicTechniqueExpr, evaluateTechniqueAttr } from "./DynamicTechniqueExpr";
import { Env, Expr, isJsonExpr, JsonExpr, MapEnv, Value } from "./Expr";
import { isInterpolatedPropertyDefinition } from "./InterpolatedProperty";
import { InterpolatedProperty } from "./InterpolatedPropertyDefs";
import {
    mergeTechniqueDescriptor,
    techniqueAttrType,
    TechniqueAttrType,
    TechniqueDescriptor,
    TechniquePropName
} from "./TechniqueDescriptor";
import { IndexedTechnique, Technique, techniqueDescriptors } from "./Techniques";
import { isReference, LineStyle, Style, StyleDeclaration, StyleSelector, StyleSet } from "./Theme";

export const logger = LoggerManager.instance.create("StyleSetEvaluator");

const emptyTechniqueDescriptor = mergeTechniqueDescriptor({});

interface StyleInternalParams {
    /**
     * Optimization: Lazy creation and storage of expression in a style object.
     */
    _whenExpr?: Expr;

    _staticAttributes?: Array<[string, Value | InterpolatedProperty<unknown>]>;

    /**
     * These attributes are used to instantiate Technique variants.
     *
     * @see [[TechiqueDescriptor.techniquePropNames]]
     */
    _dynamicTechniqueAttributes?: Array<[string, DynamicTechniqueExpr]>;

    /**
     * These attributes must be evaluated basing with feature env.
     *
     * @see [[TechiqueDescriptor.featurePropNames]]
     */
    _dynamicFeatureAttributes?: Array<[string, DynamicTechniqueExpr]>;

    /**
     * These attributes are forwarded as serialized by decoder to main thread, so they are resolved
     * based on [[SceneState]].
     *
     * Filtered to by
     *  - [[TechiqueDescriptor.dynamicMaterialPropNames]]
     *  - [[TechniqueDescriptor.dynamicObjectPropNames]]
     */
    _dynamicForwaredAttributes?: Array<[string, DynamicTechniqueExpr]>;
    _dynamicTechniques?: Map<string, IndexedTechnique>;

    /**
     * Optimization: Index into table in StyleSetEvaluator.
     * @hidden
     */
    _staticTechnique?: IndexedTechnique;

    /**
     * Optimization: StyleSet index.
     * @hidden
     */
    _styleSetIndex?: number;
}

type InternalStyle = Style & StyleSelector & StyleInternalParams;

/**
 * Combine data from datasource and apply the rules from a specified theme to show it on the map.
 */
export class StyleSetEvaluator {
    readonly styleSet: InternalStyle[];

    private readonly m_renderOrderBiasGroups: Map<string, number> = new Map();
    private readonly m_techniques: IndexedTechnique[] = [];

    constructor(styleSet: StyleSet) {
        let techniqueRenderOrder = 0;
        let styleSetIndex = 0;

        const cloneStyle = (style: StyleDeclaration): StyleDeclaration | undefined => {
            if (isReference(style)) {
                return undefined;
            }
            return {
                ...style,
                styles:
                    style.styles !== undefined
                        ? (style.styles
                              .map(subStyle => cloneStyle(subStyle))
                              .filter(subStyle => subStyle !== undefined) as StyleSet)
                        : undefined
            };
        };
        styleSet = styleSet.map(style => cloneStyle(style) as StyleDeclaration);
        const computeDefaultRenderOrder = (style: InternalStyle): void => {
            if (style.renderOrderBiasGroup !== undefined) {
                const renderOrderBiasGroupOrder = style.renderOrderBiasGroup
                    ? this.m_renderOrderBiasGroups.get(style.renderOrderBiasGroup)
                    : undefined;
                if (
                    style.renderOrderBiasRange !== undefined &&
                    renderOrderBiasGroupOrder === undefined
                ) {
                    if (style.renderOrder !== undefined) {
                        logger.warn(
                            "WARN: style.renderOrder will be overridden if " +
                                "renderOrderBiasGroup is set:",
                            style
                        );
                    }
                    const [minRange, maxRange] = style.renderOrderBiasRange;
                    style.renderOrder =
                        minRange < 0
                            ? techniqueRenderOrder + Math.abs(minRange)
                            : techniqueRenderOrder;
                    techniqueRenderOrder += Math.abs(minRange) + maxRange;
                    if (style.renderOrderBiasGroup) {
                        this.m_renderOrderBiasGroups.set(
                            style.renderOrderBiasGroup,
                            style.renderOrder
                        );
                    }
                    techniqueRenderOrder++;
                } else if (renderOrderBiasGroupOrder) {
                    if (style.renderOrder !== undefined) {
                        logger.warn(
                            "WARN: style.renderOrder will be overridden if " +
                                "renderOrderBiasGroup is set:",
                            style
                        );
                    }
                    style.renderOrder = renderOrderBiasGroupOrder;
                }
            }
            // search through child styles
            if (style.styles !== undefined) {
                for (const currStyle of style.styles) {
                    computeDefaultRenderOrder(currStyle as InternalStyle);
                }
            } else {
                (style as InternalStyle)._styleSetIndex = styleSetIndex++;
                if (style.technique !== undefined && style.renderOrder === undefined) {
                    style.renderOrder = techniqueRenderOrder++;
                }
            }
        };

        for (const style of styleSet) {
            computeDefaultRenderOrder(style as InternalStyle);
        }
        this.styleSet = styleSet as InternalStyle[];
    }
    /**
     * Find all techniques that fit the current objects' environment.
     * *The techniques in the resulting array may not be modified* since they are being reused for
     * identical objects.
     *
     * @param env The objects environment, i.e. the attributes that are relevant for its
     * representation.
     */
    getMatchingTechniques(env: MapEnv): IndexedTechnique[] {
        const result: IndexedTechnique[] = [];
        const styleStack = new Array<InternalStyle>();
        for (const currStyle of this.styleSet) {
            if (styleStack.length !== 0) {
                throw new Error("Internal error: style stack cleanup failed");
            }
            if (this.processStyle(env, styleStack, currStyle, result)) {
                break;
            }
        }
        return result;
    }

    /**
     * Get the (current) array of techniques that have been created during decoding.
     */
    get techniques(): IndexedTechnique[] {
        return this.m_techniques;
    }

    /**
     * Get the (current) array of techniques that have been created during decoding.
     */
    get decodedTechniques(): DecodedTechnique[] {
        return this.m_techniques.map(makeDecodedTechnique);
    }

    /**
     * Process a style (and its sub-styles) hierarchically to look for the technique that fits the
     * current objects' environment. The attributes of the styles are assembled to create a unique
     * technique for every object.
     *
     * @param env The objects environment, i.e. the attributes that are relevant for its
     *            representation.
     * @param styleStack Stack of styles containing the hierarchy of styles up to this point.
     * @param style Current style (could also be top of stack).
     * @param result The array of resulting techniques. There may be more than one technique per
     *               object, resulting in multiple graphical objects for representation.
     * @returns `true` if style has been found and processing is finished. `false` if not found, or
     *          more than one technique should be applied.
     */
    private processStyle(
        env: MapEnv,
        styleStack: InternalStyle[],
        style: InternalStyle,
        result: Technique[]
    ): boolean {
        if (style.when !== undefined) {
            // optimization: Lazy evaluation of when-expression
            try {
                if (style._whenExpr === undefined) {
                    // tslint:disable-next-line: prefer-conditional-expression
                    if (Array.isArray(style.when)) {
                        style._whenExpr = Expr.fromJSON(style.when);
                    } else {
                        style._whenExpr = Expr.parse(style.when as string);
                    }
                }
                if (!style._whenExpr!.evaluate(env)) {
                    return false;
                }
            } catch (err) {
                logger.log(
                    "failed to evaluate expression",
                    JSON.stringify(style.when),
                    "error",
                    String(err)
                );
                return false;
            }
        }
        // search through sub-styles
        if (style.styles !== undefined) {
            styleStack.push(style);
            for (const currStyle of style.styles) {
                if (this.processStyle(env, styleStack, currStyle as InternalStyle, result)) {
                    styleStack.pop();
                    return true;
                }
            }
            styleStack.pop();
            return false;
        }

        if (style.technique === undefined) {
            return false;
        }
        // we found a technique!
        if (style.technique !== "none") {
            this.checkStyleDynamicAttributes(style, styleStack);

            if (style._dynamicTechniques !== undefined) {
                const dynamicAttributes = this.evaluateTechniqueProperties(style, env);
                const dynamicAttrKey = dynamicAttributes
                    .map(([attrName, attrValue]) => {
                        if (attrValue === undefined) {
                            return "U";
                        } else {
                            return JSON.stringify(attrValue);
                        }
                    })
                    .join("\0");
                const key = makeCacheKey(style._styleSetIndex!, dynamicAttrKey);
                let technique = style._dynamicTechniques!.get(key);
                if (technique === undefined) {
                    technique = this.createTechnique(style, dynamicAttributes);
                    style._dynamicTechniques!.set(key, technique);
                }
                result.push(technique);
            } else {
                let technique = style._staticTechnique;
                if (technique === undefined) {
                    style._staticTechnique = technique = this.createTechnique(
                        style,
                        []
                    ) as IndexedTechnique;
                }
                result.push(technique as IndexedTechnique);
            }
        }
        // stop processing if "final" is set
        return style.final === true;
    }

    private checkStyleDynamicAttributes(style: InternalStyle, styleStack: InternalStyle[]) {
        if (style._dynamicTechniqueAttributes !== undefined || style.technique === "none") {
            return;
        }

        style._dynamicTechniqueAttributes = [];
        style._dynamicFeatureAttributes = [];
        style._dynamicForwaredAttributes = [];
        style._staticAttributes = [];

        const dynamicFeatureAttributes = style._dynamicFeatureAttributes;
        const dynamicTechniqueAttributes = style._dynamicTechniqueAttributes;
        const dynamicForwardedAttributes = style._dynamicForwaredAttributes;
        const targetStaticAttributes = style._staticAttributes;

        const techniqueDescriptor =
            techniqueDescriptors[style.technique] || emptyTechniqueDescriptor;

        function processAttribute(attrName: string, attrValue: Value | JsonExpr | undefined) {
            if (attrValue === undefined) {
                return;
            }

            const attrType = techniqueAttrType(
                (attrName as any) as TechniquePropName<unknown>,
                techniqueDescriptor as TechniqueDescriptor<unknown>
            );

            const targetList =
                attrType === TechniqueAttrType.Feature
                    ? dynamicFeatureAttributes
                    : attrType === TechniqueAttrType.Technique
                    ? dynamicTechniqueAttributes
                    : dynamicForwardedAttributes;

            if (isJsonExpr(attrValue)) {
                targetList.push([
                    attrName,
                    {
                        _cacheKey: makeCacheKey(style._styleSetIndex!, attrName),
                        transferrableExpr: attrValue
                    }
                ]);
            } else if (isInterpolatedPropertyDefinition(attrValue)) {
                targetList.push([
                    attrName,
                    {
                        _cacheKey: makeCacheKey(style._styleSetIndex!, attrName),
                        interpolated: attrValue
                    }
                ]);
            } else {
                targetStaticAttributes.push([attrName, attrValue]);
            }
        }

        function processAttributes(style2: Style) {
            processAttribute("renderOrder", style2.renderOrder);
            processAttribute("renderOrderOffset", style2.renderOrderOffset);

            // line & solid-line secondaryRenderOrder should be generic attr
            // TODO: maybe just warn and force move it to `attr` ?
            processAttribute("secondaryRenderOrder", (style2 as LineStyle).secondaryRenderOrder);

            if (style2.attr !== undefined) {
                for (const attrName in style2.attr) {
                    if (!style2.attr.hasOwnProperty(attrName)) {
                        continue;
                    }
                    processAttribute(attrName, (style2.attr as any)[attrName]);
                }
            }
        }

        for (const parentStyle of styleStack) {
            processAttributes(parentStyle);
        }
        processAttributes(style);

        if (dynamicTechniqueAttributes.length > 0) {
            style._dynamicTechniques = new Map();
        }
    }

    private evaluateTechniqueProperties(style: InternalStyle, env: Env): Array<[string, Value]> {
        if (style._dynamicTechniqueAttributes === undefined) {
            return [];
        }
        return style._dynamicTechniqueAttributes.map(([attrName, attrExpr]) => {
            return [attrName, evaluateTechniqueAttr<Value>(attrExpr, env)];
        });
    }

    private createTechnique(style: InternalStyle, dynamicAttrs: Array<[string, Value]>) {
        const technique = {} as any;
        technique.name = style.technique;
        if (style._staticAttributes !== undefined) {
            for (const [attrName, attrValue] of style._staticAttributes) {
                technique[attrName] = attrValue;
            }
        }
        for (const [attrName, attrValue] of dynamicAttrs) {
            technique[attrName] = attrValue;
        }
        if (style._dynamicForwaredAttributes !== undefined) {
            for (const [attrName, attrValue] of style._dynamicForwaredAttributes) {
                technique[attrName] = attrValue;
            }
        }

        (technique as IndexedTechnique)._index = this.m_techniques.length;
        (technique as IndexedTechnique)._styleSetIndex = style._styleSetIndex!;
        this.m_techniques.push(technique as IndexedTechnique);
        return technique as IndexedTechnique;
    }
}

function makeCacheKey(...elements: Array<string | number>): string {
    return elements.map(String).join(":");
}
