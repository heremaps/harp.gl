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

import * as dm from "@here/download-manager";
import * as Fetch from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { assert } from "chai";
import sinon = require("sinon");
import { CatalogClient, CatalogLayer } from "../lib/CatalogClient";
import * as dataStoreClient from "../lib/DataStoreClient";
import { HRN } from "../lib/HRN";
import { Catalog1Client } from "../lib/v1/Catalog1Client";

const appId = "123";
const appCode = "456";
const baseUrl = "https://hype-ci-map.catalogs.datastore.sit.api.here.com";
const tileBaseUrl = "https://testmap-apoluektov.s3.amazonaws.com/TestMap";

function createMockDownloadResponse(resp: string) {
    const mock = {
        type: "aaa",
        status: 200,
        statusText: "success",
        ok: true,
        headers: new Fetch.Headers().append("etag", "1237696a7c876b7e"),
        arrayBuffer: sinon.stub(),
        json: sinon.stub(),
        text: sinon.stub().returns(resp)
    };
    return mock;
}

/**
 * urlToResponses is a map of possible requests for tiles or metadata.
 * The response URL is the map's key and a corresponding response for each url is the value.
 */
const urlToResponses = new Map<string, any>();

urlToResponses.set(
    baseUrl +
        "/v2/catalog/versions/latest" +
        "?startVersion=-1" +
        "&app_id=" +
        appId +
        "&app_code=" +
        appCode,
    {
        version: 4
    }
);
urlToResponses.set(
    baseUrl +
        "/v2/catalog/layerVersions" +
        "?version=4" +
        "&app_id=" +
        appId +
        "&app_code=" +
        appCode,
    {
        version: 4,
        layerVersions: [
            { layer: "multilevel_testLayer", version: 3 },
            { layer: "testLayer", version: 3 },
            { layer: "testLayer_RES", version: 4 },
            { layer: "testLayer_broken_tile", version: 3 }
        ]
    }
);
urlToResponses.set(
    baseUrl +
        "/v2/catalog/partitions" +
        "?version=4" +
        "&layer=testLayer_RES" +
        "&app_id=" +
        appId +
        "&app_code=" +
        appCode,
    {
        partitions: [
            {
                version: 4,
                partition: "R1",
                layer: "testLayer_RES",
                dataHandle:
                    "https://testmap-apoluektov.s3.amazonaws.com/TestMap" +
                    "/resource-testLayer_RES-1-R1"
            }
        ]
    }
);

urlToResponses.set(
    baseUrl + "/v2/catalog/configuration" + "?app_id=" + appId + "&app_code=" + appCode,
    {
        layers: [
            {
                name: "multilevel_testLayer",
                partitioning: "quadtree",
                dataUrl: "",
                layerProperties: []
            },
            {
                name: "testLayer",
                partitioning: "quadtree",
                dataUrl: "https://testmap-apoluektov.s3.amazonaws.com/TestMap/",
                layerProperties: []
            },
            { name: "testLayer_RES", partitioning: "generic", dataUrl: "", layerProperties: [] },
            {
                name: "testLayer_broken_tile",
                partitioning: "quadtree",
                dataUrl: "",
                layerProperties: []
            }
        ],
        dataCatalogs: ["hrn:here-dev:datastore:::hype-ci-map"]
    }
);

urlToResponses.set(
    baseUrl + "/v2/index/3/testLayer/-/4" + "?app_id=" + appId + "&app_code=" + appCode,
    {
        subQuads: [
            { version: 1, subQuadKey: "1000", dataHandle: "tile-testLayer-1-1000" },
            { version: 1, subQuadKey: "1001", dataHandle: "tile-testLayer-1-1001" },
            { version: 1, subQuadKey: "1002", dataHandle: "tile-testLayer-1-1002" },
            { version: 1, subQuadKey: "1003", dataHandle: "tile-testLayer-1-1003" },
            { version: 1, subQuadKey: "1010", dataHandle: "tile-testLayer-1-1010" },
            { version: 1, subQuadKey: "1011", dataHandle: "tile-testLayer-1-1011" },
            { version: 1, subQuadKey: "1012", dataHandle: "tile-testLayer-1-1012" },
            { version: 1, subQuadKey: "1013", dataHandle: "tile-testLayer-1-1013" },
            { version: 1, subQuadKey: "1020", dataHandle: "tile-testLayer-1-1020" },
            { version: 1, subQuadKey: "1021", dataHandle: "tile-testLayer-1-1021" }
        ],
        parentQuads: []
    }
);

urlToResponses.set(
    baseUrl + "/v2/index/3/testLayer/1/4" + "?app_id=" + appId + "&app_code=" + appCode,
    {
        subQuads: [{ version: 1, subQuadKey: "000", dataHandle: "tile-testLayer-1-1000" }],
        parentQuads: []
    }
);

urlToResponses.set(
    baseUrl + "/v2/index/3/testLayer/1000000/4" + "?app_id=" + appId + "&app_code=" + appCode,
    {
        subQuads: [],
        parentQuads: [{ version: 1, partition: "1000", dataHandle: "tile-testLayer-1-1000" }]
    }
);

const headersMock = new Fetch.Headers();
headersMock.append("etag", "1237696a7c876b7e");

urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1000" + "?app_id=" + appId + "&app_code=" + appCode,
    {
        type: "aaa",
        status: 304,
        statusText: "success",
        ok: true,
        headers: headersMock,
        arrayBuffer: sinon.stub(),
        json: sinon.stub().returns("DT_1_1000"),
        text: sinon.stub().returns("DT_1_1000")
    }
    //createMockDownloadResponse("DT_1_1000")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1001" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1001")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1002" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1002")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1003" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1003")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1010" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1010")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1011" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1011")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1012" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1012")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1013" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1013")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1020" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1020")
);
urlToResponses.set(
    tileBaseUrl + "/tile-testLayer-1-1021" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DT_1_1021")
);
urlToResponses.set(
    tileBaseUrl + "/resource-testLayer_RES-1-R1" + "?app_id=" + appId + "&app_code=" + appCode,
    createMockDownloadResponse("DR_R1")
);

/**
 * Mocked `DownloadManager` returns values from the `urlToResponses` map. `urlToResponses` connects
 * URLs with their corresponding and expected responses.
 * Mocked `DownloadManager` throws an assertion error when an unspecified URL is called which can
 * indicate that the expected behaviour has changed.
 */
function createMockDownloadManager(): dm.DownloadManager {
    const downloadMgr = sinon.createStubInstance(dm.DownloadManager);

    // tslint:disable-next-line:no-unused-variable
    downloadMgr.downloadJson.callsFake((url: string, init?: Fetch.DownloadRequestInit) => {
        const resp = urlToResponses.get(url);
        assert(resp, "Unrecognized url called.");
        return Promise.resolve(resp);
    });

    downloadMgr.download.callsFake((url: string, init?: Fetch.DownloadRequestInit) => {
        const resp = urlToResponses.get(url);

        if (init && init.cancellationToken && init.cancellationToken.isCancelled) {
            return Promise.reject(new Fetch.CancellationException());
        }
        assert(resp, "Unrecognized url called.");
        return Promise.resolve(resp);
    });

    return downloadMgr as any;
}

describe("CatalogClient - stubbed tests", () => {
    let catalogClient: CatalogClient;

    before(async () => {
        const dataStoreClient1 = dataStoreClient.createDataStoreClient({
            appId,
            appCode,
            hrn: HRN.fromString("hrn:here-dev:datastore:::hype-ci-map"),
            downloadManager: createMockDownloadManager()
        });
        catalogClient = (await dataStoreClient1.getCatalogClient()) as Catalog1Client;
        assert.isNotNull(catalogClient);
    });

    it("#findLayer", () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);
        assert.strictEqual(layer.name, "testLayer");

        const invalidLayer = catalogClient.findLayer("NonExistingLayer");
        assert.isUndefined(invalidLayer);
    });

    it("#getEmptyTile", async () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        const response = await catalogClient.getTile(layer, TileKey.fromQuadKey("0000"));
        assert.isNotNull(response);
        assert.isTrue(response.ok);
        assert.strictEqual(response.status, 204);
    });

    it("#getTile", async () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        let response = await catalogClient.getTile(layer, TileKey.fromQuadKey("1000"));
        assert.isNotNull(response);
        assert.isTrue(response.ok);

        let buf = await response.text();
        assert.strictEqual(buf, "DT_1_1000");

        // now, request another one, to check the index cache
        response = await catalogClient.getTile(layer, TileKey.fromQuadKey("1001"));
        assert.isNotNull(response);
        assert.isTrue(response.ok);

        buf = await response.text();
        assert.strictEqual(buf, "DT_1_1001");
    });

    it("#getAggregatedTile", async () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        const response = await catalogClient.getTile(layer, TileKey.fromQuadKey("10000"));
        assert.strictEqual(response.status, 204);

        // try a direct ancestor
        {
            const aggregatedResponse = await catalogClient.getAggregatedTile(
                layer,
                TileKey.fromQuadKey("10000")
            );
            assert.isTrue(aggregatedResponse.ok);
            assert.isDefined(aggregatedResponse.tileKey);
            if (aggregatedResponse.tileKey !== undefined) {
                assert.strictEqual(
                    aggregatedResponse.tileKey.mortonCode(),
                    TileKey.fromQuadKey("1000").mortonCode()
                );
            }
        }

        // try something really far out, e.g. out of depth 4
        {
            const aggregatedResponse = await catalogClient.getAggregatedTile(
                layer,
                TileKey.fromQuadKey("10000000000")
            );
            assert.isTrue(aggregatedResponse.ok);
            assert.isDefined(aggregatedResponse.tileKey);
            if (aggregatedResponse.tileKey !== undefined) {
                assert.strictEqual(
                    aggregatedResponse.tileKey.mortonCode(),
                    TileKey.fromQuadKey("1000").mortonCode()
                );
            }
        }
    });

    it("#abortTileFetch", async () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        let caught = false;
        const init = { cancellationToken: new Fetch.CancellationToken() };
        const responsePromise = catalogClient.getTile(layer, TileKey.fromQuadKey("1000"), init);
        init.cancellationToken.cancel();
        try {
            await responsePromise;
        } catch (err) {
            assert.isTrue(err instanceof Error);
            assert.strictEqual((err as Error).message, "Request cancelled");
            caught = true;
        }
        assert.isTrue(init.cancellationToken.isCancelled);
        assert.isTrue(caught);
    });

    it("#getTiles", async () => {
        // clear the cache in order to verify index download compression
        (catalogClient as any).m_indexCache.clear();

        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        const results = await Promise.all([
            catalogClient.getTile(layer, TileKey.fromQuadKey("1002")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1003")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1010")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1011")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1012")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1013")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1020")),
            catalogClient.getTile(layer, TileKey.fromQuadKey("1021"))
        ]);

        const contents = await Promise.all([
            results[0].text(),
            results[1].text(),
            results[2].text(),
            results[3].text(),
            results[4].text(),
            results[5].text(),
            results[6].text(),
            results[7].text()
        ]);

        assert.deepEqual(contents, [
            "DT_1_1002",
            "DT_1_1003",
            "DT_1_1010",
            "DT_1_1011",
            "DT_1_1012",
            "DT_1_1013",
            "DT_1_1020",
            "DT_1_1021"
        ]);
    });

    it("#getTileWithETag", async () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        const response = await catalogClient.getTile(layer, TileKey.fromQuadKey("1000"));
        assert.isNotNull(response);
        assert.isTrue(response.ok);
        const etag = response.headers.get("etag");
        assert.isDefined(etag);
        if (etag === null) {
            return;
        } // no etag received - skip test

        const buf = await response.text();
        assert.strictEqual(buf, "DT_1_1000");

        // fetch again, this time with etag
        const init = {
            headers: new Fetch.Headers({ "if-none-match": etag }),
            cancellationToken: new Fetch.CancellationToken()
        };
        const cachedResponse = await catalogClient.getTile(
            layer,
            TileKey.fromQuadKey("1000"),
            init
        );
        // make sure status is 304 - not modified
        assert.strictEqual(cachedResponse.status, 304);
    });

    it("#getPartition", async () => {
        const layer = catalogClient.findLayer("testLayer_RES") as CatalogLayer;
        assert.isDefined(layer);

        let response = await catalogClient.getPartition(layer, "R1");
        assert.isNotNull(response);
        assert.isTrue(response.ok);

        let buf = await response.text();
        assert.strictEqual(buf, "DR_R1");

        // now, request again to make sure the cached index works
        response = await catalogClient.getPartition(layer, "R1");
        assert.isNotNull(response);
        assert.isTrue(response.ok);

        buf = await response.text();
        assert.strictEqual(buf, "DR_R1");
    });
});
