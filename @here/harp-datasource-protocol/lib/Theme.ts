/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "@here/harp-geoutils/lib/math/Vector3Like";
import {
    BasicExtrudedLineTechniqueParams,
    DashedLineTechniqueParams,
    ExtrudedPolygonTechniqueParams,
    FillTechniqueParams,
    GeometryKind,
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
     * Actual URL the theme has been loaded from.
     */
    url?: string;

    /**
     * Color to be used as a clear background - no map objects.
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
}

/**
 * A dictionary of [[Styles]]s.
 */
export interface Styles {
    [styleSetName: string]: StyleSet;
}

/**
 * An array of [[Style]]s that are used together to define how a [[DataSource]] should be rendered.
 * `StyleSet`s are applied to sources providing vector tiles via their method `setStyleSet`. This
 * is also handle internally when a whole theme is passed to a [[MapView]] via `mapview.theme`.
 */
export type StyleSet = Style[];

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
     * Compile-time condition.
     */
    when: string;

    /**
     * Technique name. Must be one of `"line"`, `"fill"`, `"solid-line"`, `"dashed-line"`,
     * `"extruded-line"`, `"extruded-polygon"`, `"text"`, or `"none"`.
     */
    technique?: string;

    /**
     * Specify `renderOrder` of object.
     */
    renderOrder?: number;

    /**
     * Property that is used to hold the z-order delta.
     */
    renderOrderBiasProperty?: string;

    /**
     * Minimum and maximum z-order delta values.
     */
    renderOrderBiasRange?: [number, number];

    /**
     * Z-order group. For example: used to set same render order for all roads
     * to be able to use the z-order delta when drawing tunnels or bridges over or under the roads.
     */
    renderOrderBiasGroup?: string;

    /**
     * Optional. If `true`, no more matching styles will be evaluated.
     */
    final?: boolean;

    /**
     * Optional. If `true`, no IDs will be saved for the geometry this style creates. Default is
     * `false`.
     */
    transient?: boolean;

    /**
     * Array of substyles.
     */
    styles?: StyleSet;

    /**
     * Optional: If `true`, the objects with matching `when` statement will be printed to the
     * console.
     */
    debug?: boolean;

    // TODO: Make pixel units default.
    /**
     * Units in which different size properties are specified. Either `Meter` (default) or `Pixel`.
     */
    metricUnit?: "Meter" | "Pixel";

    /**
     * XYZ defines the property to display as text label of a feature in the styles.
     */
    labelProperty?: string;

    /**
     * Specified kind(s) of geometry. One kind is set as default in the technique, and can be
     * overridden in the style. An array of kinds can also be specified.
     */
    kind?: GeometryKind | GeometryKind[];
}

export type Style =
    | SquaresStyle
    | CirclesStyle
    | PoiStyle
    | LineMarkerStyle
    | LineStyle
    | SegmentsStyle
    | SolidLineStyle
    | DashedLineStyle
    | FillStyle
    | StandardStyle
    | BasicExtrudedLineStyle
    | StandardExtrudedLineStyle
    | ExtrudedPolygonStyle
    | ShaderStyle
    | TextTechniqueStyle
    | NoneStyle;

/**
 * Render feature as set of squares rendered in screen space.
 *
 * @see [[PointTechniqueParams]].
 */
export interface SquaresStyle extends BaseStyle {
    technique: "squares";
    attr?: Partial<PointTechniqueParams>;
}

/**
 * Render feature as set of circles rendered in screen space.
 *
 * @see [[PointTechniqueParams]].
 */
export interface CirclesStyle extends BaseStyle {
    technique: "circles";
    attr?: Partial<PointTechniqueParams>;
}

/**
 * Render feature as POIs (icons and text) rendered in screen space.
 *
 * @see [[MarkerTechniqueParams]].
 */
export interface PoiStyle extends BaseStyle {
    technique: "labeled-icon";
    attr?: Partial<MarkerTechniqueParams>;
}

/**
 * Render feature as line markers, which is a recurring marker along a line (usually road).
 *
 * @see [[MarkerTechniqueParams]].
 */
export interface LineMarkerStyle extends BaseStyle {
    technique: "line-marker";
    attr?: Partial<MarkerTechniqueParams>;
}

/**
 * Render feature as line.
 */
export interface LineStyle extends BaseStyle {
    technique: "line";
    secondaryRenderOrder?: number;
    attr?: Partial<MarkerTechniqueParams>;
}

/**
 * Render feature as segments.
 */
export interface SegmentsStyle extends BaseStyle {
    technique: "segments";
    attr?: Partial<SegmentsTechniqueParams>;
}

export interface SolidLineStyle extends BaseStyle {
    technique: "solid-line";
    secondaryRenderOrder?: number;
    attr?: Partial<SolidLineTechniqueParams>;
}

export interface DashedLineStyle extends BaseStyle {
    technique: "dashed-line";
    attr?: Partial<DashedLineTechniqueParams>;
}

export interface FillStyle extends BaseStyle {
    technique: "fill";
    attr?: Partial<FillTechniqueParams>;
}

export interface StandardStyle extends BaseStyle {
    technique: "standard";
    attr?: Partial<StandardTechniqueParams>;
}

export interface TerrainStyle extends BaseStyle {
    technique: "terrain";
    attr?: Partial<TerrainTechniqueParams>;
}

export interface BasicExtrudedLineStyle extends BaseStyle {
    technique: "extruded-line";
    shading?: "basic";
    attr?: Partial<BasicExtrudedLineTechniqueParams>;
}

export interface StandardExtrudedLineStyle extends BaseStyle {
    technique: "extruded-line";
    shading: "standard";
    attr?: Partial<StandardExtrudedLineTechniqueParams>;
}

/**
 * Style used to draw a geometry as an extruded polygon, for example extruded buildings.
 */
export interface ExtrudedPolygonStyle extends BaseStyle {
    technique: "extruded-polygon";
    attr?: Partial<ExtrudedPolygonTechniqueParams>;
}

export interface ShaderStyle extends BaseStyle {
    technique: "shader";
    attr?: Partial<ShaderTechniqueParams>;
}

export interface TextTechniqueStyle extends BaseStyle {
    technique: "text";
    attr?: Partial<TextTechniqueParams>;
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
 */
export interface AmbientLight extends BaseLight {
    type: "ambient";
    color: string;
    intensity?: number;
}

/**
 * Light type: directional.
 */
export interface DirectionalLight extends BaseLight {
    type: "directional";
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
    color?: string;
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
 * Interface that defines the options to configure the sky
 *
 * @param type Represents the type of sky. At the moment only the sky as a texture is available
 * @param colorTop Defines the color of the upper part of the gradient.
 * @param colorBottom Defines the color of bottom part of the gradient that touches the ground
 * @param groundColor Defines the color of the first pixel of the gradient from the bottom.
 * @param monomialPower Defines the texture gradient power.
 */
export interface Sky {
    type: string;
    colorTop: string;
    colorBottom: string;
    groundColor: string;
    monomialPower?: number;
}

/**
 * Interface that defines the options to configure the sky
 *
 * @param enabled Whether the fog is enabled.
 * @param startRatio Distance ratio to far plane at which the linear fogging begins.
 */
export interface Fog {
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
