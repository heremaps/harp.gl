/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { ShapeUtils, Vector2 } from "three";
import { clipPolygon } from "../lib/ClipPolygon";

describe("ClipPolygon", () => {
    const extents = 4 * 1024;

    const tileBounds = [
        new Vector2(0, 0),
        new Vector2(extents, 0),
        new Vector2(extents, extents),
        new Vector2(0, extents)
    ];

    it("Full quad convering the tile (outer ring)", () => {
        const polygon = [...tileBounds];
        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(polygon));
    });

    it("Full quad convering the tile (inter ring)", () => {
        const polygon = [...tileBounds].reverse();
        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(polygon));
    });

    it("Full quad with margin (outer ring)", () => {
        const polygon = [
            new Vector2(-20, -20),
            new Vector2(extents + 20, -20),
            new Vector2(extents + 20, extents + 20),
            new Vector2(-20, extents + 20)
        ];
        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(tileBounds));
    });

    it("Full quad with margin (inner ring)", () => {
        const polygon = [
            new Vector2(-20, -20),
            new Vector2(extents + 20, -20),
            new Vector2(extents + 20, extents + 20),
            new Vector2(-20, extents + 20)
        ].reverse();
        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), -ShapeUtils.area(tileBounds));
    });

    // a big triangle covering the entire tile bounds
    // should result to a full quad polygon.
    it("Big triangle (outer ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-extents * 10, -extents * 10),
            new Vector2(extents * 10, -extents * 10),
            new Vector2(extents * 4, extents * 10)
        ];

        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 4);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(tileBounds));
    });

    it("Big triangle (inner ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-extents * 10, -extents * 10),
            new Vector2(extents * 10, -extents * 10),
            new Vector2(extents * 4, extents * 10)
        ].reverse();

        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 4);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), -ShapeUtils.area(tileBounds));
    });

    it("Non overlapping adjacent polygon (outer ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(0, 0),
            new Vector2(0, 1000),
            new Vector2(-1000, 1000)
        ];

        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 0);
    });

    it("Non overlapping adjacent polygon (inner ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(0, 0),
            new Vector2(0, 1000),
            new Vector2(-1000, 1000)
        ].reverse();

        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 0);
    });

    it("Overlapping adjacent polygon (outer ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(20, 0),
            new Vector2(20, 1000),
            new Vector2(-1000, 1000)
        ];

        const expectedClippedPolygon: Vector2[] = [
            new Vector2(0, 0),
            new Vector2(20, 0),
            new Vector2(20, 1000),
            new Vector2(0, 1000)
        ];

        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 4);
        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedClippedPolygon));
    });

    it("Overlapping adjacent polygon (inner ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(20, 0),
            new Vector2(20, 1000),
            new Vector2(-1000, 1000)
        ].reverse();

        const clippedPolygon = clipPolygon(polygon, tileBounds);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 4);
        assert.strictEqual(ShapeUtils.area(clippedPolygon), -(20 * 1000));
    });

    it("Polygon to clip", () => {
        const polygon: Vector2[] = [
            new Vector2(-33, -33),
            new Vector2(421, -33),
            new Vector2(412, 92),
            new Vector2(28, -22),
            new Vector2(94, 908),
            new Vector2(6, 894),
            new Vector2(8, 961),
            new Vector2(8, 952),
            new Vector2(6, 1026),
            new Vector2(312, 1170),
            new Vector2(1286, 1440),
            new Vector2(1220, 2124),
            new Vector2(1204, 2252),
            new Vector2(1118, 2680),
            new Vector2(1092, 2866),
            new Vector2(4414, 3408),
            new Vector2(911, 4829),
            new Vector2(-33, 4829)
        ];

        assert.isTrue(polygon.some(vert => vert.x < 0));
        assert.isTrue(polygon.some(vert => vert.x > extents));
        assert.isTrue(polygon.some(vert => vert.y < 0));
        assert.isTrue(polygon.some(vert => vert.y > extents));

        const clippedPolygon = clipPolygon(polygon, tileBounds);

        assert.isNotEmpty(clippedPolygon);

        assert.isTrue(clippedPolygon.every(vert => vert.x >= 0));
        assert.isTrue(clippedPolygon.every(vert => vert.x <= extents));
        assert.isTrue(clippedPolygon.every(vert => vert.y >= 0));
        assert.isTrue(clippedPolygon.every(vert => vert.y <= extents));

        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));

        // collect the vertices of the subject polygon contained in the tile bounds.
        const verticesInsideTile = polygon.filter(
            p => p.x >= 0 && p.x <= extents && p.y >= 0 && p.y <= extents
        );

        assert.isNotEmpty(verticesInsideTile);

        // test that all the vertices of the subject polygon that are inside
        // the tile bounds are also valid vertices of the clipped polygon.
        verticesInsideTile.forEach(v => {
            assert.isDefined(clippedPolygon.find(p => p.equals(v)));
        });
    });
});
