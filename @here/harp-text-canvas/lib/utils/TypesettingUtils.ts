/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { GlyphData } from "../rendering/GlyphData";
import { FontUnit, FontVariant } from "../rendering/TextStyle";
import { UnicodeUtils } from "../utils/UnicodeUtils";

/**
 * Collection of different constants and utility functions used by [[Typesetter]]s.
 */
export namespace TypesettingUtils {
    /**
     * Ratio between EMs and Pixels.
     */
    export const EM_TO_PX = 16.0;

    /**
     * Ratio between Points and Pixels.
     */
    export const PT_TO_PX = 1.25;

    /**
     * Angle used when emulating italic fonts (oblique).
     */
    export const OBLIQUE_ANGLE = 0.174533;

    /**
     * Horizontal offset used when emulating italic fonts (oblique).
     */
    export const OBLIQUE_OFFSET = Math.tan(OBLIQUE_ANGLE);

    /**
     * Convert between any size specified in any [[FontUnit]] to pixels.
     *
     * @param size - Font size (specified in `unit`).
     * @param unit - Size unit.
     * @param originalSize - Original size (pixels)
     *
     * @returns Pixel size.
     */
    export function getPixelSize(size: number, unit: FontUnit, originalSize: number) {
        let result = size;
        switch (unit) {
            case FontUnit.Em:
                result *= EM_TO_PX;
                break;
            case FontUnit.Point:
                result *= PT_TO_PX;
                break;
            case FontUnit.Percent:
                result *= (1.0 / 100) * originalSize;
                break;
        }
        return result;
    }

    /**
     * Gets the scale applied to a certain character when using the [[FontVariant]].`SmallCaps`.
     *
     * @param glyphs - Array containing [[TransformedGlyphData]].
     * @param index - Index to `glyphDataArray`.
     * @param fontVariant - Currently active [[FontVariant]].
     *
     * @returns Glyph `SmallCaps` scale.
     */
    export function getSmallCapsScale(
        glyphs: GlyphData[],
        smallCapsTransformations: boolean[],
        index: number,
        fontVariant: FontVariant
    ): number {
        const isSmallCaps =
            smallCapsTransformations[index] && fontVariant === FontVariant.SmallCaps;
        return isSmallCaps
            ? glyphs[index].font.metrics.xHeight / glyphs[index].font.metrics.capHeight
            : 1.0;
    }

    /**
     * Returns the first strong direction (LTR or RTL) found for a given array of [[GlyphData]].
     *
     * @param glyphs - Array containing [[GlyphData]].
     * @param offset - `glyphDataArray` offset.
     *
     * @returns Strong direction.
     */
    export function getDirection(glyphs: GlyphData[], offset: number): UnicodeUtils.Direction {
        let result = UnicodeUtils.Direction.LTR;
        let index = offset;
        while (
            glyphs[index].direction !== UnicodeUtils.Direction.LTR &&
            glyphs[index].direction !== UnicodeUtils.Direction.RTL &&
            index < glyphs.length - 1
        ) {
            ++index;
        }

        if (Math.abs(glyphs[index].direction) === 1.0) {
            result = glyphs[index].direction;
        }
        return result;
    }

    /**
     * Computes the transformation matrix for a glyph.
     *
     * @param transform - Matrix used to store the results.
     * @param position - Glyph' position.
     * @param scale - Glyph' scale.
     * @param rotation - [[TextCanvas]] rotation.
     * @param localRotation - Glyph' local rotation.
     */
    export function computeGlyphTransform(
        transform: THREE.Matrix3,
        position: THREE.Vector3,
        scale: number,
        rotation: number,
        localRotation: number
    ): void {
        const cosAngle = Math.cos(rotation);
        const sinAngle = Math.sin(rotation);
        const localCosAngle = Math.cos(localRotation);
        const localSinAngle = Math.sin(localRotation);
        transform.set(
            scale * localCosAngle,
            scale * -localSinAngle,
            cosAngle * position.x - sinAngle * position.y,
            scale * localSinAngle,
            scale * localCosAngle,
            sinAngle * position.x + cosAngle * position.y,
            0,
            0,
            1.0
        );
    }

    /**
     * Updates the supplied bounds with the computed screen-space corners for a given glyph.
     *
     * @param corners - Glyph' corners.
     * @param globalBounds - Global text bounds.
     * @param individualBounds - Individual per-character bounds.
     */
    export function updateBounds(
        corners: THREE.Vector3[],
        globalBounds: THREE.Box2,
        individualBounds?: { array: THREE.Box2[]; offset: number }
    ): void {
        const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
        const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);

        if (individualBounds !== undefined) {
            if (individualBounds.array[individualBounds.offset] !== undefined) {
                individualBounds.array[individualBounds.offset].min.set(minX, minY);
                individualBounds.array[individualBounds.offset].max.set(maxX, maxY);
            } else {
                individualBounds.array.push(
                    new THREE.Box2(new THREE.Vector2(minX, minY), new THREE.Vector2(maxX, maxY))
                );
            }
            ++individualBounds.offset;
        }

        globalBounds.min.set(
            Math.min(globalBounds.min.x, minX),
            Math.min(globalBounds.min.y, minY)
        );
        globalBounds.max.set(
            Math.max(globalBounds.max.x, maxX),
            Math.max(globalBounds.max.y, maxY)
        );
    }
}
