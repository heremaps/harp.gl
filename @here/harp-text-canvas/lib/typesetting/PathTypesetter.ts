/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { FontStyle, FontVariant } from "../rendering/TextStyle";
import { TypesettingUtils } from "../utils/TypesettingUtils";
import { UnicodeUtils } from "../utils/UnicodeUtils";
import { Typesetter, TypesettingParameters } from "./Typesetter";

/**
 * @hidden
 * Parameters passed when placing glyphs using [[PathTypesetter]]'s `arrangeGlyphs` function.
 */
export interface PathTypesettingParameters extends TypesettingParameters {
    /**
     * Path to be followed when arranging glyphs.
     */
    path: THREE.Path | THREE.CurvePath<THREE.Vector2>;
}

/**
 * @hidden
 * [[Typesetter]] implementation that arranges glyphs alongside a specified path.
 */
export class PathTypesetter implements Typesetter {
    private m_tempTransform: THREE.Matrix3;
    private m_tempCorners: THREE.Vector3[];
    private m_tempLineDirection: UnicodeUtils.Direction;
    private m_tempRunDirection: UnicodeUtils.Direction;
    private m_tempPixelSize: number;
    private m_tempPixelBgSize: number;
    private m_tempScale: number;

    private m_tempPathPosition: THREE.Vector3;
    private m_tempPathLength: number;
    private m_tempPathOffset: number;

    private m_currentParams?: PathTypesettingParameters;

    /**
     * Creates a `PathTypesetter` object.
     *
     * @returns New `PathTypesetter`.
     */
    constructor() {
        this.m_tempTransform = new THREE.Matrix3();
        this.m_tempCorners = [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ];
        this.m_tempLineDirection = UnicodeUtils.Direction.LTR;
        this.m_tempRunDirection = UnicodeUtils.Direction.LTR;
        this.m_tempPixelSize = 1.0;
        this.m_tempPixelBgSize = 1.0;
        this.m_tempScale = 1.0;

        this.m_tempPathPosition = new THREE.Vector3();
        this.m_tempPathLength = 0.0;
        this.m_tempPathOffset = 0.0;
    }

    /**
     * Arranges the specified glyphs using this `PathTypesetter`. Text will be placed into a single
     * bidirectional line that follows the specified path. Characters will be orientated and placed
     * alongside this path following [[TextLayout]]'s [[VerticalAlignment]] and
     * [[HorizontalAlignment]].
     *
     * @param params Typesetting parameters.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    arrangeGlyphs(params: PathTypesettingParameters): boolean {
        // Initializes common typesetting parameters (used across all functions in this class).
        this.m_currentParams = params;
        this.m_tempLineDirection = TypesettingUtils.getDirection(
            this.m_currentParams.glyphDataArray,
            0
        );
        this.m_tempRunDirection = this.m_tempLineDirection;
        this.m_tempPixelSize = TypesettingUtils.getPixelSize(
            this.m_currentParams.textStyle.fontSize!.size,
            this.m_currentParams.textStyle.fontSize!.unit,
            this.m_currentParams.fontCatalog.size
        );
        this.m_tempPixelBgSize = TypesettingUtils.getPixelSize(
            this.m_currentParams.textStyle.fontSize!.backgroundSize,
            this.m_currentParams.textStyle.fontSize!.unit,
            this.m_currentParams.fontCatalog.size
        );
        this.m_tempScale = this.m_tempPixelSize / this.m_currentParams.fontCatalog.size;

        this.m_tempPathLength = this.m_currentParams.path.getLength();
        this.m_tempPathOffset = 0.0;

        // To be able to properly set the horizontal alignment on a path, we need to first retrieve
        // how much of the path the input text covers, so we can calculate the correct initial
        // offset.
        let isBidirectional = false;
        let pathWidth = 0.0;
        for (let i = 0; i < this.m_currentParams.glyphDataArray.length; ++i) {
            const glyphData = this.m_currentParams.glyphDataArray[i];

            if (!UnicodeUtils.isPrintable(glyphData.codePoint)) {
                continue;
            }
            if (!isBidirectional && glyphData.direction === -this.m_tempLineDirection) {
                isBidirectional = true;
            }

            pathWidth +=
                (glyphData.advanceX + this.m_currentParams.textStyle.tracking!) *
                this.m_tempScale *
                TypesettingUtils.getSmallCapsScale(
                    this.m_currentParams.glyphDataArray,
                    this.m_currentParams.glyphTransformationArray,
                    i,
                    this.m_currentParams.textStyle.fontVariant!
                );
        }
        this.m_tempPathOffset = Math.min(
            Math.max(
                -this.m_currentParams.layoutStyle.horizontalAlignment! +
                    (this.m_currentParams.layoutStyle.horizontalAlignment! * pathWidth) /
                        this.m_tempPathLength,
                0
            ),
            1
        );

        // Place the input text as a single path line.
        return this.placeLine(this.m_tempLineDirection, isBidirectional);
    }

    // Place characters alongside a path line. Text direction is taken into account, and text is
    // broken into directional runs.
    private placeLine(direction: UnicodeUtils.Direction, isBidirectional: boolean): boolean {
        // If the line is not bidirectional, place it as a single directional run.
        if (!isBidirectional) {
            return this.placeRun(0, this.m_currentParams!.glyphDataArray.length - 1, direction);
        }

        // Gather common typesetting parameters.
        const glyphDataArray = this.m_currentParams!.glyphDataArray;

        // Initialize line placement parameters.
        let runStart = 0;
        for (let i = runStart; i < glyphDataArray.length; ++i) {
            const glyphData = glyphDataArray[i];

            // If the current glyph changes the line direction, place the current run.
            if (glyphData.direction === -this.m_tempRunDirection) {
                if (!this.placeRun(runStart, i - 1, this.m_tempRunDirection)) {
                    return false;
                }

                runStart = i;
                this.m_tempRunDirection *= -1.0;
            }
            // If the current glyph has neutral direction (i.e. white space) and we're in the middle
            // of a run with direction opposite to the line's main direction, check for the closest
            // strong direction in the run.
            else if (
                glyphData.direction === UnicodeUtils.Direction.Neutral &&
                this.m_tempRunDirection === -direction
            ) {
                let neutralIdx = i;
                while (
                    neutralIdx + 1 < glyphDataArray.length &&
                    Math.abs(glyphDataArray[neutralIdx].direction) !== 1
                ) {
                    ++neutralIdx;
                }

                // If the closest strong direction in the run is not the current run's direction,
                // place the current run.
                if (glyphDataArray[neutralIdx].direction !== this.m_tempRunDirection) {
                    if (!this.placeRun(runStart, i - 1, this.m_tempRunDirection)) {
                        return false;
                    }

                    runStart = i;
                    this.m_tempRunDirection *= -1.0;
                }
            }
        }

        // If we still haven't placed all characters in the line, place a final run.
        if (runStart < glyphDataArray.length) {
            if (!this.placeRun(runStart, glyphDataArray.length - 1, this.m_tempRunDirection)) {
                return false;
            }
        }

        return true;
    }

    // Place a directional run of index inside a path line.
    private placeRun(startIdx: number, endIdx: number, direction: UnicodeUtils.Direction): boolean {
        // Gather common typesetting parameters.
        const glyphDataArray = this.m_currentParams!.glyphDataArray;
        const glyphTransformationArray = this.m_currentParams!.glyphTransformationArray;
        const fontCatalog = this.m_currentParams!.fontCatalog;
        const textStyle = this.m_currentParams!.textStyle;
        const layoutStyle = this.m_currentParams!.layoutStyle;
        const position = this.m_currentParams!.position;
        const geometry = this.m_currentParams!.geometry;
        const globalBounds = this.m_currentParams!.globalBounds;
        const individualBounds = this.m_currentParams!.individualBounds;
        const path = this.m_currentParams!.path;

        const defaultGlyphRotation = textStyle.glyphRotation;
        const normalDisplacement =
            layoutStyle.verticalAlignment! *
            glyphDataArray[0].font.metrics.capHeight *
            this.m_tempScale;

        // Move through the glyph array following the run's direction (as the order of the glyphs in
        // memory might not match the order on glyphs on scree).
        const start = direction === UnicodeUtils.Direction.LTR ? startIdx : endIdx;
        const end = direction === UnicodeUtils.Direction.LTR ? endIdx : startIdx;
        for (
            let i = start;
            direction === UnicodeUtils.Direction.RTL ? i >= end : i <= end;
            i += direction
        ) {
            // Only process printable characters.
            const glyphData = glyphDataArray[i];
            if (!UnicodeUtils.isPrintable(glyphData.codePoint)) {
                continue;
            }

            // When placing a RTL run, we need to check for weak runs (numerical runs of characters
            // that don't change the overall run direction, but should always be displayed as LTR
            // text).
            if (
                startIdx !== endIdx &&
                direction === UnicodeUtils.Direction.RTL &&
                glyphData.direction === UnicodeUtils.Direction.Weak
            ) {
                let weakRunStart = i;
                let weakGlyph = glyphDataArray[weakRunStart - 1];
                while (
                    weakRunStart !== startIdx &&
                    (weakGlyph.direction === UnicodeUtils.Direction.Weak ||
                        (weakGlyph.direction === UnicodeUtils.Direction.Neutral &&
                            !UnicodeUtils.isWhiteSpace(weakGlyph.codePoint)))
                ) {
                    --weakRunStart;
                    weakGlyph = glyphDataArray[weakRunStart - 1];
                }

                this.placeRun(Math.max(weakRunStart, startIdx), i, UnicodeUtils.Direction.LTR);

                i = weakRunStart;
                continue;
            }

            // Compute various rendering parameters for this glyph.
            const glyphFont = glyphData.font;
            const glyphFontMetrics = glyphFont.metrics;
            const fontStyle = textStyle.fontStyle;

            const isBoldEmulated =
                (fontStyle === FontStyle.Bold && glyphFont.bold === undefined) ||
                (fontStyle === FontStyle.BoldItalic &&
                    glyphFont.bold === undefined &&
                    glyphFont.boldItalic === undefined);
            const isItalicEmulated =
                (fontStyle === FontStyle.Italic && glyphFont.italic === undefined) ||
                (fontStyle === FontStyle.BoldItalic &&
                    glyphFont.italic === undefined &&
                    glyphFont.boldItalic === undefined);

            const isSmallCaps =
                glyphTransformationArray[i] && textStyle.fontVariant === FontVariant.SmallCaps;
            const smallCapsScale = isSmallCaps
                ? glyphFontMetrics.xHeight / glyphFontMetrics.capHeight
                : 1.0;
            const glyphScale = this.m_tempScale * smallCapsScale;

            let emulationWeight: number = 0;
            let bgWeight: number = 0;
            let isMirrored: boolean = false;
            if (globalBounds === undefined) {
                emulationWeight =
                    ((isBoldEmulated ? 0.02 : 0.0) + (isSmallCaps ? 0.01 : 0.0)) *
                    (fontCatalog.size / fontCatalog.distanceRange);
                bgWeight =
                    (0.5 * this.m_tempPixelBgSize) /
                    (fontCatalog.distanceRange * Math.max(glyphScale, 1.0));
                isMirrored =
                    UnicodeUtils.isRtlMirrored(glyphData.codePoint) &&
                    direction === UnicodeUtils.Direction.RTL;
            }

            const verticalOffset =
                glyphFontMetrics.lineHeight -
                glyphFontMetrics.base -
                glyphFontMetrics.distanceRange * 0.5;

            // Update the current interpolated path position and angle.
            const textPoint = path.getPoint(this.m_tempPathOffset);
            if (textPoint === null) {
                return false;
            }
            const tangent = path.getTangent(this.m_tempPathOffset);
            const normal = new THREE.Vector2(-tangent.y, tangent.x).multiplyScalar(
                normalDisplacement
            );
            const angle = Math.atan2(tangent.y, tangent.x);
            this.m_tempPathPosition.set(normal.x + textPoint.x, normal.y + textPoint.y, 0);
            textStyle.glyphRotation = (defaultGlyphRotation || 0.0) + angle;

            // Compute the glyphs transformation matrix and apply to all corners of a glyph.
            TypesettingUtils.computeGlyphTransform(
                this.m_tempTransform,
                this.m_tempPathPosition,
                glyphScale,
                textStyle.rotation || 0.0,
                textStyle.glyphRotation
            );
            for (let j = 0; j < 4; ++j) {
                const glyphVertexPosition = glyphData.positions[j];
                const horizontalOffset =
                    isItalicEmulated && j > 1
                        ? TypesettingUtils.OBLIQUE_OFFSET * glyphFontMetrics.size
                        : 0.0;
                this.m_tempCorners[j].set(
                    glyphVertexPosition.x + horizontalOffset,
                    glyphVertexPosition.y - verticalOffset,
                    glyphVertexPosition.z
                );
                this.m_tempCorners[j].applyMatrix3(this.m_tempTransform);

                this.m_tempCorners[j].x -= position.x;
                this.m_tempCorners[j].y -= position.y;
            }

            // Depending on the typesetting options, add the computed glyph to the TextGeometry or
            // update the text bounds.
            if (globalBounds !== undefined) {
                TypesettingUtils.updateBounds(this.m_tempCorners, globalBounds, individualBounds);
            } else {
                if (
                    !geometry.add(
                        glyphData,
                        this.m_tempCorners,
                        emulationWeight,
                        emulationWeight + bgWeight,
                        isMirrored,
                        textStyle
                    )
                ) {
                    textStyle.glyphRotation = defaultGlyphRotation;
                    return false;
                }
            }

            // Restore the original glyph rotation.
            textStyle.glyphRotation = defaultGlyphRotation;

            // Advance the current position and proceed to next glyph in the run.
            this.m_tempPathOffset +=
                ((glyphData.advanceX + textStyle.tracking!) * glyphScale) / this.m_tempPathLength;
        }

        return true;
    }
}
