/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    EarthConstants,
    MercatorConstants,
    mercatorProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { DataSource } from "../lib/DataSource";
import { projectTilePlaneCorners } from "../lib/geometry/ProjectTilePlaneCorners";
import { Tile } from "../lib/Tile";

class MockDataSource extends DataSource {
    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        return undefined;
    }
}

describe("projectTilePlaneCorners", function () {
    it("generates tile corners ", () => {
        const mockDatasource = sinon.createStubInstance(MockDataSource);
        mockDatasource.getTilingScheme.callsFake(() => webMercatorTilingScheme);
        sinon.stub(mockDatasource, "projection").get(() => {
            return mercatorProjection;
        });
        const newTile = new Tile(
            (mockDatasource as unknown) as DataSource,
            TileKey.fromRowColumnLevel(0, 0, 0)
        );

        const delta = 0.0000000000001;
        const corners = projectTilePlaneCorners(newTile, mercatorProjection);

        //SOUTH WEST
        assert.equal(corners.sw.x, 0);
        assert.equal(corners.sw.y, 6.673830935484984e-9);
        assert.equal(corners.sw.z, 0);

        const southWestGeo = mercatorProjection.unprojectPoint(corners.sw);
        assert.equal(
            southWestGeo.latitude,
            -THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE)
        );
        assert.equal(southWestGeo.longitude, -180);
        assert.equal(southWestGeo.altitude, 0);

        //SOUTH EAST
        assert.closeTo(corners.se.x, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.equal(corners.se.y, 6.673830935484984e-9);
        assert.equal(corners.se.z, 0);

        const southEastGeo = mercatorProjection.unprojectPoint(corners.se);
        assert.equal(
            southEastGeo.latitude,
            -THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE)
        );
        assert.equal(southEastGeo.longitude, 180);
        assert.equal(southEastGeo.altitude, 0);

        //NORTH EAST
        assert.closeTo(corners.ne.x, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.closeTo(corners.ne.y, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.equal(corners.ne.z, 0);

        const northEastGeo = mercatorProjection.unprojectPoint(corners.ne);
        assert.closeTo(
            northEastGeo.latitude,
            THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE),
            0.0000000000001
        );
        assert.equal(northEastGeo.longitude, 180);
        assert.equal(northEastGeo.altitude, 0);

        //NORTH WEST
        assert.equal(corners.nw.x, 0);
        assert.closeTo(corners.nw.y, EarthConstants.EQUATORIAL_CIRCUMFERENCE, delta);
        assert.equal(corners.nw.z, 0);

        const northWestGeo = mercatorProjection.unprojectPoint(corners.nw);
        assert.closeTo(
            northWestGeo.latitude,
            THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE),
            delta
        );
        assert.equal(northWestGeo.longitude, -180);
        assert.equal(northWestGeo.altitude, 0);
    });
});
