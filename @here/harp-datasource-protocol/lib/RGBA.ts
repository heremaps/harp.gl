/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MathUtils } from "three";
import { ColorUtils } from "./ColorUtils";
import { StringEncodedColorFormats } from "./StringEncodedNumeral";

/**
 * A class representing RGBA colors.
 *
 * @hidden
 * @internal
 */
export class RGBA {
    /**
     * Parses a string describing a color.
     *
     * @param text The string color literal
     */
    static parse(text: string) {
        const format = StringEncodedColorFormats.find(f => f.regExp.test(text));
        if (format === undefined) {
            return undefined;
        }

        const components = [1, 1, 1, 1];
        format.decoder(text, components);
        return new RGBA(...components);
    }

    /**
     * Constructs a [[RGBA]] color using the given components in the [0..1] range.
     */
    constructor(
        public r: number = 1,
        public g: number = 1,
        public b: number = 1,
        public a: number = 1
    ) {}

    /**
     * Clones this [[RGBA]] color.
     */
    clone() {
        return new RGBA(this.r, this.g, this.b, this.a);
    }

    /**
     * Returns this color encoded as one single number.
     */
    getHex() {
        return ColorUtils.getHexFromRgba(this.r, this.g, this.b, this.a);
    }

    /**
     * Linearly interpolate the components of this color.
     */
    lerp(target: RGBA, t: number) {
        this.r = MathUtils.lerp(this.r, target.r, t);
        this.g = MathUtils.lerp(this.g, target.g, t);
        this.b = MathUtils.lerp(this.b, target.b, t);
        this.a = MathUtils.lerp(this.a, target.a, t);
        return this;
    }

    /**
     * Returns this color encoded as JSON literal.
     */
    toJSON() {
        // tslint:disable-next-line: no-bitwise
        return `rgba(${(this.r * 255) << 0}, ${(this.g * 255) << 0}, ${(this.b * 255) << 0}, ${
            this.a
        })`;
    }
}
