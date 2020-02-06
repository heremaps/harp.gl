/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { assert } from "@here/harp-utils";
import { Color } from "three";
import { ColorUtils } from "./ColorUtils";
import { Env } from "./Env";

const tmpColor = new Color();

/**
 * Enumeration of supported string encoded numerals.
 */
export enum StringEncodedNumeralType {
    Meters,
    Pixels,
    Hex,
    RGB,
    RGBA,
    HSL
}

/**
 * Interface containing information about a [[StringEncodedNumeral]] format, component size and
 * evaluation.
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
    regExp: /^\#((?:[0-9A-Fa-f][0-9A-Fa-f]){3,4}|[0-9A-Fa-f]{3,4})$/,
    decoder: (encodedValue: string, target: number[]) => {
        const match = StringEncodedHex.regExp.exec(encodedValue);
        if (match === null) {
            return false;
        }
        const hex = match[1];
        const size = hex.length;
        // Only few sizes are possible for given reg-exp.
        assert(
            size === 3 || size === 4 || size === 6 || size === 8,
            `Matched incorrect hex color format`
        );
        // Note that we simply ignore alpha channel value.
        // TODO: To be resolved with HARP-7517
        if (size === 3 || size === 4) {
            // #RGB or #RGBA
            target[0] = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
            target[1] = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
            target[2] = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
            target[3] = size === 4 ? parseInt(hex.charAt(3) + hex.charAt(3), 16) / 255 : 1;
        } else if (size === 6 || size === 8) {
            // #RRGGBB or #RRGGBBAA
            target[0] = parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255;
            target[1] = parseInt(hex.charAt(2) + hex.charAt(3), 16) / 255;
            target[2] = parseInt(hex.charAt(4) + hex.charAt(5), 16) / 255;
            target[3] = size === 8 ? parseInt(hex.charAt(6) + hex.charAt(7), 16) / 255 : 1;
        }
        return true;
    }
};
const StringEncodedRGB: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.RGB,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /^rgb\( ?(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5])) ?\)$/,
    decoder: (encodedValue: string, target: number[]) => {
        const channels = StringEncodedRGB.regExp.exec(encodedValue);
        if (channels === null) {
            return false;
        }
        target[0] = parseInt(channels[1], 10) / 255;
        target[1] = parseInt(channels[2], 10) / 255;
        target[2] = parseInt(channels[3], 10) / 255;
        return true;
    }
};
const StringEncodedRGBA: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.RGBA,
    size: 4,
    // tslint:disable-next-line:max-line-length
    regExp: /^rgba\( ?(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:(0(?:\.[0-9]+)?|1(?:\.0+)?)) ?\)$/,
    decoder: (encodedValue: string, target: number[]) => {
        const channels = StringEncodedRGBA.regExp.exec(encodedValue);
        if (channels === null) {
            return false;
        }
        target[0] = parseInt(channels[1], 10) / 255;
        target[1] = parseInt(channels[2], 10) / 255;
        target[2] = parseInt(channels[3], 10) / 255;
        target[3] = parseFloat(channels[4]);
        return true;
    }
};
const StringEncodedHSL: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.HSL,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /^hsl\( ?((?:[0-9]|[1-9][0-9]|1[0-9]{1,2}|2[0-9]{1,2}|3[0-5][0-9]|360)), ?(?:([0-9]|[1-9][0-9]|100)%), ?(?:([0-9]|[1-9][0-9]|100)%) ?\)$/,
    decoder: (encodedValue: string, target: number[]) => {
        const channels = StringEncodedHSL.regExp.exec(encodedValue);
        if (channels === null) {
            return false;
        }
        tmpColor.setHSL(
            parseInt(channels[1], 10) / 360,
            parseInt(channels[2], 10) / 100,
            parseInt(channels[3], 10) / 100
        );
        target[0] = tmpColor.r;
        target[1] = tmpColor.g;
        target[2] = tmpColor.b;
        return true;
    }
};

/**
 * Array of all supported [[StringEncodedNumeralFormat]]s describing sizes, lengths and distances.
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
 */
export const StringEncodedColorFormats: StringEncodedNumeralFormat[] = [
    StringEncodedHex,
    StringEncodedRGB,
    StringEncodedRGBA,
    StringEncodedHSL
];

const StringEncodedColorFormatMaxSize = StringEncodedColorFormats.reduce(
    (a, b) => Math.max(a, b.size),
    0
);

/**
 * Array of supported [[StringEncodedNumeralFormat]]s (intended to be indexed with
 * [[StringEncodedNumeralType]] enum).
 */
export const StringEncodedNumeralFormats: StringEncodedNumeralFormat[] = [
    ...StringEncodedMetricFormats,
    ...StringEncodedColorFormats
];

export const StringEncodedNumeralFormatMaxSize = Math.max(
    StringEncodedColorFormatMaxSize,
    StringEncodedMetricFormatMaxSize
);

const tmpBuffer: number[] = new Array(StringEncodedNumeralFormatMaxSize);

/**
 * Parse string encoded numeral values using all known [[StringEncodedNumeralFormats]].
 *
 * @param numeral The string representing numeric value.
 * @param env [[Env]] instance to evaluate scene dependent numerals
 * @returns Number parsed or __undefined__ if non of the numeral patterns matches the expression
 * provided in [[numeral]].
 */
export function parseStringEncodedNumeral(numeral: string, env?: Env): number | undefined {
    let result: number | undefined;
    const formatMatch = (format: StringEncodedNumeralFormat) => {
        if (format.decoder(numeral, tmpBuffer)) {
            switch (format.type) {
                case StringEncodedNumeralType.Meters:
                    result = tmpBuffer[0];
                    break;
                case StringEncodedNumeralType.Pixels:
                    const pixelToMeters = (env?.lookup("$pixelToMeters") as number) ?? 1;
                    result = tmpBuffer[0] * pixelToMeters;
                    break;
                case StringEncodedNumeralType.Hex:
                case StringEncodedNumeralType.RGBA:
                    result = ColorUtils.getHexFromRgba(
                        tmpBuffer[0],
                        tmpBuffer[1],
                        tmpBuffer[2],
                        tmpBuffer[3]
                    );
                    break;
                case StringEncodedNumeralType.RGB:
                case StringEncodedNumeralType.HSL:
                    result = ColorUtils.getHexFromRgb(tmpBuffer[0], tmpBuffer[1], tmpBuffer[2]);
                    break;
                default:
                    result = tmpBuffer[0];
                    break;
            }
            return true;
        }
        return false;
    };
    StringEncodedNumeralFormats.some(formatMatch);
    return result;
}

/**
 * Parse string encoded color value using all known [[StringEncodedColorFormats]].
 *
 * @param color The string encoded color expression (i.e. '#FFF', 'rgb(255, 0, 0)', etc.).
 * @returns The color parsed or __undefined__ if non of the known representations matches
 * the expression provided in [[color]].
 */
export function parseStringEncodedColor(color: string): number | undefined {
    const matchedFormat = matchFormat(StringEncodedColorFormats, color, tmpBuffer);
    if (matchedFormat === undefined) {
        return undefined;
    }
    switch (matchedFormat.type) {
        case StringEncodedNumeralType.Hex:
        case StringEncodedNumeralType.RGBA:
            return ColorUtils.getHexFromRgba(
                tmpBuffer[0],
                tmpBuffer[1],
                tmpBuffer[2],
                tmpBuffer[3]
            );
        case StringEncodedNumeralType.RGB:
        case StringEncodedNumeralType.HSL:
            return ColorUtils.getHexFromRgb(tmpBuffer[0], tmpBuffer[1], tmpBuffer[2]);
        default:
            return tmpBuffer[0];
    }
}

function matchFormat(
    formats: StringEncodedNumeralFormat[],
    numeral: string,
    result: number[]
): StringEncodedNumeralFormat | undefined {
    return formats.find(format => {
        return format.decoder(numeral, result) ? true : false;
    });
}
