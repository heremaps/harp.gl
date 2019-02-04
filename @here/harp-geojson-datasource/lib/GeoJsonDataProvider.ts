/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";

// tslint:disable-next-line:no-var-requires
const geojsonvt = require("geojson-vt");

/**
 * GeoJson [[DataProvider]]. Automatically handles tiling and simplification of static GeoJson.
 */
export class GeoJsonDataProvider implements DataProvider {
    private m_geoJson?: any;
    private m_tileIndex?: any;

    /**
     * Constructs a new `GeoJsonDataProvider`.
     *
     * @param url URL of the input GeoJson.
     *
     * @returns New `GeoJsonDataProvider`.
     */
    constructor(readonly url: URL) {}

    async connect(): Promise<void> {
        const response = await fetch(this.url.href);
        if (!response.ok) {
            throw new Error(`${this.url.href} Status Text:  ${response.statusText}`);
        }
        const rawJSON = await response.text();

        this.m_geoJson = JSON.parse(rawJSON);
        this.m_tileIndex = geojsonvt.default(this.m_geoJson, {
            maxZoom: 20, // max zoom to preserve detail on
            indexMaxZoom: 5, // max zoom in the tile index
            indexMaxPoints: 100000, // max number of points per tile in the tile index
            tolerance: 3, // simplification tolerance (higher means simpler)
            extent: 4096, // tile extent
            buffer: 0, // tile buffer on each side
            lineMetrics: false, // whether to calculate line metrics
            promoteId: null, // name of a feature property to be promoted to feature.id
            generateId: false, // whether to generate feature ids. Cannot be used with promoteId
            debug: 0 // logging level (0, 1 or 2)
        });
    }

    ready(): boolean {
        return this.m_geoJson !== undefined;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<{}> {
        const tile = this.m_tileIndex.getTile(tileKey.level, tileKey.column, tileKey.row);
        if (tile === null) {
            return { features: [] };
        }
        tile.layer = this.url.pathname;
        return tile;
    }
}
