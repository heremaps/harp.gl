/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

export type ExtendedMesh = THREE.Mesh & {
    /**
     * Distance of this object from the Tile's center.
     */
    displacement?: THREE.Vector3;
};

/**
 * This enum defines the possible origin points for an image.
 */
export enum ImageOrigin {
    TopLeft,
    BottomLeft
}

/**
 * Available rendering parameters for the POIs.
 */
export interface ImageOptions {
    /**
     * The point of origin of the texture as supported in [[ImageOrigin]].
     */
    origin?: ImageOrigin;

    /**
     * Missing Typedoc
     */
    width: number;

    /**
     * Missing Typedoc
     */
    height: number;

    /**
     * Missing Typedoc
     */
    xOffset?: number;

    /**
     * Missing Typedoc
     */
    yOffset?: number;

    /**
     * Missing Typedoc
     */
    flipH?: boolean;

    /**
     * Missing Typedoc
     */
    flipV?: boolean;

    /**
     * Missing Typedoc
     */
    opacity?: number;
}

// export enum TextAlign {
//     Center,
//     Left,
//     Right,

//     // ??? expands lines to have same length.
//     Justify
// }

// export interface LayoutOptions {
//     paddingH?: number;
//     paddingV: number;
//     transFormCenterX?: number;
//     transFormCenterY?: number;
//     rotation?: number;
//     /** Set to `true` to enlarge the box after rotation to include all rotated corners. */
//     rotationEnlargesBox: boolean;
// }

// export interface TextOptions {
//     bgColor?: THREE.Color;
//     wrapWords?: boolean;
//     maxNumLines?: number;
//     maxWidth?: number;
//     /** Replace with ellipsis if wider than maxWidth. */
//     addEllipsis?: boolean;
//     /** Handle right-to-left texts */
//     isRightToLeft?: boolean;

//     textAlignH?: AlignH; // = AlignH.Center;
//     textAlignV?: AlignV; // = AlignV.Center;
// }

// export class IconLabel {
//     constructor(text: string, options: LayoutOptions | TextOptions) {}

//     /**
//      * Setup a box with size and padding.
//      *
//      * @param box Target box to set up.
//      */
//     getBox(box: THREE.Box2) {}

//     /**
//      * Compute width and height from text and font.
//      */
//     computeBox() {}

//     /**
//      * Generate the glyphs and keep them in a buffer. Generates a fixed layout.
//      */
//     prepareRendering() {}
// }

// export enum AlignH {
//     Center,
//     Left,
//     Right
// }

// export enum AlignV {
//     Center,
//     Top,
//     Bottom
// }

// export enum AnchorTarget {
//     /** Anchor point relative to Icon */
//     Icon,
//     /** Anchor point is transform center of icon */
//     IconCenter,
//     /** Anchor point relative to Icon including padding */
//     IconBox,
//     /** Anchor point relative to Label */
//     Label,
//     /** Anchor point relative to combination of Icon and Label */
//     Box
// }

// export class AnchorPosition {
//     targetH: AnchorTarget = AnchorTarget.Icon;
//     targetV: AnchorTarget = AnchorTarget.Icon;
//     alignH: AlignH = AlignH.Center;
//     alignV: AlignV = AlignV.Center;
// }

// export enum IconPinMode {
//     /** Pinned down, anchor point is the same at all angles. */
//     PinDown,
//     /**
//      * Icon stands up. "StreetLevel"-style. The anchor point moves to the bottom of the icon when
//      * the view direction gets parallel to the ground.
//      */
//     StandUp
// }

// export interface IconScaleOptions {
//     depthScale?: boolean;
//     minimumScale?: number;
// }

// export interface IconOptions {
//     useScreenSpace?: boolean; // = true
//     priority?: number;

//     scaleOptions?: IconScaleOptions;

//     /** Optional offset in screen space */
//     screenOffsetX?: number;
//     screenOffsetY?: number;

//     /** Optional 3D height above terrain. */
//     heightAboveGround?: number;
// }

// export class SimplePoiIcon {
//     constructor(
//         readonly pos: THREE.Vector3,
//         readonly image ?: IconTexture,
//         options ?: IconOptions
//     ) { }
// }

// export class PoiIcon {
//     constructor(
//         readonly pos: THREE.Vector3,
//         readonly image?: IconTexture,
//         readonly label?: IconLabel,
//         options?: IconOptions
//     ) {}
// }

// export interface PoiOptions {
//     featureId?: number;
//     minZoomLevel?: number;
// }

// export class SimplePoi {
//     private m_featureId?: number;
//     private m_minZoomLevel: number = 0;

//     constructor(readonly icon: SimplePoiIcon, options?: PoiOptions) {
//         if (options !== undefined) {
//             this.m_featureId = options.featureId;
//             this.m_minZoomLevel = options.minZoomLevel !== undefined ? options.minZoomLevel : 0;
//         }
//     }
// }

// export class Poi {
//     /** store multiple icons, one for every LOD */
//     private m_icons: PoiIcon[] = [];
//     private m_lod = 0;
//     private m_featureId?: number;
//     private m_minZoomLevel: number = 0;

//     constructor(icon: PoiIcon, options?: PoiOptions) {
//         this.m_icons.push(icon);

//         if (options !== undefined) {
//             this.m_featureId = options.featureId;
//             this.m_minZoomLevel = options.minZoomLevel !== undefined ? options.minZoomLevel : 0;
//         }
//     }

//     icon(): PoiIcon | undefined {
//         return this.m_icons[this.m_lod];
//     }

//     /**
//      * Select the level of detail that should be used.
//      *
//      * @param levelOfDetail Level of detail to render.
//      */
//     selectIcon(levelOfDetail: number) {}
// }
