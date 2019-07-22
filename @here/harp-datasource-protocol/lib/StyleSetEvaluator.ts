/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

import { Expr, MapEnv } from "./Expr";
import { isInterpolatedPropertyDefinition } from "./InterpolatedProperty";
import { InterpolatedPropertyDefinition, InterpolationMode } from "./InterpolatedPropertyDefs";
import {
    StringEncodedHex,
    StringEncodedHSL,
    StringEncodedMeters,
    StringEncodedNumeralFormat,
    StringEncodedNumeralFormats,
    StringEncodedNumeralType,
    StringEncodedPixels,
    StringEncodedRGB
} from "./StringEncodedNumeral";
import { IndexedTechnique, Technique } from "./Techniques";
import { Style, StyleSet } from "./Theme";

export const logger = LoggerManager.instance.create("StyleSetEvaluator");

interface StyleInternalParams {
    /**
     * Optimization: Lazy creation and storage of expression in a style object.
     */
    _whenExpr?: Expr;

    /**
     * Optimization: Index into table in StyleSetEvaluator.
     * @hidden
     */
    _index?: number;

    /**
     * Optimization: StyleSet index.
     * @hidden
     */
    _styleSetIndex?: number;
}

type InternalStyle = Style & Partial<StyleInternalParams>;

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

        const cloneStyle = (style: Style): Style => {
            return {
                ...style,
                styles:
                    style.styles !== undefined
                        ? style.styles.map(subStyle => cloneStyle(subStyle))
                        : undefined
            };
        };
        this.styleSet = styleSet.map(style => cloneStyle(style));
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
                    computeDefaultRenderOrder(currStyle);
                }
            } else {
                style._styleSetIndex = styleSetIndex++;
                if (style.technique !== undefined && style.renderOrder === undefined) {
                    style.renderOrder = techniqueRenderOrder++;
                }
            }
        };

        for (const style of this.styleSet) {
            computeDefaultRenderOrder(style);
        }
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
        const styleStack = new Array<Style>();
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
     * Shorten the style object for debug log. Remove special strings (starting with "_") as well
     * as the sub-styles of style groups.
     *
     * @param key Key in object
     * @param value value in object
     */
    private cleanupStyle(key: string, value: any): any {
        // Filtering out properties
        if (key === "styles") {
            return "[...]";
        }
        if (key.startsWith("_")) {
            return undefined;
        }
        return value;
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
        styleStack: Style[],
        style: Style & Partial<InternalStyle>,
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
                        style._whenExpr = Expr.parse(style.when);
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
            if (style.debug) {
                logger.log(
                    "\n======== style group =========\nenv:",
                    JSON.stringify(env.unmap(), undefined, 2),
                    "\nstyle group:",
                    JSON.stringify(style, this.cleanupStyle, 2)
                );
            }
            styleStack.push(style);
            for (const currStyle of style.styles) {
                if (this.processStyle(env, styleStack, currStyle, result)) {
                    styleStack.pop();
                    return true;
                }
            }
            styleStack.pop();
        } else {
            // we found a technique!
            if (style.technique !== undefined) {
                if (style.technique !== "none") {
                    // Check if we already assembled the technique for exactly this style. If we
                    // have, we return the preassembled technique object. Otherwise we assemble the
                    // technique from all parent styles' attributes and the current stales'
                    // attributes, and add it to the cached techniques.
                    if (style._index === undefined) {
                        const technique = this.createTechnique(style, styleStack);
                        result.push(technique);
                        if (style.debug) {
                            logger.log(
                                "\n======== style w/ technique =========\nenv:",
                                JSON.stringify(env.unmap(), undefined, 2),
                                "\nstyle:",
                                JSON.stringify(style, this.cleanupStyle, 2),
                                "\ntechnique:",
                                JSON.stringify(technique, this.cleanupStyle, 2)
                            );
                        }
                    } else {
                        result.push(this.m_techniques[style._index]);
                    }
                }
                // stop processing if "final" is set
                return style.final === true;
            }
        }
        return false;
    }

    private createTechnique(style: InternalStyle, styleStack: InternalStyle[]) {
        const technique = {} as any;
        technique.name = style.technique;
        const addAttributes = (currStyle: InternalStyle) => {
            if (currStyle.renderOrder !== undefined) {
                technique.renderOrder = currStyle.renderOrder;
            }
            if (currStyle.transient !== undefined) {
                technique.transient = currStyle.transient;
            }
            if (currStyle.renderOrderBiasProperty !== undefined) {
                technique.renderOrderBiasProperty = currStyle.renderOrderBiasProperty;
            }
            if (currStyle.labelProperty !== undefined) {
                technique.label = currStyle.labelProperty;
            }
            if (currStyle.renderOrderBiasRange !== undefined) {
                technique.renderOrderBiasRange = currStyle.renderOrderBiasRange;
            }
            if (currStyle.renderOrderBiasGroup !== undefined) {
                technique.renderOrderBiasGroup = currStyle.renderOrderBiasGroup;
            }
            if ((currStyle as any).secondaryRenderOrder !== undefined) {
                technique.secondaryRenderOrder = (currStyle as any).secondaryRenderOrder;
            }
            if (currStyle.attr !== undefined) {
                Object.getOwnPropertyNames(currStyle.attr).forEach(property => {
                    const prop = (currStyle.attr as any)[property];
                    if (isInterpolatedPropertyDefinition(prop)) {
                        removeDuplicatePropertyValues(prop);
                        const propKeys = new Float32Array(prop.zoomLevels);
                        let propValues;
                        let maskValues;
                        switch (typeof prop.values[0]) {
                            default:
                            case "number":
                                propValues = new Float32Array((prop.values as any[]) as number[]);
                                technique[property] = {
                                    interpolationMode:
                                        prop.interpolation !== undefined
                                            ? InterpolationMode[prop.interpolation]
                                            : InterpolationMode.Discrete,
                                    zoomLevels: propKeys,
                                    values: propValues,
                                    exponent: prop.exponent
                                };
                                break;
                            case "boolean":
                                propValues = new Float32Array(prop.values.length);
                                for (let i = 0; i < prop.values.length; ++i) {
                                    propValues[i] = ((prop.values[i] as unknown) as boolean)
                                        ? 1
                                        : 0;
                                }
                                technique[property] = {
                                    interpolationMode: InterpolationMode.Discrete,
                                    zoomLevels: propKeys,
                                    values: propValues,
                                    exponent: prop.exponent
                                };
                                break;
                            case "string":
                                let needsMask = false;

                                const matchedFormat = StringEncodedNumeralFormats.find(format =>
                                    format.regExp.test((prop.values[0] as unknown) as string)
                                );
                                if (matchedFormat === undefined) {
                                    logger.error(
                                        `No StringEncodedNumeralFormat matched ${property}.`
                                    );
                                    break;
                                }
                                propValues = new Float32Array(
                                    prop.values.length * matchedFormat.size
                                );
                                maskValues = new Float32Array(prop.values.length);
                                needsMask = procesStringEnocodedNumeralInterpolatedProperty(
                                    matchedFormat,
                                    prop as InterpolatedPropertyDefinition<string>,
                                    propValues,
                                    maskValues
                                );

                                technique[property] = {
                                    interpolationMode:
                                        prop.interpolation !== undefined
                                            ? InterpolationMode[prop.interpolation]
                                            : InterpolationMode.Discrete,
                                    zoomLevels: propKeys,
                                    values: propValues,
                                    exponent: prop.exponent,
                                    _stringEncodedNumeralType: matchedFormat.type,
                                    _stringEncodedNumeralDynamicMask: needsMask
                                        ? maskValues
                                        : undefined
                                };
                                break;
                        }
                    } else {
                        technique[property] = prop;
                    }
                });
            }
        };
        for (const currStyle of styleStack) {
            addAttributes(currStyle);
        }
        addAttributes(style);

        style._index = this.m_techniques.length;
        (technique as IndexedTechnique)._index = style._index;
        (technique as IndexedTechnique)._styleSetIndex = style._styleSetIndex!;
        this.m_techniques.push(technique as IndexedTechnique);

        return technique as Technique;
    }
}

function removeDuplicatePropertyValues<T>(p: InterpolatedPropertyDefinition<T>) {
    for (let i = 0; i < p.values.length; ++i) {
        const firstIdx = p.zoomLevels.findIndex((a: number) => {
            return a === p.zoomLevels[i];
        });
        if (firstIdx !== i) {
            p.zoomLevels.splice(--i, 1);
            p.values.splice(--i, 1);
        }
    }
}

const colorFormats = [StringEncodedHSL, StringEncodedHex, StringEncodedRGB];
const worldSizeFormats = [StringEncodedMeters, StringEncodedPixels];

function procesStringEnocodedNumeralInterpolatedProperty(
    baseFormat: StringEncodedNumeralFormat,
    prop: InterpolatedPropertyDefinition<string>,
    propValues: Float32Array,
    maskValues: Float32Array
): boolean {
    let needsMask = false;
    const allowedValueFormats =
        baseFormat.type === StringEncodedNumeralType.Meters ||
        baseFormat.type === StringEncodedNumeralType.Pixels
            ? worldSizeFormats
            : colorFormats;

    for (let valueIdx = 0; valueIdx < prop.values.length; ++valueIdx) {
        for (const valueFormat of allowedValueFormats) {
            const value = prop.values[valueIdx];
            if (!valueFormat.regExp.test(value)) {
                continue;
            }

            if (valueFormat.mask !== undefined) {
                maskValues[valueIdx] = valueFormat.mask;
                needsMask = true;
            }

            const result = valueFormat.decoder(value);
            for (let i = 0; i < result.length; ++i) {
                propValues[valueIdx * valueFormat.size + i] = result[i];
            }
            break;
        }
    }

    return needsMask;
}
