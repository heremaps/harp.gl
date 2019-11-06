/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJson, ITiler } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";

// tslint:disable-next-line:no-var-requires
const geojsonvtExport = require("geojson-vt");
// to be able to run tests on nodejs
const geojsonvt = geojsonvtExport.default || geojsonvtExport;

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
        return Promise.resolve();
    }

    async registerIndex(indexId: string, input: URL | GeoJson): Promise<void> {
        if (this.indexes.has(indexId)) {
            return;
        }
        return this.updateIndex(indexId, input);
    }

    async updateIndex(indexId: string, input: URL | GeoJson): Promise<void> {
        if (input instanceof URL) {
            const response = await fetch(input.href);
            if (!response.ok) {
                throw new Error(
                    `GeoJsonTiler: Unable to fetch ${input.href}: ${response.statusText}`
                );
            }
            input = await response.json();
        } else {
            input = input as GeoJson;
        }

        const index = geojsonvt(input, {
            maxZoom: 20, // max zoom to preserve detail on
            indexMaxZoom: 5, // max zoom in the tile index
            indexMaxPoints: 100000, // max number of points per tile in the tile index
            tolerance: 3, // simplification tolerance (higher means simpler)
            extent: 4096, // tile extent
            buffer: 0, // tile buffer on each side
            lineMetrics: false, // whether to calculate line metrics
            promoteId: null, // name of a feature property to be promoted to feature.id
            generateId: true, // whether to generate feature ids. Cannot be used with promoteId
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
            for (const feature of tile.features) {
                feature.originalGeometry = this.getOriginalGeometry(feature, index.geojson);
            }
        }
        return tile || {};
    }

    private getOriginalGeometry(feature: any, geojson: GeoJson): any {
        switch (geojson.type) {
            case "Point":
            case "MultiPoint":
            case "LineString":
            case "MultiLineString":
            case "Polygon":
            case "MultiPolygon":
            case "GeometryCollection":
                return geojson;
            case "Feature":
                return geojson.geometry;
            case "FeatureCollection":
                return geojson.features[feature.id].geometry;
        }
    }
}
