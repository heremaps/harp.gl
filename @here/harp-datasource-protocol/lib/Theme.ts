/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "@here/harp-geoutils/lib/math/Vector3Like";
import { isJsonExpr, JsonExpr } from "./Expr";
import { isInterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import {
    BaseTechniqueParams,
    BasicExtrudedLineTechniqueParams,
    DynamicProperty,
    ExtrudedPolygonTechniqueParams,
    FillTechniqueParams,
    MarkerTechniqueParams,
    PointTechniqueParams,
    SegmentsTechniqueParams,
    ShaderTechniqueParams,
    SolidLineTechniqueParams,
    StandardExtrudedLineTechniqueParams,
    StandardTechniqueParams,
    TerrainTechniqueParams,
    TextTechniqueParams
} from "./TechniqueParams";

/**
 * Map theme is used to define what features are shown and how the map is styled, for example
 * which lightning is used or whether fog should be displayed.
 */
export interface Theme {
    /**
     * The URI of the JSON schema describing themes.
     */
    $schema?: string;

    /**
     * The base `Theme`s or `theme` URLs to extend.
     *
     * If used, base themes are loaded first, and then all the properties from inherited theme
     * overwrite these defined in base theme.
     */
    extends?: string | Theme | Array<string | Theme>;

    /**
     * Actual URL the theme has been loaded from.
     */
    url?: string;

    /**
     * Color to be used as a clear background - no map objects.
     * @format color-hex
     */
    clearColor?: string;

    /**
     * Define the default text style for styling labels and texts.
     */
    defaultTextStyle?: TextStyleDefinition;

    /**
     * Define the lightning available on the three.js scene.
     */
    lights?: Light[];

    /**
     * Define the style of the sky presented in the map scene.
     */
    sky?: Sky;

    /**
     * Define the fog used in the map scene.
     */
    fog?: Fog;

    /**
     * The definitions exported by these theme.
     */
    definitions?: Definitions;

    /**
     * Map styles available for datasources used to render the map.
     */
    styles?: Styles;

    /**
     * Define the style to render different types of text used on the map.
     */
    textStyles?: TextStyleDefinition[];

    /**
     * List available fonts to be used while rendering text.
     */
    fontCatalogs?: FontCatalogConfig[];

    /**
     * Optional images to be rendered on the map view.
     */
    images?: ImageDefinitions;

    /**
     * Image textures to be used while rendering geometries on the map view.
     */
    imageTextures?: ImageTexture[];

    /**
     * Optional list of [[ThemePoiTableDef]]s.
     */
    poiTables?: PoiTableRef[];

    /**
     * Optional list of symbolic priorities for the object
     * created using this [[Theme]].
     *
     * The attribute `styleSet` and `category` of the [[Technique]]
     * are used together with [[Theme.priorities]] to sort
     * the objects created using this [[Theme]], for example:
     *
     * ```json
     * {
     *      "priorities": [
     *          { "group": "tilezen", "category": "outline-1" }
     *      ],
     *      "styles": [
     *          {
     *              "technique": "solid-line",
     *              "styleSet": "tilezen",
     *              "category": "outline-1"
     *          }
     *      ]
     * }
     * ```
     */
    priorities?: StylePriority[];

    /**
     * Optional list of priorities for the screen-space
     * objects created using this style.
     *
     * The name of the `category` attribute of the screen-space
     * technique (e.g. `"text"`) must match on the strings
     * defined by this [[Theme.labelPriorities]], for example:
     *
     * ```json
     * {
     *      "labelPriorities": [
     *          "continent-labels",
     *          "country-labels",
     *          "state-labels"
     *      ],
     *      "styles": [
     *          {
     *              "technique": "text",
     *              "category": "state-labels"
     *          }
     *      ]
     * }
     * ```
     */
    labelPriorities?: string[];
}

/**
 * A type representing symbolic render orders.
 */
export interface StylePriority {
    /**
     * The group of this [[StylePriority]].
     */
    group: string;

    /**
     * The category of this [[StylePriority]].
     */
    category?: string;
}

/**
 * A type representing HARP themes with all the styleset declarations
 * grouped in one [[Array]].
 *
 * @internal This type will merge with [[Theme]].
 */
export type FlatTheme = Omit<Theme, "styles"> & {
    /**
     * The style rules used to render the map.
     */
    styles?: StyleSet;
};

/**
 * Checks if the given definition implements the [[BoxedDefinition]] interface.
 */
export function isBoxedDefinition(def: Definition): def is BoxedDefinition {
    const bdef = def as BoxedDefinition;
    return (
        typeof bdef === "object" &&
        bdef !== null &&
        (typeof bdef.type === "string" || typeof bdef.type === "undefined") &&
        (typeof bdef.value === "string" ||
            typeof bdef.value === "number" ||
            typeof bdef.value === "boolean" ||
            isInterpolatedPropertyDefinition(bdef.value) ||
            isJsonExpr(bdef.value))
    );
}

export function isLiteralDefinition(def: Definition): def is LiteralValue {
    return typeof def === "string" || typeof def === "number" || typeof def === "boolean";
}

/**
 * Value definition commons.
 */
export interface BaseValueDefinition {
    /**
     * The type of the definition.
     */
    type?: string;

    /**
     * The description of the definition.
     */
    description?: string;
}

/**
 * Possible types of unboxed literal values carried by [[Definition]].
 */
export type LiteralValue = string | number | boolean;

/**
 * Boxed definition without type.
 */
export interface BoxedAnyDefinition extends BaseValueDefinition {
    /**
     * The value of the definition.
     */
    value: LiteralValue | JsonExpr;
}

/**
 * A boxed boolean value definition.
 */
export interface BoxedBooleanDefinition extends BaseValueDefinition {
    /**
     * The type of the definition.
     */
    type: "boolean";

    /**
     * The value of the definition.
     */
    value: DynamicProperty<boolean>;
}

/**
 * A boxed numerical value definition.
 */
export interface BoxedNumericDefinition extends BaseValueDefinition {
    /**
     * The type of the definition.
     */
    type: "number";

    /**
     * The value of the definition.
     */
    value: DynamicProperty<number>;
}

/**
 * A boxed string value definition.
 */
export interface BoxedStringDefinition extends BaseValueDefinition {
    /**
     * The type of the definition.
     */
    type: "string";

    /**
     * The value of the definition.
     */
    value: DynamicProperty<string>;
}

/**
 * A boxed color value definition.
 */
export interface BoxedColorDefinition extends BaseValueDefinition {
    /**
     * The type of the definition.
     */
    type: "color";

    /**
     * The value of the definition.
     */
    value: DynamicProperty<string>;
}

/**
 * A boxed selector value definition.
 */
export interface BoxedSelectorDefinition extends BaseValueDefinition {
    /**
     * The type of the definition.
     */
    type: "selector";

    /**
     * The value of the definition.
     *
     * See [[BaseStyle.when]].
     */
    value: string | JsonExpr;
}

/**
 * A boxed value definition.
 */
export type BoxedDefinition =
    | BoxedAnyDefinition
    | BoxedBooleanDefinition
    | BoxedNumericDefinition
    | BoxedStringDefinition
    | BoxedColorDefinition
    | BoxedSelectorDefinition;

/**
 * Possible values for `definitions` element of [Theme].
 */
export type Definition = LiteralValue | JsonExpr | BoxedDefinition | StyleDeclaration;

/**
 * An array of [[Definition]]s.
 */
export interface Definitions {
    [name: string]: Definition;
}

/**
 * Base [StyleSelector] attributes required to match [Style] object against given feature.
 *
 * Contains [Style]'s members related to feature matching in [[StyleSetEvaluator]].
 */
export interface StyleSelector {
    /**
     * Condition that is applied to feature properties to check if given [[Style]] this feature
     * should emit geometry of this style.
     *
     * Conditions are defined using [[Array]]s describing literals, built-in symbols and function
     * calls:
     *  - `["has", string]` returns `true` if the given property exists.
     *  - `["get", string]` returns the value of the given feature property with the given name.
     *  - `["all", expressions...]` returns `true` if all the sub expressions evaluate to true.
     *  - `["any", expressions...]` returns `true` if any sub expression evaluates to true.
     *  - `["in", expression, [literals...]]` returns `true` if the result of evaluating the first
     *    expression is included in the given `Array` of literals.
     *  - `["!", expression]` returns `false` if the sub expression evaluates to `true`.
     *  - `["<", expression, expression]` returns `true` if the result of evaluating the first
     *    expression is less than the result of evaluating the second expression.
     *  - `[">", expression, expression]` returns `true` if the result of evaluating the first
     *    expression is greater than the result of evaluating the second expression.
     *  - `["<=", expression, expression]` returns `true` if the result of evaluating the first
     *    expression is less than or equal the result of evaluating the second expression.
     *  - `[">=", expression, expression]` returns `true` if the result of evaluating the first
     *    expression is greater than or equal the result of evaluating the second expression.
     *  - `["==", expression, expression]` returns `true` if the result of evaluating the first
     *    expression is equal the result of evaluating the second expression.
     *  - `["!=", expression, expression]` returns `true` if the result of evaluating the first
     *    expression is not equal to the result of evaluating the second expression.
     *  - `["length", expression]` returns the length of the given expression if it evaluates to
     *    a `string` or an `Array`; otherwise, returns `undefined`.
     *  - `["~=", expression, expression]` if the expressions evaluate to `string`, returns `true`
     *    if the `string` obtained from the first expression contains the `string` obtained from the
     *    second expression; otherwise, returns `undefined`.
     *  - `["^=", expression, expression]` if the expressions evaluate to `string`, returns `true`
     *    if the `string` obtained from the first expression starts with the `string` obtained from
     *    the second expression; otherwise, returns `undefined`.
     *  - `["$=", expression, expression]` if the expressions evaluate to `string`, returns `true`
     *    if the `string` obtained from the first expression ends with the `string` obtained from
     *    the second expression; otherwise, returns `undefined`.
     */
    when: string | JsonExpr;

    /**
     * The layer containing the carto features processed by this style rule.
     */
    layer?: string;

    /**
     * Optional. If `true`, no more matching styles will be evaluated.
     */
    final?: boolean;
}

export type JsonExprReference = ["ref", string];

/**
 * Checks if the given value is a reference to a definition.
 *
 * @param value The value of a technique property.
 */
export function isJsonExprReference(value: any): value is JsonExprReference {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        value[0] === "ref" &&
        typeof value[1] === "string"
    );
}

/**
 * Like [[StyleDeclaration]], but without [[Reference]] type.
 */
export type ResolvedStyleDeclaration = Style & StyleSelector;

/**
 * Like [[StyleSet]], but without [[Reference]] type.
 */
export type ResolvedStyleSet = ResolvedStyleDeclaration[];

/**
 * Compound type that merges all raw [Style] with selector arguments from [BaseSelector], optionally
 * a [[Reference]].
 */
export type StyleDeclaration = (Style & StyleSelector) | JsonExpr;

export function isActualSelectorDefinition(def: Definition): def is Style & StyleSelector {
    const styleDef = def as StyleDeclaration;
    return (
        typeof styleDef === "object" &&
        styleDef !== null &&
        !Array.isArray(styleDef) &&
        typeof styleDef.technique === "string"
    );
}

/**
 * An array of [[StyleSelector]]s that are used together to define how a [[DataSource]] should be
 * rendered. `StyleSet`s are applied to sources providing vector tiles via their method
 * `setStyleSet`. This is also handle internally when a whole theme is passed to a [[MapView]] via
 * `mapview.theme`.
 */
export type StyleSet = StyleDeclaration[];

/**
 * The object that defines what way an item of a [[DataSource]] should be decoded to assemble a
 * tile. [[Style]] is describing which features are shown on a map and in what way they are being
 * shown.
 */
export interface BaseStyle {
    /**
     * Human readable description.
     */
    description?: string;

    /**
     * The style set referenced by this styling rule.
     */
    styleSet?: string;

    /**
     * The category of this style.
     */
    category?: string | JsonExpr;

    /**
     * Technique name. See the classes extending from this class to determine what possible
     * techniques are possible, includes `"line"`, `"fill"`, `"solid-line"`, `"extruded-line"`,
     * `"extruded-polygon"`, `"text"`, `"none"`.
     */
    technique?: string;

    /**
     * Specify `renderOrder` of value.
     *
     * @default If not specified in style file, `renderOrder` will be assigned with monotonically
     * increasing values according to style position in file.
     */
    renderOrder?: number | JsonExpr;

    /**
     * Minimal zoom level. If the current zoom level is smaller, the technique will not be used.
     */
    minZoomLevel?: number | JsonExpr;

    /**
     * Maximum zoom level. If the current zoom level is larger, the technique will not be used.
     */
    maxZoomLevel?: number | JsonExpr;

    /**
     * Optional. If `true`, no IDs will be saved for the geometry this style creates. Default is
     * `false`.
     */
    transient?: boolean;

    /**
     * Optional: If `true`, the objects with matching `when` statement will be printed to the
     * console.
     */
    debug?: boolean;

    // TODO: Make pixel units default.
    /**
     * Units in which different size properties are specified. Either `Meter` (default) or `Pixel`.
     *
     * @deprecated use "string encoded numerals" as documented in TODO, wher eis the doc ?
     */
    metricUnit?: "Meter" | "Pixel";

    /**
     * XYZ defines the property to display as text label of a feature in the styles.
     */
    labelProperty?: string;
}

/**
 *
 * @defaultSnippets [
 *     {
 *         "label": "New solid-line",
 *         "description": "Add a new 'solid-line' Styling Rule",
 *         "body": {
 *             "technique": "solid-line",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "lineWidth": "^${3:1}",
 *                 "secondaryColor": "#$4ddd",
 *                 "secondaryWidth": "^${5:2}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New dashed-line",
 *         "description": "Add a new 'dashed-line' Styling Rule",
 *         "body": {
 *             "technique": "solid-line",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "lineWidth": "^${3:1}",
 *                 "gapSize": "^${4:10}",
 *                 "dashSize": "^${5:10}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New fill",
 *         "description": "Add a new 'fill' Styling Rule",
 *         "body": {
 *             "technique": "fill",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "lineWidth": "^${3:0}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New text",
 *         "description": "Add a new 'text' Styling Rule",
 *         "body": {
 *             "technique": "text",
 *             "when": "$1",
 *             "attr": {
 *                 "size": "^${2:24}",
 *                 "color": "#${3:fff}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New labeled-icon",
 *         "description": "Add a new 'labeled-icon' marker styling",
 *         "body": {
 *             "technique": "labeled-icon",
 *             "when": "$1",
 *             "attr": {
 *                 "size": "^${2:24}",
 *                 "color": "#${3:fff}",
 *                 "backgroundSize": "^${4:32}",
 *                 "backgroundColor": "#${5:aaa}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New line-marker",
 *         "description": "Add a new 'line-marker' marker styling",
 *         "body": {
 *             "technique": "line-marker",
 *             "when": "$1",
 *             "attr": {
 *                 "size": "^${2:24}",
 *                 "color": "#${3:fff}",
 *                 "backgroundSize": "^${4:32}",
 *                 "backgroundColor": "#${5:aaa}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New line",
 *         "description": "Add a new 'line' Styling Rule",
 *         "body": {
 *             "technique": "line",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "lineWidth": "^${3:1}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New segments",
 *         "description": "Add a new 'segments' Styling Rule",
 *         "body": {
 *             "technique": "segments",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "lineWidth": "^${3:1}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New standard",
 *         "description": "Add a new 'standard' Styling Rule",
 *         "body": {
 *             "technique": "standard",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "roughness": "^${3:0.5}",
 *                 "metalness": "^${4:0.5}",
 *                 "emissive": "#${5:c44}",
 *                 "emissiveIntensity": "^${6:0.8}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New extruded-line",
 *         "description": "Add a new 'extruded-line' Styling Rule",
 *         "body": {
 *             "technique": "extruded-line",
 *             "when": "$1",
 *             "attr": {
 *                 "shading": "${2:standard}",
 *                 "color": "#${3:fff}",
 *                 "lineWidth": "^${4:1}",
 *                 "caps": "${5:Circle}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New extruded-polygon",
 *         "description": "Add a new 'extruded-polygon' Styling Rule",
 *         "body": {
 *             "technique": "extruded-polygon",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "roughness": "^${3:0.5}",
 *                 "metalness": "^${4:0.5}",
 *                 "emissive": "#${5:c44}",
 *                 "emissiveIntensity": "^${6:0.8}",
 *                 "lineWidth": "^${7:1}",
 *                 "lineColor": "#${8:c0f}",
 *                 "defaultHeight": "^${9:20}",
 *                 "animateExtrusion": "^${10:true}",
 *                 "animateExtrusionDuration": "^${11:300}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New none",
 *         "description": "Add a new 'none' Styling Rule",
 *         "body": {
 *             "technique": "none",
 *             "when": "$1",
 *             "attr": {}
 *         }
 *     },
 *     {
 *         "label": "New shader",
 *         "description": "Add a new 'shader' Styling Rule",
 *         "body": {
 *             "technique": "shader",
 *             "when": "$1",
 *             "attr": {
 *                 "primitive": "${2:mesh}",
 *                 "params": {}
 *             }
 *         }
 *     },
 *     {
 *         "label": "New squares",
 *         "description": "Add a new 'squares' point styling",
 *         "body": {
 *             "technique": "squares",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "size": "^${3:32}",
 *                 "texture": "${4:url}",
 *                 "enablePicking": "^${5:true}"
 *             }
 *         }
 *     },
 *     {
 *         "label": "New circles",
 *         "description": "Add a new 'circles' point styling",
 *         "body": {
 *             "technique": "circles",
 *             "when": "$1",
 *             "attr": {
 *                 "color": "#${2:fff}",
 *                 "size": "^${3:32}",
 *                 "texture": "${4:url}",
 *                 "enablePicking": "^${5:true}"
 *             }
 *         }
 *     }
 * ]
 *
 */
export type AllStyles =
    | SquaresStyle
    | CirclesStyle
    | PoiStyle
    | LineMarkerStyle
    | LineStyle
    | SegmentsStyle
    | SolidLineStyle
    | LabelRejectionLineStyle
    | FillStyle
    | StandardStyle
    | BasicExtrudedLineStyle
    | StandardExtrudedLineStyle
    | ExtrudedPolygonStyle
    | ShaderStyle
    | TerrainStyle
    | TextTechniqueStyle
    | NoneStyle;

export type Style = AllStyles;
/**
 * A dictionary of [[StyleSet]]s.
 */
export interface Styles {
    [styleSetName: string]: StyleSet;
}

/**
 * A reference to a style definition.
 *
 * Use as value `attrs` to reference value from `definitions`.
 *
 * Example of usage:
 * ```json
 * {
 *   "definitions": {
 *     "roadColor": { "type": "color", "value": "#f00" }
 *   },
 *   "styles": { "tilezen": [
 *      {
 *       "when": "kind == 'road",
 *       "technique": "solid-line",
 *       "attr": {
 *         "lineColor": { "$ref": "roadColor" }
 *       }
 *     }
 *   ] }
 * }
 * ```
 */

/**
 * The attributes of a technique.
 */
export type Attr<T> = { [P in keyof T]?: T[P] | JsonExpr };

/**
 * Render feature as set of squares rendered in screen space.
 *
 * @see [[PointTechniqueParams]].
 */
export interface SquaresStyle extends BaseStyle {
    technique: "squares";
    attr?: Attr<PointTechniqueParams>;
}

/**
 * Render feature as set of circles rendered in screen space.
 *
 * @see [[PointTechniqueParams]].
 */
export interface CirclesStyle extends BaseStyle {
    technique: "circles";
    attr?: Attr<PointTechniqueParams>;
}

/**
 * Render feature as POIs (icons and text) rendered in screen space.
 *
 * @see [[MarkerTechniqueParams]].
 */
export interface PoiStyle extends BaseStyle {
    technique: "labeled-icon";
    attr?: Attr<MarkerTechniqueParams>;
}

/**
 * Render feature as line markers, which is a recurring marker along a line (usually road).
 *
 * @see [[MarkerTechniqueParams]].
 */
export interface LineMarkerStyle extends BaseStyle {
    technique: "line-marker";
    attr?: Attr<MarkerTechniqueParams>;
}

/**
 * Render feature as line.
 */
export interface LineStyle extends BaseStyle {
    technique: "line";
    secondaryRenderOrder?: number;
    secondaryCategory?: string;
    attr?: Attr<MarkerTechniqueParams>;
}

/**
 * Render feature as segments.
 */
export interface SegmentsStyle extends BaseStyle {
    technique: "segments";
    attr?: Attr<SegmentsTechniqueParams>;
}

export interface SolidLineStyle extends BaseStyle {
    technique: "solid-line" | "dashed-line";
    secondaryRenderOrder?: number;
    secondaryCategory?: string;
    attr?: Attr<SolidLineTechniqueParams>;
}

export interface LabelRejectionLineStyle extends BaseStyle {
    technique: "label-rejection-line";
    attr?: Attr<BaseTechniqueParams>;
}

export interface FillStyle extends BaseStyle {
    technique: "fill";
    attr?: Attr<FillTechniqueParams>;
}

export interface StandardStyle extends BaseStyle {
    technique: "standard";
    attr?: Attr<StandardTechniqueParams>;
}

export interface TerrainStyle extends BaseStyle {
    technique: "terrain";
    attr?: Attr<TerrainTechniqueParams>;
}

export interface BasicExtrudedLineStyle extends BaseStyle {
    technique: "extruded-line";
    shading?: "basic";
    attr?: Attr<BasicExtrudedLineTechniqueParams>;
}

export interface StandardExtrudedLineStyle extends BaseStyle {
    technique: "extruded-line";
    shading: "standard";
    attr?: Attr<StandardExtrudedLineTechniqueParams>;
}

/**
 * Style used to draw a geometry as an extruded polygon, for example extruded buildings.
 */
export interface ExtrudedPolygonStyle extends BaseStyle {
    technique: "extruded-polygon";
    attr?: Attr<ExtrudedPolygonTechniqueParams>;
}

export interface ShaderStyle extends BaseStyle {
    technique: "shader";
    attr?: Attr<ShaderTechniqueParams>;
}

export interface TextTechniqueStyle extends BaseStyle {
    technique: "text";
    attr?: Attr<TextTechniqueParams>;
}

export interface NoneStyle extends BaseStyle {
    technique: "none";
    attr?: {
        [name: string]: any;
    };
}

/**
 * Possible lights used for light the map.
 */
export type Light = AmbientLight | DirectionalLight;

export interface BaseLight {
    type: string;
    name: string;
}

/**
 * Light type: ambient.
 * @defaultSnippets [
 *     {
 *         "label": "New Ambient Light",
 *         "description": "Adds a new Ambient Light",
 *         "body": {
 *             "type": "ambient",
 *             "name": "${1:ambient light}",
 *             "color": "#${2:fff}",
 *             "intensity": "^${3:1}"
 *         }
 *     }
 * ]
 */
export interface AmbientLight extends BaseLight {
    type: "ambient";
    /**
     * @format color-hex
     */
    color: string;
    intensity?: number;
}

/**
 * Light type: directional.
 * @defaultSnippets [
 *     {
 *         "label": "New Directional Light",
 *         "description": "Adds a new Directional Light",
 *         "body": {
 *             "type": "directional",
 *             "name": "${1:directional-light$:1}",
 *             "color": "#${2:fff}",
 *             "intensity": "^${3:1}",
 *             "direction": {
 *                 "x": "^${4:1}",
 *                 "y": "^${5:0}",
 *                 "z": "^${6:0}"
 *             }
 *         }
 *     }
 * ]
 */
export interface DirectionalLight extends BaseLight {
    type: "directional";
    /**
     * @format color-hex
     */
    color: string;
    intensity: number;
    direction: Vector3Like;
    castShadow?: boolean;
}

/**
 * Various text styles used with labels and texts.
 */
export interface TextStyleDefinition {
    name?: string;
    fontCatalogName?: string;

    fontName?: string;
    size?: number;
    backgroundSize?: number;
    fontStyle?: "Regular" | "Bold" | "Italic" | "BoldItalic";
    fontVariant?: "Regular" | "AllCaps" | "SmallCaps";
    rotation?: number;
    /**
     * @format color-hex
     */
    color?: string;
    /**
     * @format color-hex
     */
    backgroundColor?: string;
    opacity?: number;
    backgroundOpacity?: number;

    tracking?: number;
    leading?: number;
    maxLines?: number;
    lineWidth?: number;
    canvasRotation?: number;
    lineRotation?: number;
    wrappingMode?: "None" | "Character" | "Word";
    hAlignment?: "Left" | "Center" | "Right";
    vAlignment?: "Above" | "Center" | "Below";
}

/**
 * Interface that defines a procedural gradient sky.
 */
export interface GradientSky {
    /** Sky type. */
    type: "gradient";
    /**
     * Color of the upper part of the gradient.
     * @format color-hex
     */
    topColor: string;
    /**
     * Color of bottom part of the gradient.
     * @format color-hex
     */
    bottomColor: string;
    /**
     * Color of the ground plane.
     * @format color-hex
     */
    groundColor: string;
    /** Texture's gradient power. */
    monomialPower?: number;
}

/**
 * Interface that defines a cubemap sky.
 */
export interface CubemapSky {
    /** Sky type. */
    type: "cubemap";
    /** Positive X cube map face. */
    positiveX: string;
    /** Negative X cube map face. */
    negativeX: string;
    /** Positive Y cube map face. */
    positiveY: string;
    /** Negative Y cube map face. */
    negativeY: string;
    /** Positive Z cube map face. */
    positiveZ: string;
    /** Negative Z cube map face. */
    negativeZ: string;
}

/**
 * Interface that defines the options to configure the sky.
 */
export type Sky = GradientSky | CubemapSky;

/**
 * Interface that defines the options to configure fog.
 */
export interface Fog {
    /** Fog's color. */
    color: string;
    /** Distance ratio to far plane at which the linear fog begins. */
    startRatio: number;
}

/**
 * Define an image (e.g. icon).
 */
export interface ImageDefinition {
    /** Url to load content from. */
    url: string;
    /** `true` to start loading at init tile, `false` to lazily wait until required. */
    preload: boolean;
    /** Url of JSON file containing the texture atlas */
    atlas?: string;
}

export interface ImageDefinitions {
    /** Name of Image. */
    [name: string]: ImageDefinition;
}

/**
 * Can be used to create a texture atlas.
 */
export interface ImageTexture {
    /** Name of ImageTexture. Used to reference texture in the styles. */
    name: string;
    /** Name of ImageDefinition to use. */
    image: string;
    /** Origin of image, defaults to "topleft" */
    origin?: string;
    /** Specify sub-region: Defaults to 0. */
    xOffset?: number;
    /** Specify sub-region: Defaults to 0. */
    yOffset?: number;
    /** Specify sub-region:  Defaults to 0, meaning width is taken from loaded image. */
    width?: number;
    /** Specify sub-region:  Defaults to 0, meaning height is taken from loaded image. */
    height?: number;
    /** Defaults to false. */
    flipH?: boolean;
    /** Defaults to false. */
    flipV?: boolean;
    /** Defaults to 1. */
    opacity?: number;
}

/**
 * Definition for a [[PoiTable]] reference as part of the [[Theme]] object.
 */
export interface PoiTableRef {
    /** Required name of the [[PoiTable]] for later reference. */
    name: string;
    /**
     * Required URL from where to load [[PoiTable]].
     *
     * Should refer to JSON that is matched [[PoiTableDef]] interface.
     */
    url: string;
    /**
     * If set to `true`, the list of values in the field "altNames" will be used as names for this
     * POI.
     */
    useAltNamesForKey: boolean;
}

/**
 * Interface for the JSON description of the [[PoiTable]]. It is being implemented in [[PoiTable]].
 */
export interface PoiTableDef {
    /** Name of the `PoiTable`. Must be unique. */
    name?: string;
    /**
     * Stores the list of [[PoiTableEntry]]s.
     */
    poiList?: PoiTableEntryDef[];
}

/**
 * Interface for the JSON description of the [[PoiTableEntry]]. The interface is being implemented
 * as [[PoiTableEntry]].
 */
export interface PoiTableEntryDef {
    /** Default name of the POI as the key for looking it up. */
    name?: string;
    /** Alternative names of the POI. */
    altNames?: string[];
    /** Visibility of the POI. If `false`, the POI will not be rendered. */
    visible?: boolean;
    /** Name of the icon, defined in the the texture atlases. */
    iconName?: string;
    /** Stacking mode of the POI. For future use. */
    stackMode?: string;
    /**
     * Priority of the POI to select the visible set in case there are more POIs than can be
     * handled.
     */
    priority?: number;
    /** Minimum zoom level to render the icon on. */
    iconMinLevel?: number;
    /** Maximum zoom level to render the icon on. */
    iconMaxLevel?: number;
    /** Minimum zoom level to render the text label on. */
    textMinLevel?: number;
    /** Maximum zoom level to render the text label on. */
    textMaxLevel?: number;
}

/**
 * Fonts used for all text related rendering.
 */
export interface FontCatalogConfig {
    url: string;
    name: string;
}
