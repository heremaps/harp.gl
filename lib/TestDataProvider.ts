/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
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

import { CancellationToken } from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { DataStoreClientParameters, HRN } from "@here/hype";
import { loadTestResource } from "@here/test-utils";
import { DataProvider } from "../lib/DataProvider";

export class TestDataProvider extends DataProvider {
    constructor(private readonly moduleName: string, private readonly basePath: string) {
        super();
    }

    ready(): boolean {
        return true;
    }

    connect() {
        return Promise.resolve();
    }

    async getTile(
        tileKey: TileKey,
        cancellationToken?: CancellationToken
    ): Promise<ArrayBufferLike> {
        return loadTestResource(this.moduleName, this.basePath, "arraybuffer");
    }
}
