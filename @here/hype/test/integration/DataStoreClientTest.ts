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

import { DownloadManager } from "@here/download-manager";
import * as Fetch from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { LoggerManager } from "@here/utils";
import { assert } from "chai";
import { CatalogClient, CatalogLayer } from "../../lib/CatalogClient";
import { DataStoreClient } from "../../lib/DataStoreClient";
import { HRN } from "../../lib/HRN";

// Consider to remove or disable logging from tests completely.
const logger = LoggerManager.instance.create("DataStoreClientTest");

const appId = "inxaFrAWuwRedan8stuc";
const appCode = "duf7nLX8P4G5cKeOLlmKSg";
const testHRN = HRN.fromString("hrn:here-dev:datastore:::hype-ci-map");

// set to true to get more verbose output
const verbose = false;

class VerboseDownloadManager extends DownloadManager {
    download(url: string, init?: Fetch.DownloadRequestInit): Promise<Fetch.DownloadResponse> {
        logger.log("Downloading", url);
        return super.download(url, init);
    }
}

const defaultDownloadManager = verbose ? new VerboseDownloadManager() : DownloadManager.instance();

describe("[Integration tests] HRN, external network call test", () => {
    it("resolver", () => {
        HRN.addResolver(data => (data.partition === "test" ? "test2" + data.resource : undefined));
        const testHrn = HRN.fromString("hrn:test:something:::Worked");
        assert.strictEqual(testHrn.resolve(), "test2Worked");

        const noresolveHrn = HRN.fromString("hrn:nothing::::");
        assert.throws(noresolveHrn.resolve);
    });

    it("schemaHRN", () => {
        const testHrn = HRN.fromString(
            "hrn:here-dev:schema:::com.here.rib.schema:rib-topology_v1:1.17.0:ds"
        );
        assert.strictEqual(
            testHrn.resolve(),
            "https://artifactory.in.here.com" +
                "/artifactory/here-olp-sit/com/here/rib/schema/rib-topology_v1_ds/1.17.0" +
                "/rib-topology_v1_ds-1.17.0.zip"
        );
    });

    it("fromString", () => {
        const hrnString = "hrn:here:datastore:::testcatalog";
        assert.strictEqual(HRN.fromString(hrnString).toString(), hrnString);
    });

    it("localURL", () => {
        const hrn = HRN.fromString("http://localhost:5000");

        assert.strictEqual(hrn.data.partition, "catalog-url");
        assert.strictEqual(hrn.data.service, "datastore");
        assert.strictEqual(hrn.data.region, "");
        assert.strictEqual(hrn.data.account, "");

        assert.strictEqual(hrn.resolve(), "http://localhost:5000");
    });

    it("additionalFields", () => {
        const hrn = HRN.fromString("hrn:here:datastore:::testcatalog:some:additional:fields");
        assert.sameOrderedMembers(hrn.data.resource.split(":"), [
            "testcatalog",
            "some",
            "additional",
            "fields"
        ]);
    });
});

describe("[Integration tests] DataStoreClient, external network call test", () => {
    it("getCatalogClient", async () => {
        const dataStoreClient = new DataStoreClient({
            appId,
            appCode,
            hrn: testHRN,
            downloadManager: defaultDownloadManager
        });
        const catalogClient = await dataStoreClient.getCatalogClient();

        assert.isDefined(catalogClient);
    });
});

describe("[Integration tests] CatalogClient, external network call test", () => {
    let catalogClient: CatalogClient;

    before(async () => {
        const dataStoreClient = new DataStoreClient({
            appId,
            appCode,
            hrn: testHRN,
            downloadManager: defaultDownloadManager
        });
        catalogClient = await dataStoreClient.getCatalogClient();

        assert.isNotNull(catalogClient);
    });

    it("findLayer", () => {
        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);
        assert.strictEqual(layer.name, "testLayer");

        const invalidLayer = catalogClient.findLayer("NonExistingLayer");
        assert.isUndefined(invalidLayer);
    });

    it("getEmptyTile", async function() {
        this.timeout(15000);

        const layer = catalogClient.findLayer("testLayer") as CatalogLayer;
        assert.isDefined(layer);

        const response = await catalogClient.getTile(layer, TileKey.fromQuadKey("0000"));
        assert.isNotNull(response);
        assert.isTrue(response.ok);
        assert.strictEqual(response.status, 204);
    });

    it("getTile", async function() {
        this.timeout(15000);

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

    it("getAggregatedTile", async function() {
        this.timeout(15000);

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

    it("abortTileFetch", async () => {
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

    it("getTiles", async function() {
        this.timeout(15000);

        // clear the cache in order to verify index download compression
        (catalogClient as any).indexCache.clear();

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

    it("getTileWithETag", async function() {
        this.timeout(15000);

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

    it("getPartition", async function() {
        this.timeout(15000);

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
