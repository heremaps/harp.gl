/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

import {
    BooleanLiteralExpr,
    CallExpr,
    CaseExpr,
    ContainsExpr,
    Env,
    Expr,
    ExprVisitor,
    HasAttributeExpr,
    isJsonExpr,
    JsonExpr,
    LiteralExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";
import { ExprPool } from "./ExprPool";
import {
    createInterpolatedProperty,
    isInterpolatedPropertyDefinition
} from "./InterpolatedProperty";
import { InterpolatedProperty } from "./InterpolatedPropertyDefs";
import { AttrScope, mergeTechniqueDescriptor, TechniquePropNames } from "./TechniqueDescriptor";
import { IndexedTechnique, Technique, techniqueDescriptors } from "./Techniques";
import {
    Definitions,
    isActualSelectorDefinition,
    isJsonExprReference,
    LineStyle,
    Style,
    StyleDeclaration,
    StyleSelector,
    StyleSet
} from "./Theme";

const logger = LoggerManager.instance.create("StyleSetEvaluator");

const emptyTechniqueDescriptor = mergeTechniqueDescriptor<Technique>({});

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
    _dynamicTechniqueAttributes?: Array<[string, Expr]>;

    /**
     * These attributes must be evaluated basing with feature env.
     *
     * They are not propagated to rendering scope.
     *
     * @see [[TechniqueAttrScope.Feature]]
     */
    _dynamicFeatureAttributes?: Array<[string, Expr | InterpolatedProperty<unknown>]>;

    /**
     * These attributes are forwarded as serialized by decoder to main thread, so they are resolved
     * directly in render loop.
     *
     * Will contain attributes from these lists
     *  - interpolants from [[TechiqueDescriptor.techniquePropNames]]
     *  - expressions [[TechniqueDescriptor.dynamicPropNames]] (Future)
     */
    _dynamicForwaredAttributes?: Array<[string, Expr | InterpolatedProperty<unknown>]>;
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

    /**
     * Optimization: Requested $geometryType.
     * @hidden
     */
    _geometryType?: string;
}

type InternalStyle = Style & StyleSelector & StyleInternalParams;

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

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, enclosingExpr: Expr | undefined): Expr {
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

    visitMatchExpr(expr: MatchExpr, enclosingExpr: Expr | undefined): Expr {
        return expr;
    }

    visitCaseExpr(expr: CaseExpr, enclosingExpr: Expr | undefined): Expr {
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

            if (matched) {
                if (this._style.layer === undefined && matched.name === "$layer") {
                    // found a subexpression `["==", ["get", "$layer"], "some layer name"]`
                    // enclosed in an `["all", e1...eN]` expression. Remove it from
                    // its parent expression and store the value of the expected $layer in
                    // [[StyleInternalParams]].

                    this._style.layer = matched.value;

                    // return `undefined` to remove this sub expression from its parent.
                    return undefined;
                } else if (
                    this._style._geometryType === undefined &&
                    matched.name === "$geometryType"
                ) {
                    // found a subexpression `["==", ["get", "$geometryType"], "geometry"]`
                    // enclosed in an `["all", e1...eN]` expression. Remove it from
                    // its parent expression and store the value of the expected $geometryType in
                    // [[StyleInternalParams]].

                    this._style._geometryType = matched.value;

                    // return `undefined` to remove this sub expression from its parent.
                    return undefined;
                }
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
    private m_geometryType: string | undefined;
    private m_definitions?: Definitions;
    private m_definitionExprCache?: Map<string, Expr>;

    constructor(styleSet: StyleSet, definitions?: Definitions) {
        let techniqueRenderOrder = 0;
        let styleSetIndex = 0;
        this.m_definitions = definitions;
        if (definitions !== undefined) {
            this.m_definitionExprCache = new Map();
        }

        const resolveStyleReferences = (style: StyleDeclaration): StyleDeclaration | undefined => {
            if (isJsonExpr(style)) {
                if (!isJsonExprReference(style)) {
                    throw new Error(
                        "invalid expression in this context, only 'ref's are supported"
                    );
                }
                // expand and instantiate references to style definitions.
                const definitionName = style[1];
                const def = definitions && definitions[definitionName];

                if (!def) {
                    throw new Error(`invalid reference '${definitionName}' - not found`);
                }
                if (!isActualSelectorDefinition(def)) {
                    throw new Error(
                        `invalid reference '${definitionName}' - expected style definition`
                    );
                }

                // instantiate the style
                return resolveStyleReferences(def);
            }
            return {
                ...style,
                styles:
                    style.styles !== undefined
                        ? (style.styles
                              .map(subStyle => resolveStyleReferences(subStyle))
                              .filter(subStyle => subStyle !== undefined) as StyleSet)
                        : undefined
            };
        };
        styleSet = styleSet.map(style => resolveStyleReferences(style) as StyleDeclaration);
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
        this.compileStyleSet();
    }

    /**
     * Find all techniques that fit the current objects' environment.
     * *The techniques in the resulting array may not be modified* since they are being reused for
     * identical objects.
     *
     * @param env The objects environment, i.e. the attributes that are relevant for its
     * representation.
     * @param layer The optional layer name used to filter techniques.
     * @param geometryType The optional geometryType used to filter techniques.
     */
    getMatchingTechniques(env: Env, layer?: string, geometryType?: string): IndexedTechnique[] {
        const result: IndexedTechnique[] = [];
        const styleStack = new Array<InternalStyle>();
        this.m_cachedResults.clear();

        // get the requested $layer and $geometryType, if any.
        const currentLayer = layer !== undefined ? layer : env.lookup("$layer");
        const currentGeometryType =
            geometryType !== undefined ? geometryType : env.lookup("$geometryType");

        // set the requested $layer as the current layer.
        const previousLayer = this.changeLayer(
            typeof currentLayer === "string" ? currentLayer : undefined
        );

        const previousGeometryType = this.changeGeometryType(
            typeof currentGeometryType === "string" ? currentGeometryType : undefined
        );

        for (const currStyle of this.styleSet) {
            if (styleStack.length !== 0) {
                this.changeLayer(previousLayer); // restore the layer
                this.changeGeometryType(previousGeometryType); // restore the geometryType

                throw new Error("Internal error: style stack cleanup failed");
            }

            if (this.processStyle(env, styleStack, currStyle, result)) {
                break;
            }
        }

        this.changeLayer(previousLayer); // restore the layer
        this.changeGeometryType(previousGeometryType); // restore the geometryType

        return result;
    }

    /**
     * Get the expression evaluation cache, for further feature processing.
     *
     * This object is valid until next `getMatchingTechniques` call.
     */
    get expressionEvaluatorCache() {
        return this.m_cachedResults;
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
    get decodedTechniques(): IndexedTechnique[] {
        return this.m_techniques.map(makeDecodedTechnique);
    }

    private changeLayer(layer: string | undefined) {
        const savedLayer = this.m_layer;
        this.m_layer = layer;
        return savedLayer;
    }

    private changeGeometryType(geometryType: string | undefined) {
        const savedGeometryType = this.m_geometryType;
        this.m_geometryType = geometryType;
        return savedGeometryType;
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
                    ? Expr.fromJSON(style.when, this.m_definitions, this.m_definitionExprCache)
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
        env: Env,
        styleStack: InternalStyle[],
        style: InternalStyle,
        result: Technique[]
    ): boolean {
        if (style._whenExpr) {
            if (
                this.m_layer !== undefined &&
                style.layer !== undefined &&
                this.m_layer !== style.layer
            ) {
                // skip this rule because its requested layer is different than the
                // layer defined in $layer variable.
                return false;
            }

            if (
                this.m_geometryType !== undefined &&
                style._geometryType !== undefined &&
                this.m_geometryType !== style._geometryType
            ) {
                // skip this rule because its requested geometryType is different than the
                // layer defined in $geometryType variable.
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
                    .join(":");
                const key = `${style._styleSetIndex!}:${dynamicAttrKey}`;
                let technique = style._dynamicTechniques!.get(key);
                if (technique === undefined) {
                    technique = this.createTechnique(style, key, dynamicAttributes);
                    style._dynamicTechniques!.set(key, technique);
                }
                result.push(technique);
            } else {
                let technique = style._staticTechnique;
                if (technique === undefined) {
                    style._staticTechnique = technique = this.createTechnique(
                        style,
                        `${style._styleSetIndex}`,
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

        const processAttribute = (
            attrName: TechniquePropNames<Technique>,
            attrValue: Value | JsonExpr | undefined
        ) => {
            if (attrValue === undefined) {
                return;
            }

            const attrScope: AttrScope | undefined = (techniqueDescriptor.attrScopes as any)[
                attrName as any
            ];

            if (isJsonExpr(attrValue)) {
                const expr = Expr.fromJSON(
                    attrValue,
                    this.m_definitions,
                    this.m_definitionExprCache
                ).intern(this.m_exprPool);
                if (expr instanceof LiteralExpr) {
                    // Shortcut for literal expressions, so they are not taken into account when
                    // trying to instantiate technique variants.
                    attrValue = expr.value;
                } else {
                    switch (attrScope) {
                        case AttrScope.FeatureGeometry:
                            dynamicFeatureAttributes.push([attrName, expr]);
                            break;
                        case AttrScope.TechniqueGeometry:
                        case AttrScope.TechniqueRendering:
                            dynamicTechniqueAttributes.push([attrName, expr]);
                            break;
                    }
                    return;
                }
            }

            if (isInterpolatedPropertyDefinition(attrValue)) {
                const interpolatedProperty = createInterpolatedProperty(attrValue);
                if (!interpolatedProperty) {
                    return;
                }
                switch (attrScope) {
                    case AttrScope.FeatureGeometry:
                        dynamicFeatureAttributes.push([attrName, interpolatedProperty]);
                        break;
                    case AttrScope.TechniqueRendering:
                    case AttrScope.TechniqueGeometry:
                        dynamicForwardedAttributes.push([attrName, interpolatedProperty]);
                        break;
                }
            } else {
                targetStaticAttributes.push([attrName, attrValue]);
            }
        };

        function processAttributes(style2: Style) {
            processAttribute("renderOrder", style2.renderOrder);
            processAttribute("renderOrderOffset", style2.renderOrderOffset);

            // TODO: What the heck is that !?
            processAttribute("label", style2.labelProperty);

            // line & solid-line secondaryRenderOrder should be generic attr
            // TODO: maybe just warn and force move it to `attr` ?
            processAttribute("secondaryRenderOrder", (style2 as LineStyle).secondaryRenderOrder);

            if (style2.attr !== undefined) {
                for (const attrName in style2.attr) {
                    if (!style2.attr.hasOwnProperty(attrName)) {
                        continue;
                    }
                    processAttribute(
                        attrName as TechniquePropNames<Technique>,
                        (style2.attr as any)[attrName]
                    );
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
            const evaluatedValue = attrExpr.evaluate(env, this.m_cachedResults);
            return [attrName, evaluatedValue];
        });
    }

    private createTechnique(
        style: InternalStyle,
        key: string,
        dynamicAttrs: Array<[string, Value]>
    ) {
        const technique: any = {};
        technique.name = style.technique;
        if (style._staticAttributes !== undefined) {
            for (const [attrName, attrValue] of style._staticAttributes) {
                technique[attrName] = attrValue;
            }
        }
        for (const [attrName, attrValue] of dynamicAttrs) {
            technique[attrName] = attrValue;
        }

        if (style._dynamicFeatureAttributes !== undefined) {
            for (const [attrName, attrValue] of style._dynamicFeatureAttributes) {
                technique[attrName] = attrValue;
            }
        }

        if (style._dynamicForwaredAttributes !== undefined) {
            for (const [attrName, attrValue] of style._dynamicForwaredAttributes) {
                if (attrValue instanceof Expr) {
                    // TODO: We don't support `Expr` instances in main thread yet.
                    continue;
                }
                technique[attrName] = attrValue;
            }
        }

        technique._index = this.m_techniques.length;
        technique._styleSetIndex = style._styleSetIndex!;
        technique._key = key;
        this.m_techniques.push(technique as IndexedTechnique);
        return technique as IndexedTechnique;
    }
}

/**
 * Create transferable representation of dynamic technique.
 *
 * As for now, we remove all `Expr` as they are not supported on other side.
 */
export function makeDecodedTechnique(technique: IndexedTechnique): IndexedTechnique {
    const result: Partial<IndexedTechnique> = {};
    for (const attrName in technique) {
        if (!technique.hasOwnProperty(attrName)) {
            continue;
        }
        const attrValue: any = (technique as any)[attrName];
        if (attrValue instanceof Expr) {
            continue;
        }
        (result as any)[attrName] = attrValue;
    }
    return (result as any) as IndexedTechnique;
}
