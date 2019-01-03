/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { DataProvider } from "./DataProvider";

/**
 * Provides a general way of issuing untiled data into a [[TileDataSource]].
 */
export class UntiledDataProvider implements DataProvider {
    isUntiled = true;

    /**
     * The root tile the data should be added to.
     */
    rootTileKey: TileKey = new TileKey(0, 0, 0);

    constructor(public data: {} = {}) {}

    ready(): boolean {
        return true;
    }

    // tslint:disable-next-line:no-empty
    async connect(): Promise<void> {}

    async getTile(): Promise<{}> {
        return this.data;
    }
}
