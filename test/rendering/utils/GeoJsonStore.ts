/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";
import RBush from "geojson-rbush";

/**
 * A simple {@link @here/harp-mapview-decoder/DataProvider} that organizes GeoJson features using an rtree.
 *
 * The `GeoJsonStore` can be used as a {@link @here/harp-mapview-decoder/DataProvider}
 * of {@link @here/harp-vectortile-datasource/VectorTileDataSource}s.
 *
 * @example
 * ```typescript
 * const geoJsonStore = new GeoJsonStore();
 *
 * const dataSource = new VectorTileDataSource({
 *    dataProvider: geoJsonStore,
 *    // ...
 * });
 *
 * geoJsonStore.features.insert(polygonFeature);
 * geoJsonStore.features.insert(lineStringFeature);
 * // ...
 * ```
 */
export class GeoJsonStore extends DataProvider {
    /**
     * The set of GeoJson features organized by this this `GeoJsonStore`.
     */
    readonly features = RBush();

    ready(): boolean {
        return true;
    }

    async getTile(tileKey: TileKey) {
        const { west, south, east, north } = webMercatorTilingScheme.getGeoBox(tileKey);
        const features = this.features.search([west, south, east, north]);
        return features;
    }

    protected async connect(): Promise<void> {}

    protected dispose(): void {}
}
