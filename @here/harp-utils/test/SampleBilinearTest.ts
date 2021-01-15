/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";

import { sampleBilinear } from "../lib/SampleBilinear";

describe("sampleBilinearTest", () => {
    // prettier-ignore
    const texture = new Float32Array(
        [1, 2, 3,
        4, 5, 6,
        7, 8, 9]);
    it("Sampling coordinates exactly at a texture element returns it", () => {
        expect(sampleBilinear(texture, 3, 3, 0, 0)).equals(1);
        expect(sampleBilinear(texture, 3, 3, 0.5, 0)).equals(2);
        expect(sampleBilinear(texture, 3, 3, 0, 0.5)).equals(4);
        expect(sampleBilinear(texture, 3, 3, 0.5, 0.5)).equals(5);
    });

    it("Sampling coordinates with no exact match does interpolation", () => {
        expect(sampleBilinear(texture, 3, 3, 0.25, 0.25)).equals(3);
        expect(sampleBilinear(texture, 3, 3, 0.625, 0.75)).equals(6.75);
        expect(sampleBilinear(texture, 3, 3, 0.25, 0.875)).equals(6.75);
        expect(sampleBilinear(texture, 3, 3, 0.625, 0.375)).equals(4.5);
    });

    it("Sampling coordinates exactly at a boundary texture element returns it", () => {
        expect(sampleBilinear(texture, 3, 3, 1, 0)).equals(3);
        expect(sampleBilinear(texture, 3, 3, 1, 0.5)).equals(6);
        expect(sampleBilinear(texture, 3, 3, 0, 1)).equals(7);
        expect(sampleBilinear(texture, 3, 3, 0.5, 1)).equals(8);
        expect(sampleBilinear(texture, 3, 3, 1, 1)).equals(9);
    });

    it("Sampling coordinates near the boundary interpolates ignoring missing neighbours", () => {
        expect(sampleBilinear(texture, 3, 3, 1, 0.25)).equals(4.5);
        expect(sampleBilinear(texture, 3, 3, 1, 0.75)).equals(7.5);
        expect(sampleBilinear(texture, 3, 3, 0.25, 1)).equals(7.5);
        expect(sampleBilinear(texture, 3, 3, 0.75, 1)).equals(8.5);
    });
});
