/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybeInterpolatedProperty } from "./InterpolatedPropertyDefs";

/**
 * Common attributes or all [[Technique]]s.
 */
export interface BaseTechniqueParams {
    /**
     * The name used to identify materials created from this technique.
     */
    id?: string;

    /**
     * The render order of the objects created using this technique.
     *
     * If not specified in style file, [[StyleSetEvaluator]] will assign monotonicaly increasing
     * values according to style position in file.
     */
    renderOrder: number;

    /**
     * Property that is used to hold the z-order delta in [renderOrderBiasRange].
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
     * Optional. If `true`, no IDs will be saved for the geometry this technique creates.
     */
    transient?: boolean;

    /**
     * Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the object start
     * fading out (opacity decreases).
     */
    fadeNear?: number;

    /**
     * Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the object has zero
     * opacity and stops fading out. A value of <= 0.0 disables fading.
     */
    fadeFar?: number;
}

/**
 * Standard technique paraneters.
 */
export interface BaseStandardTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color?: string;
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     */
    wireframe?: boolean;
    /**
     * If `vertexColors` is `true`, every vertex has color information, which is interpolated
     * between vertices.
     */
    vertexColors?: boolean;
    /**
     * How rough the material appears. `0.0` means a smooth mirror reflection. `1.0` means fully
     * diffuse. Default is `0.5`.
     */
    roughness?: number;
    /**
     * How much the material is like a metal. Nonmetallic materials such as wood or stone use `0.0`,
     * metallic ones use `1.0`, with nothing (usually) in between. Default is `0.5`. A value between
     * `0.0` and `1.0` can be used for a rusty metal look. If `metalnessMap` is also provided, both
     * values are multiplied.
     */
    metalness?: number;
    /**
     * The material will not be rendered if the opacity is lower than this value.
     */
    alphaTest?: number;
    /**
     * Skip rendering clobbered pixels.
     */
    depthTest?: boolean;
    /**
     * Set to 'true' if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: number;
    /**
     * Emissive (light) color of the material, essentially a solid color unaffected by other
     * lighting. Default is black.
     */
    emissive?: string;
    /**
     * Intensity of the emissive light. Modulates the emissive color. Default is `1`.
     */
    emissiveIntensity?: number;
    /**
     * The index of refraction (IOR) of air (approximately 1) divided by the index of refraction of
     * the material. It is used with environment mapping modes `THREE.CubeRefractionMapping` and
     * `THREE.EquirectangularRefractionMapping`. The refraction ratio should not exceed `1`. Default
     *  is `0.98`.
     */
    refractionRatio?: number;

    /**
     * Control rendering of depth prepass before the actual geometry.
     *
     * Depth prepass is a method to render translucent meshes, hence only the visible front faces of
     * a mesh are actually rendered, removing artifacts caused by blending with internal faces of
     * the mesh. This method is used for drawing translucent buildings over map background.
     *
     * By default, each [[DataSource]] determines how/if enable the depth pre-pass. A value of
     * `false` forcefully disables depth prepass.
     */
    enableDepthPrePass?: boolean;
}

/**
 * Possible parameters of [[PointTechnique]].
 */
export interface PointTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of a point in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color?: string;
    /**
     * URL of a texture image to be loaded.
     */
    texture?: string;
    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: number;
    /**
     * Size of point in pixels.
     */
    size?: number;
    /**
     * Whether to enable picking on these points.
     */
    enablePicking?: boolean;
}

/**
 * Define the stacking option. Enum values for theme file are in "kebab-case".
 */
export enum PoiStackMode {
    /**
     * Show in a stack.
     */
    Show = "show-in-stack",
    /**
     * Do not show in a stack.
     */
    Hide = "hide-in-stack",
    /**
     * Show category parent in the stack.
     */
    ShowParent = "show-parent"
}

/**
 * Technique that describes icons with labels. Used in [[PoiTechnique]] and [[LineMarkerTechnique]]
 * (for road shields).
 */
export interface MarkerTechniqueParams extends BaseTechniqueParams {
    /**
     * Priority of marker, defaults to `0`. Markers with highest priority get placed first.
     */
    priority?: number;
    // Image part of technique:
    /**
     * Name of [[ImageTexture]] definition to use.
     */
    imageTexture?: string;
    /**
     * Field name to extract imageTexture content from.
     */
    imageTextureField?: string;
    /**
     * Prefix for `imageTexture` if `imageTextureField` is used.
     */
    imageTexturePrefix?: string;
    /**
     * Postfix for `imageTexture` if `imageTextureField` is used.
     */
    imageTexturePostfix?: string;
    /**
     * Scaling factor of icon.
     */
    iconScale?: number;
    /**
     * Horizontal offset (to the right) in screen pixels.
     */
    iconXOffset?: number;
    /**
     * Vertical offset (up) in screen pixels.
     */
    iconYOffset?: number;
    /**
     * Vertical height in pixels, controls vertical scaling. Overrides `iconScale`.
     */
    screenHeight?: number;
    /**
     * Horizontal height in pixels, controls horizontal scaling. Overrides `iconScale`.
     */
    screenWidth?: number;
    /**
     * Scaling factor of icon. Defaults to 0.5, reducing the size ot 50% in the distance.
     */
    distanceScale?: number;
    // Text part of technique:
    /**
     * Field name of object containing the text to be rendered.
     */
    label?: string;
    /**
     * If `true`, icon will appear even if the text part is blocked by other labels. Defaults to
     * `false`.
     */
    textIsOptional?: boolean;
    /**
     * If true, the text will appear even if the icon cannot be rendered because of missing icon
     * graphics. Defaults to `true`.
     */
    iconIsOptional?: boolean;
    /**
     * If `false`, text will not be rendered during animations. Defaults to `true`.
     */
    renderTextDuringMovements?: boolean;
    /**
     * If `false`, text may overlap markers.
     * @default `false`
     */
    textMayOverlap?: boolean;
    /**
     * If `false`, text will not reserve screen space, other markers will be able to overlap.
     * @default `true`
     */
    textReserveSpace?: boolean;
    /**
     * If `false`, the icon may overlap text and other icons of lower priority. If not defined, the
     * property value from `textMayOverlap` will be used.
     * @default `false`
     */
    iconMayOverlap?: boolean;
    /**
     * If `false`, icon will not reserve screen space, other markers will be able to overlap. If not
     * defined, the property value from `iconReserveSpace` will be used.
     * @default `true`
     */
    iconReserveSpace?: boolean;
    /**
     * If `true`, the label will always be rendered on top. If overlapping with other labels with
     * this flag set, the render order is undefined.
     * @default `false`
     */
    alwaysOnTop?: boolean;
    /**
     * All caps style modifier.
     */
    allCaps?: boolean;
    /**
     * Small caps style modifier.
     */
    smallCaps?: boolean;
    /**
     * Bold style modifier.
     */
    bold?: boolean;
    /**
     * Oblique style modifier.
     */
    oblique?: boolean;
    /**
     * Name of the text style.
     */
    style?: string;
    /**
     * If `true`, the abbreviation (field `name:short`) of the elements is used as text.
     */
    useAbbreviation?: boolean;
    /**
     * If `true`, the iso code (field 'iso_code') of the elements is used as text.
     * The `iso_code` field contains the ISO 3166-1 2-letter country code.
     */
    useIsoCode?: boolean;
    /**
     * Text color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color?: string;
    /**
     * Text background color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`,
     * `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    backgroundColor?: string;
    /**
     * Background text alpha (opacity) value.
     */
    backgroundAlpha?: number;
    /**
     * Size of the text (pixels).
     */
    size?: number;
    /**
     * Size of the text background (pixels).
     */
    backgroundSize?: number;
    /**
     * Horizontal offset (to the right) in screen pixels.
     */
    xOffset?: number;
    /**
     * Vertical offset (up) in screen pixels.
     */
    yOffset?: number;
    /**
     * Horizontal alignment on a text line. Either `Left`, `Center` or `Right`.
     */
    hAlignment?: string;
    /**
     * Vertical alignment on a text line. Either `Above`, `Center` or `Below`.
     */
    vAlignment?: string;
    /*
     * Horizontal separation between glyphs.
     */
    tracking?: number;
    /**
     * Fading time for labels in seconds.
     */
    textFadeTime?: number;
    /**
     * Fading time for icons in seconds.
     */
    iconFadeTime?: number;
    /**
     * Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the object start
     * fading out (opacity decreases).
     */
    fadeNear?: number;
    /**
     * Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the object becomes
     * transparent. A value of <= 0.0 disables fading.
     */
    fadeFar?: number;
    /**
     * Name of the POI table which should be used for this POI.
     */
    poiTable?: string;
    /**
     * Fixed name to identify POI options in the POI table. If `poiName` has a value, this value
     * supercedes any value read from the field referenced in `poiNameField`.
     */
    poiName?: string;
    /**
     * Name of the field to evaluate to get the name of the POI options in the POI table.
     */
    poiNameField?: string;
    /**
     * Should be displayed on map or not. Defaults to `true`.
     */
    showOnMap?: boolean;
    /**
     * Specify stack mode. Defaults to `ShowInStack`.
     */
    stackMode?: PoiStackMode;
    /**
     * Minimum zoomLevel at which to display the label icon. No default.
     */
    iconMinZoomLevel?: number;
    /**
     * Maximum zoomLevel at which to display the label icon. No default.
     */
    iconMaxZoomLevel?: number;
    /**
     * Minimum zoomLevel at which to display the label text. No default.
     */
    textMinZoomLevel?: number;
    /**
     * Maximum zoomLevel at which to display the label text. No default.
     */
    textMaxZoomLevel?: number;
    /**
     * Minimal distance between markers in screen pixels.
     */
    minDistance?: number;
}

export interface LineTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color: string;
    /**
     * Set to true if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: number;
    /**
     * Width of line in pixels. WebGL implementations will normally render all lines with 1 pixel
     * width, and ignore this value.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
}

/**
 * Declares a geometry as a segment.
 */
export interface SegmentsTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of segments in a hexadecimal notation, for example: `"#e4e9ec"` or `"#fff"`.
     */
    color: string;
    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between `0.0` for fully transparent, to `1.0` for fully
     * opaque.
     */
    opacity?: number;
    /**
     * Width of a line in meters.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
}

/**
 * Declares a a geometry as a polygon.
 */
export interface PolygonalTechniqueParams {
    /**
     * Whether to use polygon offset. Default is false. This corresponds to the
     * GL_POLYGON_OFFSET_FILL WebGL feature.
     *
     * PolygonOffset is used to raise the geometry towards the geometry (for depth calculation
     * only). Default is false.
     *
     * See here: https://sites.google.com/site/threejstuts/home/polygon_offset
     *
     * To activate polygonOffset these values have to be set to pull the line "forwards":
     *
     * transparent: true
     *
     * polygonOffset: true
     *
     * polygonOffsetFactor : -1.0, (as an example, see link above)
     *
     * polygonOffsetUnits: -1 (as an example, see link above)
     */
    polygonOffset?: boolean;

    /**
     * Sets the polygon offset factor. Default is 0.
     */
    polygonOffsetFactor?: number;

    /**
     * Sets the polygon offset units. Default is 0.
     */
    polygonOffsetUnits?: number;

    /**
     * Sets the polygon outline color.
     */
    lineColor?: string;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges start
     * fading out.
     */
    lineFadeNear?: number;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges become
     * transparent. A value of <= 0.0 disables fading.
     */
    lineFadeFar?: number;
}

/**
 * Declares a a geometry as a basic extruded line.
 */
export interface BasicExtrudedLineTechniqueParams
    extends BaseTechniqueParams,
        PolygonalTechniqueParams {
    /**
     * A value determining the shading technique. Valid values are "Basic" and "Standard". Default
     * is "Basic".
     *
     * `"basic"`   : Simple shading, faster to render. Only simple color and opacity are effective.
     * `"standard"`: Elaborate shading, with metalness, and roughness.
     *
     * TODO: is this TechniqueParams or Style prop ?
     */
    shading?: "basic";
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color: string;
    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: number;
    /**
     * Width of line in meters for different zoom levels.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     */
    wireframe?: boolean;
    /**
     * Style of both end caps. Possible values: `"None"`, `"Circle"`. A value of undefined maps to
     * `"Circle"`.
     */
    caps?: "None" | "Circle";
}

/**
 * Declares a a geometry as a standard extruded line.
 */
export interface StandardExtrudedLineTechniqueParams
    extends BaseStandardTechniqueParams,
        PolygonalTechniqueParams {
    /**
     * A value determining the shading technique. Valid values are `"basic"` and `"standard"`.
     * Default is `"basic"`.
     *
     * `"basic"` : Simple shading, faster to render. Only simple color and opacity are effective.
     * `"standard"` : Elaborate shading, with metalness, and roughness.
     */
    shading: "standard";
    /**
     * Width of a line in meters for different zoom levels.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
    /**
     * Style of both end caps. Possible values: `"None"`, `"Circle"`. A value of undefined maps to
     * `"Circle"`.
     */
    caps?: "None" | "Circle";
}

/**
 * Declares a a geometry as a solid line.
 */
export interface SolidLineTechniqueParams extends BaseTechniqueParams, PolygonalTechniqueParams {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "solid-line";
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color: string;
    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between `0.0` for fully transparent, to `1.0` for fully
     * opaque.
     */
    opacity?: number;
    // TODO: Make pixel units default.
    /**
     * Units in which different size properties are specified. Either `Meter` (default) or `Pixel`.
     */
    metricUnit?: string;
    /**
     * Width of a line in `metricUnit`s for different zoom levels.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
    /**
     * Clip the line outside the tile if `true`.
     */
    clipping?: boolean;
    /**
     * Color of secondary line geometry in hexadecimal or CSS-style notation, for example:
     * `"#e4e9ec"`, `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    secondaryColor?: string;
    /**
     * Width of secondary line geometry in `metricUnit`s for different zoom levels.
     */
    secondaryWidth?: number;
    /**
     * The render order of the secondary line geometry object created using this technique.
     */
    secondaryRenderOrder?: number;
}

/**
 * Declares a a geometry as a dashed line.
 */
export interface DashedLineTechniqueParams extends BaseTechniqueParams, PolygonalTechniqueParams {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "dashed-line";
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color: string;
    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between `0.0` for fully transparent, to `1.0` for fully
     * opaque.
     */
    opacity?: number;
    // TODO: Make pixel units default.
    /**
     * Units in which different size properties are specified. Either `Meter` (default) or `Pixel`.
     */
    metricUnit?: "Meter" | "Pixel";
    /**
     * Width of a line in `metricUnit`s for different zoom levels.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
    /**
     * Length of a line in meters for different zoom levels.
     */
    dashSize?: MaybeInterpolatedProperty<number>;
    /**
     * Size of a gap between lines in meters for different zoom levels.
     */
    gapSize?: MaybeInterpolatedProperty<number>;
    /**
     * Clip the line outside the tile if `true`.
     */
    clipping?: boolean;
}

/**
 * Technique used to draw filled polygons.
 */
export interface FillTechniqueParams extends BaseTechniqueParams, PolygonalTechniqueParams {
    /**
     * Fill color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color?: string;
    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: boolean;
    /**
     * For transparent lines, set a value between `0.0` for fully transparent, to `1.0` for fully
     * opaque.
     */
    opacity?: number;
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     */
    wireframe?: boolean;
    /**
     * Width of the lines. Currently limited to the [0, 1] range.
     */
    lineWidth?: number;
}

/**
 * Technique used to draw a geometry as an extruded polygon, for example extruded buildings.
 */
export interface ExtrudedPolygonTechniqueParams extends BaseStandardTechniqueParams {
    /**
     * Derived property that has first priority in use for rendering.
     * In case property is absent class will try to get color from the [[MapEnv]].
     */
    color?: string;
    /**
     * Renders the footprint lines if set to 'true'.
     */
    footprint?: boolean;
    /**
     * Set to a negative value to remove all the vertical lines, and to a value between 0.0 and 1.0
     * to modulate the amount of vertical lines rendered.
     */
    maxSlope?: number;
    /**
     * Width of the lines. Currently limited to the [0, 1] range.
     */
    lineWidth: MaybeInterpolatedProperty<number>;
    /**
     * Fill color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    lineColor?: string;
    /**
     * Mix value between the lineColor(0.0) and the geometry's vertex colors(1.0).
     */
    lineColorMix?: number;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges start
     * fading out.
     */
    lineFadeNear?: number;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges become
     * transparent. A value of <= 0.0 disables fading.
     */
    lineFadeFar?: number;

    /**
     * In some data sources, for example Tilezen, building extrusion information might be missing.
     * This attribute allows to define a default height of an extruded polygon in the theme.
     */
    defaultHeight?: number;

    /**
     * Default color used if feature doesn't provide color attribute
     * and [[MapEnv]] did not return it too.
     */
    defaultColor?: string;

    /**
     * If `true`, the height of the extruded buildings will not be modified by the mercator
     * projection distortion that happens around the poles.
     * @default `false`
     */
    constantHeight?: boolean;

    /**
     * If `false`, wall geometry will not be added along the tile boundaries.
     * @default `true`
     */
    boundaryWalls?: boolean;

    /**
     * Animate the extrusion of the buildings if set to `true`.
     */
    animateExtrusion?: boolean;

    /**
     * Duration of the building's extrusion in milliseconds
     */
    animateExtrusionDuration?: number;
}

export interface ShaderTechniqueMaterialParameters {
    [name: string]: any;
}

/**
 * Special technique for user-defined shaders. See
 * https://threejs.org/docs/#api/harp-materials/ShaderMaterial for details.
 */
export interface ShaderTechniqueParams extends BaseTechniqueParams {
    /**
     * Parameters for shader. See `THREE.ShaderMaterialParameters`.
     */
    params: ShaderTechniqueMaterialParameters;

    /**
     * Type of primitive for the shader technique. Valid values are "point" | "line" | "segments" |
     * "mesh"
     */
    primitive: "point" | "line" | "segments" | "mesh";
}

/**
 * Technique used to render a geometry with a texture.
 * When using this technique, the datasource will produce texture coordinates in
 * local tile space (i.e. [0,0] at south-west and [1,1] at north-east tile corner )
 */
export interface StandardTexturedTechniqueParams extends BaseStandardTechniqueParams {
    /**
     * Render texture if available.
     *
     * Defaults to true if `map` is available for mesh.
     *
     * May be used to forcefully disable textures in theme even if textures are available.
     */
    renderTexture?: boolean;

    /**
     * URL or texture buffer that should be used as color map
     */
    map?: string | TextureBuffer;
    mapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as normal map
     */
    normalMap?: string | TextureBuffer;
    normalMapType?: number;
    normalMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as displacement map
     */
    displacementMap?: string | TextureBuffer;
    displacementMapProperties?: TextureProperties;
}

/**
 * Render geometry as a text.
 */
export interface TextTechniqueParams extends BaseTechniqueParams {
    /**
     * Field name of object containing the text to be rendered.
     */
    label?: string;
    /**
     * If `true`, the abbreviation (field `name:short`) of the elements is used as text.
     */
    useAbbreviation?: boolean;
    /**
     * If `true`, the iso code (field 'iso_code') of the elements is used as text.
     * The `iso_code` field contains the ISO 3166-1 2-letter country code.
     */
    useIsoCode?: boolean;
    /**
     * For transparent text, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: number;
    /**
     * Text color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color?: string;
    /**
     * Text background color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`,
     * `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    backgroundColor?: string;
    /**
     * Background text alpha (opacity) value.
     */
    backgroundAlpha?: number;
    /**
     * Priority of text, defaults to `0`. Elements with highest priority get placed first.
     */
    priority?: number;
    /**
     * Size of the text (pixels).
     */
    size?: MaybeInterpolatedProperty<number>;
    /**
     * Size of the text background (pixels).
     */
    backgroundSize?: MaybeInterpolatedProperty<number>;
    /**
     * Scaling factor of the text. Defaults to 0.5, reducing the size ot 50% in the distance.
     */
    distanceScale?: number;
    /**
     * Minimal zoom level. If the current zoom level is smaller, the technique will not be used.
     */
    minZoomLevel?: number;
    /**
     * Maximum zoom level. If the current zoom level is larger, the technique will not be used.
     */
    maxZoomLevel?: number;
    /**
     * Horizontal offset (to the right) in screen pixels.
     */
    xOffset?: number;
    /**
     * Vertical offset (up) in screen pixels.
     */
    yOffset?: number;
    /**
     * Horizontal alignment on a text line. Either `Left`, `Center` or `Right`.
     */
    hAlignment?: "Left" | "Center" | "Right";
    /**
     * Vertical alignment on a text line. Either `Above`, `Center` or `Below`.
     */
    vAlignment?: "Above" | "Center" | "Below";
    /**
     * Horizontal separation between glyphs.
     */
    tracking?: number;
    /**
     * Name of the text style.
     */
    style?: string;
    /**
     * If `true`, icon is allowed to overlap other labels or icons of lower priority.
     * @default `false`
     */
    mayOverlap?: boolean;
    /**
     * If `true`, element will reserve screen space, other markers of lower priority will not be
     * able to overlap.
     * @default `true`
     */
    reserveSpace?: boolean;
    /**
     * All caps style modifier.
     */
    allCaps?: boolean;
    /**
     * Small caps style modifier.
     */
    smallCaps?: boolean;
    /**
     * Bold style modifier.
     */
    bold?: boolean;
    /**
     * Oblique style modifier.
     */
    oblique?: boolean;
    /**
     * Fading time for labels in seconds.
     */
    textFadeTime?: number;
    /**
     * Clip the line outside the tile if `true`.
     */
    clipping?: boolean;
    /**
     * The name of the property containing the text.
     */
    textLabel?: string;
}

/**
 * Buffer holding a texture.
 */
export interface TextureBuffer {
    /**
     * Buffer containing the (compressed) image or the raw texture data.
     */
    buffer: ArrayBuffer;

    /**
     * Mime type of the image or 'image/raw' in case of raw texture data.
     */
    type: string;

    /**
     * Properties for creating a three.js DataTexture
     * (https://threejs.org/docs/#api/en/textures/DataTexture).
     */
    dataTextureProperties?: DataTextureProperties;
}

/**
 * Type guard to check if an object is an instance of `TextureBuffer`.
 */
export function isTextureBuffer(object: any): object is TextureBuffer {
    return object && object.buffer && typeof object.type === "string";
}

/**
 * Properties of a DataTexture (https://threejs.org/docs/#api/en/textures/DataTexture).
 */
export interface DataTextureProperties {
    width: number;
    height: number;

    format?: PixelFormat;
    type?: TextureDataType;
}

/**
 * Properties of a Texture (https://threejs.org/docs/#api/en/textures/Texture).
 */
export interface TextureProperties {
    /**
     * Texture horizontal wrapping mode.
     */
    wrapS?: WrappingMode;

    /**
     * Texture vertical wrapping mode.
     */
    wrapT?: WrappingMode;

    /**
     * Flip texture vertically.
     */
    flipY?: boolean;
}

export type PixelFormat =
    | "Alpha"
    | "RGB"
    | "RGBA"
    | "Luminance"
    | "LuminanceAlpha"
    | "RGBE"
    | "Depth"
    | "DepthStencil";
// | "Red" FIXME: Red is missing from DefinitelyTyped (HARP-4881)

export type TextureDataType =
    | "UnsignedByte"
    | "Byte"
    | "Short"
    | "UnsignedShort"
    | "Int"
    | "UnsignedInt"
    | "Float"
    | "HalfFloat";

/**
 * Available texture wrapping modes.
 */
export type WrappingMode = "clamp" | "repeat" | "mirror";
