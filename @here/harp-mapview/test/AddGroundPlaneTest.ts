/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    mercatorProjection,
    sphereProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { DataSource } from "../lib/DataSource";
import { addGroundPlane } from "../lib/geometry/AddGroundPlane";
import { LodMesh } from "../lib/geometry/LodMesh";
import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { MapView } from "../lib/MapView";
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

describe("addGroundPlaneTest", function () {
    let tile: Tile;
    let mapView: MapView;
    let mockDataSource: sinon.SinonStubbedInstance<MockDataSource>;

    before(() => {
        mockDataSource = sinon.createStubInstance(MockDataSource);
        mockDataSource.getTilingScheme.callsFake(() => webMercatorTilingScheme);
    });

    beforeEach(() => {
        mapView = ({
            clearColor: 0,
            shadowsEnabled: false,
            enableMixedLod: false
        } as any) as MapView;

        sinon.stub(mockDataSource, "mapView").get(() => {
            return mapView;
        });
        tile = new Tile((mockDataSource as any) as DataSource, new TileKey(0, 0, 2));
    });

    function getPlaneMesh(tile: Tile): THREE.Mesh {
        assert.equal(tile.objects.length, 1);
        const object = tile.objects[0];
        assert.instanceOf(object, THREE.Mesh);
        return object as THREE.Mesh;
    }

    describe("mercator", () => {
        before(() => {
            sinon.stub(mockDataSource, "projection").get(() => mercatorProjection);
        });

        it("background geometry is registered as non-pickable", () => {
            addGroundPlane(tile, 0);
            const adapter = MapObjectAdapter.get(getPlaneMesh(tile));
            expect(adapter).not.equals(undefined);
            expect(adapter!.isPickable()).to.equal(false);
        });

        it("plane mesh properties are correctly set", () => {
            const renderOrder = 42;
            const receiveShadow = true;
            addGroundPlane(tile, renderOrder, 0, 1, false, receiveShadow);

            const mesh = getPlaneMesh(tile);
            expect(mesh.receiveShadow).equals(receiveShadow);
            expect(mesh.renderOrder).equals(renderOrder);
        });

        it("uses color for default material", () => {
            const color = 42;
            addGroundPlane(tile, 0, color);

            const mesh = getPlaneMesh(tile);
            expect(mesh.material).exist.and.has.property("color");
            expect(((mesh.material as any).color as THREE.Color).getHex()).equals(color);
        });

        it("creates uv coordinates if requested", () => {
            addGroundPlane(tile, 0, 0, 1, true);

            const mesh = getPlaneMesh(tile);
            expect(mesh.geometry).exist.and.is.instanceOf(THREE.BufferGeometry);
            const geometry = mesh.geometry as THREE.BufferGeometry;
            expect(geometry.hasAttribute("uv")).to.be.true;
        });

        it("creates normals if plane must receive shadow", () => {
            addGroundPlane(tile, 0, 0, 1, false, true);

            const mesh = getPlaneMesh(tile);
            expect(mesh.geometry).exist.and.is.instanceOf(THREE.BufferGeometry);
            const geometry = mesh.geometry as THREE.BufferGeometry;
            expect(geometry.hasAttribute("normal")).to.be.true;
        });
    });

    describe("sphere", () => {
        before(() => {
            sinon.stub(mockDataSource, "projection").get(() => sphereProjection);
        });

        it("subdivides geometry", () => {
            addGroundPlane(tile, 0, 0, 1, false, false, false);

            const mesh = getPlaneMesh(tile);
            expect(mesh.geometry).exist.and.is.instanceOf(THREE.BufferGeometry);
            const geometry = mesh.geometry as THREE.BufferGeometry;
            expect(geometry.hasAttribute("position")).to.be.true;

            const posAttr = geometry.getAttribute("position");
            expect(posAttr.array.length).to.be.greaterThan(4);
        });

        it("creates mesh with mutiple LOD if requested", () => {
            addGroundPlane(tile, 0, 0, 1, false, false, true);

            const mesh = getPlaneMesh(tile);
            expect(mesh).to.be.instanceOf(LodMesh);
        });
    });
});
