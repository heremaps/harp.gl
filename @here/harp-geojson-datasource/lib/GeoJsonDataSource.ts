/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    OmvWithCustomDataProvider,
    OmvWithRestClientParams,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

/**
 * `GeoJsonDataSource` is used for the visualization of geometric objects provided in the GeoJSON
 * format. To be able to render GeoJSON data, a `GeoJsonDataSource` instance must be added to the
 * {@link @here/harp-mapview#MapView} instance.
 *
 * @example
 * ```typescript
 *    const geoJsonDataProvider = new GeoJsonDataProvider(
 *        "italy",
 *        new URL("resources/italy.json", window.location.href)
 *    );
 *    const geoJsonDataSource = new GeoJsonDataSource({
 *        dataProvider: geoJsonDataProvider,
 *        styleSetName: "geojson"
 *    });
 *    mapView.addDataSource(geoJsonDataSource);
 *   ```
 */
export class GeoJsonDataSource extends VectorTileDataSource {
    /**
     * Default constructor.
     *
     * @param params - Data source configuration's parameters.
     */
    constructor(params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
        super({ styleSetName: "geojson", ...params });
    }
}
