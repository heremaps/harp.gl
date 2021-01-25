/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Vector3Like } from "@here/harp-geoutils/lib/math/Vector3Like";

import { JsonExpr, JsonValue } from "./Expr";
import { InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import {
    BaseTechniqueParams,
    BasicExtrudedLineTechniqueParams,
    ExtrudedPolygonTechniqueParams,
    FillTechniqueParams,
    LineTechniqueParams,
    MarkerTechniqueParams,
    Pickability,
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
     * @remarks
     * If used, base themes are loaded first, and then all the properties from inherited theme
     * overwrite these defined in base theme.
     */

    extends?: string | Theme | Array<string | Theme>;

    //
    // TODO: We support also [[FlatTheme]], but it's not exposed here since ts-json-schema-generator
    // fails with too complex typing.
    // See: https://github.com/vega/ts-json-schema-generator/issues/192
    // Typing should look like this:
    // extends?: string | Theme | FlatTheme| Array<string | Theme | FlatTheme>;
    //

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
     * Alpha to be used as a clear background - no map objects.
     * @format 0-1
     */
    clearAlpha?: number;

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
     * created using this {@link Theme}.
     *
     * @remarks
     * The attribute `styleSet` and `category` of the [[Technique]]
     * are used together with [[Theme.priorities]] to sort
     * the objects created using this {@link Theme}, for example:
     *
     * @example
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
     * @remarks
     * The name of the `category` attribute of the screen-space
     * technique (e.g. `"text"`) must match on the strings
     * defined by this [[Theme.labelPriorities]], for example:
     *
     * @example
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
     * The group of this `StylePriority`.
     */
    group: string;

    /**
     * The category of this `StylePriority`.
     */
    category?: string;
}

/**
 * A type representing HARP themes with all the styleset declarations
 * grouped in one `Array`.
 *
 * @internal This type will merge with {@link Theme}.
 */
export type FlatTheme = Omit<Theme, "styles"> & {
    /**
     * The style rules used to render the map.
     */
    styles?: StyleSet;
};

/**
 * Value definition commons.
 */
export interface Definition {
    /**
     * The type of the definition.
     */
    type?: "selector" | "boolean" | "number" | "string" | "color";

    /**
     * The value of the definition.
     */
    value: JsonValue | InterpolatedPropertyDefinition<JsonValue>;

    /**
     * The description of the definition.
     */
    description?: string;
}

/**
 * An set of {@link Definition}s.
 */
export interface Definitions {
    [name: string]: Definition;
}

export type JsonExprReference = ["ref", string];

/**
 * Checks if the given value is a reference to a definition.
 *
 * @param value - The value of a technique property.
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
 * An array of {@link Style}s that are used together to define how a
 * {@link @here/harp-mapview#DataSource} should be rendered.
 *
 * @remarks
 * `StyleSet`s are applied to sources providing vector tiles via their method
 * `setStyleSet`. This is also handle internally when a whole theme is passed to a
 * {@link @here/harp-mapview#MapView} via {@link @here/harp-mapview#MapViewtheme}.
 */
export type StyleSet = Style[];

/**
 * The object that defines what way an item of a {@link @here/harp-mapview#DataSource}
 * should be decoded to assemble a tile.
 *
 * @remarks
 * {@link Style} is describing which features are shown on a map and in what way they are being
 * shown.
 */
export type BaseStyle<Technique, Params> = StyleAttributes<Technique, Params> & Partial<Params>;

/**
 * The common attributes of a {@link Style}.
 */
export interface StyleAttributes<Technique, Params> {
    /**
     * Unique identifier associated with this `Style`.
     */
    id?: string;

    /**
     * Reference to the identifier of an existing `Style` to extend.
     */
    extends?: string;

    /**
     * Condition when this style rule applies.
     *
     * @remarks
     * Condition that is applied to feature properties to check if given {@link Style} this feature
     * should emit geometry of this style.
     */
    when?: string | JsonExpr;

    /**
     * The layer containing the carto features processed by this style rule.
     */
    layer?: string;

    /**
     * Optional. If `true`, no more matching styles will be evaluated.
     */
    final?: boolean;

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
     * The name of the technique to use.
     *
     * @remarks
     * Technique name. See the classes extending from this class to determine what possible
     * techniques are possible, includes `"line"`, `"fill"`, `"solid-line"`, `"extruded-line"`,
     * `"extruded-polygon"`, `"text"`, `"none"`.
     */
    technique: Technique;

    /**
     * Specify `renderOrder` of value.
     *
     * @remarks
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
     * Optional. If `true` or `Pickability.transient`, no IDs will be saved for the geometry
     * this style creates. Default is `Pickability.onlyVisible`, which allows all pickable and visible
     * objects to be picked, Pickability.all, will also allow invisible objects to be
     * picked.
     * @defaultValue `Pickability.onlyVisible`
     * The boolean option is for backwardscompatibilty, please use the Pickability.
     *
     *
     * TODO: deprecate and rename to something that makes more sense
     */
    transient?: boolean | Pickability;

    /**
     * Optional: If `true`, the objects with matching `when` statement will be printed to the
     * console.
     */
    debug?: boolean;

    attr?: Partial<Params>;
}

export type Style =
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

/**
 * A dictionary of {@link StyleSet}s.
 */
export interface Styles {
    [styleSetName: string]: StyleSet;
}

/**
 * A reference to a style definition.
 *
 * @remarks
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
 * @see {@link PointTechniqueParams}.
 */
export type SquaresStyle = BaseStyle<"squares", PointTechniqueParams>;

/**
 * Render feature as set of circles rendered in screen space.
 *
 * @see {@link PointTechniqueParams}.
 */
export type CirclesStyle = BaseStyle<"circles", PointTechniqueParams>;

/**
 * Render feature as POIs (icons and text) rendered in screen space.
 *
 * @see [[MarkerTechniqueParams]].
 */
export type PoiStyle = BaseStyle<"labeled-icon", MarkerTechniqueParams>;

/**
 * Render feature as line markers, which is a recurring marker along a line (usually road).
 *
 * @see [[MarkerTechniqueParams]].
 */
export type LineMarkerStyle = BaseStyle<"line-marker", MarkerTechniqueParams>;

/**
 * Render feature as line.
 */
export type LineStyle = BaseStyle<"line", LineTechniqueParams>;

/**
 * Render feature as segments.
 */
export type SegmentsStyle = BaseStyle<"segments", SegmentsTechniqueParams>;

export type SolidLineStyle = BaseStyle<"solid-line" | "dashed-line", SolidLineTechniqueParams>;

export type LabelRejectionLineStyle = BaseStyle<"label-rejection-line", BaseTechniqueParams>;

export type FillStyle = BaseStyle<"fill", FillTechniqueParams>;

export type StandardStyle = BaseStyle<"standard", StandardTechniqueParams>;

export type TerrainStyle = BaseStyle<"terrain", TerrainTechniqueParams>;

export type BasicExtrudedLineStyle = BaseStyle<"extruded-line", BasicExtrudedLineTechniqueParams>;

export type StandardExtrudedLineStyle = BaseStyle<
    "extruded-line",
    StandardExtrudedLineTechniqueParams
>;

/**
 * Style used to draw a geometry as an extruded polygon, for example extruded buildings.
 */
export type ExtrudedPolygonStyle = BaseStyle<"extruded-polygon", ExtrudedPolygonTechniqueParams>;

export type ShaderStyle = BaseStyle<"shader", ShaderTechniqueParams>;

export type TextTechniqueStyle = BaseStyle<"text", TextTechniqueParams>;

export interface NoneStyle
    extends BaseStyle<
        "none",
        {
            [name: string]: any;
        }
    > {
    [name: string]: any;
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
 * Ambient light
 */
export interface AmbientLight extends BaseLight {
    /**
     * The type of the light.
     */
    type: "ambient";

    /**
     * The color of this ambient light.
     */
    color: string;

    /**
     * The intensity of this ambient light.
     */
    intensity?: number;
}

/**
 * Directional light.
 */
export interface DirectionalLight extends BaseLight {
    /**
     * The type of the light.
     */
    type: "directional";

    /**
     * The color of this directional light.
     */
    color: string;

    /**
     * The intensity of this directional light.
     */
    intensity: number;

    /**
     * The direction of this directional light.
     */
    direction: Vector3Like;

    /**
     * Determine if this light casts dynamic shadows.
     *
     * @defaultValue false
     */
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
    /**
     * @format comma separated list of placement tokens, i.e. "TR, TL, C"
     * @see [[PlacementToken]]
     */
    placements?: string;
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
 * Definition for a [[PoiTable]] reference as part of the {@link Theme} object.
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
     * Stores the list of {@link PoiTableEntryDef}s.
     */
    poiList?: PoiTableEntryDef[];
}

/**
 * Interface descrining POI entries.
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
