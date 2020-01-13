/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";

import { DecodedTile } from "@here/harp-datasource-protocol";
import { mercatorProjection, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { DataSource } from "../lib/DataSource";
import { MapView } from "../lib/MapView";
import { Tile } from "../lib/Tile";

class TileTestStubDataSource extends DataSource {
    /** @override */
    getTile(tileKey: TileKey) {
        return undefined;
    }

    /** @override */
    getTilingScheme() {
        return webMercatorTilingScheme;
    }
}

describe("Tile", function() {
    const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
    const stubDataSource = new TileTestStubDataSource("test-data-source");
    const mapView = { projection: mercatorProjection };
    stubDataSource.attach(mapView as MapView);

    it("set empty decoded tile forces hasGeometry to be true", function() {
        const tile = new Tile(stubDataSource, tileKey);
        const decodedTile: DecodedTile = {
            techniques: [],
            geometries: []
        };
        tile.decodedTile = decodedTile;
        assert(tile.hasGeometry);
        expect(tile.decodedTile).to.be.equal(decodedTile);
    });
    it("set decoded tile with text only forces hasGeometry to be true", function() {
        const tile = new Tile(stubDataSource, tileKey);
        const decodedTile: DecodedTile = {
            techniques: [],
            geometries: [],
            textGeometries: [
                {
                    positions: {
                        name: "positions",
                        buffer: new Float32Array(),
                        type: "float",
                        itemCount: 1000
                    },
                    texts: new Array<number>(1000)
                }
            ]
        };
        tile.decodedTile = decodedTile;
        assert(tile.hasGeometry);
        expect(tile.decodedTile).to.be.equal(decodedTile);
    });
});
