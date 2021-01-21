/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import earcut from "earcut";
import { ShapeUtils, Vector2 } from "three";

import { clipPolygon } from "../lib/ClipPolygon";

describe("ClipPolygon", () => {
    const extents = 4 * 1024;

    const tileBounds = [
        new Vector2(0, 0),
        new Vector2(extents, 0),
        new Vector2(extents, extents),
        new Vector2(0, extents),
        new Vector2(0, 0)
    ];

    it("Full quad convering the tile (outer ring)", () => {
        const polygon = [...tileBounds];
        const clippedPolygon = clipPolygon(polygon, extents);
        const expectedPolygon = [
            { x: 0, y: 0 },
            { x: 4096, y: 0 },
            { x: 4096, y: 4096 },
            { x: 0, y: 4096 },
            { x: 0, y: 0 }
        ];
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(polygon));
        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Full quad convering the tile (inter ring)", () => {
        const polygon = [...tileBounds].reverse();
        const clippedPolygon = clipPolygon(polygon, extents);
        const expectedPolygon = [
            { x: 0, y: 0 },
            { x: 0, y: 4096 },
            { x: 4096, y: 4096 },
            { x: 4096, y: 0 },
            { x: 0, y: 0 }
        ];
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(polygon));
        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Full quad with margin (outer ring)", () => {
        const polygon = [
            new Vector2(-20, -20),
            new Vector2(extents + 20, -20),
            new Vector2(extents + 20, extents + 20),
            new Vector2(-20, extents + 20),
            new Vector2(-20, -20)
        ];
        const expectedPolygon = [
            { x: 0, y: 0, isClipped: true },
            { x: 4096, y: 0, isClipped: true },
            { x: 4096, y: 4096, isClipped: true },
            { x: 0, y: 4096, isClipped: true }
        ];
        const clippedPolygon = clipPolygon(polygon, extents);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), ShapeUtils.area(tileBounds));
        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Full quad with margin (inner ring)", () => {
        const polygon = [
            new Vector2(-20, -20),
            new Vector2(extents + 20, -20),
            new Vector2(extents + 20, extents + 20),
            new Vector2(-20, extents + 20),
            new Vector2(-20, -20)
        ].reverse();
        const expectedPolygon = [
            { x: 0, y: 4096, isClipped: true },
            { x: 4096, y: 4096, isClipped: true },
            { x: 4096, y: 0, isClipped: true },
            { x: 0, y: 0, isClipped: true }
        ];
        const clippedPolygon = clipPolygon(polygon, extents);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(ShapeUtils.isClockWise(clippedPolygon), ShapeUtils.isClockWise(polygon));
        assert.strictEqual(ShapeUtils.area(clippedPolygon), -ShapeUtils.area(tileBounds));
        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    // a big triangle covering the entire tile bounds
    // should result to a full quad polygon.
    it("Big triangle (outer ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-extents * 10, -extents * 10),
            new Vector2(extents * 10, -extents * 10),
            new Vector2(extents * 4, extents * 10)
        ];

        const clippedPolygon = clipPolygon(polygon, extents);

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

        const clippedPolygon = clipPolygon(polygon, extents);
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
            new Vector2(-1000, 1000),
            new Vector2(-1000, 0)
        ];

        // the result of clipping the polygon touching the boundary
        // of one tile is one line.
        const expectedPolygon = [
            { x: 0, y: 0, isClipped: true }, // a vertex introduced during clipping
            { x: 0, y: 0 }, // proper vertex, it was a vertex in the original geometry
            { x: 0, y: 1000 }, // proper vertex, it was a vertex in the original geometry
            { x: 0, y: 1000, isClipped: true } // a vertex introduced during clipping
        ];

        const clippedPolygon = clipPolygon(polygon, extents);

        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Non overlapping adjacent polygon (inner ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(0, 0),
            new Vector2(0, 1000),
            new Vector2(-1000, 1000),
            new Vector2(-1000, 0)
        ].reverse();

        // the result of clipping the polygon touching the boundary
        // of one tile is one line.
        const expectedPolygon = [
            { x: 0, y: 1000, isClipped: true }, // a vertex introduced during clipping
            { x: 0, y: 1000 }, // proper vertex, it was a vertex in the original geometry
            { x: 0, y: 0 }, // proper vertex, it was a vertex in the original geometry
            { x: 0, y: 0, isClipped: true } // a vertex introduced during clippings
        ];

        const clippedPolygon = clipPolygon(polygon, extents);

        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Overlapping adjacent polygon (outer ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(20, 0),
            new Vector2(20, 1000),
            new Vector2(-1000, 1000),
            new Vector2(-1000, 0)
        ];

        const expectedPolygon = [
            { x: 0, y: 0, isClipped: true },
            { x: 20, y: 0 },
            { x: 20, y: 1000 },
            { x: 0, y: 1000, isClipped: true }
        ];

        const clippedPolygon = clipPolygon(polygon, extents);
        assert.notStrictEqual(clippedPolygon, polygon);
        assert.strictEqual(clippedPolygon.length, 4);
        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Overlapping adjacent polygon (inner ring)", () => {
        const polygon: Vector2[] = [
            new Vector2(-1000, 0),
            new Vector2(20, 0),
            new Vector2(20, 1000),
            new Vector2(-1000, 1000)
        ].reverse();

        const clippedPolygon = clipPolygon(polygon, extents);
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

        const expectedPolygon = [
            { x: 0, y: 0, isClipped: true },
            { x: 419, y: 0, isClipped: true },
            { x: 412, y: 92 },
            { x: 102, y: 0, isClipped: true },
            { x: 30, y: 0, isClipped: true },
            { x: 94, y: 908 },
            { x: 6, y: 894 },
            { x: 8, y: 961 },
            { x: 8, y: 952 },
            { x: 6, y: 1026 },
            { x: 312, y: 1170 },
            { x: 1286, y: 1440 },
            { x: 1220, y: 2124 },
            { x: 1204, y: 2252 },
            { x: 1118, y: 2680 },
            { x: 1092, y: 2866 },
            { x: 4096, y: 3356, isClipped: true },
            { x: 4096, y: 3537, isClipped: true },
            { x: 2718, y: 4096, isClipped: true },
            { x: 0, y: 4096, isClipped: true }
        ];

        assert.isTrue(polygon.some(vert => vert.x < 0));
        assert.isTrue(polygon.some(vert => vert.x > extents));
        assert.isTrue(polygon.some(vert => vert.y < 0));
        assert.isTrue(polygon.some(vert => vert.y > extents));

        const clippedPolygon = clipPolygon(polygon, extents);

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

        assert.strictEqual(JSON.stringify(clippedPolygon), JSON.stringify(expectedPolygon));
    });

    it("Concave polygon resulting into 2 parts after clipping", () => {
        const polygon: Vector2[] = [
            new Vector2(-100, 0),
            new Vector2(4096, 0),
            new Vector2(-50, 2048),
            new Vector2(4096, 4096),
            new Vector2(-100, 4096)
        ];

        const clippedPolygon = clipPolygon(polygon, extents);

        const expectedPolygon = clippedPolygon.reduce((points, { x, y }) => {
            points.push(x | 0, y | 0);
            return points;
        }, [] as number[]);

        assert.deepEqual(expectedPolygon, [0, 0, 4096, 0, 0, 2023, 0, 2073, 4096, 4096, 0, 4096]);

        assert.deepEqual(earcut(expectedPolygon), [0, 1, 2, 3, 4, 5]);
    });
});
