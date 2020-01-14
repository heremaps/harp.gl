/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import { Vector2 } from "three";
import { clipPolyline } from "../lib/GeometryClipping";

describe("OmvClippedLines", () => {
    const extents = 4 * 1024;

    const tileBounds = [
        new Vector2(0, 0),
        new Vector2(extents, 0),
        new Vector2(extents, extents),
        new Vector2(0, extents)
    ];

    it("Clips line intersecting tile edges(topleft, bottomright)", () => {
        const line = [new Vector2(-100, -100), new Vector2(extents + 100, extents + 100)];

        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(2);
        expect(clippedLine).to.not.equal(line);
        expect(clippedLine[0].x).to.equal(0);
        expect(clippedLine[0].y).to.equal(0);
        expect(clippedLine[1].x).to.equal(4096);
        expect(clippedLine[1].y).to.equal(4096);
    });

    it("Clips line intersecting tile edges(bottomleft, topright)", () => {
        const line = [new Vector2(-100, extents + 100), new Vector2(extents + 100, -100)];

        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(2);
        expect(clippedLine).to.not.equal(line);
        expect(clippedLine[0].x).to.equal(0);
        expect(clippedLine[0].y).to.equal(4096);
        expect(clippedLine[1].x).to.equal(4096);
        expect(clippedLine[1].y).to.equal(0);
    });

    it("Clips line intersecting tile", () => {
        const line = [new Vector2(-100, -50), new Vector2(extents + 100, extents + 50)];

        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(2);
        expect(clippedLine).to.not.equal(line);
        expect(clippedLine[0].x).to.equal(0);
        expect(clippedLine[0].y).to.equal(48);
        expect(clippedLine[1].x).to.equal(4096);
        expect(clippedLine[1].y).to.equal(4048);
    });

    it("Clips line with first point inside tile", () => {
        const line = [new Vector2(100, 50), new Vector2(extents + 100, extents + 50)];

        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(2);
        expect(clippedLine).to.not.equal(line);
        expect(clippedLine[0].x).to.equal(100);
        expect(clippedLine[0].y).to.equal(50);
        expect(clippedLine[1].x).to.equal(4096);
        expect(clippedLine[1].y).to.equal(4046);
    });

    it("Clips line with last point inside tile", () => {
        const line = [new Vector2(-100, -50), new Vector2(extents - 100, extents - 50)];

        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(2);
        expect(clippedLine).to.not.equal(line);
        expect(clippedLine[0].x).to.equal(0);
        expect(clippedLine[0].y).to.equal(50);
        expect(clippedLine[1].x).to.equal(3996);
        expect(clippedLine[1].y).to.equal(4046);
    });

    it("Keeps direction of line", () => {
        const line = [new Vector2(extents + 100, extents + 50), new Vector2(-100, -50)];

        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(2);
        expect(clippedLine).to.not.equal(line);
        expect(clippedLine[0].x).to.equal(4096);
        expect(clippedLine[0].y).to.equal(4048);
        expect(clippedLine[1].x).to.equal(0);
        expect(clippedLine[1].y).to.equal(48);
    });

    it("Removes line outside of tile", () => {
        const line = [new Vector2(0, -100), new Vector2(4096, -100)];
        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(0);
    });

    it("Clips polyline", () => {
        const line = [
            new Vector2(-200, -50),
            new Vector2(-100, -50),
            new Vector2(100, 100),
            new Vector2(500, 300),
            new Vector2(extents + 100, extents + 50)
        ];
        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(4);
        expect(clippedLine[0].x).to.equal(0);
        expect(clippedLine[0].y).to.equal(25);
        expect(clippedLine[1].x).to.equal(100);
        expect(clippedLine[1].y).to.equal(100);
        expect(clippedLine[2].x).to.equal(500);
        expect(clippedLine[2].y).to.equal(300);
        expect(clippedLine[3].x).to.equal(4096);
        expect(clippedLine[3].y).to.equal(4042);
    });

    it("Clips reversed polyline", () => {
        const line = [
            new Vector2(extents + 100, extents + 50),
            new Vector2(500, 300),
            new Vector2(100, 100),
            new Vector2(-100, -50),
            new Vector2(-200, -50)
        ];
        const clippedLine = clipPolyline(line, tileBounds);
        expect(clippedLine).to.have.length(4);
        expect(clippedLine[0].x).to.equal(4096);
        expect(clippedLine[0].y).to.equal(4042);
        expect(clippedLine[1].x).to.equal(500);
        expect(clippedLine[1].y).to.equal(300);
        expect(clippedLine[2].x).to.equal(100);
        expect(clippedLine[2].y).to.equal(100);
        expect(clippedLine[3].x).to.equal(0);
        expect(clippedLine[3].y).to.equal(25);
    });
});
