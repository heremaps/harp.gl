/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { CopyrightInfo, MapView, Tile } from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { expect } from "chai";
import * as sinon from "sinon";

import { WebTileDataSource } from "../index";

describe("WebTileDataSource", function() {
    const fakeWebTileProvider = {
        getTexture: sinon.spy((tile: Tile) => {
            return Promise.resolve(([{}, []] as unknown) as [THREE.Texture, CopyrightInfo[]]);
        })
    };

    const fakeMapView = {
        projection: mercatorProjection
    } as MapView;

    it("#createWebTileDataSource has default values", async function() {
        const webTileDataSource = new WebTileDataSource({
            dataProvider: fakeWebTileProvider
        });

        expect(webTileDataSource.maxDataLevel).to.equal(20);
        expect(webTileDataSource.minDataLevel).to.equal(1);
        expect(webTileDataSource.maxDisplayLevel).to.equal(20);
        expect(webTileDataSource.minDisplayLevel).to.equal(1);
        expect(webTileDataSource.resolution).to.equal(
            WebTileDataSource.resolutionValue.resolution512
        );
    });

    it("#createWebTileDataSource with 256px resolution", async function() {
        const webTileDataSource = new WebTileDataSource({
            dataProvider: fakeWebTileProvider,
            resolution: WebTileDataSource.resolutionValue.resolution256
        });
        expect(webTileDataSource.resolution).to.equal(
            WebTileDataSource.resolutionValue.resolution256
        );
    });

    it("#gets Texture for requested Tile", async function() {
        const webTileDataSource = new WebTileDataSource({
            dataProvider: fakeWebTileProvider
        });
        sinon.stub(webTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = webTileDataSource.getTile(tileKey);
        expect(fakeWebTileProvider.getTexture.calledOnceWith(tile));
    });

    it("#createWebTileDataSource with renderingOptions opacity", async function() {
        const webTileDataSource = new WebTileDataSource({
            dataProvider: fakeWebTileProvider,
            renderingOptions: { opacity: 0.5 }
        });
        sinon.stub(webTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const creatorSpy = sinon.spy(TileGeometryCreator.instance, "createGroundPlane");

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = await webTileDataSource.getTile(tileKey);
        expect(fakeWebTileProvider.getTexture.calledOnceWith(tile));
        expect(creatorSpy.called).to.be.true;
        expect((creatorSpy.args[0][1] as THREE.MeshBasicMaterial).opacity).to.equal(0.5);
    });
});
