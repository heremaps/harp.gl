/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:completed-docs
// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import "@here/harp-fetch";
import { assert } from "chai";
import * as sinon from "sinon";
import { TransferManager } from "../index";

describe("TransferManager", function() {
    const fakeDataUrl = `https://download.example.url`;

    function createMockDownloadResponse() {
        const mock = {
            type: "aaa",
            status: 200,
            statusText: "success",
            ok: true,
            headers: new Headers(),
            arrayBuffer: sinon.stub(),
            json: sinon.stub(),
            text: sinon.stub()
        };
        return mock;
    }

    it("#downloadJson handles successful download response", async function() {
        // Arrange
        const mock = createMockDownloadResponse();
        mock.json.resolves({ version: "4" });
        const fetchStub = sinon.stub().resolves(mock);
        const downloadMgr = new TransferManager(fetchStub, 5);

        // Act
        const response = await downloadMgr.downloadJson(fakeDataUrl);

        // Assert
        assert.isTrue(fetchStub.calledOnce);
        assert.isTrue(fetchStub.getCall(0).args[0] === fakeDataUrl);
        assert.deepEqual(response, { version: "4" });
    });

    it("#downloadJson handles HTTP 404 status response", async function() {
        // Arrange
        const mock = createMockDownloadResponse();
        mock.status = 404;
        mock.ok = false;
        mock.json.resolves({ version: "4" });
        const fetchStub = sinon.stub().resolves(mock);
        const downloadMgr = new TransferManager(fetchStub, 5);

        // Act
        const downloadResponse = downloadMgr.download(fakeDataUrl);

        const resp = await downloadResponse.then(response => {
            return response;
        });

        const data = await resp.json();

        // Assert
        assert(fetchStub.called);
        assert(fetchStub.callCount === 1);
        assert(fetchStub.getCall(0).args[0] === fakeDataUrl);
        assert.isFalse(resp.ok);
        assert.equal(resp.status, 404);
        assert.deepEqual(data, { version: "4" });
    });

    it("#instance handles returning same single static instance correctly", async function() {
        const downloadMgr1 = TransferManager.instance();
        const downloadMgr2 = TransferManager.instance();

        assert.deepEqual(downloadMgr1, downloadMgr2);
    });

    /*
     * Note, TransferManager limits the number of html headers sent to MAX_PARALLEL_DOWNLOADS, but
     * will allow more then MAX_PARALLEL_DOWNLOADS of parallel download under the hood.
     */
    it("#downloadJson performs download with maxParallelDownloads exceeded", async function() {
        // Arrange
        const MAX_PARALLEL_DOWNLOADS = 16;
        const CALLS_NUMBER = 32;

        const mock = createMockDownloadResponse();
        mock.json.resolves({ version: "4" });
        const fetchStub = sinon.stub().resolves(mock);
        const downloadMgr = new TransferManager(fetchStub, 5);

        // Act
        const downloadResponses = new Array<Promise<Response>>();
        for (let i = 0; i < CALLS_NUMBER; i++) {
            downloadResponses[i] = downloadMgr.download(fakeDataUrl);
        }

        await Promise.all(
            downloadResponses.map(downloadRespPromise => {
                return downloadRespPromise.then(downloadResp => {
                    return downloadResp.arrayBuffer();
                });
            })
        );

        // Assert
        assert(fetchStub.callCount === CALLS_NUMBER);
        assert(fetchStub.getCall(MAX_PARALLEL_DOWNLOADS - 1).args[0] === fakeDataUrl);
    });

    it("#Maximum parallel downloads", async function() {
        let numberOfFetches = 0;
        let numberOfJsonDownloads = 0;
        let numberOfArrayBufferDownloads = 0;

        // dummy fetch function
        const fetchFunction = () => {
            ++numberOfFetches;
            return new Promise(resolve => {
                const response = {
                    ok: true,
                    status: 200,
                    json: async () => {
                        ++numberOfJsonDownloads;
                        return { dummy: true };
                    },
                    arrayBuffer: async () => {
                        ++numberOfArrayBufferDownloads;
                        return new ArrayBuffer(5);
                    }
                };

                setTimeout(() => resolve(response), 0);
            });
        };

        const dm = new TransferManager(fetchFunction as any);

        // do a couple of downloads
        const jsonResult = await Promise.all(Array(42).fill(dm.downloadJson("")));

        assert.strictEqual(numberOfFetches, 1);
        assert.strictEqual(numberOfJsonDownloads, 1);
        assert.isTrue(jsonResult.every(val => val.dummy === true));

        const arrayBufferResult = await Promise.all(Array(42).fill(dm.downloadArrayBuffer("")));

        assert.strictEqual(numberOfFetches, 2);
        assert.strictEqual(numberOfArrayBufferDownloads, 1);
        assert.isTrue(arrayBufferResult.every(val => val.byteLength === 5));
    });
});
