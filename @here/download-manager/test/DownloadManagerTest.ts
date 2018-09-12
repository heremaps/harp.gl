/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

 /* tslint:disable:completed-docs */

import * as Fetch from "@here/fetch";
import { assert } from "chai";
import * as sinon from "sinon";
import * as dm from "../index";

describe("DownloadManager", () => {
    const fakeDataUrl = `https://download.example.url`;

    function createMockDownloadResponse() {
        const mock = {
            type: "aaa",
            status: 200,
            statusText: "success",
            ok: true,
            headers: new Fetch.Headers(),
            arrayBuffer: sinon.stub(),
            json: sinon.stub(),
            text: sinon.stub()
        };
        return mock;
    }

    it("#downloadJson handles successful download response", async () => {
        // Arrange
        const mock = createMockDownloadResponse();
        mock.json.resolves({ version: "4" });
        const fetchStub = sinon.stub().resolves(mock);
        const downloadMgr = new dm.DownloadManager(fetchStub, 5);

        // Act
        const response = await downloadMgr.downloadJson(fakeDataUrl);

        // Assert
        assert.isTrue(fetchStub.calledOnce);
        assert.isTrue(fetchStub.getCall(0).args[0] === fakeDataUrl);
        assert.deepEqual(response, { version: "4" });
    });

    it("#downloadJson handles HTTP 404 status response", async () => {
        // Arrange
        const mock = createMockDownloadResponse();
        mock.status = 404;
        mock.ok = false;
        mock.json.resolves({ version: "4" });
        const fetchStub = sinon.stub().resolves(mock);
        const downloadMgr = new dm.DownloadManager(fetchStub, 5);

        // Act
        const downloadResp = downloadMgr.download(fakeDataUrl);

        const resp = await downloadResp.then(downlResp => {
            return downlResp;
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

    it("#instance handles returning same single static instance correctly", async () => {
        const downloadMgr1 = dm.DownloadManager.instance();
        const downloadMgr2 = dm.DownloadManager.instance();

        assert.deepEqual(downloadMgr1, downloadMgr2);
    });

    /**
     * Note, DownloadManager limits the number of html headers sent to MAX_PARALLEL_DOWNLOADS, but
     * will allow more then MAX_PARALLEL_DOWNLOADS of parallel download under the hood.
     */
    it("#downloadJson performs download with maxParallelDownloads exceeded", async () => {
        // Arrange
        const MAX_PARALLEL_DOWNLOADS = 16;
        const CALLS_NUMBER = 32;

        const mock = createMockDownloadResponse();
        mock.json.resolves({ version: "4" });
        const fetchStub = sinon.stub().resolves(mock);
        const downloadMgr = new dm.DownloadManager(fetchStub, 5);

        // Act
        const downlResponses = new Array<Promise<Fetch.DownloadResponse>>();
        for (let i = 0; i < CALLS_NUMBER; i++) {
            downlResponses[i] = downloadMgr.download(fakeDataUrl);
        }

        await Promise.all(
            downlResponses.map(downloadRespPromise => {
                return downloadRespPromise.then(downloadResp => {
                    return downloadResp.arrayBuffer();
                });
            })
        );

        // Assert
        assert(fetchStub.callCount === CALLS_NUMBER);
        assert(fetchStub.getCall(MAX_PARALLEL_DOWNLOADS - 1).args[0] === fakeDataUrl);
    });
});
