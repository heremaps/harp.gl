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
export const StringEncodedMeters: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Meters,
    size: 1,
    regExp: /((?=\.\d|\d)(?:\d+)?(?:\.?\d*))m/,
    decoder: (encodedValue: string) => {
        return [Number(StringEncodedMeters.regExp.exec(encodedValue)![1])];
    }
};
export const StringEncodedPixels: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Pixels,
    size: 1,
    mask: 1.0,
    regExp: /((?=\.\d|\d)(?:\d+)?(?:\.?\d*))px/,
    decoder: (encodedValue: string) => {
        return [Number(StringEncodedPixels.regExp.exec(encodedValue)![1])];
    }
};
export const StringEncodedHex: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.Hex,
    size: 3,
    regExp: /#([0-9A-Fa-f]{1,2})([0-9A-Fa-f]{1,2})([0-9A-Fa-f]{1,2})/,
    decoder: (encodedValue: string) => {
        tmpColor.set(encodedValue);
        return [tmpColor.r, tmpColor.g, tmpColor.b];
    }
};
export const StringEncodedRGB: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.RGB,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /rgb\((?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]))\)/,
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
export const StringEncodedRGBA: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.RGBA,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /rgba\((?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:([0-9]{1,2}|1[0-9]{1,2}|2[0-4][0-9]|25[0-5]), ?)(?:(0(?:\.[0-9]+)?|1(?:\.0+)?))\)/,
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
export const StringEncodedHSL: StringEncodedNumeralFormat = {
    type: StringEncodedNumeralType.HSL,
    size: 3,
    // tslint:disable-next-line:max-line-length
    regExp: /hsl\(((?:[0-9]|[1-9][0-9]|1[0-9]{1,2}|2[0-9]{1,2}|3[0-5][0-9]|360)), ?(?:([0-9]|[1-9][0-9]|100)%), ?(?:([0-9]|[1-9][0-9]|100)%)\)/,
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
 * Array of supported [[StringEncodedNumeralFormat]]s (inteded to be indexed with
 * [[StringEncodedNumeralType]] enum).
 */
export const StringEncodedNumeralFormats: StringEncodedNumeralFormat[] = [
    StringEncodedMeters,
    StringEncodedPixels,
    StringEncodedHex,
    StringEncodedRGB,
    StringEncodedRGBA,
    StringEncodedHSL
];
