/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { GeoBox } from "../lib/coordinates/GeoBox";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { webMercatorProjection } from "../lib/projection/WebMercatorProjection";
import { TileKey } from "../lib/tiling/TileKey";
import { TileKeyUtils } from "../lib/tiling/TileKeyUtils";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

describe("TileKey", () => {
    it("toHereTile", () => {
        assert.strictEqual(TileKey.fromRowColumnLevel(0, 0, 0).toHereTile(), "1");
        assert.strictEqual(TileKey.fromRowColumnLevel(1, 1, 1).toHereTile(), "7");
        assert.strictEqual(TileKey.fromRowColumnLevel(3, 5, 3).toHereTile(), "91");
        assert.strictEqual(TileKey.fromRowColumnLevel(25920, 35136, 16).toHereTile(), "6046298112");
    });

    it("fromHereTile", () => {
        assert.isTrue(TileKey.fromHereTile("1").equals(TileKey.fromRowColumnLevel(0, 0, 0)));
        assert.isTrue(TileKey.fromHereTile("7").equals(TileKey.fromRowColumnLevel(1, 1, 1)));
        assert.isTrue(TileKey.fromHereTile("91").equals(TileKey.fromRowColumnLevel(3, 5, 3)));
        assert.isTrue(
            TileKey.fromHereTile("6046298112").equals(TileKey.fromRowColumnLevel(25920, 35136, 16))
        );
    });

    it("fromHereTileCached", () => {
        const tileKey = TileKey.fromHereTile("377894432");
        assert.strictEqual(tileKey.toHereTile(), "377894432");
        assert.strictEqual(tileKey.mortonCode(), 377894432);
    });

    it("largeNumberDivision", () => {
        // make sure that dividing by a large number by 2 actually produces correct results
        let x = Math.pow(2, 52);
        for (let i = 51; i > 0; --i) {
            x /= 2;
            assert.strictEqual(x, Math.pow(2, i), `power of ${i}`);
        }
    });

    it("getSubHereTile", () => {
        assert.strictEqual("4", TileKey.fromRowColumnLevel(2, 2, 2).getSubHereTile(1));
        assert.strictEqual("5", TileKey.fromRowColumnLevel(2, 3, 2).getSubHereTile(1));
        assert.strictEqual("6", TileKey.fromRowColumnLevel(3, 2, 2).getSubHereTile(1));
        assert.strictEqual("7", TileKey.fromRowColumnLevel(3, 3, 2).getSubHereTile(1));
    });

    it("addedSubHereTile", () => {
        assert.isTrue(
            TileKey.fromRowColumnLevel(1, 1, 1)
                .addedSubHereTile("1")
                .equals(TileKey.fromRowColumnLevel(1, 1, 1))
        );

        assert.isTrue(
            TileKey.fromRowColumnLevel(1, 1, 1)
                .addedSubHereTile("4")
                .equals(TileKey.fromRowColumnLevel(2, 2, 2))
        );
        assert.isTrue(
            TileKey.fromRowColumnLevel(1, 1, 1)
                .addedSubHereTile("5")
                .equals(TileKey.fromRowColumnLevel(2, 3, 2))
        );
        assert.isTrue(
            TileKey.fromRowColumnLevel(1, 1, 1)
                .addedSubHereTile("6")
                .equals(TileKey.fromRowColumnLevel(3, 2, 2))
        );
        assert.isTrue(
            TileKey.fromRowColumnLevel(1, 1, 1)
                .addedSubHereTile("7")
                .equals(TileKey.fromRowColumnLevel(3, 3, 2))
        );
    });
});

describe("WebMercator", () => {
    it("getTileKey", () => {
        const coords = new GeoCoordinates(52.504951, 13.371806);

        const tileKey = webMercatorTilingScheme.getTileKey(coords, 14) as TileKey;
        assert.isNotNull(tileKey);
        assert.strictEqual(tileKey.row, 5374);
        assert.strictEqual(tileKey.column, 8800);
    });

    it("project", () => {
        const coords = new GeoCoordinates(52.504951, 13.371806);
        const projected = webMercatorProjection.projectPoint(coords);
        const unprojected = webMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, 0.0001);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, 0.0001);
    });

    it("projectBox", () => {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const box = webMercatorTilingScheme.getGeoBox(tileKey);
        const projectedBox = webMercatorProjection.projectBox(box);
        const unprojectedBox = webMercatorProjection.unprojectBox(projectedBox);

        assert.approximately(
            box.southWest.latitudeInRadians,
            unprojectedBox.southWest.latitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.southWest.longitudeInRadians,
            unprojectedBox.southWest.longitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.northEast.latitudeInRadians,
            unprojectedBox.northEast.latitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.northEast.longitudeInRadians,
            unprojectedBox.northEast.longitudeInRadians,
            0.0001
        );
    });

    it("geoRect", () => {
        const northParis = new GeoCoordinates(49.097766, 2.333063);
        const prague = new GeoCoordinates(50.092733, 14.41723);

        const geoRect = new GeoBox(northParis, prague);
        const tileKeys = TileKeyUtils.geoRectangleToTileKeys(webMercatorTilingScheme, geoRect, 6);

        assert.strictEqual(tileKeys.length, 3);
        assert.deepEqual(tileKeys.map(tileKey => parseInt(tileKey.toQuadKey(), 10)).sort(), [
            120202,
            120203,
            120212
        ]);
    });

    it("geoBox", () => {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const rect = webMercatorTilingScheme.getGeoBox(tileKey);
        assert.isTrue(rect.southWest.latitudeInRadians < rect.northEast.latitudeInRadians);
        assert.isTrue(rect.southWest.longitudeInRadians < rect.northEast.longitudeInRadians);
    });
});

describe("TileKeyUtils", () => {
    it("geoRectangleToTileKeys", () => {
        const geoBox = new GeoBox(
            new GeoCoordinates(52.5163, 13.3777), // Brandenburg gate
            new GeoCoordinates(52.5309, 13.385) // HERE office
        );
        const expectedResult = [371506848, 371506849, 371506850, 371506851];

        const result = TileKeyUtils.geoRectangleToTileKeys(webMercatorTilingScheme, geoBox, 14);
        assert.sameMembers(result.map(tk => tk.mortonCode()), expectedResult);
    });
});
