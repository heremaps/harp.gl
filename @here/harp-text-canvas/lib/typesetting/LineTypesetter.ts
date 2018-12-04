/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { FontStyle, FontVariant, WrappingMode } from "../rendering/TextStyle";
import { TypesettingUtils } from "../utils/TypesettingUtils";
import { UnicodeUtils } from "../utils/UnicodeUtils";
import { Typesetter, TypesettingParameters } from "./Typesetter";

/**
 * @hidden
 * [[Typesetter]] implementation that handles multi-line complex layout text.
 */
export class LineTypesetter implements Typesetter {
    private m_tempTransform: THREE.Matrix3;
    private m_tempCorners: THREE.Vector3[];
    private m_tempLineDirection: UnicodeUtils.Direction;
    private m_tempRunDirection: UnicodeUtils.Direction;
    private m_tempPixelSize: number;
    private m_tempPixelBgSize: number;
    private m_tempScale: number;

    private m_currentParams?: TypesettingParameters;

    /**
     * Creates a `LineTypesetter` object.
     *
     * @returns New `LineTypesetter`.
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
    }

    /**
     * Arranges the specified glyphs using this `LineTypesetter`. Text will be placed into multiple
     * bidirectional lines, that will be generated taking into account [[LayoutStyle]] features,
     * such as:
     * - Maximum line width.
     * - Word and character wrapping.
     * - Maximum number of lines.
     * - Vertical and horizontal alignment.
     * - Leading (spacing between lines).
     *
     * @param params Typesetting parameters.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    arrangeGlyphs(params: TypesettingParameters): boolean {
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

        this.m_currentParams.position.y +=
            this.m_currentParams.layoutStyle.verticalAlignment! *
            this.m_currentParams.glyphDataArray[0].font.metrics.capHeight *
            this.m_tempScale;

        // Compute line origin and height.
        const origin = this.m_currentParams.position.x;
        const lineHeight =
            this.m_currentParams.glyphDataArray[0].font.metrics.lineHeight +
            this.m_currentParams.layoutStyle.leading!;

        // Initialize line-breaking and wrapping variables.
        let lineStartIdx = 0;
        let glyphWrapIdx = 0;
        let wordWrapIdx = 0;
        let lineStartX = 0;
        let lineCurrX = 0;
        let glyphWrapX = 0;
        let wordWrapX = 0;

        let lineCount = 0;
        let isBidirectionalLine = false;
        for (let i = 0; i < this.m_currentParams.glyphDataArray.length; ++i) {
            if (lineCount > this.m_currentParams.layoutStyle.maxLines! - 1) {
                break;
            }
            const glyphData = this.m_currentParams.glyphDataArray[i];
            const isNewLine = UnicodeUtils.isNewLine(glyphData.codePoint);
            const isWhiteSpace = UnicodeUtils.isWhiteSpace(glyphData.codePoint);

            // Check if this line should be treated as bidirectional.
            if (!isBidirectionalLine && glyphData.direction === -this.m_tempLineDirection) {
                isBidirectionalLine = true;
            }
            // Advance the line's current X offset (only for printable characters).
            if (UnicodeUtils.isPrintable(glyphData.codePoint)) {
                lineCurrX +=
                    (glyphData.advanceX + this.m_currentParams.textStyle.tracking!) *
                    this.m_tempScale *
                    TypesettingUtils.getSmallCapsScale(
                        this.m_currentParams.glyphDataArray,
                        this.m_currentParams.glyphTransformationArray,
                        i,
                        this.m_currentParams.textStyle.fontVariant!
                    );
            }
            // If this is the first character in a line, update the line's X offset values (needed
            // to properly center and wrap).
            if (i === lineStartIdx) {
                lineStartX = lineCurrX;
                glyphWrapX = lineCurrX;
                wordWrapX = lineCurrX;
            }

            // Check if should break the current line.
            if (
                isNewLine ||
                (this.m_currentParams.layoutStyle.wrappingMode! !== WrappingMode.None &&
                    lineCurrX > this.m_currentParams.layoutStyle.lineWidth!)
            ) {
                // Perform wrapping.
                if (this.m_currentParams.layoutStyle.wrappingMode! !== WrappingMode.None) {
                    let wrapPointIdx = glyphWrapIdx;
                    let wrapPointX = glyphWrapX;
                    // Only wrap words when more than a single word fits into the current line.
                    if (
                        this.m_currentParams.layoutStyle.wrappingMode! === WrappingMode.Word &&
                        wordWrapX !== lineStartX
                    ) {
                        wrapPointIdx = wordWrapIdx;
                        wrapPointX = wordWrapX;
                    }

                    lineCurrX = wrapPointX;
                    i = Math.min(
                        isNewLine ? (lineStartIdx === i ? wrapPointIdx : i) : wrapPointIdx,
                        this.m_currentParams.glyphDataArray.length - 1
                    );
                }

                // Calculate the correct starting position for the line base on alignment, and place
                // all glyphs in it.
                const lineAlignment =
                    this.m_tempLineDirection === UnicodeUtils.Direction.RTL && isBidirectionalLine
                        ? 1.0 + this.m_currentParams.layoutStyle.horizontalAlignment!
                        : this.m_currentParams.layoutStyle.horizontalAlignment!;
                this.m_currentParams.position.x =
                    this.m_currentParams.position.x + lineCurrX * lineAlignment;
                if (
                    !this.placeLine(lineStartIdx, i, this.m_tempLineDirection, isBidirectionalLine)
                ) {
                    return false;
                }

                // Update the line position.
                this.m_currentParams.position.y -= lineHeight * this.m_tempScale;
                this.m_currentParams.position.x = origin;

                // Find the beginning of a new line (removing trailing white spaces).
                while (
                    i !== lineStartIdx &&
                    i + 1 < this.m_currentParams.glyphDataArray.length &&
                    UnicodeUtils.isWhiteSpace(this.m_currentParams.glyphDataArray[i + 1].codePoint)
                ) {
                    ++i;
                }
                lineStartIdx = i + 1;
                if (lineStartIdx === this.m_currentParams.glyphDataArray.length) {
                    break;
                }

                // Only reset the line's direction when a new line character is found (to keep
                // correct bidirectional behaviour when a bidirectional run is placed between
                // multiple lines).
                if (isNewLine) {
                    this.m_tempLineDirection = TypesettingUtils.getDirection(
                        this.m_currentParams.glyphDataArray,
                        lineStartIdx
                    );
                    this.m_tempRunDirection = this.m_tempLineDirection;
                }

                // Reset the line placement parameters.
                lineStartX = 0;
                lineCurrX = 0;
                glyphWrapIdx = lineStartIdx;
                glyphWrapX = 0;
                wordWrapIdx = lineStartIdx;
                wordWrapX = 0;
                isBidirectionalLine = false;
                lineCount++;
            }
            // If not, should if we should record any new wrapping points.
            else if (
                this.m_currentParams.layoutStyle.wrappingMode !== WrappingMode.None &&
                !isWhiteSpace
            ) {
                // Update the per-glyph wrapping point.
                glyphWrapIdx = i;
                glyphWrapX = lineCurrX;

                // Update the word wrapping point (only if mode is correctly set and we are
                // currently placed at the end of a word).
                if (
                    this.m_currentParams.layoutStyle.wrappingMode === WrappingMode.Word &&
                    i + 1 < this.m_currentParams.glyphDataArray.length &&
                    (UnicodeUtils.isWhiteSpace(
                        this.m_currentParams.glyphDataArray[i + 1].codePoint
                    ) ||
                        UnicodeUtils.isNewLine(
                            this.m_currentParams.glyphDataArray[i + 1].codePoint
                        ))
                ) {
                    wordWrapIdx = i;
                    wordWrapX = lineCurrX;
                }
            }
        }

        // If we still haven't placed all characters, place a final line.
        if (
            lineCount <= this.m_currentParams.layoutStyle.maxLines! - 1 &&
            lineStartIdx <= this.m_currentParams.glyphDataArray.length - 1
        ) {
            const offset =
                this.m_tempLineDirection === UnicodeUtils.Direction.RTL && isBidirectionalLine
                    ? 1.0 + this.m_currentParams.layoutStyle.horizontalAlignment!
                    : this.m_currentParams.layoutStyle.horizontalAlignment!;
            this.m_currentParams.position.setX(
                this.m_currentParams.position.x + lineCurrX * offset
            );
            if (
                !this.placeLine(
                    lineStartIdx,
                    this.m_currentParams.glyphDataArray.length - 1,
                    this.m_tempLineDirection,
                    isBidirectionalLine
                )
            ) {
                return false;
            }
        }

        return true;
    }

    // Place characters alongside a line. Text direction is taken into account, and text is broken
    // into directional runs.
    private placeLine(
        startIdx: number,
        endIdx: number,
        direction: UnicodeUtils.Direction,
        isBidirectional: boolean
    ): boolean {
        // If the line is not bidirectional, place it as a single directional run.
        if (!isBidirectional) {
            return this.placeRun(startIdx, endIdx, direction);
        }

        // Gather common typesetting parameters.
        const glyphDataArray = this.m_currentParams!.glyphDataArray;
        const glyphTransformationArray = this.m_currentParams!.glyphTransformationArray;
        const textStyle = this.m_currentParams!.textStyle;
        const position = this.m_currentParams!.position;

        // Initialize line placement parameters.
        const isRTL = direction === UnicodeUtils.Direction.RTL;
        const origin = position.x;
        let offset = 0;
        let runStart = startIdx;

        for (let i = startIdx; i <= endIdx; ++i) {
            const glyphData = glyphDataArray[i];

            // If the current glyph changes the line direction, place the current run.
            if (glyphData.direction === -this.m_tempRunDirection) {
                if (isRTL) {
                    position.x = origin + offset;
                }
                if (!this.placeRun(runStart, i - 1, this.m_tempRunDirection)) {
                    return false;
                }
                if (!isRTL) {
                    position.x = origin + offset;
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
                    if (isRTL) {
                        position.x = origin + offset;
                    }
                    if (!this.placeRun(runStart, i - 1, this.m_tempRunDirection)) {
                        return false;
                    }
                    if (!isRTL) {
                        position.x = origin + offset;
                    }

                    runStart = i;
                    this.m_tempRunDirection *= -1.0;
                }
            }

            // Advance the offset position in the line.
            offset +=
                (glyphData.advanceX + textStyle.tracking!) *
                this.m_tempScale *
                TypesettingUtils.getSmallCapsScale(
                    glyphDataArray,
                    glyphTransformationArray,
                    i,
                    textStyle.fontVariant!
                ) *
                direction;
        }

        // If we still haven't placed all characters in the line, place a final run.
        if (runStart <= endIdx) {
            if (isRTL) {
                position.x = origin + offset;
            }
            if (!this.placeRun(runStart, endIdx, this.m_tempRunDirection)) {
                return false;
            }
            if (!isRTL) {
                position.x = origin + offset;
            }
        }

        return true;
    }

    // Place a directional run of index inside a line.
    private placeRun(startIdx: number, endIdx: number, direction: UnicodeUtils.Direction): boolean {
        // Gather common typesetting parameters.
        const glyphDataArray = this.m_currentParams!.glyphDataArray;
        const glyphTransformationArray = this.m_currentParams!.glyphTransformationArray;
        const fontCatalog = this.m_currentParams!.fontCatalog;
        const textStyle = this.m_currentParams!.textStyle;
        const position = this.m_currentParams!.position;
        const geometry = this.m_currentParams!.geometry;
        const globalBounds = this.m_currentParams!.globalBounds;
        const individualBounds = this.m_currentParams!.individualBounds;

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
                    (0.5 * this.m_tempPixelBgSize!) /
                    (fontCatalog.distanceRange * Math.max(glyphScale, 1.0));
                isMirrored =
                    UnicodeUtils.isRtlMirrored(glyphData.codePoint) &&
                    direction === UnicodeUtils.Direction.RTL;
            }

            const verticalOffset =
                glyphFontMetrics.lineHeight -
                glyphFontMetrics.base -
                glyphFontMetrics.distanceRange * 0.5;

            // Compute the glyphs transformation matrix and apply to all corners of a glyph.
            TypesettingUtils.computeGlyphTransform(
                this.m_tempTransform,
                position,
                glyphScale,
                textStyle.rotation || 0.0,
                textStyle.glyphRotation || 0.0
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
                    return false;
                }
            }

            // Advance the current position and proceed to next glyph in the run.
            position.x += (glyphData.advanceX + textStyle.tracking!) * glyphScale;
        }

        return true;
    }
}
