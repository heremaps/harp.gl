/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const RX = /^((?=\.\d|\d)(?:\d+)?(?:\.?\d*))px$/;

/**
 * A class representing Pixels.
 *
 * @hidden
 * @internal
 */
export class Pixels {
    /**
     * Parses a pixel string literal.
     *
     * @param text - The string color literal
     */
    static parse(text: string): Pixels | undefined {
        const match = RX.exec(text);
        if (match === null) {
            return undefined;
        }
        return new Pixels(Number(match[1]));
    }

    /**
     * Constructs a [[Pixels]] literal
     *
     * @param value - The number of pixels.
     */
    constructor(readonly value: number) {}

    toJSON() {
        return `${this.value}px`;
    }
}
