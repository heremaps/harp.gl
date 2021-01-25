/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import "@here/harp-fetch";

import { TileKey } from "@here/harp-geoutils";
import { TransferManager } from "@here/harp-transfer-manager";
import { assert } from "chai";
import * as sinon from "sinon";

import { APIFormat, AuthenticationMethod, AuthenticationTypeBearer, OmvRestClient } from "../index";

function createMockDownloadResponse(tileUrl: string) {
    const mock = {
        type: "aaa",
        status: 200,
        statusText: "success",
        ok: true,
        headers: new Headers(),
        arrayBuffer: sinon.stub(),
        json: sinon.stub(),
        text: sinon.stub().resolves(tileUrl)
    };
    return mock;
}

class MockTransferManager extends TransferManager {
    /** @override */
    download(tileUrl: string): Promise<Response> {
        return Promise.resolve((createMockDownloadResponse(tileUrl) as any) as Response);
    }
}
const mockDownloadManager = new MockTransferManager();

describe("OmvRestClient", function () {
    let downloadSpy: sinon.SinonSpy;

    beforeEach(function () {
        downloadSpy = (sinon.spy(mockDownloadManager, "download") as any) as sinon.SinonSpy;
    });

    afterEach(function () {
        downloadSpy.restore();
    });

    it("supports url pattern", async function () {
        const restClient = new OmvRestClient({
            url: "https://some.base.url/somepath/{z}/{x}/{y}/omv",
            downloadManager: mockDownloadManager
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(downloadSpy.args[0][0], "https://some.base.url/somepath/3/2/1/omv");
    });

    it("supports url pattern and custom `urlParams`", async function () {
        const restClient = new OmvRestClient({
            url: "https://some.base.url/somepath/{z}/{x}/{y}.mvt",
            urlParams: {
                token: "1234567890abcdefg"
            },
            downloadManager: mockDownloadManager
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(
            downloadSpy.args[0][0],
            "https://some.base.url/somepath/3/2/1.mvt?token=1234567890abcdefg"
        );
    });

    it("generates proper Url with HEREV1 Format", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://some.base.url",
            apiFormat: APIFormat.HereV1,
            downloadManager: mockDownloadManager
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(downloadSpy.args[0][0], "https://some.base.url/3/2/1/omv");
    });

    it("generates proper Url with MapBox Format", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: async () => "123",
            downloadManager: mockDownloadManager
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(
            downloadSpy.args[0][0],
            "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7/3/2/1.mvt?access_token=123"
        );
    });

    it("generates proper Url with TomTom Format", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://a.tomtom.base.url",
            apiFormat: APIFormat.TomtomV1,
            authenticationCode: "123",
            downloadManager: mockDownloadManager
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(downloadSpy.args[0][0], "https://a.tomtom.base.url/3/2/1.pbf?key=123");
    });

    it("generates proper Url with XYZ OMV Format", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            authenticationCode: async () => "123",
            downloadManager: mockDownloadManager
        });
        await restClient.getTile(new TileKey(6338, 2649, 14));
        assert.equal(
            downloadSpy.args[0][0],
            "https://xyz.api.here.com/tiles/herebase.02/14/2649/6338/omv?access_token=123"
        );
    });

    it("supports custom authentication method based on query string key", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://some.base.url",
            apiFormat: APIFormat.HereV1,
            downloadManager: mockDownloadManager,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "customKey"
            },
            authenticationCode: async () => "12345"
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(downloadSpy.args[0][0], "https://some.base.url/3/2/1/omv?customKey=12345");
    });

    it("generates authentication header with bearer token from a function", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://some.base.url",
            apiFormat: APIFormat.HereV1,
            downloadManager: mockDownloadManager,
            authenticationMethod: AuthenticationTypeBearer,
            authenticationCode: async () => "12345"
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(downloadSpy.args[0][0], "https://some.base.url/3/2/1/omv");
        const downloadRequestInit = downloadSpy.args[0][1] as RequestInit;
        assert.exists(downloadRequestInit);
        assert.exists(downloadRequestInit.headers);
        if (
            downloadRequestInit.headers !== undefined &&
            downloadRequestInit.headers instanceof Headers
        ) {
            assert.equal(downloadRequestInit.headers.get("authorization"), "Bearer 12345");
        }
    });

    it("bearer auth token with custom query params", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://some.base.url",
            apiFormat: APIFormat.HereV1,
            downloadManager: mockDownloadManager,
            authenticationMethod: AuthenticationTypeBearer,
            authenticationCode: async () => "12345",
            urlParams: {
                first: "abc",
                second: "xyz"
            }
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(
            downloadSpy.args[0][0],
            "https://some.base.url/3/2/1/omv?first=abc&second=xyz"
        );
        const downloadRequestInit = downloadSpy.args[0][1] as RequestInit;
        assert.exists(downloadRequestInit);
        assert.exists(downloadRequestInit.headers);
        if (
            downloadRequestInit.headers !== undefined &&
            downloadRequestInit.headers instanceof Headers
        ) {
            assert.equal(downloadRequestInit.headers.get("authorization"), "Bearer 12345");
        }
    });

    it("query param auth with custom query param", async function () {
        const restClient = new OmvRestClient({
            baseUrl: "https://some.base.url",
            apiFormat: APIFormat.HereV1,
            downloadManager: mockDownloadManager,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "customKey"
            },
            urlParams: {
                first: "abc",
                second: "xyz"
            },
            authenticationCode: async () => "12345"
        });
        await restClient.getTile(new TileKey(1, 2, 3));
        assert.equal(
            downloadSpy.args[0][0],
            "https://some.base.url/3/2/1/omv?customKey=12345&first=abc&second=xyz"
        );
    });
});
