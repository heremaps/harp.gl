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
import { assert } from "chai";
import * as sinon from "sinon";
import * as dataStoreClient from "../lib/DataStoreClient";
import { HRN } from "../lib/HRN";
import { DataStore2Client } from "../lib/v2/DataStore2Client";

describe("DataStoreClient", () => {
    const appId = "3";
    const appCode = "123";
    const baseUrl = "https://hype-ci-map.catalogs.datastore.sit.api.here.com";

    const urlToResponses = new Map<string, object>();

    urlToResponses.set(
        baseUrl + "/v2/catalog/versions/latest?startVersion=-1&app_id=3&app_code=123",
        {
            version: 4
        }
    );

    urlToResponses.set(baseUrl + "/v2/catalog/layerVersions?version=4&app_id=3&app_code=123", {
        version: 4,
        layerVersions: [
            { layer: "mvt", version: 4 },
            { layer: "landmark", version: 4 },
            { layer: "resources", version: 1 },
            { layer: "schema", version: 3 }
        ]
    });

    urlToResponses.set(baseUrl + "/v2/catalog/configuration?app_id=3&app_code=123", {
        layers: [
            {
                name: "mvt",
                partitioning: "heretile",
                dataUrl: "https://acfc-shr-us-standard.s3.amazonaws.com/data/kaihlani-mvt-weu/",
                layerProperties: [
                    { name: "BlobStoreType", value: "s3" },
                    { name: "S3Bucket", value: "acfc-shared-us-standard" },
                    { name: "S3Prefix", value: "data/kaihlani-mvt-weu/" },
                    { name: "QuadTree-Levels", value: "1,2,3,4,5,6,7,8,9,10,11,12,13,14" },
                    { name: "Schema-Layer", value: "schema" },
                    { name: "Schema-Proto-Bundle", value: "mapbox" },
                    { name: "Compression", value: "true" },
                    { name: "Content-Type", value: "application/x-protobuf" }
                ]
            },
            {
                name: "landmark",
                partitioning: "heretile",
                dataUrl: "https://acfc-shr-us-standard.s3.amazonaws.com/data/kaihlani-mvt-weu/",
                layerProperties: [
                    { name: "BlobStoreType", value: "s3" },
                    { name: "S3Bucket", value: "acfc-shared-us-standard" },
                    { name: "S3Prefix", value: "data/kaihlani-mvt-weu/" },
                    { name: "QuadTree-Levels", value: "14" },
                    { name: "Schema-Layer", value: "schema" },
                    { name: "Schema-Proto-Bundle", value: "landmark" },
                    { name: "Compression", value: "true" },
                    { name: "Content-Type", value: "application/x-protobuf" }
                ]
            }
        ],
        dataCatalogs: ["hrn:here-dev:datastore:::verity-mvt-1"]
    });

    function createMockDownloadManager(): dm.DownloadManager {
        const downloadMgr = sinon.createStubInstance(dm.DownloadManager);

        downloadMgr.downloadJson.callsFake((url: string) => {
            const resp = urlToResponses.get(url);
            assert(resp, "Unsecognized url called.");
            return Promise.resolve(resp);
        });

        return downloadMgr as any;
    }

    it("#stubbed dataStoreClient API ver 1", async () => {
        // Arrange
        const testHRN = HRN.fromString("hrn:here-dev:datastore:::hype-ci-map");

        const dataStoreClient1 = dataStoreClient.createDataStoreClient({
            appId,
            appCode,
            hrn: testHRN,
            downloadManager: createMockDownloadManager()
        });
        assert.isDefined(dataStoreClient1);
    });

    it("#stubbed dataStoreClient API ver 2", async () => {
        // Arrange
        HRN.addResolver(data => (data.service === "data" ? "data" + data.resource : undefined));

        const testHRN = HRN.fromString("hrn:here-dev:data:::hype-ci-map");
        const downloadMgr = createMockDownloadManager();

        const dataStoreClient2 = dataStoreClient.createDataStoreClient({
            appId,
            appCode,
            hrn: testHRN,
            downloadManager: downloadMgr
        });

        assert.isDefined(dataStoreClient2);
        assert.isTrue(dataStoreClient2 instanceof DataStore2Client);
    });

    it("#stubbed getCatalogClient", async () => {
        // Arrange
        const testHRN = HRN.fromString("hrn:here-dev:datastore:::hype-ci-map");

        const dataStoreClient1 = dataStoreClient.createDataStoreClient({
            appId,
            appCode,
            hrn: testHRN,
            downloadManager: createMockDownloadManager()
        });
        assert.isDefined(dataStoreClient1);

        const catalogClient = await dataStoreClient1.getCatalogClient();
        assert.isDefined(catalogClient);
    });
});
