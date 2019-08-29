/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

import {
    BooleanLiteralExpr,
    CallExpr,
    ContainsExpr,
    Expr,
    ExprVisitor,
    HasAttributeExpr,
    MapEnv,
    NullLiteralExpr,
    NumberLiteralExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";
import { ExprPool } from "./ExprPool";
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
import { isReference, Style, StyleDeclaration, StyleSelector, StyleSet } from "./Theme";

const logger = LoggerManager.instance.create("StyleSetEvaluator");

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

    /**
     * Optimization: The `$layer` requested by the `when` condition of this style.
     * @hidden
     */
    _layer?: string;
}

type InternalStyle = Style & StyleSelector & Partial<StyleInternalParams>;

/**
 * [[ExprClassifier]] searches for usages of `$layer` in `when` conditions
 * associated with styling rules.
 *
 * @hidden
 */
class StyleConditionClassifier implements ExprVisitor<Expr | undefined, Expr | undefined> {
    private _style!: InternalStyle;

    classify(style: InternalStyle) {
        if (style._whenExpr) {
            const savedStyle = this.switchStyle(style);
            style._whenExpr = style._whenExpr.accept(this, undefined);
            this._style = savedStyle;
        }
    }

    visitNullLiteralExpr(expr: NullLiteralExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitVarExpr(expr: VarExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitContainsExpr(expr: ContainsExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitCallExpr(call: CallExpr, enclosingExpr: Expr | undefined): Expr | undefined {
        if (call.op === "all") {
            // processing of an `["all", e1, e2, ... eN]` expression. In this case
            // search for expressions matching comparison of `$layer` and string literals
            // in the sub expressions.
            const children = call.children
                .map(childExpr => childExpr.accept(this, call))
                .filter(childExpr => childExpr !== undefined) as Expr[];

            return new CallExpr(call.op, children);
        } else if (enclosingExpr) {
            // `call` is a direct child expression of an `"all"` operator.
            const matched = this.matchVarStringComparison(call);

            if (matched && this._style._layer === undefined && matched.name === "$layer") {
                // found a subexpression `["==", ["get", "$layer"], "some layer name"]`
                // enclosed in an `["all", e1...eN]` expression. Remove it from
                // its parent expression and store the value of the expected $layer in
                // [[StyleInternalParams]].

                this._style._layer = matched.value;

                // return `undefined` to remove this sub expression from its parent.
                return undefined;
            }
        }

        return call;
    }

    /**
     * Tests if the given `call` matches the structure ["==", ["get", name], value].
     * If a match is found returns an object containing the `name` and the `value`;
     *
     * @param call The expression to match.
     */
    private matchVarStringComparison(call: CallExpr) {
        if (call.op === "==") {
            const left = call.children[0];
            const right = call.children[1];

            if (left instanceof VarExpr && right instanceof StringLiteralExpr) {
                return { name: left.name, value: right.value };
            }

            if (right instanceof VarExpr && left instanceof StringLiteralExpr) {
                return { name: right.name, value: left.value };
            }
        }

        return undefined;
    }

    /**
     * Sets the given `style` as current.
     *
     * @returns The previous `style`.
     */
    private switchStyle(style: InternalStyle) {
        const saved = this._style;
        this._style = style;
        return saved;
    }
}

/**
 * Combine data from datasource and apply the rules from a specified theme to show it on the map.
 */
export class StyleSetEvaluator {
    readonly styleSet: InternalStyle[];

    private readonly m_renderOrderBiasGroups: Map<string, number> = new Map();
    private readonly m_techniques: IndexedTechnique[] = [];
    private readonly m_exprPool = new ExprPool();
    private readonly m_cachedResults = new Map<Expr, Value>();
    private readonly m_styleConditionClassifier = new StyleConditionClassifier();
    private m_layer: string | undefined;

    constructor(styleSet: StyleSet) {
        let techniqueRenderOrder = 0;
        let styleSetIndex = 0;

        const cloneStyle = (style: StyleDeclaration): InternalStyle | undefined => {
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
        this.styleSet = styleSet
            .map(style => cloneStyle(style))
            .filter(subStyle => subStyle !== undefined) as InternalStyle[];

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
                style._styleSetIndex = styleSetIndex++;
                if (style.technique !== undefined && style.renderOrder === undefined) {
                    style.renderOrder = techniqueRenderOrder++;
                }
            }
        };

        for (const style of this.styleSet) {
            computeDefaultRenderOrder(style);
        }

        this.compileStyleSet();
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
        this.m_cachedResults.clear();

        // get the requested $layer, if any.
        const layer = env.lookup("$layer");

        // set the requested $layer as the current layer.
        const previousLayer = this.changeLayer(typeof layer === "string" ? layer : undefined);

        for (const currStyle of this.styleSet) {
            if (styleStack.length !== 0) {
                this.changeLayer(previousLayer); // restore the layer

                throw new Error("Internal error: style stack cleanup failed");
            }

            if (this.processStyle(env, styleStack, currStyle, result)) {
                break;
            }
        }

        this.changeLayer(previousLayer); // restore the layer

        return result;
    }
    /**
     * Get the (current) array of techniques that have been created during decoding.
     */
    get techniques(): IndexedTechnique[] {
        return this.m_techniques;
    }

    private changeLayer(layer: string | undefined) {
        const savedLayer = this.m_layer;
        this.m_layer = layer;
        return savedLayer;
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
     * Compile the `when` conditions found when traversting the styling rules.
     */
    private compileStyleSet() {
        this.styleSet.forEach(style => this.compileStyle(style));
    }

    /**
     * Compile the `when` conditions reachable from the given `style`.
     *
     * @param style The current style.
     */
    private compileStyle(style: InternalStyle) {
        if (style.when !== undefined) {
            try {
                style._whenExpr = Array.isArray(style.when)
                    ? Expr.fromJSON(style.when)
                    : Expr.parse(style.when);

                // search for usages of '$layer' and any other
                // special symbol that can be used to speed up the evaluation
                // of the `when` conditions associated to this `style`.
                this.m_styleConditionClassifier.classify(style);

                if (style._whenExpr !== undefined) {
                    style._whenExpr = style._whenExpr.intern(this.m_exprPool);
                }
            } catch (err) {
                logger.log(
                    "failed to evaluate expression",
                    JSON.stringify(style.when),
                    "error",
                    String(err)
                );
            }
        }

        if (Array.isArray(style.styles)) {
            style.styles.forEach(nestedStyle => this.compileStyle(nestedStyle as InternalStyle));
        }
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
        if (style._whenExpr) {
            if (
                this.m_layer !== undefined &&
                style._layer !== undefined &&
                this.m_layer !== style._layer
            ) {
                // skip this rule because its requested layer is different than the
                // layer defined in $layer variable.
                return false;
            }

            if (!style._whenExpr.evaluate(env, this.m_cachedResults)) {
                // Stop processing this styling rule. The `when` condition
                // associated with the current `style` evaluates to false so
                // no techinque defined by this style should be applied.
                return false;
            }
        }

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
                if (this.processStyle(env, styleStack, currStyle as InternalStyle, result)) {
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
