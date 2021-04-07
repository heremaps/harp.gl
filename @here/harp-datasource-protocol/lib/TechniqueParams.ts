/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { JsonExpr } from "./Expr";
import { InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";

/**
 * The style type of the line caps.
 */
export type LineCaps = "Square" | "Round" | "None" | "TriangleOut" | "TriangleIn";

/**
 * The style type of the line dashes.
 */
export type LineDashes = "Square" | "Round" | "Diamond";

/**
 * Defines how to interpret the units.
 */
export type MetricUnit = "Meter" | "Pixel";

/**
 * Standard kinds of geometry.
 * @deprecated See {@link BaseTechniqueParams.kind}.
 */
export enum StandardGeometryKind {
    /**
     * Used in the enabledKinds/disabledKinds filter to match any kind.
     */
    All = "_all_",

    /**
     * Background geometry.
     */
    Background = "background",

    /**
     * Terrain geometry.
     */
    Terrain = "terrain",

    /**
     * Default value for the FillTechnique.
     */
    Area = "area",

    /**
     * Default value for all line techniques.
     */
    Line = "line",

    /**
     * Default value for the FillTechnique.
     */
    Water = "water",

    /**
     * Political borders.
     */
    Border = "border",

    /**
     * Basis for all roads.
     */
    Road = "road",

    /**
     * Default value for the ExtrudedPolygonTechnique.
     */
    Building = "building",

    /**
     * Default value for the TextTechnique, LineMarkerTechnique and the PoiTechnique.
     */
    Label = "label",

    /**
     * Anything that may show up last.
     */
    Detail = "detail"
}

/**
 * The kind of geometry is used to group objects together,
 * allowing the group to be hidden or displayed.
 *
 * @remarks
 * Any string can be used to specify the kind of the technique in a style in the theme file. Is is
 * suggested to specify multiple kinds for specific types of data. For a highway, the following list
 * of kinds is suggested:
 *```json
 *    ["line", "road", "road:highway"]
 *```
 * If it is a tunnel for a highway:
 *```json
 *    ["line", "road", "road:highway", "tunnel", "road:tunnel", "road:highway:tunnel"]
 *```
 * If specified in this way, specific types of data (here: highway roads) can be enabled and/or
 * disabled.
 * @deprecated See {@link BaseTechniqueParams.kind}.
 */
export type GeometryKind = string | StandardGeometryKind;

// See https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-redeclare.md#ignoredeclarationmerge
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GeometryKind = StandardGeometryKind;

/**
 * Decorate property type with possible dynamic variants.
 */
export type DynamicProperty<T> = T | JsonExpr | InterpolatedPropertyDefinition<T>;

/**
 * Length literals.
 *
 * @remarks
 * Description of length units inside a style. Supports literal values (interpreted as `m`), `m` and
 * `px`(i.e. `80`, `14px`, `0.6m`, etc.).
 */
export type StyleLength = string | number;

/**
 * Color literals.
 *
 * @remarks
 * Description of colors inside a style. Supports hex values as well as CSS hex, rgb and hsl values
 * (i.e. `0xffffff`, `#f00fab`, `#aaa`, `rgb(255, 0 120)`, `hsl(360, 100%, 100%)`, etc.).
 */
export type StyleColor = string | number;

/**
 * A set of {@link GeometryKind}s.
 */
export class GeometryKindSet extends Set {
    /**
     * Return `true` if the Set is a superset of the set 'subset'.
     */
    isSuperset(subset: Set<any>): boolean {
        for (const elem of subset) {
            if (!this.has(elem)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Return `true` if the Set intersects Set 'set'.
     */
    hasIntersection(set: any) {
        for (const elem of set) {
            if (this.has(elem)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Return `true` if the Set either intersects Set 'set' (if set is a Set), of has element 'set'
     * if set is not a Set.
     */
    hasOrIntersects(set: any) {
        if (set instanceof Set) {
            return this.hasIntersection(set);
        }
        return this.has(set);
    }

    /**
     * Return `true` if this set and the array of elements share at least a single element.
     */
    hasOrIntersectsArray(subset: any[]) {
        for (const elem of subset) {
            if (this.has(elem)) {
                return true;
            }
        }
        return false;
    }
}

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
     * @remarks
     * If not specified in style file monotonically increasing
     * values according to style position in file.
     */
    renderOrder?: DynamicProperty<number>;

    /**
     * The category of this technique.
     *
     * @remarks
     * The category is used in conjunction with {@link Theme.priorities}
     * to assign render orders to the objects created by this {@link Style}.
     */
    category?: DynamicProperty<string>;

    /**
     * Optional. If `true` or `Pickability.transient`, no IDs will be saved for the geometry
     * this style creates. Default is `Pickability.onlyVisible`, which allows all pickable and
     * visible objects to be picked, Pickability.all, will also allow invisible objects to be
     * picked.
     * @defaultValue `Pickability.onlyVisible`
     * The boolean option is for backwardscompatibilty, please use the Pickability.
     *
     *
     * TODO: deprecate and rename to something that makes more sense
     */
    transient?: boolean | Pickability;

    /**
     * Distance to the camera `(0.0 = camera position, 1.0 = farPlane) at which the object start
     * fading out (opacity decreases).
     */
    fadeNear?: DynamicProperty<number>;

    /**
     * Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the object has zero
     * opacity and stops fading out. An undefined value disables fading.
     */
    fadeFar?: DynamicProperty<number>;

    /**
     * Specified kind of geometry.
     *
     * @remarks
     * One kind is set as default in the technique, and can be overridden in the style.
     *
     * @deprecated Use {@link enabled} with expressions based on `['dynamic-properties']` operator.
     * See "object picking" example.
     */
    kind?: GeometryKind | GeometryKindSet;

    /**
     * Runtime filtering of techniques.
     *
     * Use with `['dynamic-properties']` operator for dynamic feature highlight, highlighig etc.
     *
     * @see Picking example
     */
    enabled?: DynamicProperty<boolean>;

    /**
     * Set to 'true' if line should appear transparent.
     *
     * @remarks
     * Rendering transparent lines may come with a
     * slight performance impact.
     * See https://threejs.org/docs/#api/en/materials/Material.transparent.
     */
    transparent?: DynamicProperty<boolean>;

    /**
     * Defines which side of faces will be rendered - front, back or both.
     * See https://threejs.org/docs/#api/en/materials/Material.side.
     */
    side?: DynamicProperty<number>;

    /**
     * Minimal zoom level. If the current zoom level is smaller, the technique will not be used.
     */
    minZoomLevel?: DynamicProperty<number>;

    /**
     * Maximum zoom level. If the current zoom level is equal to or greater, the technique will not be used.
     */
    maxZoomLevel?: DynamicProperty<number>;

    /**
     * If `true`, geometry height won't be scaled on projection. Enable it for projections with
     * variable scale factor (e.g. mercator) to avoid distortions in geometry with great heights and
     * latitude spans. E.g. a large object with even height would look oblique to the ground plane
     * on mercator unless this property is set to `true`.
     *
     * @defaultValue `true` for geometries stored at level less than `12`.
     */
    constantHeight?: DynamicProperty<boolean>;
}

export enum TextureCoordinateType {
    /**
     * Texture coordinates are in tile space.
     *
     * @remarks
     * SW of the tile will have (0,0) and NE will have (1,1).
     */
    TileSpace = "tile-space",

    /**
     * Texture coordinates are in equirectangular space.
     *
     * @remarks
     * (u, v) = ( (longitude+180) / 360, (latitude+90) / 180).
     */
    EquirectangularSpace = "equirectangular-space",

    /**
     * Texture coordinates in feature space.
     *
     * @remarks
     * To compute texture coordinates in feature space,
     * the feature must have a property named `bbox` with value
     * the tuple `[west, south, east, north]`.
     */
    FeatureSpace = "feature-space"
}

/**
 * Standard technique parameters.
 */
export interface StandardTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of the feature in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`,
     * `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.color.
     * @format color-hex
     */
    color?: DynamicProperty<StyleColor>;
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.wireframe.
     */
    wireframe?: boolean;
    /**
     * If `vertexColors` is `true`, every vertex has color information, which is interpolated
     * between vertices.
     * See https://threejs.org/docs/#api/en/materials/Material.vertexColors.
     */
    vertexColors?: boolean;
    /**
     * How rough the material appears. `0.0` means a smooth mirror reflection. `1.0` means fully
     * diffuse. Default is `1.0`.
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.roughness.
     */
    roughness?: DynamicProperty<number>;
    /**
     * How much the material is like a metal. Nonmetallic materials such as wood or stone use `0.0`,
     * metallic ones use `1.0`, with nothing (usually) in between. Default is `0.0`. A value between
     * `0.0` and `1.0` can be used for a rusty metal look. If `metalnessMap` is also provided, both
     * values are multiplied.
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.metalness.
     */
    metalness?: DynamicProperty<number>;
    /**
     * The material will not be rendered if the opacity is lower than this value.
     * See https://threejs.org/docs/#api/en/materials/Material.alphaTest.
     */
    alphaTest?: DynamicProperty<number>;
    /**
     * Skip rendering clobbered pixels.
     * See https://threejs.org/docs/#api/en/materials/Material.depthTest.
     */
    depthTest?: DynamicProperty<boolean>;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     * See https://threejs.org/docs/#api/en/materials/Material.opacity.
     */
    opacity?: DynamicProperty<number>;
    /**
     * Emissive (light) color of the material, essentially a solid color unaffected by other
     * lighting. Default is black.
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.emissive.
     * @format color-hex
     */
    emissive?: DynamicProperty<StyleColor>;
    /**
     * Intensity of the emissive light. Modulates the emissive color. Default is `1`.
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.emissiveIntensity.
     */
    emissiveIntensity?: DynamicProperty<number>;
    /**
     * The index of refraction (IOR) of air (approximately 1) divided by the index of refraction of
     * the material. It is used with environment mapping modes `THREE.CubeRefractionMapping` and
     * `THREE.EquirectangularRefractionMapping`. The refraction ratio should not exceed `1`. Default
     *  is `0.98`.
     * See https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.refractionRatio.
     */
    refractionRatio?: DynamicProperty<number>;

    /**
     * Whether and how texture coordinates should be generated. No texture coordinates are
     * generated if `undefined`.
     * Should be set if any texture assigned (e.g. `map`, `normalMap`, ...).
     */
    textureCoordinateType?: TextureCoordinateType;

    /*
     * URL or texture buffer that should be used as color map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.map
     */
    map?: string | TextureBuffer;
    mapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as normal map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.normalMap
     */
    normalMap?: string | TextureBuffer;
    normalMapType?: number;
    normalMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as displacement map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.displacementMap
     */
    displacementMap?: string | TextureBuffer;
    displacementMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as roughness map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.roughnessMap
     */
    roughnessMap?: string | TextureBuffer;
    roughnessMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as emissive map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.emissiveMap
     */
    emissiveMap?: string | TextureBuffer;
    emissiveMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as bump map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.bumpMap
     */
    bumpMap?: string | TextureBuffer;
    bumpMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as metalness map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.metalnessMap
     */
    metalnessMap?: string | TextureBuffer;
    metalnessMapProperties?: TextureProperties;

    /**
     * URL or texture buffer that should be used as alpha map. See:
     * https://threejs.org/docs/#api/en/materials/MeshStandardMaterial.alphaMap
     */
    alphaMap?: string | TextureBuffer;
    alphaMapProperties?: TextureProperties;
}

/**
 * Possible parameters of [[PointTechnique]].
 */
export interface PointTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of a point in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    color?: DynamicProperty<StyleColor>;
    /**
     * URL of a texture image to be loaded.
     */
    texture?: string;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: DynamicProperty<number>;
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
 * Define the pickability of an object.
 */
export enum Pickability {
    /**
     * Pickable if visible.
     */
    onlyVisible = "only-visible",
    /**
     * Not Pickable at all.
     */
    transient = "transient",
    /**
     * All objects of this type pickable.
     */
    all = "all"
}

/**
 * Converts backwards compatible transient property to pure {@type Pickabilty} object
 *
 * @param transient The transient property from the style
 */
export function transientToPickability(transient?: boolean | Pickability): Pickability {
    let pickability: Pickability = Pickability.onlyVisible;
    if (transient !== undefined && transient !== null) {
        pickability =
            typeof transient === "string"
                ? transient
                : transient === true
                ? Pickability.transient
                : Pickability.onlyVisible;
    }
    return pickability;
}

/**
 * Defines options (tokens) supported for text placements defined via [[placements]] attribute.
 *
 * @remarks
 * Possible values are defined as vertical placement letter and horizontal letter, where
 * one of the axis may be ignored and then assumed centered. Moving clock-wise, we have:
 * `TL` (top-left), `T` (top-center), `TR` (top-right), `R` (center-right), `BR` (bottom-right),
 * `B` (bottom-center), `BL` (bottom-left), `L` (left), `C` (center-center).
 * Alternatively instead of `T`, `B`, `L`, `R` geographic directions may be used accordingly:
 * `NW` (north-west), `N` (north), `NE` (north-east), `E` (east), `SE` (south-east), `S` (south),
 * `SW` (south-west), `W` (west).
 */
export enum PlacementToken {
    TopLeft = "TL",
    Top = "T",
    TopRight = "TR",
    Right = "R",
    BottomRight = "BR",
    Bottom = "B",
    BottomLeft = "BL",
    Left = "L",
    Center = "C",
    NorthWest = "NW",
    North = "N",
    NorthEast = "NE",
    East = "E",
    SouthEast = "SE",
    South = "S",
    SouthWest = "SW",
    West = "W"
}

/**
 * Technique that describes icons with labels. Used in [[PoiTechnique]] and [[LineMarkerTechnique]]
 * (for road shields).
 */
export interface MarkerTechniqueParams extends BaseTechniqueParams {
    /**
     * Text to be displayed for feature.
     *
     * @remarks
     * Defaults to first defined:
     *  - feature property `label` if present in technique (deprecated)
     *  - `["get", "name:short"]` is `useAbbreviation` is true
     *  - `["get", "iso_code"]` is `useIsoCode` is true
     *  - `["get", "name:$LANGUAGE"]` for each specified language
     *  - `["get", "name"]`
     *
     * See [[ExtendedTileInfo.getFeatureText]]
     */
    text?: DynamicProperty<string>;

    /**
     * Field name of object containing the text to be rendered.
     *
     * @deprecated Use `["get", "FIELD"]`.
     */
    label?: string;
    /**
     * If `true`, the abbreviation (field `name:short`) of the elements is used as text.
     *
     * @deprecated Use proper expression with [`get`, `name:short`] for this purpose.
     */
    useAbbreviation?: boolean;
    /**
     * If `true`, the iso code (field 'iso_code') of the elements is used as text.
     * The `iso_code` field contains the ISO 3166-1 2-letter country code.
     *
     * @deprecated Use proper expression with [`get`, `iso_code`] for this purpose.
     */
    useIsoCode?: boolean;
    /**
     * Priority of marker, defaults to `0`. Markers with highest priority get placed first.
     */
    priority?: DynamicProperty<number>;
    /**
     * Minimum zoomLevel at which to display the label text. No default.
     */
    textMinZoomLevel?: DynamicProperty<number>;
    /**
     * Maximum zoomLevel at which to display the label text. No default.
     */
    textMaxZoomLevel?: DynamicProperty<number>;
    /**
     * Minimum zoomLevel at which to display the label icon. No default.
     */
    iconMinZoomLevel?: DynamicProperty<number>;
    /**
     * Maximum zoomLevel at which to display the label icon. No default.
     */
    iconMaxZoomLevel?: DynamicProperty<number>;

    /**
     * Icon color.
     *
     * @remarks
     * If specified, combined using multiplication with color value read from icon texture.
     * Works best for grayscale or monochromatic textures.
     */
    iconColor?: StyleColor;

    /**
     * Icon brightness.
     *
     * @remarks
     * Factor that multiplies a color on top of the icon texture (and `iconColor`) with `0` being
     * fully black as final output, `1` being the original rgb colors of the texture.
     *
     * @defaultValue `1`
     */
    iconBrightness?: number;

    /**
     * Scaling factor of icon. Defaults to 0.5, reducing the size ot 50% in the distance.
     */
    distanceScale?: number;
    /**
     * If `false`, text may overlap markers.
     * @defaultValue `false`
     */
    textMayOverlap?: boolean;
    /**
     * If `false`, the icon may overlap text and other icons of lower priority.
     *
     * @remarks
     * If not defined, the
     * property value from `textMayOverlap` will be used.
     * @defaultValue `false`
     */
    iconMayOverlap?: boolean;
    /**
     * If `false`, text will not reserve screen space, other markers will be able to overlap.
     * @defaultValue `true`
     */
    textReserveSpace?: boolean;
    /**
     * If `false`, icon will not reserve screen space, other markers will be able to overlap.
     *
     * @remarks
     * If not defined, the property value from `iconReserveSpace` will be used.
     * @defaultValue `true`
     */
    iconReserveSpace?: boolean;
    /**
     * If `false`, text will not be rendered during animations. Defaults to `true`.
     */
    renderTextDuringMovements?: boolean;
    /**
     * If `true`, the label will always be rendered on top.
     *
     * @remarks
     * If overlapping with other labels with
     * this flag set, the render order is undefined.
     * @defaultValue `false`
     */
    alwaysOnTop?: boolean;
    /**
     * If `true`, icon will appear even if the text part is blocked by other labels.
     *
     * @remarks
     * @defaultValue `false`
     */
    textIsOptional?: boolean;
    /**
     * Should be displayed on map or not. Defaults to `true`.
     */
    showOnMap?: boolean;
    /**
     * Specify stack mode. Defaults to `ShowInStack`.
     */
    stackMode?: PoiStackMode;
    /**
     * Minimal distance between markers in screen pixels.
     */
    minDistance?: number;
    /**
     * If `true`, text will appear even if the icon is blocked by other labels.
     *
     * @defaultValue `false`
     */
    iconIsOptional?: boolean;
    /**
     * Fading time for labels in seconds.
     */
    textFadeTime?: number;
    /**
     * Fading time for icons in seconds.
     */
    iconFadeTime?: number;
    /**
     * Horizontal offset (to the right) in screen pixels.
     */
    xOffset?: DynamicProperty<number>;
    /**
     * Vertical offset (up) in screen pixels.
     */
    yOffset?: DynamicProperty<number>;
    /**
     * Horizontal offset (to the right) in screen pixels.
     */
    iconXOffset?: DynamicProperty<number>;
    /**
     * Vertical offset (up) in screen pixels.
     */
    iconYOffset?: DynamicProperty<number>;
    /**
     * Scaling factor of icon.
     */
    iconScale?: number;
    /**
     * Vertical height in pixels, controls vertical scaling. Overrides `iconScale`.
     */
    screenHeight?: DynamicProperty<number>;
    /**
     * Horizontal height in pixels, controls horizontal scaling. Overrides `iconScale`.
     */
    screenWidth?: DynamicProperty<number>;
    /**
     * Name of the POI table which should be used for this POI.
     */
    poiTable?: string;
    /**
     * Fixed name to identify POI options in the POI table.
     *
     * @remarks
     * If `poiName` has a value, this value
     * supersedes any value read from the field referenced in `poiNameField`.
     */
    poiName?: string;
    /**
     * Name of the field to evaluate to get the name of the POI options in the POI table.
     */
    poiNameField?: string;
    /**
     * The name of either the {@link ImageTexture} in {@link Theme.imageTextures} or the user image
     * cached in {@link @here/harp-mapview#userImageCache} to be rendered as marker.
     */
    imageTexture?: DynamicProperty<string>;
    /**
     * Field name to extract imageTexture content from, if imageTexture refers to an
     * [[ImageTexture]] definition.
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
     * Name of the text style.
     */
    style?: string;
    /**
     * Name of the preferred [[Font]] to be used when rendering.
     */
    fontName?: string;
    /**
     * Size of the text (pixels).
     */
    size?: DynamicProperty<number>;
    /**
     * Size of the text background (pixels).
     */
    backgroundSize?: DynamicProperty<number>;
    /**
     * Glyph style to apply for the currently active [[Font]].
     */
    fontStyle?: "Regular" | "Bold" | "Italic" | "BoldItalic";
    /**
     * Glyph variant to apply for the currently active [[Font]].
     */
    fontVariant?: "Regular" | "AllCaps" | "SmallCaps";
    /**
     * Glyph local rotation (radians).
     */
    rotation?: number;
    /**
     * Text color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    color?: DynamicProperty<StyleColor>;
    /**
     * Text background color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`,
     * `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    backgroundColor?: DynamicProperty<StyleColor>;
    /**
     * For transparent text, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: DynamicProperty<number>;
    /**
     * Background text opacity value.
     */
    backgroundOpacity?: DynamicProperty<number>;
    /**
     * Inter-glyph spacing (pixels). Scaled by `size`.
     */
    tracking?: DynamicProperty<number>;
    /**
     * Inter-line spacing (pixels). Scaled by `size`.
     */
    leading?: DynamicProperty<number>;
    /**
     * Maximum number of lines for this label.
     */
    maxLines?: DynamicProperty<number>;
    /**
     * Maximum line width (pixels).
     */
    lineWidth?: DynamicProperty<number>;
    /**
     * [[TextCanvas]] rotation (radians).
     */
    canvasRotation?: DynamicProperty<number>;
    /**
     * Line typesetting rotation (radians).
     */
    lineRotation?: DynamicProperty<number>;
    /**
     * Wrapping (line-breaking) mode.
     */
    wrappingMode?: DynamicProperty<"None" | "Character" | "Word">;
    /**
     * Text position regarding the baseline.
     *
     * @note The [[placements]] attribute may override the alignment settings.
     */
    hAlignment?: DynamicProperty<"Left" | "Center" | "Right">;
    /**
     * Text position inside a line.
     *
     * @note The [[placements]] attribute may supersede it.
     */
    vAlignment?: DynamicProperty<"Above" | "Center" | "Below">;
    /**
     * Text label positions relative to the label central position (anchor point).
     *
     * @remarks
     * This attribute defines a comma separated tokens of possible text placements
     * relative to label central position (anchor), for example: "TL, TR, C".
     * Keep in mind that horizontal placement defines text position in opposite way to
     * the alignment, so the text `R` placed (located on the **right side** of label position)
     * will be the same as `Left` aligned by deduction. On other side vertical placement is quite
     * similar to vertical alignment so `T` placement corresponds with `Above` alignment.
     *
     * @note This attribute may override [[hAlignment]] and [[vAlignment]] if defined.
     */
    placements?: string;

    /**
     * World space offset in meters applied to the icon along the ground plane, i.e. tangent
     * to the local space up vector.
     *
     * @remarks
     * Valid only for icons which have the
     * "offset_direction" property as an attribute of the data, which specifies an angle in degrees
     * in which direction the offset should take place, i.e. 0 degrees is north, 90 is east etc.
     */
    worldOffset?: DynamicProperty<number>;
}

export interface LineTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    color: DynamicProperty<StyleColor>;
    /**
     * For transparent lines, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: DynamicProperty<number>;
    /**
     * Width of line in pixels. WebGL implementations will normally render all lines with 1 pixel
     * width, and ignore this value.
     */
    lineWidth: DynamicProperty<number>;
}

/**
 * Declares a geometry as a segment.
 */
export interface SegmentsTechniqueParams extends BaseTechniqueParams {
    /**
     * Color of segments in a hexadecimal notation, for example: `"#e4e9ec"` or `"#fff"`.
     * @format color-hex
     */
    color: DynamicProperty<StyleColor>;
    /**
     * For transparent lines, set a value between `0.0` for fully transparent, to `1.0` for fully
     * opaque.
     */
    opacity?: DynamicProperty<number>;
    /**
     * Width of a line in meters.
     */
    lineWidth: DynamicProperty<number>;
}

/**
 * Declares a a geometry as a polygon.
 */
export interface PolygonalTechniqueParams {
    /**
     * Whether to use polygon offset. Default is false.
     *
     * @remarks
     * This corresponds to the
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
    polygonOffsetFactor?: DynamicProperty<number>;

    /**
     * Sets the polygon offset units. Default is 0.
     */
    polygonOffsetUnits?: DynamicProperty<number>;

    /**
     * Skip rendering clobbered pixels.
     * See https://threejs.org/docs/#api/en/materials/Material.depthTest.
     * @defaultValue `false`
     */
    depthTest?: DynamicProperty<boolean>;

    /**
     * Sets the polygon outline color.
     * @format color-hex
     */
    lineColor?: DynamicProperty<StyleColor>;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges start
     * fading out.
     */
    lineFadeNear?: DynamicProperty<number>;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges become
     * transparent. A value of <= 0.0 disables fading.
     */
    lineFadeFar?: DynamicProperty<number>;

    /**
     * Set to `true` if line should appear transparent. Rendering transparent lines may come with a
     * slight performance impact.
     */
    transparent?: DynamicProperty<boolean>;

    /**
     * For transparent lines, set a value between `0.0` for fully transparent, to `1.0` for fully
     * opaque.
     */
    opacity?: DynamicProperty<number>;

    /**
     * Fill color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    color?: DynamicProperty<StyleColor>;
}

/**
 * Declares a a geometry as a basic extruded line.
 */
export interface BasicExtrudedLineTechniqueParams
    extends BaseTechniqueParams,
        PolygonalTechniqueParams {
    /**
     * A value determining the shading technique.
     *
     * @remarks
     * Valid values are "Basic" and "Standard". Default is "basic".
     *
     * `"basic"`   : Simple shading, faster to render. Only simple color and opacity are effective.
     * `"standard"`: Elaborate shading, with metalness, and roughness.
     */
    shading?: "basic";
    /**
     * Width of line in meters for different zoom levels.
     */
    lineWidth: DynamicProperty<number>;
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     */
    wireframe?: boolean;
    /**
     * Style of both end caps. Possible values: `"None"`, `"Circle"`. A value of undefined maps to
     * `"Circle"`.
     */
    caps?: DynamicProperty<"None" | "Circle">;
}

/**
 * Declares a a geometry as a standard extruded line.
 */
export interface StandardExtrudedLineTechniqueParams
    extends StandardTechniqueParams,
        PolygonalTechniqueParams {
    /**
     * A value determining the shading technique. Valid values are `"basic"` and `"standard"`.
     * Default is `"basic"`.
     *
     * @remarks
     * `"basic"` : Simple shading, faster to render. Only simple color and opacity are effective.
     * `"standard"` : Elaborate shading, with metalness, and roughness.
     */
    shading: "standard";
    /**
     * Width of a line in meters for different zoom levels.
     */
    lineWidth: DynamicProperty<number>;
    /**
     * Style of both end caps. Possible values: `"None"`, `"Circle"`.
     *
     * @remarks
     * A value of undefined maps to
     * `"Circle"`.
     */
    caps?: DynamicProperty<"None" | "Circle">;
}

/**
 * Declares a a geometry as a solid line.
 */
export interface SolidLineTechniqueParams extends BaseTechniqueParams, PolygonalTechniqueParams {
    /**
     * Color of a line in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    color: DynamicProperty<StyleColor>;
    /**
     * Color of a line outline in hexadecimal or CSS-style notation,
     * for example: `"#e4e9ec"`, `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    outlineColor?: DynamicProperty<StyleColor>;
    /**
     * @deprecated Specify metrics units as part of the value instead.
     * Units in which different size properties are specified. Either `Meter` (default) or `Pixel`.
     */
    metricUnit?: MetricUnit;
    /**
     * Width of a line in `metricUnit` for different zoom levels.
     */
    lineWidth: DynamicProperty<StyleLength>;
    /**
     * Outline width of a line in `metricUnit`s for different zoom levels.
     */
    outlineWidth?: DynamicProperty<StyleLength>;
    /**
     * Clip the line outside the tile if `true`.
     * @defaultValue false
     */
    clipping?: DynamicProperty<boolean>;
    /**
     * Describes the style of the line caps.
     * @defaultValue `"Round"`.
     */
    caps?: DynamicProperty<LineCaps>;
    /**
     * Color of secondary line geometry in hexadecimal or CSS-style notation, for example:
     * `"#e4e9ec"`, `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    secondaryColor?: DynamicProperty<StyleColor>;
    /**
     * Width of secondary line geometry in `metricUnit`s for different zoom levels.
     */
    secondaryWidth?: DynamicProperty<StyleLength>;
    /**
     * The render order of the secondary line geometry object created using this technique.
     */
    secondaryRenderOrder?: DynamicProperty<number>;
    /**
     * Describes the style of the secondary line caps
     * @defaultValue `"Round"`.
     */
    secondaryCaps?: DynamicProperty<LineCaps>;
    /**
     * Describes the category of the secondary geometry object created using this technique.
     */
    secondaryCategory?: DynamicProperty<string>;
    /**
     * Describes the starting drawing position for the line (in the range [0...1]).
     * Default is `0.0`.
     */
    drawRangeStart?: number;
    /**
     * Describes the ending drawing position for the line (in the range [0...1]).
     * Default is `1.0`.
     */
    drawRangeEnd?: number;
    /**
     * Describes the style of the line dashes.
     * @defaultValue `"Square"`.
     */
    dashes?: DynamicProperty<LineDashes>;
    /**
     * Color of a line dashes in hexadecimal or CSS-style notation,
     * for example: `"#e4e9ec"`, `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    dashColor?: DynamicProperty<StyleColor>;
    /**
     * Length of a line in meters for different zoom levels.
     */
    dashSize?: DynamicProperty<StyleLength>;
    /**
     * Size of a gap between lines in meters for different zoom levels.
     */
    gapSize?: DynamicProperty<StyleLength>;
    /**
     * Size in world units how far to offset the line perpendicular to its direction.
     */
    offset?: DynamicProperty<number>;
}

/**
 * Technique used to draw filled polygons.
 */
export interface FillTechniqueParams extends BaseTechniqueParams, PolygonalTechniqueParams {
    /**
     * A value of `true` creates a wireframe geometry. (May not be supported with all techniques).
     */
    wireframe?: boolean;
    /**
     * Width of the lines. Currently limited to the [0, 1] range.
     */
    lineWidth?: DynamicProperty<number>;
}

/**
 * Technique used to draw a geometry as an extruded polygon, for example extruded buildings.
 */
export interface ExtrudedPolygonTechniqueParams extends StandardTechniqueParams {
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
    lineWidth: DynamicProperty<number>;
    /**
     * Fill color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    lineColor?: DynamicProperty<StyleColor>;
    /**
     * Mix value between the lineColor(0.0) and the geometry's vertex colors(1.0).
     */
    lineColorMix?: number;

    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges start
     * fading out.
     */
    lineFadeNear?: DynamicProperty<number>;
    /**
     * Distance to the camera (0.0 = nearPlane, 1.0 = farPlane) at which the object edges become
     * transparent. A value of <= 0.0 disables fading.
     */
    lineFadeFar?: DynamicProperty<number>;

    /**
     * Height above ground in world units of extruded polygon.
     *
     * Usually, unique per feature, so defaults to `["get", "height"]`.
     */
    height?: DynamicProperty<number>;

    /**
     * Height of "floor" of extruded polygon in world units of extruded polygon.
     *
     * Usually, unique per feature, so defaults to `["number", ["get", "min_height"], 0]`.
     */
    floorHeight?: DynamicProperty<number>;

    /**
     * In some data sources, for example Tilezen, building extrusion information might be missing.
     * This attribute allows to define a default height of an extruded polygon in the theme.
     *
     * @deprecated use [[height]]
     */
    defaultHeight?: number;

    /**
     * Default color used if feature doesn't provide color attribute
     * and [[MapEnv]] did not return it too.
     * @format color-hex
     */
    defaultColor?: DynamicProperty<StyleColor>;

    /**
     * If `true`, wall geometry will is added along the tile boundaries.
     *
     * @remarks
     * this causes artifacts when used with shadows,
     * so it should be known in advance that shadows won't be enabled.
     * @defaultValue `false`
     */
    boundaryWalls?: boolean;

    /**
     * Animate the extrusion of the buildings if set to `true`.
     */
    animateExtrusion?: DynamicProperty<boolean>;

    /**
     * Duration of the building's extrusion in milliseconds
     */
    animateExtrusionDuration?: number;

    /**
     * Control rendering of depth prepass before the actual geometry.
     *
     * @remarks
     * Depth prepass is a method to render translucent meshes, hence only the visible front faces of
     * a mesh are actually rendered, removing artifacts caused by blending with internal faces of
     * the mesh. This method is used for drawing translucent buildings over map background.
     *
     * By default, each [[DataSource]] determines how/if enable the depth pre-pass. A value of
     * `false` forcefully disables depth prepass.
     */
    enableDepthPrePass?: boolean;
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
     * Type of primitive for the shader technique.
     */
    primitive: "point" | "line" | "segments" | "mesh";

    [name: string]: any;
}

/**
 * Technique used to render a terrain geometry with a texture.
 *
 * @remarks
 * When using this technique, the datasource will produce texture coordinates in
 * local tile space (i.e. [0,0] at south-west and [1,1] at north-east tile corner).
 */
export interface TerrainTechniqueParams extends StandardTechniqueParams {
    /**
     * Colors to be applied at different heights (as a results of a `displacementMap`).
     */
    heightBasedColors?: HeightBasedColors;

    /**
     * If `heightBasedColors` is defined, this value defines the interpolation method used to
     * generate the height-based gradient texture (defaults to `Discrete`).
     * @defaultValue `"Discrete"`
     */
    heightGradientInterpolation?: "Discrete" | "Linear" | "Cubic";

    /**
     * If `heightBasedColors` is defined, this value defines the width (in pixels) of the generated
     * gradient texture.
     *
     * @defaultValue `128`
     */
    heightGradientWidth?: number;
}

/**
 * Render geometry as a text.
 */
export interface TextTechniqueParams extends BaseTechniqueParams {
    /**
     * Text to be displayed for feature.
     *
     * @remarks
     * Defaults to first defined:
     *  - feature property `label` if present in technique (depreacted);
     *  - `["get", "name:short"]` is `useAbbreviation` is true;
     *  - `["get", "iso_code"]` is `useIsoCode` is true;
     *  - `["get", "name:$LANGUAGE"]` for each specified language;
     *  - `["get", "name"]`.
     */
    text?: DynamicProperty<string>;

    /**
     * Field name of object containing the text to be rendered.
     *
     * @deprecated Use `["get", "FIELD"]`.
     */
    label?: string;
    /**
     * If `true`, the abbreviation (field `name:short`) of the elements is used as text.
     *
     * @deprecated Use proper expression with [`get`, `name:short`] for this purpose.
     */
    useAbbreviation?: boolean;
    /**
     * If `true`, the iso code (field 'iso_code') of the elements is used as text.
     * @remarks
     * The `iso_code` field contains the ISO 3166-1 2-letter country code.
     *
     * @deprecated Use proper expression with [`get`, `iso_code`] for this purpose.
     */
    useIsoCode?: boolean;
    /**
     * Priority of text, defaults to `0`. Elements with highest priority get placed first.
     */
    priority?: DynamicProperty<number>;
    /**
     * Scaling factor of the text. Defaults to 0.5, reducing the size ot 50% in the distance.
     */
    distanceScale?: number;
    /**
     * If `true`, icon is allowed to overlap other labels or icons of lower priority.
     * @defaultValue `false`
     */
    mayOverlap?: boolean;
    /**
     * If `true`, element will reserve screen space, other markers of lower priority will not be
     * able to overlap.
     * @defaultValue `true`
     */
    reserveSpace?: boolean;
    /**
     * Fading time for labels in seconds.
     */
    textFadeTime?: number;
    /**
     * Horizontal offset (to the right) in screen pixels.
     */
    xOffset?: number;
    /**
     * Vertical offset (up) in screen pixels.
     */
    yOffset?: number;
    /**
     * Name of the text style.
     */
    style?: string;
    /**
     * Name of the preferred [[Font]] to be used when rendering.
     */
    fontName?: string;
    /**
     * Size of the text (pixels).
     */
    size?: DynamicProperty<number>;
    /**
     * Size of the text background (pixels).
     */
    backgroundSize?: DynamicProperty<number>;
    /**
     * Glyph style to apply for the currently active [[Font]].
     */
    fontStyle?: "Regular" | "Bold" | "Italic" | "BoldItalic";
    /**
     * Glyph variant to apply for the currently active [[Font]].
     */
    fontVariant?: "Regular" | "AllCaps" | "SmallCaps";
    /**
     * Glyph local rotation (radians).
     */
    rotation?: number;
    /**
     * Text color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`, `"#fff"`,
     * `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    color?: DynamicProperty<StyleColor>;
    /**
     * Text background color in hexadecimal or CSS-style notation, for example: `"#e4e9ec"`,
     * `"#fff"`, `"rgb(255, 0, 0)"`, or `"hsl(35, 11%, 88%)"`.
     * @format color-hex
     */
    backgroundColor?: DynamicProperty<StyleColor>;
    /**
     * For transparent text, set a value between 0.0 for totally transparent, to 1.0 for totally
     * opaque.
     */
    opacity?: DynamicProperty<number>;
    /**
     * Background text opacity value.
     */
    backgroundOpacity?: DynamicProperty<number>;
    /**
     * Inter-glyph spacing (pixels). Scaled by `size`.
     */
    tracking?: DynamicProperty<number>;
    /**
     * Inter-line spacing (pixels). Scaled by `size`.
     */
    leading?: DynamicProperty<number>;
    /**
     * Maximum number of lines for this label.
     */
    maxLines?: DynamicProperty<number>;
    /**
     * Maximum line width (pixels).
     */
    lineWidth?: DynamicProperty<number>;
    /**
     * [[TextCanvas]] rotation (radians).
     */
    canvasRotation?: DynamicProperty<number>;
    /**
     * Line typesetting rotation (radians).
     */
    lineRotation?: DynamicProperty<number>;
    /**
     * Wrapping (line-breaking) mode.
     */
    wrappingMode?: DynamicProperty<"None" | "Character" | "Word">;
    /**
     * Text position regarding the baseline.
     */
    hAlignment?: DynamicProperty<"Left" | "Center" | "Right">;
    /**
     * Text position inside a line.
     */
    vAlignment?: DynamicProperty<"Above" | "Center" | "Below">;
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
     * See: https://threejs.org/docs/#api/en/textures/Texture.wrapS.
     */
    wrapS?: WrappingMode;

    /**
     * Texture vertical wrapping mode.
     * See: https://threejs.org/docs/#api/en/textures/Texture.wrapT.
     */
    wrapT?: WrappingMode;

    /**
     * Texture magnification filter.
     */
    magFilter?: MagFilter;

    /**
     * Texture minification filter.
     */
    minFilter?: MinFilter;

    /**
     * Flip texture vertically.
     * See: https://threejs.org/docs/#api/en/textures/Texture.flipY.
     */
    flipY?: boolean;

    /**
     * Texture horizontal repetition rate.
     * See: https://threejs.org/docs/#api/en/textures/Texture.repeat.
     */
    repeatU?: number;

    /**
     * Texture vertical repetition rate.
     * See: https://threejs.org/docs/#api/en/textures/Texture.repeat.
     */
    repeatV?: number;
}

/**
 * Interface containing the definition of different colors to be used at different heights with the
 * [[TerrainTechnique]].
 */
export interface HeightBasedColors {
    heightArray: number[];
    colorArray: string[];
}

export type PixelFormat =
    | "Alpha"
    | "RGB"
    | "RGBA"
    | "Luminance"
    | "LuminanceAlpha"
    | "RGBE"
    | "Depth"
    | "DepthStencil"
    | "Red";

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

/**
 * Available texture magnification filters.
 */
export type MagFilter = "nearest" | "linear";

/**
 * Available texture minification filters.
 */
export type MinFilter =
    | "nearest"
    | "nearestMipMapNearest"
    | "nearestMipMapLinear"
    | "linear"
    | "linearMipMapNearest"
    | "linearMipMapLinear";
