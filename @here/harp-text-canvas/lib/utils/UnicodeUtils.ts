/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Namespace containing useful information when dealing with Unicode's code points.
 */
export namespace UnicodeUtils {
    /**
     * Range of Unicode code points considered as white space.
     * https://en.wikipedia.org/wiki/Whitespace_character
     */
    export const whiteSpaceRanges = [
        [0x0009, 0x0009],
        [0x0020, 0x0020],
        [0x1680, 0x1680],
        [0x2000, 0x2006],
        [0x2008, 0x200a],
        [0x205f, 0x3000],
        [0x180e, 0x180e],
        [0x200b, 0x200d]
    ];

    /**
     * Checks if a character should be considered as a white space.
     *
     * @param codePoint - Character's Unicode code point.
     *
     * @returns Result of the test.
     */
    export function isWhiteSpace(codePoint: number) {
        for (const range of whiteSpaceRanges) {
            if (codePoint >= range[0] && codePoint <= range[1]) {
                return true;
            }
        }
        return false;
    }

    /**
     * Range of Unicode code points considered as `NewLine`.
     * https://en.wikipedia.org/wiki/Newline#Unicode
     */
    export const newLineRanges = [
        [0x000a, 0x000d],
        [0x0085, 0x0085],
        [0x2028, 0x2029]
    ];

    /**
     * Checks if a character should be considered as a new line.
     *
     * @param codePoint - Character's Unicode code point.
     *
     * @returns Result of the test.
     */
    export function isNewLine(codePoint: number) {
        for (const range of newLineRanges) {
            if (codePoint >= range[0] && codePoint <= range[1]) {
                return true;
            }
        }
        return false;
    }

    /**
     * Range of Unicode code points considered as non-printable.
     * https://en.wikipedia.org/wiki/Unicode_control_characters
     */
    export const nonPrintableRanges = [
        [0x0000, 0x001f],
        [0x007f, 0x009f]
    ];

    /**
     * Checks if a character's can be printed (rendered).
     *
     * @param codePoint - Character's Unicode code point.
     *
     * @returns Result of the test.
     */
    export function isPrintable(codePoint: number) {
        for (const range of nonPrintableRanges) {
            if (codePoint >= range[0] && codePoint <= range[1]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Unicode code point direction.
     */
    export enum Direction {
        Neutral = 0.0,
        Weak = 0.5,
        LTR = 1.0,
        RTL = -1.0
    }

    // TODO: Review/Remove/Add any additional needed blocks (HARP-3330).
    /**
     * Unicode Blocks which have inherent RTL direction.
     * These blocks correspond to the scripts described here:
     * https://en.wikipedia.org/wiki/Right-to-left#List_of_RTL_scripts
     */
    export const rtlBlocks: string[] = [
        "Hebrew",
        "Alphabetic Presentation Forms",
        "Arabic",
        "Arabic Supplement",
        "Arabic Extended-A",
        "Arabic Presentation Forms-A",
        "Arabic Presentation Forms-B",
        "Arabic Mathematical Alphabetic Symbols",
        "Indic Siyaq Numbers",
        "Rumi Numeral Symbols",
        "Syriac",
        "Syriac Supplement",
        "Samaritan",
        "Mandaic",
        "Thaana",
        "Mende Kikakui",
        "NKo",
        "Adlam",
        "Hanifi Rohingya"
    ];

    /**
     * ASCII punctuation is considered to have neutral direction:
     * https://en.wikipedia.org/wiki/Basic_Latin_(Unicode_block)#Table_of_characters
     */
    export const neutralBidirectionalRanges = [
        [0x0020, 0x002f],
        [0x003a, 0x0040],
        [0x005b, 0x0060],
        [0x007b, 0x007e]
    ];

    /**
     * Latin and arabic numerals are considered to have weak directionality:
     * https://en.wikipedia.org/wiki/Basic_Latin_(Unicode_block)#Table_of_characters
     * https://en.wikipedia.org/wiki/Arabic_(Unicode_block)#Block
     */
    export const weakBidirectionalRanges = [
        [0x0030, 0x0039],
        [0x0660, 0x0669],
        [0x06f0, 0x06f9]
    ];

    /**
     * Returns the Unicode's character direction.
     *
     * @param codePoint - Character's Unicode code point.
     * @param block - Character's Unicode block.
     *
     * @returns Character's direction.
     */
    export function getDirection(codePoint: number, block: string): Direction {
        // Test for neutral and weak code points first (they're inside LTR/RTL ranges).
        for (const weakRange of weakBidirectionalRanges) {
            if (codePoint >= weakRange[0] && codePoint <= weakRange[1]) {
                return Direction.Weak;
            }
        }
        for (const neutralRange of neutralBidirectionalRanges) {
            if (codePoint >= neutralRange[0] && codePoint <= neutralRange[1]) {
                return Direction.Neutral;
            }
        }

        // Check for RTL/LTR.
        const rtl = rtlBlocks.find(element => {
            return element === block;
        });
        if (rtl !== undefined) {
            return Direction.RTL;
        } else {
            return Direction.LTR;
        }
    }

    /**
     * Some punctuation characters (like: (, ), <, >, [,], {, }) need to be mirrored when rendering
     * a RTL string to preserve their intrinsic meaning.
     * https://en.wikipedia.org/wiki/Basic_Latin_(Unicode_block)#Table_of_characters
     */
    export const rtlMirroredCodePoints = [
        0x0028,
        0x0029,
        0x003c,
        0x003e,
        0x005b,
        0x005d,
        0x007b,
        0x007d
    ];

    /**
     * Checks if a character should be mirrored on an RTL run.
     *
     * @param codePoint - Character's Unicode code point.
     *
     * @returns Result of the test.
     */
    export function isRtlMirrored(codePoint: number): boolean {
        return (
            rtlMirroredCodePoints.find(element => {
                return element === codePoint;
            }) !== undefined
        );
    }
}
