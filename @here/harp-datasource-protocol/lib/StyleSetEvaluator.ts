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
    ExprScope,
    ExprVisitor,
    HasAttributeExpr,
    isJsonExpr,
    JsonExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";
import { ExprPool } from "./ExprPool";
import { isInterpolatedProperty, isInterpolatedPropertyDefinition } from "./InterpolatedProperty";
import {
    InterpolatedProperty,
    interpolatedPropertyDefinitionToJsonExpr
} from "./InterpolatedPropertyDefs";
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

    _staticAttributes?: Array<[string, Value | InterpolatedProperty]>;

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
    _dynamicFeatureAttributes?: Array<[string, Expr | InterpolatedProperty]>;

    /**
     * These attributes are forwarded as serialized by decoder to main thread, so they are resolved
     * directly in render loop.
     *
     * Will contain attributes from these lists
     *  - interpolants from [[TechiqueDescriptor.techniquePropNames]]
     *  - expressions [[TechniqueDescriptor.dynamicPropNames]] (Future)
     */
    _dynamicForwardedAttributes?: Array<[string, Expr | InterpolatedProperty]>;
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
 * [[StyleConditionClassifier]] searches for usages of `$layer` in `when` conditions
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
            const children = call.args
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
            const left = call.args[0];
            const right = call.args[1];

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

class OptimizedSubSetKey {
    key: string;
    layer: string | undefined;
    geometryType: string | undefined;

    cachedStyleSet?: InternalStyle[];

    constructor(layer?: string | undefined, geometryType?: string | undefined) {
        this.key = "";
        this.set(layer, geometryType);
    }

    set(
        layer: string | undefined,
        geometryType: string | undefined,
        env?: Env
    ): OptimizedSubSetKey {
        let keyUpdateNeeded: boolean = false;
        if (layer === undefined) {
            const envLayer = env !== undefined ? env.lookup("$layer") : undefined;
            layer = typeof envLayer === "string" ? envLayer : undefined;
        }
        if (this.layer !== layer) {
            this.layer = layer;
            keyUpdateNeeded = true;
        }

        if (geometryType === undefined) {
            const envGeometryType = env !== undefined ? env.lookup("$geometryType") : undefined;
            geometryType = typeof envGeometryType === "string" ? envGeometryType : undefined;
        }
        if (this.geometryType !== geometryType) {
            this.geometryType = geometryType;
            keyUpdateNeeded = true;
        }

        if (keyUpdateNeeded) {
            this.updateKey();
        }
        return this;
    }

    private updateKey() {
        if (this.layer !== undefined) {
            // tslint:disable-next-line:prefer-conditional-expression
            if (this.geometryType !== undefined) {
                this.key = `${this.layer}:${this.geometryType}`;
            } else {
                this.key = `${this.layer}:`;
            }
        } else {
            if (this.geometryType !== undefined) {
                this.key = `:${this.geometryType}`;
            } else {
                this.key = "all";
            }
        }
        this.cachedStyleSet = undefined;
    }
}

/**
 * Combine data from datasource and apply the rules from a specified theme to show it on the map.
 */
export class StyleSetEvaluator {
    readonly styleSet: InternalStyle[];

    private readonly m_techniques: IndexedTechnique[] = [];
    private readonly m_exprPool = new ExprPool();
    private readonly m_cachedResults = new Map<Expr, Value>();
    private readonly m_styleConditionClassifier = new StyleConditionClassifier();
    private readonly m_subStyleSetCache = new Map<string, InternalStyle[]>();
    private readonly m_definitions?: Definitions;
    private readonly m_definitionExprCache = new Map<string, Expr>();
    private readonly m_tmpOptimizedSubSetKey: OptimizedSubSetKey = new OptimizedSubSetKey();
    private readonly m_emptyEnv = new Env();
    private m_layer: string | undefined;
    private m_geometryType: string | undefined;

    constructor(styleSet: StyleSet, definitions?: Definitions) {
        this.m_definitions = definitions;
        this.styleSet = resolveReferences(styleSet, definitions);
        computeDefaultRenderOrder(this.styleSet);
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
    getMatchingTechniques(
        env: Env,
        layer?: string | undefined,
        geometryType?: string | undefined
    ): IndexedTechnique[] {
        const result: IndexedTechnique[] = [];
        this.m_cachedResults.clear();

        const optimizedSubSetKey = this.m_tmpOptimizedSubSetKey;
        optimizedSubSetKey.set(layer, geometryType, env);

        // get the requested $layer and $geometryType, if any.
        const currentLayer = optimizedSubSetKey.layer;
        const currentGeometryType = optimizedSubSetKey.geometryType;

        const searchedStyleSet = this.getOptimizedStyleSet(optimizedSubSetKey);

        // set the requested $layer as the current layer.
        const previousLayer = this.changeLayer(
            typeof currentLayer === "string" ? currentLayer : undefined
        );

        const previousGeometryType = this.changeGeometryType(
            typeof currentGeometryType === "string" ? currentGeometryType : undefined
        );

        for (const currStyle of searchedStyleSet) {
            if (this.processStyle(env, currStyle, result)) {
                break;
            }
        }

        this.changeLayer(previousLayer); // restore the layer
        this.changeGeometryType(previousGeometryType); // restore the geometryType

        return result;
    }

    /**
     * Check if `styleSet` contains any rule related to `layer`.
     *
     * @param layer name of layer
     */
    wantsLayer(layer: string): boolean {
        return (
            this.getOptimizedStyleSet(this.m_tmpOptimizedSubSetKey.set(layer, undefined)).length > 0
        );
    }

    /**
     * Check if `styleSet` contains any rule related to particular `[layer, geometryType]` pair.
     *
     * @param layer name of layer
     * @param geometryType type of layer - `point`, `line` or `polygon`
     */
    wantsFeature(layer: string, geometryType?: string): boolean {
        return (
            this.getOptimizedStyleSet(this.m_tmpOptimizedSubSetKey.set(layer, geometryType))
                .length > 0
        );
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

    private getOptimizedStyleSet(subSetKey: OptimizedSubSetKey): InternalStyle[] {
        if (subSetKey.cachedStyleSet !== undefined) {
            return subSetKey.cachedStyleSet;
        }
        let optimizedStyleSet = this.m_subStyleSetCache.get(subSetKey.key);
        if (optimizedStyleSet !== undefined) {
            subSetKey.cachedStyleSet = optimizedStyleSet;
            return optimizedStyleSet;
        }
        optimizedStyleSet = this.createPreFilteredStyleSet(subSetKey);
        this.m_subStyleSetCache.set(subSetKey.key, optimizedStyleSet);
        subSetKey.cachedStyleSet = optimizedStyleSet;
        return optimizedStyleSet;
    }

    private createPreFilteredStyleSet(subSetKey: OptimizedSubSetKey) {
        const { layer, geometryType } = subSetKey;

        return this.styleSet.filter(style => {
            if (layer !== undefined && style.layer !== undefined && style.layer !== layer) {
                return false;
            }
            if (
                geometryType !== undefined &&
                style._geometryType !== undefined &&
                style._geometryType !== geometryType
            ) {
                return false;
            }
            return true;
        });
    }

    /**
     * Compile the `when` conditions found when traversting the styling rules.
     */
    private compileStyleSet() {
        this.styleSet.forEach(style => this.compileStyle(style));

        // Create optimized styleSets for each `layer` & `geometryType` tuple.
        this.styleSet.forEach(style => {
            this.getOptimizedStyleSet(
                this.m_tmpOptimizedSubSetKey.set(style.layer, style._geometryType)
            );
        });
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
    }

    /**
     * Process a style (and its sub-styles) hierarchically to look for the technique that fits the
     * current objects' environment. The attributes of the styles are assembled to create a unique
     * technique for every object.
     *
     * @param env The objects environment, i.e. the attributes that are relevant for its
     *            representation.
     * @param style Current style (could also be top of stack).
     * @param result The array of resulting techniques. There may be more than one technique per
     *               object, resulting in multiple graphical objects for representation.
     * @returns `true` if style has been found and processing is finished. `false` if not found, or
     *          more than one technique should be applied.
     */
    private processStyle(env: Env, style: InternalStyle, result: Technique[]): boolean {
        if (
            this.m_layer !== undefined &&
            style.layer !== undefined &&
            style.layer !== this.m_layer
        ) {
            return false;
        }
        if (
            this.m_geometryType !== undefined &&
            style._geometryType !== undefined &&
            style._geometryType !== this.m_geometryType
        ) {
            return false;
        }

        if (style._whenExpr) {
            try {
                if (!style._whenExpr.evaluate(env, ExprScope.Condition, this.m_cachedResults)) {
                    // Stop processing this styling rule. The `when` condition
                    // associated with the current `style` evaluates to false so
                    // no techinque defined by this style should be applied.
                    return false;
                }
            } catch (error) {
                logger.error(
                    `failed to evaluate expression '${JSON.stringify(style.when)}': ${error}`
                );
                return false;
            }
        }

        if (style.technique === undefined) {
            return false;
        }
        // we found a technique!
        if (style.technique !== "none") {
            result.push(this.getTechniqueForStyleMatch(env, style));
        }
        // stop processing if "final" is set
        return style.final === true;
    }

    private getTechniqueForStyleMatch(env: Env, style: InternalStyle) {
        this.checkStyleDynamicAttributes(style);

        if (style._dynamicTechniques !== undefined) {
            const dynamicAttributes = this.evaluateTechniqueProperties(style, env);
            const key = this.getDynamicTechniqueKey(style, dynamicAttributes);
            let technique = style._dynamicTechniques!.get(key);
            if (technique === undefined) {
                technique = this.createTechnique(style, key, dynamicAttributes);
                style._dynamicTechniques!.set(key, technique);
            }
            return technique;
        } else {
            let technique = style._staticTechnique;
            if (technique === undefined) {
                style._staticTechnique = technique = this.createTechnique(
                    style,
                    `${style._styleSetIndex}`,
                    []
                ) as IndexedTechnique;
            }
            return technique;
        }
    }

    private getDynamicTechniqueKey(
        style: InternalStyle,
        dynamicAttributes: Array<[string, Value]>
    ) {
        const dynamicAttrKey = dynamicAttributes
            .map(([attrName, attrValue]) => {
                if (attrValue === undefined) {
                    return "U";
                } else {
                    return JSON.stringify(attrValue);
                }
            })
            .join(":");
        return `${style._styleSetIndex!}:${dynamicAttrKey}`;
    }

    private checkStyleDynamicAttributes(style: InternalStyle) {
        if (style._dynamicTechniqueAttributes !== undefined || style.technique === "none") {
            return;
        }

        style._dynamicTechniqueAttributes = [];
        style._dynamicFeatureAttributes = [];
        style._dynamicForwardedAttributes = [];
        style._staticAttributes = [];

        const dynamicFeatureAttributes = style._dynamicFeatureAttributes;
        const dynamicTechniqueAttributes = style._dynamicTechniqueAttributes;
        const dynamicForwardedAttributes = style._dynamicForwardedAttributes;
        const targetStaticAttributes = style._staticAttributes;

        const techniqueDescriptor =
            techniqueDescriptors[style.technique] || emptyTechniqueDescriptor;

        const processAttribute = (
            attrName: TechniquePropNames<Technique>,
            attrValue: Value | JsonExpr | InterpolatedProperty | undefined
        ) => {
            if (attrValue === undefined) {
                return;
            }

            const attrScope: AttrScope | undefined = (techniqueDescriptor.attrScopes as any)[
                attrName as any
            ];

            if (isJsonExpr(attrValue)) {
                attrValue = Expr.fromJSON(
                    attrValue,
                    this.m_definitions,
                    this.m_definitionExprCache
                ).intern(this.m_exprPool);
            } else if (isInterpolatedPropertyDefinition(attrValue)) {
                // found a property using an object-like interpolation definition.
                attrValue = Expr.fromJSON(
                    interpolatedPropertyDefinitionToJsonExpr(attrValue)
                ).intern(this.m_exprPool);
            }

            if (attrValue instanceof Expr) {
                const deps = attrValue.dependencies();

                if (deps.properties.size === 0) {
                    // no data-dependencies detected.
                    attrValue = attrValue.evaluate(this.m_emptyEnv);
                }
            }

            if (isInterpolatedProperty(attrValue) || attrValue instanceof Expr) {
                switch (attrScope) {
                    case AttrScope.FeatureGeometry:
                        dynamicFeatureAttributes.push([attrName, attrValue]);
                        break;
                    case AttrScope.TechniqueRendering:
                    case AttrScope.TechniqueGeometry:
                        if (attrValue instanceof Expr) {
                            dynamicTechniqueAttributes.push([attrName, attrValue]);
                        } else {
                            dynamicForwardedAttributes.push([attrName, attrValue]);
                        }
                        break;
                }
            } else if (attrValue !== undefined && attrValue !== null) {
                targetStaticAttributes.push([attrName, attrValue]);
            }
        };

        processAttribute("renderOrder", style.renderOrder);

        // TODO: What the heck is that !?
        processAttribute("label", style.labelProperty);

        // line & solid-line secondaryRenderOrder should be generic attr
        // TODO: maybe just warn and force move it to `attr` ?
        processAttribute("secondaryRenderOrder", (style as LineStyle).secondaryRenderOrder);

        if (style.attr !== undefined) {
            for (const attrName in style.attr) {
                if (!style.attr.hasOwnProperty(attrName)) {
                    continue;
                }
                processAttribute(
                    attrName as TechniquePropNames<Technique>,
                    (style.attr as any)[attrName]
                );
            }
        }

        if (dynamicTechniqueAttributes.length > 0) {
            style._dynamicTechniques = new Map();
        }
    }

    private evaluateTechniqueProperties(style: InternalStyle, env: Env): Array<[string, Value]> {
        if (style._dynamicTechniqueAttributes === undefined) {
            return [];
        }

        return style._dynamicTechniqueAttributes.map(([attrName, attrExpr]) => {
            try {
                const evaluatedValue = attrExpr.evaluate(
                    env,
                    ExprScope.Value,
                    this.m_cachedResults
                );
                return [attrName, evaluatedValue];
            } catch (error) {
                logger.error(`failed to evaluate expression '${attrExpr.toJSON()}': ${error}`);
                return [attrName, null];
            }
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
                if (attrValue !== null) {
                    technique[attrName] = attrValue;
                }
            }
        }
        for (const [attrName, attrValue] of dynamicAttrs) {
            if (attrValue !== null) {
                technique[attrName] = attrValue;
            }
        }

        if (style._dynamicFeatureAttributes !== undefined) {
            for (const [attrName, attrValue] of style._dynamicFeatureAttributes) {
                technique[attrName] = attrValue;
            }
        }

        if (style._dynamicForwardedAttributes !== undefined) {
            for (const [attrName, attrValue] of style._dynamicForwardedAttributes) {
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

function computeDefaultRenderOrder(styleSet: InternalStyle[]) {
    let techniqueRenderOrder = 0;
    let styleSetIndex = 0;
    for (const style of styleSet) {
        style._styleSetIndex = styleSetIndex++;
        if (style.technique !== undefined && style.renderOrder === undefined) {
            style.renderOrder = techniqueRenderOrder++;
        }
    }
}

function resolveReferences(styleSet: StyleDeclaration[], definitions: Definitions | undefined) {
    return styleSet.map(style => resolveStyleReferences(style, definitions));
}

function resolveStyleReferences(
    style: StyleDeclaration,
    definitions: Definitions | undefined
): InternalStyle {
    if (isJsonExpr(style)) {
        if (!isJsonExprReference(style)) {
            throw new Error("invalid expression in this context, only 'ref's are supported");
        }
        // expand and instantiate references to style definitions.
        const definitionName = style[1];
        const def = definitions && definitions[definitionName];
        if (!def) {
            throw new Error(`invalid reference '${definitionName}' - not found`);
        }
        if (!isActualSelectorDefinition(def)) {
            throw new Error(`invalid reference '${definitionName}' - expected style definition`);
        }
        // instantiate the style
        return resolveStyleReferences(def, definitions);
    }

    return { ...style };
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
