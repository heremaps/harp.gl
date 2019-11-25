/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Color } from "three";

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
    type: StringEncodedNumeralType;
    size: number;
    regExp: RegExp;
    mask?: number;
    // TODO: Add target/output array as parameter to minimize arrays creation.
    decoder: (encodedValue: string) => number[];
}
const StringEncodedMeters: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Meters,
    size: 1,
    regExp: /^((?=\.\d|\d)(?:\d+)?(?:\.?\d*))m$/,
    decoder: (encodedValue: string) => {
        return [Number(StringEncodedMeters.regExp.exec(encodedValue)![1])];
    }
};
const StringEncodedPixels: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Pixels,
    size: 1,
    mask: 1.0,
    regExp: /^((?=\.\d|\d)(?:\d+)?(?:\.?\d*))px$/,
    decoder: (encodedValue: string) => {
        return [Number(StringEncodedPixels.regExp.exec(encodedValue)![1])];
    }
};
const StringEncodedHex: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Hex,
    size: 3,
    regExp: /^\#((?:[0-9A-Fa-f][0-9A-Fa-f]){3,4}|[0-9A-Fa-f]{3,4})$/,
    decoder: (encodedValue: string) => {
        const match = StringEncodedHex.regExp.exec(encodedValue)!;
        const hex = match[1];
        const size = hex.length;
        // Note that we simply ignore alpha channel value.
        // TODO: To be resolved with HARP-7517
        if (size === 3 || size === 4) {
            // #RGB or #RGBA
            tmpColor.setRGB(
                parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255,
                parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255,
                parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255
            );
        } else if (size === 6 || size === 8) {
            // #RRGGBB or #RRGGBBAA
            tmpColor.setRGB(
                parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255,
                parseInt(hex.charAt(2) + hex.charAt(3), 16) / 255,
                parseInt(hex.charAt(4) + hex.charAt(5), 16) / 255
            );
        } else {
            // Impossible for given reg-exp
            throw new Error(`unsupported hex color '${encodedValue}'`);
        }
        return [tmpColor.r, tmpColor.g, tmpColor.b];
    }
};
const StringEncodedRGB: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.RGB,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /^rgb\( ?(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5])) ?\)$/,
    decoder: (encodedValue: string) => {
        const channels = StringEncodedRGB.regExp.exec(encodedValue)!;
        tmpColor.setRGB(
            parseInt(channels[1], 10) / 255,
            parseInt(channels[2], 10) / 255,
            parseInt(channels[3], 10) / 255
        );
        return [tmpColor.r, tmpColor.g, tmpColor.b];
    }
};
const StringEncodedRGBA: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.RGBA,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /^rgba\( ?(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:(0(?:\.[0-9]+)?|1(?:\.0+)?)) ?\)$/,
    decoder: (encodedValue: string) => {
        const channels = StringEncodedRGBA.regExp.exec(encodedValue)!;
        // For now we simply ignore alpha channel value.
        // TODO: To be resolved with HARP-7517
        tmpColor.setRGB(
            parseInt(channels[1], 10) / 255,
            parseInt(channels[2], 10) / 255,
            parseInt(channels[3], 10) / 255
        );
        return [tmpColor.r, tmpColor.g, tmpColor.b];
    }
};
const StringEncodedHSL: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.HSL,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /^hsl\( ?((?:[0-9]|[1-9][0-9]|1[0-9]{1,2}|2[0-9]{1,2}|3[0-5][0-9]|360)), ?(?:([0-9]|[1-9][0-9]|100)%), ?(?:([0-9]|[1-9][0-9]|100)%) ?\)$/,
    decoder: (encodedValue: string) => {
        const channels = StringEncodedHSL.regExp.exec(encodedValue)!;
        tmpColor.setHSL(
            parseInt(channels[1], 10) / 360,
            parseInt(channels[2], 10) / 100,
            parseInt(channels[3], 10) / 100
        );
        return [tmpColor.r, tmpColor.g, tmpColor.b];
    }
};

/**
 * Array of all supported [[StringEncodedNumeralFormat]]s describing sizes, lengths and distances.
 */
export const StringEncodedMetricFormats: StringEncodedNumeralFormat[] = [
    StringEncodedMeters,
    StringEncodedPixels
];

/**
 * Array of all supported [[StringEncodedNumeralFormat]]s describing color data.
 */
export const StringEncodedColorFormats: StringEncodedNumeralFormat[] = [
    StringEncodedHex,
    StringEncodedRGB,
    StringEncodedRGBA,
    StringEncodedHSL
];

/**
 * Array of supported [[StringEncodedNumeralFormat]]s (intended to be indexed with
 * [[StringEncodedNumeralType]] enum).
 */
export const StringEncodedNumeralFormats: StringEncodedNumeralFormat[] = [
    ...StringEncodedMetricFormats,
    ...StringEncodedColorFormats
];

/**
 * Parse string encoded numeral values using all known [[StringEncodedNumeralFormats]].
 *
 * @param numeral The string representing numeric value.
 * @param pixelToMeters The ratio used to convert from meters to pixels (default 1.0).
 * @returns Number parsed or __undefined__ if non of the numeral patterns matches the expression
 * provided in [[numeral]].
 */
export function parseStringEncodedNumeral(
    numeral: string,
    pixelToMeters: number = 1.0
): number | undefined {
    const matchedFormat = StringEncodedNumeralFormats.find(format => format.regExp.test(numeral));
    if (matchedFormat === undefined) {
        return undefined;
    }
    switch (matchedFormat.type) {
        case StringEncodedNumeralType.Meters:
            return matchedFormat.decoder(numeral)[0];
        case StringEncodedNumeralType.Pixels:
            return matchedFormat.decoder(numeral)[0] * pixelToMeters;
        case StringEncodedNumeralType.Hex:
        case StringEncodedNumeralType.RGB:
        case StringEncodedNumeralType.RGBA:
        case StringEncodedNumeralType.HSL:
            const rgbValues = matchedFormat.decoder(numeral);
            return tmpColor.setRGB(rgbValues[0], rgbValues[1], rgbValues[2]).getHex();
        default:
            return matchedFormat.decoder(numeral)[0];
    }
}

/**
 * Parse string encoded color value using all known [[StringEncodedColorFormats]].
 *
 * @param color The string encoded color expression (i.e. '#FFF', 'rgb(255, 0, 0)', etc.).
 * @returns The color parsed or __undefined__ if non of the known representations matches
 * the expression provided in [[color]].
 */
export function parseStringEncodedColor(color: string): number | undefined {
    const matchedFormat = StringEncodedColorFormats.find(format => format.regExp.test(color));
    if (matchedFormat === undefined) {
        return undefined;
    }
    switch (matchedFormat.type) {
        case StringEncodedNumeralType.Hex:
        case StringEncodedNumeralType.RGB:
        case StringEncodedNumeralType.RGBA:
        case StringEncodedNumeralType.HSL:
            const rgbValues = matchedFormat.decoder(color);
            return tmpColor.setRGB(rgbValues[0], rgbValues[1], rgbValues[2]).getHex();
        default:
            return matchedFormat.decoder(color)[0];
    }
}
