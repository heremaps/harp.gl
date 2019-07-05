/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    hereTilingScheme,
    mercatorTilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";
import { BackgroundDataSource } from "../lib/BackgroundDataSource";
import { MapView } from "../lib/MapView";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

describe("BackgroundDataSource", function() {
    describe("#getTilingScheme()", function() {
        let fakeDataSource1: FakeOmvDataSource;
        let fakeDataSource2: FakeOmvDataSource;
        let backgroundDataSource: BackgroundDataSource;
        let mapViewStub: sinon.SinonStubbedInstance<MapView>;
        const defaultTilingScheme = webMercatorTilingScheme;
        beforeEach(function() {
            fakeDataSource1 = new FakeOmvDataSource();
            fakeDataSource2 = new FakeOmvDataSource();
            sinon.replace(fakeDataSource1, "getTilingScheme", sinon.fake.returns(hereTilingScheme));
            sinon.replace(
                fakeDataSource2,
                "getTilingScheme",
                sinon.fake.returns(mercatorTilingScheme)
            );
            fakeDataSource2.storageLevelOffset = -3;
            backgroundDataSource = new BackgroundDataSource();
            mapViewStub = sinon.createStubInstance(MapView);
            sinon.stub(mapViewStub, "dataSources").get(function getterFn() {
                return [fakeDataSource1, fakeDataSource2, backgroundDataSource];
            });
            mapViewStub.removeDataSource.restore();
            backgroundDataSource.attach((mapViewStub as unknown) as MapView);
        });

        it("Returns default tiling scheme after construction", function() {
            expect(backgroundDataSource.getTilingScheme()).to.be.equal(defaultTilingScheme);
        });

        it("Returns default tiling scheme if no data source is enabled on update", function() {
            mapViewStub.isDataSourceEnabled.returns(false);
            backgroundDataSource.updateTilingScheme();
            expect(mapViewStub.clearTileCache.called);
            expect(backgroundDataSource.getTilingScheme()).to.be.equal(defaultTilingScheme);
        });

        // tslint:disable-next-line: max-line-length
        it("Returns tiling scheme of first enabled data source on update", function() {
            mapViewStub.isDataSourceEnabled.returns(true);
            mapViewStub.isDataSourceEnabled.withArgs(fakeDataSource1).returns(false);
            backgroundDataSource.updateTilingScheme();
            expect(mapViewStub.clearTileCache.called);
            expect(backgroundDataSource.getTilingScheme()).to.be.equal(
                fakeDataSource2.getTilingScheme()
            );
            expect(backgroundDataSource.storageLevelOffset).to.be.equal(
                fakeDataSource2.storageLevelOffset
            );
        });
    });
});
