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
import * as dm from "../../index";

const appId = "inxaFrAWuwRedan8stuc";
const appCode = "duf7nLX8P4G5cKeOLlmKSg";

describe("[Integration tests] DownloadManager, external network call test", () => {
    const dataUrl =
        `https://hype-ci-map.catalogs.datastore.sit.api.here.com` +
        `/v2/catalog/versions/latest` +
        `?startVersion=-1` +
        `&app_id=${appId}` +
        `&app_code=${appCode}`;

    it("normal fetch", async () => {
        const downloadManager = new dm.DownloadManager();
        const response = await downloadManager.downloadJson<any>(dataUrl);
        assert.isTrue(response.version > 0);
    });
});
