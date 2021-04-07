/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import "@here/harp-fetch";

import { TileKey } from "@here/harp-geoutils";
import { assertRejected } from "@here/harp-test-utils";
import { VersionedLayerClient } from "@here/olp-sdk-dataservice-read";
import * as sinon from "sinon";

import { OlpDataProvider } from "../lib/OlpDataProvider";

describe("OlpDataProvider", function () {
    let sandbox: sinon.SinonSandbox;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
    });
    afterEach(function () {
        sandbox.restore();
    });

    it("#getData doesn't swallow AbortError", async function () {
        // Check that OlpDataProvider doesn't swallow AbortError.

        // Setup stub VersionedLayerClient.getData to always throw AbortError
        sandbox.stub(VersionedLayerClient.prototype, "getData").callsFake(async () => {
            return await new Promise((resolve, reject) => {
                setTimeout(() => {
                    const error = new Error("Aborted");
                    error.name = "AbortError";
                    reject(error);
                }, 1);
            });
        });

        const dataProvider = new OlpDataProvider({
            hrn: "hrn:test:data:::test",
            layerId: "testLayer",
            getToken: async () => "token123",
            version: 333
        });
        await dataProvider.connect();
        const tileKey = TileKey.fromRowColumnLevel(2, 2, 2);

        // Assert that OlpProvider reports `AbortError`
        await assertRejected(async () => await dataProvider.getTile(tileKey), /Aborted/);
    });

    it("#getData obeys `abortSignal`", async function () {
        // Check that OlpDataProvider obeys abort signal despite fake successfull
        // Response.

        // Setup stub VersionedLayerClient.getData to always throw AbortError

        sandbox.stub(VersionedLayerClient.prototype, "getData").callsFake(async () => {
            return await new Promise<Response>((resolve, reject) => {
                setTimeout(() => {
                    const fakeResponse: Partial<Response> = {
                        status: 200
                    };
                    resolve(fakeResponse as Response);
                }, 2);
            });
        });

        const dataProvider = new OlpDataProvider({
            hrn: "hrn:test:data:::test",
            layerId: "testLayer",
            getToken: async () => "token123",
            version: 333
        });
        await dataProvider.connect();
        const tileKey = TileKey.fromRowColumnLevel(2, 2, 2);
        const abortController = new AbortController();

        // dispatch `abort` to our to our signal
        setTimeout(() => {
            abortController.abort();
        }, 0);

        // Assert that OlpProvider reports `AbortError` when signaled.
        await assertRejected(
            async () => await dataProvider.getTile(tileKey, abortController.signal),
            /Aborted/
        );
    });
});
