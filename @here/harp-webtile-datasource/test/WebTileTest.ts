/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { CopyrightInfo, MapView, Tile } from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { LoggerManager } from "@here/harp-utils";
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
        await tile.load();
        expect(fakeWebTileProvider.getTexture.calledOnceWith(tile));
        expect(tile.hasGeometry).to.be.true;
    });

    it("# creates Tile with geometry for resolve with undefined", async function() {
        const undefinedProvider = {
            getTexture: sinon.spy((tile: Tile) => {
                return Promise.resolve(undefined);
            })
        };
        const webTileDataSource = new WebTileDataSource({
            dataProvider: undefinedProvider
        });
        sinon.stub(webTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = webTileDataSource.getTile(tileKey);
        await tile.load();
        expect(fakeWebTileProvider.getTexture.calledOnceWith(tile));
        expect(tile.hasGeometry).to.be.true;
    });

    it("# disposed tile for rejected Promise", async function() {
        const logger = LoggerManager.instance.getLogger("BaseTileLoader");
        let loggerWasEnabled = false;

        if (logger) {
            loggerWasEnabled = logger.enabled;
            logger.enabled = false;
        }

        const noTextureProvider = {
            getTexture: sinon.spy((tile: Tile) => {
                return Promise.reject();
            })
        };
        const webTileDataSource = new WebTileDataSource({
            dataProvider: noTextureProvider
        });
        sinon.stub(webTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = webTileDataSource.getTile(tileKey);
        await tile.load();
        expect(fakeWebTileProvider.getTexture.calledOnceWith(tile));
        expect(tile.disposed).to.be.true;

        LoggerManager.instance.enable("BaseTileLoader", loggerWasEnabled);
    });

    it("#createWebTileDataSource with renderingOptions opacity", async function() {
        const webTileDataSource = new WebTileDataSource({
            dataProvider: fakeWebTileProvider,
            renderingOptions: { opacity: 0.5 }
        });
        sinon.stub(webTileDataSource, "mapView").get(() => {
            return fakeMapView;
        });

        const creatorSpy = sinon.spy(TileGeometryCreator.instance, "addGroundPlane");

        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tile = webTileDataSource.getTile(tileKey);
        await tile.load();
        expect(fakeWebTileProvider.getTexture.calledOnceWith(tile));
        expect(creatorSpy.called).to.be.true;
        expect((creatorSpy.args[0][2] as THREE.MeshBasicMaterial).opacity).to.equal(0.5);
    });
});
