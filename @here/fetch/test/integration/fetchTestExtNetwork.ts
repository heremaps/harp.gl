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

import { assert } from "chai";
import * as CancellableFetchBrowser from "../../index";
import * as CancellableFetchNode from "../../index_node";

const isNode =
    typeof process === "object" &&
    typeof process.versions === "object" &&
    typeof process.versions.node !== "undefined";

const cf = isNode ? CancellableFetchNode : CancellableFetchBrowser;

describe("[Integration tests] fetch, external network calls tests", () => {
    const appId = "inxaFrAWuwRedan8stuc";
    const appCode = "duf7nLX8P4G5cKeOLlmKSg";
    const testServerUrl = "https://network-test-server-dev.dev.poc.data.here.com";
    const dataUrl =
        `https://hype-ci-map.catalogs.datastore.sit.api.here.com` +
        `/v2/catalog/versions/latest` +
        `?startVersion=-1` +
        `&app_id=${appId}&app_code=${appCode}`;

    it("#fetch performs successful fetch (external network call)", async () => {
        const cancellationToken = new cf.CancellationToken();
        const response = await cf.fetch(dataUrl, { cancellationToken });
        assert.isTrue(response.ok);

        const responseJSON = await response.json<any>();
        assert.isTrue(responseJSON.version > 0);

        assert.isFalse(cancellationToken.isCancelled);
    });

    it("#fetch aborted during fetch (external network call)", async () => {
        const cancellationToken = new cf.CancellationToken();
        let exceptionCaught = false;
        try {
            const responsePromise = cf.fetch(dataUrl, { cancellationToken });
            cancellationToken.cancel();
            await responsePromise;
        } catch (err) {
            assert.isTrue(err instanceof Error);
            assert.strictEqual((err as Error).message, "Request cancelled");
            exceptionCaught = true;
        }

        assert.isTrue(exceptionCaught);
        assert.isTrue(cancellationToken.isCancelled);
    });

    it("#fetch performs compressed fetch (external network call)", async () => {
        const response = await cf.fetch(testServerUrl + "/randomDataGz?size=1024");

        assert.isTrue(response.ok);
        const data = (await response.json()) as any;
        assert.strictEqual(data.data.length, 1024);
    });

    it("#fetch performs binary fetch (external network call)", async () => {
        const response = await cf.fetch(testServerUrl + "/randomBinary?size=32768");
        assert.isTrue(response.ok);
        const data = await response.arrayBuffer();
        assert.strictEqual(data.byteLength, 32768);

        const payload = new Uint8Array(data.slice(0, 2));
        assert.strictEqual(payload[0], 0);
        assert.strictEqual(payload[1], 1);
    });

    it("#fetch performs compressed binary fetch (external network call)", async () => {
        const response = await cf.fetch(testServerUrl + "/randomBinaryGz?size=32768");
        assert.isTrue(response.ok);
        const data = await response.arrayBuffer();
        assert.strictEqual(data.byteLength, 32768);

        const payload = new Uint8Array(data.slice(0, 2));
        assert.strictEqual(payload[0], 0);
        assert.strictEqual(payload[1], 1);
    });

    it("#fetch performs a redirected fetch (external network call)", async () => {
        const response = await cf.fetch(testServerUrl + "/redirect/randomData?size=4");
        assert.isTrue(response.ok);
        const data = (await response.json()) as any;
        assert.strictEqual(data.data, "ABCD");
    });

    it("#fetch performs a redirected-multi fetch (external network call)", async () => {
        const response = await cf.fetch(
            testServerUrl + "/redirect/redirect/redirect/randomData?size=4"
        );
        assert.isTrue(response.ok);
        const data = (await response.json()) as any;
        assert.strictEqual(data.data, "ABCD");
    });
});
