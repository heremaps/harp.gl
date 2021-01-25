/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { hereTilingScheme, mercatorTilingScheme } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";

import { BackgroundDataSource } from "../lib/BackgroundDataSource";
import { MapView } from "../lib/MapView";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

describe("BackgroundDataSource", function () {
    describe("#updateStorageLevelOffset()", function () {
        let fakeDataSource1: FakeOmvDataSource;
        let fakeDataSource2: FakeOmvDataSource;
        let fakeDataSource3: FakeOmvDataSource;
        let backgroundDataSource: BackgroundDataSource;
        let mapViewStub: sinon.SinonStubbedInstance<MapView>;
        beforeEach(function () {
            fakeDataSource1 = new FakeOmvDataSource({ name: "omv1" });
            fakeDataSource2 = new FakeOmvDataSource({ name: "omv2" });
            fakeDataSource3 = new FakeOmvDataSource({ name: "omv3" });
            sinon.replace(fakeDataSource1, "getTilingScheme", sinon.fake.returns(hereTilingScheme));
            sinon.replace(
                fakeDataSource2,
                "getTilingScheme",
                sinon.fake.returns(mercatorTilingScheme)
            );
            sinon.replace(
                fakeDataSource3,
                "getTilingScheme",
                sinon.fake.returns(mercatorTilingScheme)
            );
            fakeDataSource1.storageLevelOffset = 1;
            fakeDataSource2.storageLevelOffset = -3;
            fakeDataSource3.storageLevelOffset = -1;
            backgroundDataSource = new BackgroundDataSource();
            mapViewStub = sinon.createStubInstance(MapView);
            sinon.stub(mapViewStub, "dataSources").get(function getterFn() {
                return [backgroundDataSource, fakeDataSource1, fakeDataSource2, fakeDataSource3];
            });
            mapViewStub.removeDataSource.restore();
            backgroundDataSource.attach((mapViewStub as unknown) as MapView);
        });

        it("Sets storageLevelOffset to maximum value of matching datasources", function () {
            backgroundDataSource.setTilingScheme(fakeDataSource2.getTilingScheme());
            backgroundDataSource.updateStorageLevelOffset();
            expect(mapViewStub.clearTileCache.called);
            expect(backgroundDataSource.storageLevelOffset).to.be.equal(
                fakeDataSource3.storageLevelOffset
            );
        });

        it("Resets to default value if no datasources of same tiling scheme found", function () {
            backgroundDataSource.setTilingScheme(fakeDataSource1.getTilingScheme());
            backgroundDataSource.updateStorageLevelOffset();
            expect(mapViewStub.clearTileCache.called);
            expect(backgroundDataSource.storageLevelOffset).to.be.equal(
                fakeDataSource1.storageLevelOffset
            );

            backgroundDataSource.setTilingScheme(undefined);
            backgroundDataSource.updateStorageLevelOffset();
            expect(backgroundDataSource.storageLevelOffset).to.be.equal(0);
        });
    });
});
