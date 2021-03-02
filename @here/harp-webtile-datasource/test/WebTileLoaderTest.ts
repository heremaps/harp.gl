/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { TileKey, webMercatorProjection } from "@here/harp-geoutils";
import { CopyrightInfo, MapView, Tile, TileLoaderState } from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
import * as THREE from "three";

import { WebTileDataProvider, WebTileDataSource } from "../lib/WebTileDataSource";
import { WebTileLoader } from "../lib/WebTileLoader";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("WebTileLoader", function () {
    const tileKey: TileKey = TileKey.fromRowColumnLevel(0, 0, 0);
    const mapView = ({
        projection: webMercatorProjection
    } as any) as MapView;
    const texture = new THREE.Texture();
    const copyRightInfo: CopyrightInfo[] = [];
    const renderOrder: number = 42;
    const opacity: number = 1;
    const getTextureStub = sinon.stub();
    const dataProvider: WebTileDataProvider = { getTexture: getTextureStub } as any;
    let dataSource: WebTileDataSource;
    let tile: Tile;
    let loggerWasEnabled = true;

    before(function () {
        const logger = LoggerManager.instance.getLogger("BaseTileLoader");
        if (logger) {
            loggerWasEnabled = logger.enabled;
            logger.enabled = false;
        }
    });

    beforeEach(function () {
        dataSource = new WebTileDataSource({
            dataProvider,
            renderingOptions: {
                opacity,
                renderOrder
            }
        });
        dataSource.attach(mapView);
        tile = new Tile(dataSource, tileKey);
        getTextureStub.resolves([texture, copyRightInfo]);
    });

    after(function () {
        LoggerManager.instance.enable("BaseTileLoader", loggerWasEnabled);
    });

    describe("loadAndDecode()", function () {
        it("should load textured mesh and copyright info", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);

            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;
            expect(tileLoader.isFinished).to.be.false;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.isFinished).to.be.true;
                expect(tile.shouldDisposeTexture(texture)).to.be.true;
                expect(tile.objects).has.lengthOf(1);
                expect(tile.objects[0]).instanceOf(THREE.Mesh);
                const mesh = tile.objects[0] as THREE.Mesh;
                expect(mesh.renderOrder).equal(renderOrder);
                expect(mesh.material).has.property("map").equal(texture);
                expect(mesh.material).has.property("opacity").equal(opacity);
                expect(tile.copyrightInfo).to.equal(copyRightInfo);
            });
        });

        it("should not enforce blending if data source is fully opaque", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);

            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.isFinished).to.be.true;
                expect(tile.objects).has.lengthOf(1);
                expect(tile.objects[0]).instanceOf(THREE.Mesh);
                const mesh = tile.objects[0] as THREE.Mesh;
                expect(mesh.material).has.property("blending").that.equals(THREE.NormalBlending);
            });
        });

        it("should enable custom blending if data source is transparent", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);
            dataSource.opacity = 0.5;
            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.isFinished).to.be.true;
                expect(tile.objects).has.lengthOf(1);
                expect(tile.objects[0]).instanceOf(THREE.Mesh);
                const mesh = tile.objects[0] as THREE.Mesh;
                expect(mesh.material).has.property("blending").that.equals(THREE.CustomBlending);
            });
        });

        it("should not reload already requested tile", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);

            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            const secondLoadPromise = tileLoader.loadAndDecode();
            expect(secondLoadPromise).to.not.be.undefined;
            expect(secondLoadPromise).to.equal(loadPromise);

            return expect(loadPromise).to.eventually.be.fulfilled;
        });

        it("should forceHasGeometry on tile on empty payload", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);

            getTextureStub.resolves(undefined);
            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.isFinished).to.be.true;
                expect(tileLoader.state).to.equal(TileLoaderState.Ready);
                expect(loadPromise).to.not.be.undefined;
                expect(tile.hasGeometry).to.be.true;
                expect(tile.objects).to.be.empty;
            });
        });

        it("should forceHasGeometry on tile on empty texture", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);

            getTextureStub.resolves([undefined, []]);
            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.isFinished).to.be.true;
                expect(tileLoader.state).to.equal(TileLoaderState.Ready);
                expect(loadPromise).to.not.be.undefined;
                expect(tile.hasGeometry).to.be.true;
                expect(tile.objects).to.be.empty;
            });
        });

        it("should finish loading on retry", function () {
            getTextureStub.rejects(new Error("No connection."));
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);
            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.rejected.then(() => {
                expect(tileLoader.isFinished).to.be.true;
                expect(tileLoader.state).to.equal(TileLoaderState.Failed);

                getTextureStub.resolves([{}, []]);
                const loadPromise = tileLoader.loadAndDecode();
                expect(loadPromise).to.not.be.undefined;

                return expect(loadPromise).to.eventually.be.fulfilled;
            });
        });
    });

    describe("cancel()", function () {
        it("should cancel running requests", function () {
            const tileLoader = new WebTileLoader(dataSource, tile, dataProvider);

            const loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            tileLoader.cancel();
            expect(tileLoader.state).to.equal(TileLoaderState.Canceled);

            return expect(loadPromise).to.eventually.be.rejected;
        });
    });
});
