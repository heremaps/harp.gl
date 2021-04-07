/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LoggerManager } from "@here/harp-utils";

import {
    BooleanLiteralExpr,
    CallExpr,
    CaseExpr,
    Env,
    Expr,
    ExprScope,
    ExprVisitor,
    HasAttributeExpr,
    InterpolateExpr,
    isJsonExpr,
    JsonExpr,
    LiteralExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
    StepExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";
import { ExprPool } from "./ExprPool";
import {
    interpolatedPropertyDefinitionToJsonExpr,
    isInterpolatedPropertyDefinition
} from "./InterpolatedPropertyDefs";
import { DecoderOptions } from "./ITileDecoder";
import { AttrScope, getTechniqueAttributeDescriptor } from "./TechniqueDescriptors";
import { IndexedTechnique, setTechniqueRenderOrderOrPriority, Technique } from "./Techniques";
import { Definitions, Style, StyleSet } from "./Theme";

const logger = LoggerManager.instance.create("StyleSetEvaluator");

const DEFAULT_TECHNIQUE_ATTR_SCOPE = AttrScope.TechniqueGeometry;

/**
 * Get the attribute scope of the given style property.
 *
 * @remarks
 * Certain Style properties change their dynamic scope behavior
 * based on other properties. For example, the `color` property
 * of `extruded-polygon` change behavior based on the usage
 * of `vertexColors`.
 *
 * @param style A valid Style.
 * @param attrName The name of the attribute of the {@link style}.
 */
function getStyleAttributeScope(style: InternalStyle, attrName: string): AttrScope {
    if (style.technique === "extruded-polygon") {
        if (attrName === "color" && style.vertexColors !== false) {
            return DEFAULT_TECHNIQUE_ATTR_SCOPE;
        }
    }

    return (
        getTechniqueAttributeDescriptor(style.technique, attrName)?.scope ??
        DEFAULT_TECHNIQUE_ATTR_SCOPE
    );
}

interface StyleInternalParams {
    /**
     * Optimization: Lazy creation and storage of expression in a style object.
     */
    _whenExpr?: Expr;
    _minZoomLevelExpr?: Expr;
    _maxZoomLevelExpr?: Expr;

    _staticAttributes?: Array<[string, Value]>;

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
    _dynamicFeatureAttributes?: Array<[string, Expr]>;

    /**
     * These attributes are forwarded as serialized by decoder to main thread, so they are resolved
     * directly in render loop.
     *
     * Will contain attributes from these lists
     *  - interpolants from [[TechiqueDescriptor.techniquePropNames]]
     *  - expressions [[TechniqueDescriptor.dynamicPropNames]] (Future)
     */
    _dynamicForwardedAttributes?: Array<[string, Expr]>;
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

    /**
     * `true` if any of the properties of this technique
     * requires access to the feature's state.
     */
    _usesFeatureState?: boolean;
}

type InternalStyle = Style & StyleInternalParams;

/**
 * `StyleConditionClassifier` searches for usages of `$layer` in `when` conditions
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

    visitStepExpr(expr: StepExpr, enclosingExpr: Expr | undefined): Expr | undefined {
        return expr;
    }

    visitInterpolateExpr(expr: InterpolateExpr, enclosingExpr: Expr | undefined): Expr | undefined {
        return expr;
    }

    /**
     * Tests if the given `call` matches the structure ["==", ["get", name], value].
     * If a match is found returns an object containing the `name` and the `value`;
     *
     * @param call - The expression to match.
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
 * Options to be passed to the StyleSetEvaluator
 *
 * Basically identical as the DecoderOptions but requires styleSet to be set.
 */
export type StyleSetOptions = Omit<DecoderOptions, "languages"> & { styleSet: StyleSet };

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
    private m_featureDependencies: string[] = [];
    private m_layer: string | undefined;
    private m_geometryType: string | undefined;
    private m_zoomLevel: number | undefined;
    private m_previousResult: IndexedTechnique[] | undefined;
    private m_previousEnv: Env | undefined;

    constructor(private readonly m_options: StyleSetOptions) {
        this.m_definitions = this.m_options.definitions;
        this.styleSet = resolveReferences(this.m_options.styleSet, this.m_definitions);
        computeDefaultRenderOrder(this.styleSet);
        this.compileStyleSet();
    }

    /**
     * Find all techniques that fit the current objects' environment.
     * *The techniques in the resulting array may not be modified* since they are being reused for
     * identical objects.
     *
     * @param env - The objects environment, i.e. the attributes that are relevant for its
     * representation.
     * @param layer - The optional layer name used to filter techniques.
     * @param geometryType - The optional geometryType used to filter techniques.
     */
    getMatchingTechniques(
        env: Env,
        layer?: string | undefined,
        geometryType?: string | undefined
    ): IndexedTechnique[] {
        if (
            this.m_previousResult &&
            this.m_previousEnv &&
            this.m_featureDependencies.every(p => this.m_previousEnv?.lookup(p) === env.lookup(p))
        ) {
            return this.m_previousResult;
        }

        const result: IndexedTechnique[] = [];
        this.m_cachedResults.clear();

        const optimizedSubSetKey = this.m_tmpOptimizedSubSetKey;
        optimizedSubSetKey.set(layer, geometryType, env);

        // get the requested $layer and $geometryType, if any.
        this.m_layer = optimizedSubSetKey.layer;
        this.m_geometryType = optimizedSubSetKey.geometryType;
        this.m_zoomLevel = env.lookup("$zoom") as number | undefined;

        const searchedStyleSet = this.getOptimizedStyleSet(optimizedSubSetKey);

        for (const currStyle of searchedStyleSet) {
            if (this.processStyle(env, currStyle, result)) {
                break;
            }
        }

        this.m_previousResult = result;
        this.m_previousEnv = env;

        return result;
    }

    /**
     * Check if `styleSet` contains any rule related to `layer`.
     *
     * @param layer - name of layer
     */
    wantsLayer(layer: string): boolean {
        return (
            this.getOptimizedStyleSet(this.m_tmpOptimizedSubSetKey.set(layer, undefined)).length > 0
        );
    }

    /**
     * Check if `styleSet` contains any rule related to particular `[layer, geometryType]` pair.
     *
     * @param layer - name of layer
     * @param geometryType - type of layer - `point`, `line` or `polygon`
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
     * Reset array of techniques.
     *
     * Cleans technique array and indices, so it doesn't accumulate accross several decoding runs.
     */
    resetTechniques() {
        for (const techinque of this.m_techniques) {
            techinque._index = undefined!;
        }
        this.m_techniques.length = 0;
        this.m_previousResult = undefined;
        this.m_previousEnv = undefined;
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
        this.m_featureDependencies = ["$layer", "$geometryType", "$zoom"];

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
     * @param style - The current style.
     */
    private compileStyle(style: InternalStyle) {
        this.checkStyleDynamicAttributes(style);

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

                const deps = style._whenExpr.dependencies();

                deps?.properties.forEach(prop => {
                    if (!this.m_featureDependencies.includes(prop)) {
                        this.m_featureDependencies.push(prop);
                    }
                });

                if (isJsonExpr(style.minZoomLevel)) {
                    style._minZoomLevelExpr = Expr.fromJSON(style.minZoomLevel).intern(
                        this.m_exprPool
                    );
                }

                if (isJsonExpr(style.maxZoomLevel)) {
                    style._maxZoomLevelExpr = Expr.fromJSON(style.maxZoomLevel).intern(
                        this.m_exprPool
                    );
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
     * @param env - The objects environment, i.e. the attributes that are relevant for its
     *            representation.
     * @param style - Current style (could also be top of stack).
     * @param result - The array of resulting techniques. There may be more than one technique per
     *               object, resulting in multiple graphical objects for representation.
     * @returns `true` if style has been found and processing is finished. `false` if not found, or
     *          more than one technique should be applied.
     */
    private processStyle(env: Env, style: InternalStyle, result: Technique[]): boolean {
        if (!this.checkZoomLevel(env, style)) {
            return false;
        }

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

    private checkZoomLevel(env: Env, style: InternalStyle) {
        if (style.minZoomLevel === undefined && style.maxZoomLevel === undefined) {
            return true;
        }

        const zoomLevel = this.m_zoomLevel;
        if (zoomLevel === undefined) {
            return true;
        }

        if (style.minZoomLevel !== undefined) {
            let minZoomLevel: Value = style.minZoomLevel;

            if (style._minZoomLevelExpr?.isDynamic() === false) {
                // Only filter by zoom level if the expression is not dynamic.
                try {
                    minZoomLevel = style._minZoomLevelExpr.evaluate(
                        env,
                        ExprScope.Condition,
                        this.m_cachedResults
                    );
                } catch (error) {
                    logger.error(
                        `failed to evaluate expression '${JSON.stringify(
                            style._minZoomLevelExpr
                        )}': ${error}`
                    );
                }
            }

            if (typeof minZoomLevel === "number" && zoomLevel < minZoomLevel) {
                return false;
            }
        }

        if (style.maxZoomLevel !== undefined) {
            let maxZoomLevel: Value = style.maxZoomLevel;

            if (style._maxZoomLevelExpr?.isDynamic() === false) {
                // Only filter by zoom level if the expression is not dynamic.
                try {
                    maxZoomLevel = style._maxZoomLevelExpr.evaluate(
                        env,
                        ExprScope.Condition,
                        this.m_cachedResults
                    );
                } catch (error) {
                    logger.error(
                        `failed to evaluate expression '${JSON.stringify(
                            style._maxZoomLevelExpr
                        )}': ${error}`
                    );
                }
            }

            if (typeof maxZoomLevel === "number" && zoomLevel >= maxZoomLevel) {
                return false;
            }
        }

        return true;
    }

    private getTechniqueForStyleMatch(env: Env, style: InternalStyle) {
        let technique: IndexedTechnique | undefined;
        if (style._dynamicTechniques !== undefined) {
            const dynamicAttributes = this.evaluateTechniqueProperties(style, env);
            const key = this.getDynamicTechniqueKey(style, dynamicAttributes);
            technique = style._dynamicTechniques!.get(key);
            if (technique === undefined) {
                technique = this.createTechnique(style, key, dynamicAttributes);
                style._dynamicTechniques!.set(key, technique);
            }
        } else {
            technique = style._staticTechnique;
            if (technique === undefined) {
                style._staticTechnique = technique = this.createTechnique(
                    style,
                    `${style._styleSetIndex}`,
                    []
                ) as IndexedTechnique;
            }
        }

        if (technique._index === undefined) {
            technique._index = this.m_techniques.length;
            this.m_techniques.push(technique);
        }
        return technique;
    }

    private getDynamicTechniqueKey(
        style: InternalStyle,
        dynamicAttributes: Array<[string, Value]>
    ) {
        const dynamicAttrKey = dynamicAttributes
            .map(([_attrName, attrValue]) => {
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

        const processAttribute = (attrName: string, attrValue: Value | JsonExpr | undefined) => {
            if (attrValue === undefined) {
                return;
            }

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

            if (Expr.isExpr(attrValue)) {
                const deps = attrValue.dependencies();

                if (deps.featureState) {
                    if (attrName !== "enabled") {
                        logger.log("feature-state is not supported in this context");
                    } else {
                        style._usesFeatureState = true;
                    }
                }

                if (deps.properties.size === 0 && !attrValue.isDynamic()) {
                    // no data-dependencies detected.
                    attrValue = attrValue.evaluate(this.m_emptyEnv);
                }
            }

            if (Expr.isExpr(attrValue)) {
                const attrScope = getStyleAttributeScope(style, attrName);

                const deps = attrValue.dependencies();

                deps.properties.forEach(prop => {
                    if (!this.m_featureDependencies.includes(prop)) {
                        this.m_featureDependencies.push(prop);
                    }
                });

                switch (attrScope) {
                    case AttrScope.FeatureGeometry:
                        dynamicFeatureAttributes.push([attrName, attrValue]);
                        break;
                    case AttrScope.TechniqueGeometry:
                        dynamicTechniqueAttributes.push([attrName, attrValue]);
                        break;
                    case AttrScope.TechniqueRendering:
                        if (deps.properties.size === 0) {
                            dynamicForwardedAttributes.push([attrName, attrValue]);
                        } else {
                            dynamicTechniqueAttributes.push([attrName, attrValue]);
                        }
                        break;
                }
            } else if (attrValue !== undefined && attrValue !== null) {
                targetStaticAttributes.push([attrName, attrValue]);
            }
        };

        const replacement = new Map<string, string>([
            ["category", "_category"],
            ["secondaryCategory", "_secondaryCategory"]
        ]);

        for (const p in style) {
            if (!style.hasOwnProperty(p)) {
                continue;
            }
            if (p.startsWith("_")) {
                continue;
            }
            if (["when", "technique", "layer", "attr", "description"].includes(p)) {
                continue;
            }
            const pp = replacement.get(p) ?? p;
            processAttribute(pp, (style as any)[p]);
        }

        if (style.attr !== undefined) {
            for (const attrName in style.attr) {
                if (!style.attr.hasOwnProperty(attrName)) {
                    continue;
                }
                processAttribute(attrName, (style.attr as any)[attrName]);
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
                technique[attrName] = attrValue;
            }
        }

        technique._index = this.m_techniques.length;
        technique._styleSetIndex = style._styleSetIndex!;
        if (style.styleSet !== undefined) {
            technique._styleSet = style.styleSet;
        }
        if (style._usesFeatureState !== undefined) {
            technique._usesFeatureState = style._usesFeatureState;
        }
        setTechniqueRenderOrderOrPriority(
            technique,
            this.m_options.priorities ?? [],
            this.m_options.labelPriorities ?? []
        );
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

function resolveReferences(styleSet: Style[], definitions: Definitions | undefined) {
    return styleSet.map(style => resolveStyleReferences(style, definitions));
}

function resolveStyleReferences(style: Style, definitions: Definitions | undefined): InternalStyle {
    return { ...style };
}

/**
 * Create transferable representation of dynamic technique.
 *
 * Converts  non-transferable {@link Expr}instances back to JSON form.
 */
export function makeDecodedTechnique(technique: IndexedTechnique): IndexedTechnique {
    const result: Partial<IndexedTechnique> = {};
    for (const attrName in technique) {
        if (!technique.hasOwnProperty(attrName)) {
            continue;
        }

        let attrValue: any = (technique as any)[attrName];

        if (
            typeof attrValue === "object" &&
            (attrValue.isVector2 || attrValue.isVector3 || attrValue.isVector4)
        ) {
            attrValue = LiteralExpr.fromValue(attrValue);
        }

        if (Expr.isExpr(attrValue)) {
            attrValue = attrValue.toJSON();
        }

        (result as any)[attrName] = attrValue;
    }
    return (result as any) as IndexedTechnique;
}
