/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJson, isFeatureGeometry, ITiler } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
// @ts-ignore
import * as geojsonvtExport from "geojson-vt";

// to be able to run tests on nodejs
const geojsonvt = geojsonvtExport.default ?? geojsonvtExport;

const EXTENT = 4096;

// the factor used to compute the size of the buffer.
const BUFFER_FACTOR = 0.05;

// align the buffer to the next integer multiple of 2.
const BUFFER = -(-Math.ceil(EXTENT * BUFFER_FACTOR) & -2);

interface GeoJsonVtIndex {
    geojson: GeoJson;
    getTile(level: number, column: number, row: number): any;
}

export class GeoJsonTiler implements ITiler {
    indexes: Map<string, GeoJsonVtIndex>;

    constructor() {
        this.indexes = new Map();
    }

    dispose() {
        /* */
    }

    async connect(): Promise<void> {
        return await Promise.resolve();
    }

    async registerIndex(indexId: string, input: URL | GeoJson): Promise<void> {
        if (this.indexes.has(indexId)) {
            return;
        }
        return await this.updateIndex(indexId, input);
    }

    async updateIndex(indexId: string, input: URL | GeoJson): Promise<void> {
        if (input instanceof URL) {
            const response = await fetch(input.href);
            if (!response.ok) {
                throw new Error(
                    `GeoJsonTiler: Unable to fetch ${input.href}: ${response.statusText}`
                );
            }
            input = (await response.json()) as GeoJson;
        } else {
            input = input as GeoJson;
        }

        // Generate ids only if input doesn't have them.
        const generateId =
            isFeatureGeometry(input) ||
            input.type === "GeometryCollection" ||
            (input.type === "Feature" && input.id === undefined) ||
            (input.type === "FeatureCollection" &&
                input.features.length > 0 &&
                input.features[0].id === undefined);
        const index = geojsonvt(input, {
            maxZoom: 20, // max zoom to preserve detail on
            indexMaxZoom: 5, // max zoom in the tile index
            indexMaxPoints: 100000, // max number of points per tile in the tile index
            tolerance: 3, // simplification tolerance (higher means simpler)
            extent: EXTENT, // tile extent
            buffer: BUFFER, // tile buffer on each side
            lineMetrics: false, // whether to calculate line metrics
            promoteId: null, // name of a feature property to be promoted to feature.id
            generateId, // whether to generate feature ids. Cannot be used with promoteId
            debug: 0 // logging level (0, 1 or 2)
        });
        index.geojson = input;

        this.indexes.set(indexId, index);
    }

    async getTile(indexId: string, tileKey: TileKey): Promise<{}> {
        const index = this.indexes.get(indexId);
        if (index === undefined) {
            throw new Error("Tile not found");
        }
        const tile = index.getTile(tileKey.level, tileKey.column, tileKey.row);
        if (tile !== null) {
            tile.layer = indexId;
        }
        return tile || {};
    }
}
