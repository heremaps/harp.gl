/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { CancellationToken, fetch } from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { loadTestResource } from "@here/test-utils";
import { DataProvider } from "../lib/DataProvider";

/**
 * Data provider that loads test tile using [[loadTestResource]].
 */
export class TestSingleFileDataProvider implements DataProvider {
    /**
     * TestDataProvider constructor
     * @param moduleName - name of the module's directory
     * @param basePath - base path to the test resources
     */
    constructor(private readonly moduleName: string, private readonly basePath: string) {}

    ready(): boolean {
        return true;
    }

    connect() {
        return Promise.resolve();
    }

    async getTile(
        _tileKey: TileKey,
        _cancellationToken?: CancellationToken
    ): Promise<ArrayBufferLike> {
        return loadTestResource(this.moduleName, this.basePath, "arraybuffer");
    }
}

/**
 * Data provider that loads test tiles from a specified base URL.
 * Tile's URLs are generated basing on the basePath and requested tileKey.
 *
 * The URL is construced using the following formula:
 * `${this.basePath}/${tileKey.mortonCode()}.bin`
 */
export class TestTilesDataProvider implements DataProvider {
    /**
     * Constructs `TestFilesDataProvider` using the provided base path.
     *
     * @param basePath - base path to be used to construct the url to the resource.
     */
    constructor(private readonly basePath: string) {}

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
     * @param cancellationToken - optional cancellationToken to be used by the fetch function
     */
    async getTile(
        tileKey: TileKey,
        cancellationToken?: CancellationToken
    ): Promise<ArrayBufferLike> {
        const url = `${this.basePath}/${tileKey.mortonCode()}.bin`;
        const resp = await fetch(url, { cancellationToken, responseType: "arraybuffer" });
        return resp.arrayBuffer();
    }
}
