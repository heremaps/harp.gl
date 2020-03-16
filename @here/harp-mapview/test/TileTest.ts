/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";

import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    mercatorProjection,
    OrientedBox3,
    TileKey,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import * as THREE from "three";
import { DataSource } from "../lib/DataSource";
import { MapView } from "../lib/MapView";
import { TextElement } from "../lib/text/TextElement";
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

function createFakeTextElement(): TextElement {
    const priority = 0;
    return new TextElement("fake", new THREE.Vector3(), {}, {}, priority);
}
describe("Tile", function() {
    const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
    const stubDataSource = new TileTestStubDataSource({ name: "test-data-source" });
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
    it("addTextElement to changed tile does not recreate text group", function() {
        const tile = new Tile(stubDataSource, tileKey);
        tile.addTextElement(createFakeTextElement());

        const oldGroup = tile.textElementGroups.groups.values().next().value;
        expect(oldGroup.elements).to.have.lengthOf(1);

        tile.addTextElement(createFakeTextElement());
        const newGroup = tile.textElementGroups.groups.values().next().value;
        expect(newGroup.elements).to.have.lengthOf(2);
        expect(newGroup).to.equal(oldGroup);
    });

    it("addTextElement to unchanged tile recreates text group", function() {
        const tile = new Tile(stubDataSource, tileKey);
        tile.addTextElement(createFakeTextElement());
        tile.textElementsChanged = false;

        const oldGroup = tile.textElementGroups.groups.values().next().value;
        expect(oldGroup.elements).to.have.lengthOf(1);

        tile.addTextElement(createFakeTextElement());
        const newGroup = tile.textElementGroups.groups.values().next().value;
        expect(newGroup.elements).to.have.lengthOf(2);
        expect(newGroup).to.not.equal(oldGroup);
        assert.isTrue(tile.textElementsChanged);
    });

    it("removeTextElement from changed tile does not recreate text group", function() {
        const tile = new Tile(stubDataSource, tileKey);
        tile.addTextElement(createFakeTextElement());
        const textElement = createFakeTextElement();
        tile.addTextElement(textElement);

        const oldGroup = tile.textElementGroups.groups.values().next().value;
        expect(oldGroup.elements).to.have.lengthOf(2);

        const result = tile.removeTextElement(textElement);
        assert.isTrue(result);

        const newGroup = tile.textElementGroups.groups.values().next().value;
        expect(newGroup.elements).to.have.lengthOf(1);
        expect(newGroup).to.equal(oldGroup);
    });

    it("removeTextElement from unchanged tile recreates text group", function() {
        const tile = new Tile(stubDataSource, tileKey);
        tile.addTextElement(createFakeTextElement());
        const textElement = createFakeTextElement();
        tile.addTextElement(textElement);
        tile.textElementsChanged = false;

        const oldGroup = tile.textElementGroups.groups.values().next().value;
        const result = tile.removeTextElement(textElement);
        assert.isTrue(result);

        const newGroup = tile.textElementGroups.groups.values().next().value;
        expect(newGroup.elements).to.have.lengthOf(1);
        expect(newGroup).to.not.equal(oldGroup);
        assert.isTrue(tile.textElementsChanged);
    });

    it("clearTextElements from empty tile does nothing", function() {
        const tile = new Tile(stubDataSource, tileKey);
        assert.isFalse(tile.textElementsChanged);

        tile.clearTextElements();
        assert.isFalse(tile.textElementsChanged);

        const textElement = createFakeTextElement();
        tile.addTextElement(textElement);
        tile.removeTextElement(textElement);
        tile.clearTextElements();
        assert.isTrue(tile.textElementsChanged);
    });

    it("clearTextElements from non-empty tile marks it as changed", function() {
        const tile = new Tile(stubDataSource, tileKey);
        tile.addTextElement(createFakeTextElement());
        expect(tile.textElementGroups.count()).to.equal(1);
        tile.textElementsChanged = false;

        tile.clearTextElements();
        expect(tile.textElementGroups.count()).to.equal(0);
        assert.isTrue(tile.textElementsChanged);
    });
    it("setting skipping will cause willRender to return false", function() {
        const tile = new Tile(stubDataSource, tileKey);
        tile.skipRendering = true;
        // tslint:disable: no-unused-expression
        expect(tile.willRender(0)).is.false;
        tile.skipRendering = false;
        expect(tile.willRender(0)).is.true;
    });

    it("default tile min/max elevation and max geometry height are 0", function() {
        const tile = new Tile(stubDataSource, tileKey);
        expect(tile.minElevation).equals(0);
        expect(tile.maxElevation).equals(0);
        expect(tile.maxGeometryHeight).equals(0);
    });

    it("setElevation does not update bounding box if maxGeometryHeight is not set", function() {
        const tile = new Tile(stubDataSource, tileKey);
        const oldGeoBox = tile.geoBox.clone();
        const oldBBox = tile.boundingBox.clone();
        const minElevation = 5;
        const maxElevation = 10;

        tile.setElevation(minElevation, maxElevation);

        expect(tile.minElevation).equals(minElevation);
        expect(tile.maxElevation).equals(maxElevation);
        expect(tile.geoBox).deep.equals(oldGeoBox);
        expect(tile.boundingBox).deep.equals(oldBBox);
    });

    it("setElevation updates bounding box if maxGeometryHeight is set", function() {
        const tile = new Tile(stubDataSource, tileKey);
        const minElevation = 30;
        const maxElevation = 50;
        const maxGeometryHeight = 100;
        const expectedGeoBox = tile.geoBox.clone();
        expectedGeoBox.southWest.altitude = minElevation;
        expectedGeoBox.northEast.altitude = maxElevation + maxGeometryHeight;
        const expectedBBox = new OrientedBox3();
        stubDataSource.mapView.projection.projectBox(expectedGeoBox, expectedBBox);

        tile.maxGeometryHeight = maxGeometryHeight;
        tile.setElevation(minElevation, maxElevation);

        expect(tile.minElevation).equals(minElevation);
        expect(tile.maxElevation).equals(maxElevation);
        expect(tile.geoBox).deep.equals(expectedGeoBox);
        expect(tile.boundingBox).deep.equals(expectedBBox);
    });

    it("maxGeometryHeight setter does not update bounding box if elevation is not set", function() {
        const tile = new Tile(stubDataSource, tileKey);
        const oldGeoBox = tile.geoBox.clone();
        const oldBBox = tile.boundingBox.clone();

        const maxGeometryHeight = 10;

        tile.maxGeometryHeight = maxGeometryHeight;
        expect(tile.maxGeometryHeight).equals(maxGeometryHeight);
        expect(tile.geoBox).deep.equals(oldGeoBox);
        expect(tile.boundingBox).deep.equals(oldBBox);
    });

    it("maxGeometryHeight setter updates bounding box if elevation is set", function() {
        const tile = new Tile(stubDataSource, tileKey);
        const maxGeometryHeight = 100;
        const minElevation = 1;
        const maxElevation = 5;
        const expectedGeoBox = tile.geoBox.clone();
        expectedGeoBox.southWest.altitude = minElevation;
        expectedGeoBox.northEast.altitude = maxElevation + maxGeometryHeight;
        const expectedBBox = new OrientedBox3();
        stubDataSource.mapView.projection.projectBox(expectedGeoBox, expectedBBox);

        tile.setElevation(minElevation, maxElevation);
        tile.maxGeometryHeight = maxGeometryHeight;

        expect(tile.maxGeometryHeight).equals(maxGeometryHeight);
        expect(tile.geoBox).deep.equals(expectedGeoBox);
        expect(tile.boundingBox).deep.equals(expectedBBox);
    });
});
