/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    mercatorProjection,
    Projection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";

import { DataSource, DataSourceOptions } from "../lib/DataSource";
import { ITileLoader, TileLoaderState } from "../lib/ITileLoader";
import { Tile } from "../lib/Tile";

export class FakeTileLoader implements ITileLoader {
    state: TileLoaderState = TileLoaderState.Initialized;
    payload?: ArrayBufferLike | {};
    priority: number = 1;
    decodedTile?: DecodedTile = {
        techniques: [],
        geometries: []
    };

    isFinished: boolean = false;

    loadAndDecode(): Promise<TileLoaderState> {
        return Promise.resolve(TileLoaderState.Ready);
    }

    waitSettled(): Promise<TileLoaderState> {
        return Promise.resolve(TileLoaderState.Ready);
    }

    cancel(): void {
        // Not covered with tests yet
    }
}
export class FakeOmvDataSource extends DataSource {
    private m_languages: String[] | undefined;

    constructor(options: DataSourceOptions) {
        super(options);
        this.cacheable = true;
    }

    /** @override */
    get projection(): Projection {
        return mercatorProjection;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);
        tile.tileLoader = new FakeTileLoader();
        tile.load();
        return tile;
    }

    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > 14) {
            return false;
        }
        if (tileKey.level <= 14 && zoomLevel >= 14) {
            return true;
        }
        return super.canGetTile(zoomLevel, tileKey);
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        this.m_languages = languages;
    }

    getLanguages(): String[] | undefined {
        return this.m_languages;
    }
}
