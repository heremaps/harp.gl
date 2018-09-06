/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

import { DashedLineMaterial, SolidLineMaterial } from "@here/materials";

export type Technique =
    | PointTechnique
    | PoiTechnique
    | LineMarkerTechnique
    | LineTechnique
    | SegmentsTechnique
    | SolidLineTechnique
    | DashedLineTechnique
    | FillTechnique
    | StandardTechnique
    | StandardTexturedTechnique
    | BasicExtrudedLineTechnique
    | StandardExtrudedLineTechnique
    | ExtrudedPolygonTechnique
    | ShaderTechnique
    | LandmarkTechnique
    | TextTechnique;

export interface BaseTechnique {
    /**
     * The name used to identify materials created from this technique.
     */
    id?: string;

    /**
     * The render order of the objects created using this technique.
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
     * Optional. If `true`, no IDs will be saved for the geometry this technique creates.
     */
    transient?: boolean;

    /**
     * Automatically assigned default render order. Automatic renderOrders are in ascending order
     * from the top of the theme to the bottom. Only assigned if renderOrder is not used.
     * @hidden
     */
    _renderOrderAuto?: number;

    /**
     * Optimization: Index into table in ThemeEvaluator.
     * @hidden
     */
    _index?: number;
}

export interface BaseStandardTechnique extends BaseTechnique {
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
     * The material will not be renderered if the opacity is lower than this value.
     */
    alphaTest?: number;
    /**
     * Skip rendering clobbered pixels.
     */
    depthTest?: boolean;
    /**
     * Set to 'true' if line sould appear transparent. Rendering transparent lines may come with a
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

export interface PointTechnique extends BaseTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "point";
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
}

export interface MarkerTechnique extends BaseTechnique {
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
     * If `true`, the abbreviation (field `abbr`) of the elements is used as text.
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
     * Scaling factor of text.
     */
    scale?: number;
    /**
     * Minimal zoom level. If the current zoom level is smaller, the technique will not be used.
     */
    minZoomLevel?: number;
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
}

export interface PoiTechnique extends MarkerTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "labeled-icon";
}

export interface LineMarkerTechnique extends MarkerTechnique {
    name: "line-marker";

    /**
     * Minimal distance between markers in screen pixels.
     */
    minDistance?: number;
}

export interface LineTechnique extends BaseTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "line";
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color: string;
    /**
     * Set to true if line sould appear transparent. Rendering transparent lines may come with a
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
    lineWidth: number;
}

export interface SegmentsTechnique extends BaseTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "segments";
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
    lineWidth: number;
}

export interface PolygonalTechnique {
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
     * Sets the polygon outline width.
     */
    lineWidth?: CaseProperty<number>;

    /**
     * Sets the polygon outline color.
     */
    lineColor?: string;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the lines start fading out.
     */
    lineFadeDistance?: CaseProperty<number>;
}

export interface BasicExtrudedLineTechnique extends BaseTechnique, PolygonalTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "extruded-line";
    /**
     * A value determining the shading technique. Valid values are "Basic" and "Standard". Default
     * is "Basic".
     *
     * `"Basic"`   : Simple shading, faster to render. Only simple color and opacity are effective.
     * `"Standard"`: Elaborate shading, with metalness, and roughness.
     */
    shading?: "Basic";
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     */
    color: string;
    /**
     * Set to `true` if line sould appear transparent. Rendering transparent lines may come with a
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
    lineWidth: CaseProperty<number>;
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     */
    wireframe?: boolean;

    /**
     * Style of both end caps. Possible values: `"None"`, `"Circle"`. A value of undefined maps to
     * `"Circle"`.
     */
    caps?: string;
}

export interface StandardExtrudedLineTechnique extends BaseStandardTechnique, PolygonalTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "extruded-line";
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
    lineWidth: CaseProperty<number>;

    /**
     * Style of both end caps. Possible values: `"None"`, `"Circle"`. A value of undefined maps to
     * `"Circle"`.
     */
    caps?: string;
}

export interface SolidLineTechnique extends BaseTechnique, PolygonalTechnique {
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
    /**
     * Width of a line in meters for different zoom levels.
     */
    lineWidth: CaseProperty<number>;
    /**
     * Clip the line outside the tile if `true`.
     */
    clipping?: boolean;
}

export interface DashedLineTechnique extends BaseTechnique, PolygonalTechnique {
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
    /**
     * Width of a line in meters for different zoom levels.
     */
    lineWidth: CaseProperty<number>;
    /**
     * Length of a line in meters for different zoom levels.
     */
    dashSize?: CaseProperty<number>;
    /**
     * Size of a gap between lines in meters for different zoom levels.
     */
    gapSize?: CaseProperty<number>;
    /**
     * Clip the line outside the tile if `true`.
     */
    clipping?: boolean;
}

export interface FillTechnique extends BaseTechnique, PolygonalTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "fill";
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
}

export interface ExtrudedPolygonTechnique extends BaseStandardTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "extruded-polygon";
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
    lineWidth?: number;
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
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the lines start fading out.
     */
    lineFadeDistance?: number;
}

export interface StandardTechnique extends BaseStandardTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "standard";
}

/**
 * Special technique for user-defined shaders. See
 * https://threejs.org/docs/#api/materials/ShaderMaterial for details.
 */
export interface ShaderTechnique extends BaseTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "shader";
    /**
     * Parameters for shader. See `THREE.ShaderMaterialParameters`.
     */
    params: THREE.ShaderMaterialParameters;
    /**
     * Type of primitive for the shader technique. Valid values are "point" | "line" | "segments" |
     * "mesh"
     */
    primitive: "point" | "line" | "segments" | "mesh";
}

// deprecated, same as StandardTechnique left for backwards compatibility
export interface LandmarkTechnique extends BaseStandardTechnique {
    name: "landmark";
}

export interface StandardTexturedTechnique extends BaseStandardTechnique {
    name: "standard-textured";

    /**
     * Render texture if available.
     *
     * Defaults to true if `texture` is available for mesh.
     *
     * May be used to forcefully disable textures in theme even if textures are available.
     */
    renderTexture?: boolean;

    /**
     * Texture URL or texture buffer
     */
    texture?: string | TextureBuffer;

    /**
     * Texture horizontal wrapping mode.
     */
    wrapS?: WrappingMode;

    /**
     * Texture vertical wrapping mode.
     */
    wrapT?: WrappingMode;
}

export interface TextTechnique extends BaseTechnique {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "text";
    /**
     * Field name of object containing the text to be rendered.
     */
    label?: string;
    /**
     * If `true`, the abbreviation (field `abbr`) of the elements is used as text.
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
     * Priority of text, defaults to `0`. Elements with highest priority get placed first.
     */
    priority?: number;
    /**
     * Scaling factor of text.
     */
    scale?: number;
    /**
     * Scaling factor of the text. Defaults to 0.5, reducing the size ot 50% in the distance.
     */
    distanceScale?: number;
    /**
     * Minimal zoom level. If the current zoom level is smaller, the technique will not be used.
     */
    minZoomLevel?: number;
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
}

export function isPointTechnique(technique: Technique): technique is PointTechnique {
    return technique.name === "point";
}

export function isPoiTechnique(technique: Technique): technique is PoiTechnique {
    return technique.name === "labeled-icon";
}

export function isLineMarkerTechnique(technique: Technique): technique is LineMarkerTechnique {
    return technique.name === "line-marker";
}

export function isLineTechnique(technique: Technique): technique is LineTechnique {
    return technique.name === "line";
}

export function isSegmentsTechnique(technique: Technique): technique is SegmentsTechnique {
    return technique.name === "segments";
}

export function isExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique | StandardExtrudedLineTechnique {
    return technique.name === "extruded-line";
}

export function isFillTechnique(technique: Technique): technique is FillTechnique {
    return technique.name === "fill";
}

export function isExtrudedPolygonTechnique(
    technique: Technique
): technique is ExtrudedPolygonTechnique {
    return technique.name === "extruded-polygon";
}

export function isStandardTechnique(technique: Technique): technique is StandardTechnique {
    return technique.name === "standard";
}

export function isStandardTexturedTechnique(
    technique: Technique
): technique is StandardTexturedTechnique {
    return technique.name === "standard-textured";
}

export function isLandmarkTechnique(technique: Technique): technique is LandmarkTechnique {
    return technique.name === "landmark";
}

export function isTextTechnique(technique: Technique): technique is TextTechnique {
    return technique.name === "text";
}

export function isShaderTechnique(technique: Technique): technique is ShaderTechnique {
    return technique.name === "shader";
}

export type MaterialConstructor = new (params?: {}) => THREE.Material;

export function getMaterialConstructor(technique: Technique): MaterialConstructor | undefined {
    switch (technique.name) {
        case "extruded-line":
            return technique.shading === "standard"
                ? THREE.MeshStandardMaterial
                : THREE.MeshBasicMaterial;

        case "standard":
        case "standard-textured":
        case "landmark":
        case "extruded-polygon":
            return THREE.MeshStandardMaterial;

        case "solid-line":
            return SolidLineMaterial;

        case "dashed-line":
            return DashedLineMaterial;

        case "fill":
            return THREE.MeshBasicMaterial;

        case "point":
            return THREE.PointsMaterial;

        case "line":
        case "segments":
            return THREE.LineBasicMaterial;

        case "shader":
            return THREE.ShaderMaterial;

        case "text":
        case "labeled-icon":
        case "line-marker":
            return undefined;
    }
}

export interface ObjectConstructor {
    new (
        geometry?: THREE.Geometry | THREE.BufferGeometry,
        material?: THREE.Material
    ): THREE.Object3D;
}

/**
 * Gets the default `three.js` object constructor associated with the given technique.
 *
 * @param technique The technique.
 */
export function getObjectConstructor(technique: Technique): ObjectConstructor | undefined {
    switch (technique.name) {
        case "extruded-line":
        case "standard":
        case "standard-textured":
        case "landmark":
        case "extruded-polygon":
        case "fill":
        case "solid-line":
        case "dashed-line":
            return THREE.Mesh as ObjectConstructor;

        case "point":
            return THREE.Points as ObjectConstructor;

        case "line":
            return THREE.LineSegments as ObjectConstructor;

        case "segments":
            return THREE.LineSegments as ObjectConstructor;

        case "shader": {
            switch (technique.primitive) {
                case "line":
                    return THREE.Line as ObjectConstructor;
                case "segments":
                    return THREE.LineSegments as ObjectConstructor;
                case "point":
                    return THREE.Points as ObjectConstructor;
                case "mesh":
                    return THREE.Mesh as ObjectConstructor;
                default:
                    return undefined;
            }
        }

        case "text":
        case "labeled-icon":
        case "line-marker":
            return undefined;
    }
}

export const BASE_TECHNIQUE_NON_MATERIAL_PROPS = [
    "name",
    "id",
    "renderOrder",
    "renderOrderBiasProperty",
    "renderOrderBiasGroup",
    "renderOrderBiasRange",
    "transient"
];

export type CaseProperty<T> =
    | T
    | Array<{
          /**
           * Minimum zoom level.
           */
          minLevel?: number;

          /**
           * Mazimum zoom level.
           */
          maxLevel?: number;

          /**
           * The value of the property.
           */
          value: T;
      }>;

function isCaseProperty<T>(p: any): p is CaseProperty<T> {
    if (p instanceof Array && p.length > 0 && p[0].value !== undefined) {
        return true;
    }
    return false;
}

export function getPropertyValue<T>(
    property: CaseProperty<T> | undefined,
    level: number
): T | undefined {
    if (property instanceof Array) {
        for (const range of property) {
            if (range.minLevel !== undefined && level < range.minLevel) {
                continue;
            }
            if (range.maxLevel !== undefined && level > range.maxLevel) {
                continue;
            }
            return range.value;
        }
        return undefined;
    }
    return property;
}

export interface TextureBuffer {
    buffer: ArrayBufferLike;
    format: string;
}

export function isTextureBuffer(object: any): object is TextureBuffer {
    return object && object.buffer && typeof object.format === "string";
}

/**
 * Get the value of the specified attribute at the given zoom level. Handles [[CaseProperty]]
 * instances as well as future interpolated values.
 *
 * @param attribute Attribute of a technique.
 * @param level Display level the attribute should be rendered at.
 */
export function getAttributeValue<T>(attribute: T, level: number): T | undefined {
    if (isCaseProperty(attribute)) {
        return getPropertyValue(attribute, level);
    }
    return attribute;
}

export type WrappingMode = "clamp" | "repeat" | "mirror";

export function toWrappingMode(mode: WrappingMode): THREE.Wrapping {
    if (mode === "clamp") {
        return THREE.ClampToEdgeWrapping;
    } else if (mode === "repeat") {
        return THREE.RepeatWrapping;
    } else if (mode === "mirror") {
        return THREE.MirroredRepeatWrapping;
    }
    throw new Error(`invalid wrapping: ${mode}`);
}

/**
 * Apply generic technique parameters to material.
 *
 * Skips non-material [[Technique]] props:
 *  * [[BaseTechnique]] props,
 *  * `name` which is used as discriminator for technique types,
 *  * props starting with `_`
 *  * props found `skipExtraProps`
 *
 * `THREE.Color` properties are supported.
 *
 * @param technique technique from where params are copied
 * @param material target material
 * @param level optional, tile zoom level for zoom-level dependent props
 * @param skipExtraProps optional, skipped props
 */
export function applyTechniqueToMaterial(
    technique: Technique,
    material: THREE.Material,
    level?: number,
    skipExtraProps?: string[]
) {
    Object.getOwnPropertyNames(technique).forEach(propertyName => {
        if (
            propertyName.startsWith("_") ||
            BASE_TECHNIQUE_NON_MATERIAL_PROPS.indexOf(propertyName) !== -1 ||
            (skipExtraProps !== undefined && skipExtraProps.indexOf(propertyName) !== -1)
        ) {
            return;
        }
        const prop = propertyName as keyof (typeof technique);
        const m = material as any;
        let value = technique[prop];
        if (typeof m[prop] === "undefined") {
            return;
        }
        if (level !== undefined && isCaseProperty<any>(value)) {
            value = getPropertyValue<any>(value, level);
        }
        if (m[prop] instanceof THREE.Color) {
            m[prop].set(value);
        } else {
            m[prop] = value;
        }
    });
}
