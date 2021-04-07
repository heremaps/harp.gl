/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { assert } from "@here/harp-utils";
//@ts-ignore
import { parseCSSColor } from "csscolorparser";

import { ColorUtils } from "./ColorUtils";

/**
 * Enumeration of supported string encoded numerals.
 * @internal
 */
export enum StringEncodedNumeralType {
    Meters,
    Pixels,
    Hex
}

/**
 * Interface containing information about a [[StringEncodedNumeral]] format, component size and
 * evaluation.
 * @internal
 */
export interface StringEncodedNumeralFormat {
    readonly type: StringEncodedNumeralType;
    readonly size: number;
    readonly regExp: RegExp;
    mask?: number;
    decoder: (encodedValue: string, target: number[]) => boolean;
}
const StringEncodedMeters: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Meters,
    size: 1,
    regExp: /^((?=\.\d|\d)(?:\d+)?(?:\.?\d*))m$/,
    decoder: (encodedValue: string, target: number[]) => {
        const match = StringEncodedMeters.regExp.exec(encodedValue);
        return match ? (target[0] = Number(match[1])) !== undefined : false;
    }
};
const StringEncodedPixels: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Pixels,
    size: 1,
    mask: 1.0,
    regExp: /^((?=\.\d|\d)(?:\d+)?(?:\.?\d*))px$/,
    decoder: (encodedValue: string, target: number[]) => {
        const match = StringEncodedPixels.regExp.exec(encodedValue);
        if (match === null) {
            return false;
        }
        target[0] = Number(match[1]);
        return true;
    }
};
const StringEncodedHex: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Hex,
    size: 4,
    regExp: /^\#((?:[0-9A-Fa-f][0-9A-Fa-f]){4}|[0-9A-Fa-f]{4})$/,
    decoder: (encodedValue: string, target: number[]) => {
        const match = StringEncodedHex.regExp.exec(encodedValue);
        if (match === null) {
            return false;
        }
        const hex = match[1];
        const size = hex.length;
        // Only few sizes are possible for given reg-exp.
        assert(size === 4 || size === 8, `Matched incorrect hex color format`);
        // Note that we simply ignore alpha channel value.
        // TODO: To be resolved with HARP-7517
        if (size === 4) {
            // #RGB or #RGBA
            target[0] = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
            target[1] = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
            target[2] = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
            target[3] = size === 4 ? parseInt(hex.charAt(3) + hex.charAt(3), 16) / 255 : 1;
        } else if (size === 8) {
            // #RRGGBB or #RRGGBBAA
            target[0] = parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255;
            target[1] = parseInt(hex.charAt(2) + hex.charAt(3), 16) / 255;
            target[2] = parseInt(hex.charAt(4) + hex.charAt(5), 16) / 255;
            target[3] = size === 8 ? parseInt(hex.charAt(6) + hex.charAt(7), 16) / 255 : 1;
        }
        return true;
    }
};

/**
 * Array of all supported [[StringEncodedNumeralFormat]]s describing sizes, lengths and distances.
 * @internal
 */
export const StringEncodedMetricFormats: StringEncodedNumeralFormat[] = [
    StringEncodedMeters,
    StringEncodedPixels
];

const StringEncodedMetricFormatMaxSize = StringEncodedMetricFormats.reduce(
    (a, b) => Math.max(a, b.size),
    0
);

/**
 * Array of all supported [[StringEncodedNumeralFormat]]s describing color data.
 * @internal
 */
export const StringEncodedColorFormats: StringEncodedNumeralFormat[] = [StringEncodedHex];

const StringEncodedColorFormatMaxSize = StringEncodedColorFormats.reduce(
    (a, b) => Math.max(a, b.size),
    0
);

/**
 * Array of supported [[StringEncodedNumeralFormat]]s (intended to be indexed with
 * [[StringEncodedNumeralType]] enum).
 * @internal
 */
export const StringEncodedNumeralFormats: StringEncodedNumeralFormat[] = [
    ...StringEncodedMetricFormats,
    ...StringEncodedColorFormats
];

/**
 * @internal
 */
export const StringEncodedNumeralFormatMaxSize = Math.max(
    StringEncodedColorFormatMaxSize,
    StringEncodedMetricFormatMaxSize
);

const tmpBuffer: number[] = new Array(StringEncodedNumeralFormatMaxSize);

/**
 * Parse string encoded numeral values using all known [[StringEncodedNumeralFormats]].
 *
 * @param numeral - The string representing numeric value.
 * @param pixelToMeters - The ratio used to convert from meters to pixels (default 1.0).
 * @returns Number parsed or __undefined__ if non of the numeral patterns matches the expression
 * provided in [[numeral]].
 */
export function parseStringEncodedNumeral(
    numeral: string,
    pixelToMeters: number = 1.0
): number | undefined {
    return parseStringLiteral(numeral, StringEncodedNumeralFormats, pixelToMeters);
}

/**
 * Parse string encoded color value using all known [[StringEncodedColorFormats]].
 *
 * @param color - The string encoded color expression (i.e. '#FFF', 'rgb(255, 0, 0)', etc.).
 * @returns The color parsed or __undefined__ if non of the known representations matches
 * the expression provided in [[color]].
 */
export function parseStringEncodedColor(color: string): number | undefined {
    return parseStringLiteral(color, StringEncodedColorFormats);
}

function parseStringLiteral(
    text: string,
    formats: StringEncodedNumeralFormat[],
    pixelToMeters: number = 1.0
): number | undefined {
    const matchedFormat = formats.find(format => {
        return format.decoder(text, tmpBuffer) ? true : false;
    });

    if (matchedFormat === undefined) {
        const components: number[] | null = parseCSSColor(text);

        return Array.isArray(components) && !components.some(c => isNaN(c))
            ? ColorUtils.getHexFromRgba(
                  components[0] / 255,
                  components[1] / 255,
                  components[2] / 255,
                  components[3]
              )
            : undefined;
    }

    switch (matchedFormat?.type) {
        case StringEncodedNumeralType.Pixels:
            return tmpBuffer[0] * pixelToMeters;
        case StringEncodedNumeralType.Hex:
            return ColorUtils.getHexFromRgba(
                tmpBuffer[0],
                tmpBuffer[1],
                tmpBuffer[2],
                tmpBuffer[3]
            );
        default:
            return tmpBuffer[0];
    }
}
