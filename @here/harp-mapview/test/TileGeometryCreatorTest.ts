/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile, GeometryType } from "@here/harp-datasource-protocol";
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import {
    mercatorProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { DataSource } from "../lib/DataSource";
import { DisplacementMap } from "../lib/DisplacementMap";
import { TileGeometryCreator } from "../lib/geometry/TileGeometryCreator";
import { Tile } from "../lib/Tile";

class FakeMapView {
    private m_scene = new THREE.Scene();

    get zoomLevel(): number {
        return 0;
    }

    get viewRanges(): ViewRanges {
        return { near: 0, far: 0, minimum: 0, maximum: 0 };
    }

    get clearColor(): number {
        return 0;
    }

    get animatedExtrusionHandler() {
        return undefined;
    }

    get scene() {
        return this.m_scene;
    }
}
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

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("TileGeometryCreator", () => {
    let mockDatasource: sinon.SinonStubbedInstance<MockDataSource>;
    let newTile: Tile;
    const tgc = TileGeometryCreator.instance;
    const mapView = new FakeMapView();

    before(function() {
        mockDatasource = sinon.createStubInstance(MockDataSource);

        mockDatasource.getTilingScheme.callsFake(() => webMercatorTilingScheme);
        sinon.stub(mockDatasource, "projection").get(() => mercatorProjection);
        sinon.stub(mockDatasource, "mapView").get(() => mapView);
        newTile = new Tile(
            (mockDatasource as unknown) as DataSource,
            TileKey.fromRowColumnLevel(0, 0, 0)
        );
    });

    it("add label blocking elements", () => {
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

    it("terrain tile gets tile displacement map as user data", () => {
        const decodedDisplacementMap: DisplacementMap = {
            xCountVertices: 2,
            yCountVertices: 3,
            buffer: new Float32Array()
        };
        const decodedTile: DecodedTile = {
            geometries: [
                {
                    type: GeometryType.Polygon,
                    vertexAttributes: [],
                    groups: [{ start: 0, count: 1, technique: 0, createdOffsets: [] }],
                    objInfos: [decodedDisplacementMap]
                }
            ],
            techniques: [{ name: "terrain", renderOrder: 0 }]
        };
        tgc.createObjects(newTile, decodedTile);
        assert.equal(newTile.objects.length, 1);
        const userData = newTile.objects[0].userData;
        expect(userData).to.be.an("object");

        expect(userData).to.have.property("displacementMap");
        assert.strictEqual(userData.displacementMap, decodedDisplacementMap);

        expect(userData).to.have.property("texture");
        expect(userData.texture).to.be.an.instanceOf(THREE.DataTexture);
        const imageData: ImageData = (userData.texture as THREE.DataTexture).image;
        assert.equal(imageData.width, decodedDisplacementMap.xCountVertices);
        assert.equal(imageData.height, decodedDisplacementMap.yCountVertices);
    });
});
