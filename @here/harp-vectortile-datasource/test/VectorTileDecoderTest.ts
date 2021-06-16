/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import * as chai from "chai";
// Install chai-as-promised plugin to support promise assertions like:
// expect(promise).to.eventually.be.rejectedWith()
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

import { VectorTileDecoder } from "../index-worker";
import { OmvDataAdapter } from "../lib/adapters/omv/OmvDataAdapter";
import { DataAdapter } from "../lib/DataAdapter";
chai.use(chaiAsPromised);
const { expect } = chai;

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("ThemedTileDecoder", function () {
    it("#decodeTile does not throw if styleSet was not configured", async function () {
        const target = new VectorTileDecoder();

        silenceLoggingAroundFunction("ThemedTileDecoder", async () => {
            expect(
                await target.decodeTile(
                    new ArrayBuffer(0),
                    new TileKey(0, 0, 0),
                    mercatorProjection
                )
            ).to.not.throw;
        });
    });
});

class VectorTileDecoderTest extends VectorTileDecoder {
    adapter = new OmvDataAdapter();

    /** @override */
    getDataAdapter(data: ArrayBufferLike | {}): DataAdapter | undefined {
        return this.adapter;
    }
}

describe("VectorTileDecoder", function () {
    let tileKey: TileKey;
    let styleSetEvaluator: StyleSetEvaluator;

    beforeEach(function () {
        tileKey = new TileKey(0, 0, 1);
        styleSetEvaluator = new StyleSetEvaluator({ styleSet: [] });
    });
    afterEach(function () {
        sinon.restore();
    });

    it("#decodeThemedTile rejects promise if data is not supported", function () {
        const tilePromise = new VectorTileDecoder().decodeThemedTile(
            {},
            tileKey,
            styleSetEvaluator,
            mercatorProjection
        );

        return expect(tilePromise).to.eventually.be.rejected;
    });

    it("#configure overwrites old options with newly defined ones", function () {
        const politicalView = "tlh";
        let storageLevelOffset = 1;
        let filterDescription = {};
        let roundUpCoordinatesIfNeeded = true;

        const decoder = new VectorTileDecoderTest();
        const adapter = decoder.adapter;
        const processStub = sinon.stub(adapter, "process").returns();
        const configureStub = sinon.stub(adapter, "configure").returns();
        sinon.stub(adapter, "canProcess").returns(true);

        decoder.configure(
            {},
            {
                storageLevelOffset,
                politicalView,
                filterDescription,
                roundUpCoordinatesIfNeeded
            }
        );

        const promise = decoder.decodeThemedTile(
            {},
            tileKey,
            styleSetEvaluator,
            mercatorProjection
        );
        return expect(promise).to.eventually.be.fulfilled.then(() => {
            expect(configureStub.calledOnce).is.true;
            expect(processStub.calledOnce).is.true;

            const options = configureStub.firstCall.args[0];
            expect(options.roundUpCoordinatesIfNeeded).equals(roundUpCoordinatesIfNeeded);
            expect(options.politicalView).equals(politicalView);
            expect(options.filterDescription).equals(filterDescription);
            expect(processStub.firstCall.args[1].storageLevelOffset).equals(storageLevelOffset);

            configureStub.resetHistory();
            processStub.resetHistory();

            filterDescription = {};
            roundUpCoordinatesIfNeeded = !roundUpCoordinatesIfNeeded;
            storageLevelOffset += storageLevelOffset;

            // no new political view passed, it old value should be used.
            decoder.configure(
                {},
                {
                    storageLevelOffset,
                    filterDescription,
                    roundUpCoordinatesIfNeeded
                }
            );
            return expect(
                decoder.decodeThemedTile({}, tileKey, styleSetEvaluator, mercatorProjection)
            ).to.eventually.be.fulfilled.then(() => {
                expect(configureStub.calledOnce).is.true;
                expect(processStub.calledOnce).is.true;

                const newOptions = configureStub.firstCall.args[0];
                expect(newOptions.roundUpCoordinatesIfNeeded).equals(roundUpCoordinatesIfNeeded);
                expect(newOptions.politicalView).equals(politicalView);
                expect(newOptions.filterDescription).equals(filterDescription);
                expect(processStub.firstCall.args[1].storageLevelOffset).equals(storageLevelOffset);
            });
        });
    });
});
