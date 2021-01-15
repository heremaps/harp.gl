/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";

import { Math2D } from "../lib/Math2D";

describe("Math2D", () => {
    describe("intersectLineAndCircle", () => {
        const eps = 1e-5;

        describe("no intersection", () => {
            it("centered circle and vertical line", () => {
                expect(Math2D.intersectLineAndCircle(1.01, 1, 1.01, 2, 1)).to.be.undefined;
            });
            it("centered circle and horizontal line", () => {
                expect(Math2D.intersectLineAndCircle(-1, -1.01, 1, -1.01, 1)).to.be.undefined;
            });
            it("centered circle and inclined line", () => {
                expect(
                    Math2D.intersectLineAndCircle(
                        Math.SQRT2 / 2,
                        Math.SQRT2 / 2 + 0.01,
                        0,
                        Math.SQRT2 + 0.01,
                        1
                    )
                ).to.be.undefined;
            });

            it("off-centered circle and inclined line", () => {
                expect(
                    Math2D.intersectLineAndCircle(
                        Math.SQRT2 / 2,
                        Math.SQRT2 / 2,
                        0,
                        Math.SQRT2,
                        1,
                        -0.1,
                        -0.1
                    )
                ).to.be.undefined;
            });
        });

        describe("tangent line", () => {
            it("centered circle and vertical line", () => {
                expect(Math2D.intersectLineAndCircle(1, 2, 1, 1, 1)).to.deep.equal({
                    x1: 1,
                    y1: 0
                });
            });
            it("centered circle and horizontal line", () => {
                expect(Math2D.intersectLineAndCircle(-1, -1, 1, -1, 1)).to.deep.equal({
                    x1: 0,
                    y1: -1
                });
            });
            it("centered circle and inclined line", () => {
                const result = Math2D.intersectLineAndCircle(
                    Math.SQRT2 / 2,
                    Math.SQRT2 / 2,
                    0,
                    Math.SQRT2,
                    1
                );
                expect(result).to.not.be.undefined;
                expect(result!.x1).to.be.closeTo(Math.SQRT2 / 2, eps);
                expect(result!.y1).to.be.closeTo(Math.SQRT2 / 2, eps);
                expect(result!.x2).to.be.undefined;
                expect(result!.y2).to.be.undefined;
            });

            it("off-centered circle and inclined line", () => {
                const result = Math2D.intersectLineAndCircle(
                    Math.SQRT2 / 2 - 0.1,
                    Math.SQRT2 / 2 + 0.2,
                    -0.1,
                    Math.SQRT2 + 0.2,
                    1,
                    -0.1,
                    0.2
                );
                expect(result).to.not.be.undefined;
                expect(result!.x1).to.be.closeTo(Math.SQRT2 / 2 - 0.1, eps);
                expect(result!.y1).to.be.closeTo(Math.SQRT2 / 2 + 0.2, eps);
                expect(result!.x2).to.be.undefined;
                expect(result!.y2).to.be.undefined;
            });
        });
        describe("secant line", () => {
            it("centered circle and vertical line", () => {
                const result = Math2D.intersectLineAndCircle(-1, -2, -1, 1, 3);

                expect(result).to.not.be.undefined;
                expect(result!.x1).to.be.closeTo(-1, eps);
                expect(result!.y1).to.be.closeTo(2 * Math.SQRT2, eps);
                expect(result!.x2).to.be.closeTo(-1, eps);
                expect(result!.y2).to.be.closeTo(-2 * Math.SQRT2, eps);
            });
            it("centered circle and horizontal line", () => {
                const result = Math2D.intersectLineAndCircle(-1, -1, 1, -1, 3);

                expect(result).to.not.be.undefined;
                expect(result!.x1).to.be.closeTo(2 * Math.SQRT2, eps);
                expect(result!.y1).to.be.closeTo(-1, eps);
                expect(result!.x2).to.be.closeTo(-2 * Math.SQRT2, eps);
                expect(result!.y2).to.be.closeTo(-1, eps);
            });
            it("centered circle and inclined line", () => {
                const result = Math2D.intersectLineAndCircle(0, 3, 3, 0, 3);

                expect(result).to.not.be.undefined;
                expect(result!.x1).to.be.closeTo(0, eps);
                expect(result!.y1).to.be.closeTo(3, eps);
                expect(result!.x2).to.be.closeTo(3, eps);
                expect(result!.y2).to.be.closeTo(0, eps);
            });
            it("off-centered circle and inclined line", () => {
                const result = Math2D.intersectLineAndCircle(-10, 3, -13, 0, 3, -10, 0);

                expect(result).to.not.be.undefined;
                expect(result!.x1).to.be.closeTo(-10, eps);
                expect(result!.y1).to.be.closeTo(3, eps);
                expect(result!.x2).to.be.closeTo(-13, eps);
                expect(result!.y2).to.be.closeTo(0, eps);
            });
        });
    });

    describe("line-line intersection", () => {
        it("intersect a line with 45 degrees slope with a vertical line", () => {
            const p = Math2D.intersectLines(0, 0, 100, 100, 50, 50, 50, 100);
            expect(p?.x).to.be.equal(50);
            expect(p?.y).to.be.equal(50);
        });

        it("intersect a line with 45 degrees slope with a horozontal line", () => {
            const p = Math2D.intersectLines(0, 0, 100, 100, 50, 50, 100, 50);
            expect(p?.x).to.be.equal(50);
            expect(p?.y).to.be.equal(50);
        });

        it("non intersecting vertical lines", () => {
            const p = Math2D.intersectLines(0, 0, 0, 100, 50, 50, 50, 100);
            expect(p).to.be.undefined;
        });

        it("non intersecting horizontal lines", () => {
            const p = Math2D.intersectLines(0, 0, 100, 0, 50, 50, 100, 50);
            expect(p).to.be.undefined;
        });

        it("intersect a line with 45 degrees slope with a vertical line", () => {
            const p = Math2D.intersectLines(-10, -20, 30, 25, 0, 10, 20, 15);
            expect(p?.x).to.be.closeTo(21.428571428571427, 1e5);
            expect(p?.y).to.be.closeTo(15.357142857142858, 1e5);
        });
    });
});
