/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";

import { TileKey } from "@here/harp-geoutils";
import { loadTestResource } from "@here/harp-test-utils";

import { DataProvider } from "../lib/DataProvider";

/**
 * Data provider that loads test tile using [[loadTestResource]].
 */
export class TestSingleFileDataProvider extends DataProvider {
    /**
     * TestDataProvider constructor
     * @param moduleName - name of the module's directory
     * @param basePath - base path to the test resources
     */
    constructor(private readonly moduleName: string, private readonly basePath: string) {
        super();
    }

    ready(): boolean {
        return true;
    }

    connect() {
        return Promise.resolve();
    }

    async getTile(_tileKey: TileKey, _abortSignal?: AbortSignal): Promise<ArrayBufferLike> {
        return await loadTestResource(this.moduleName, this.basePath, "arraybuffer");
    }

    /** @override */ dispose() {
        // Nothing to be done here.
    }
}

/**
 * Data provider that loads test tiles from a specified base URL.
 * Tile's URLs are generated basing on the basePath and requested tileKey.
 *
 * The URL is constructed using the following formula:
 * `${this.basePath}/${tileKey.mortonCode()}.bin`
 */
export class TestTilesDataProvider extends DataProvider {
    /**
     * Constructs `TestFilesDataProvider` using the provided base path.
     *
     * @param basePath - base path to be used to construct the url to the resource.
     */
    constructor(private readonly basePath: string) {
        super();
    }

    ready(): boolean {
        return true;
    }

    connect() {
        return Promise.resolve();
    }

    /**
     * Loads the static test data from given URL and returns them as [[ArrayBufferLike]].
     *
     * @param tileKey - the tile key for the tile to be loaded
     * @param abortSignal - optional AbortSignal to be used by the fetch function
     */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike> {
        const url = `${this.basePath}/${tileKey.mortonCode()}.bin`;
        const resp = await fetch(url, {
            signal: abortSignal
        });
        return await resp.arrayBuffer();
    }

    /** @override */ dispose() {
        // Nothing to be done here.
    }
}
