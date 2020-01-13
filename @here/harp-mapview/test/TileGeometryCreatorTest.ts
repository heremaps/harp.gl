/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    mercatorProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { DataSource } from "../lib/DataSource";
import { TileGeometryCreator } from "../lib/geometry/TileGeometryCreator";
import { Tile } from "../lib/Tile";

class MockDataSource extends DataSource {
    /** @override */
    getTilingScheme(): TilingScheme {
        throw new Error("Method not implemented.");
    }
    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        throw new Error("Method not implemented.");
    }
}

describe("TileGeometryCreator", () => {
    it("add label blocking elements", () => {
        const mockDatasource = sinon.createStubInstance(MockDataSource);

        mockDatasource.getTilingScheme.callsFake(() => webMercatorTilingScheme);
        sinon.stub(mockDatasource, "projection").get(() => mercatorProjection);

        const tgc = TileGeometryCreator.instance;
        const newTile = new Tile(
            (mockDatasource as unknown) as DataSource,
            TileKey.fromRowColumnLevel(0, 0, 0)
        );

        const decodedTile: DecodedTile = {
            pathGeometries: [{ path: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(2, 2, 2)] }],
            geometries: [],
            techniques: []
        };
        tgc.createLabelRejectionElements(newTile, decodedTile);
        // There should one line with two points.
        assert.equal(newTile.blockingElements.length, 1);
        assert.equal(newTile.blockingElements[0].points.length, 2);
    });
});
