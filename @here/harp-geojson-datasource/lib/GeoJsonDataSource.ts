/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { webMercatorTilingScheme } from "@here/harp-geoutils";
import { DataProvider, TileDataSource, TileFactory } from "@here/harp-mapview-decoder";
import { GeoJsonTile } from "./GeoJsonTile";

/**
 * Parameters to initialize the data source.
 */
export interface GeoJsonDataSourceParameters {
    dataProvider: DataProvider;

    /**
     * The unique name of this [[GeoJsonDataSource]].
     */
    name?: string;

    /**
     * The name of the [[StyleSet]] that this [[GeoJsonDataSource]] should use for decoding.
     *
     *  @default "geojson"
     */
    styleSetName?: string;
}

/**
 * `GeoJsonDataSource` is used for the visualization of geometric objects provided in the GeoJSON
 * format. To be able to render GeoJSON data, a `GeoJsonDataSource` instance must be added to the
 * [[MapView]] instance.
 *
 * @example <caption><b>Example usage of GeoJsonDataSource:</b></caption>
 * <pre>
 * const geoJsonDataSource = new GeoJsonDataSource({
 *    dataStore: {
 *       dataProvider: new XYZDataProvider({baseUrl, spaceId, token})
 *    }
 * });
 *
 * mapView.addDataSource(geoJsonDataSource);
 * // Show geoJSON data on specific tile
 * geoJsonDataSource.selectTile(geoJsonDataTile, mapView.projection);
 * </pre>
 */
export class GeoJsonDataSource extends TileDataSource<GeoJsonTile> {
    /**
     * Default constructor.
     *
     * @param params Data source configuration's parameters.
     */
    constructor(readonly params: GeoJsonDataSourceParameters) {
        super(new TileFactory(GeoJsonTile), {
            styleSetName: params.styleSetName || "geojson",
            name: params.name,
            tilingScheme: webMercatorTilingScheme,
            dataProvider: params.dataProvider,
            concurrentDecoderServiceName: "geojson-tile-decoder",
            storageLevelOffset: -1
        });
    }

    /** @override */
    async connect(): Promise<void> {
        await super.connect();
        await this.decoder.connect();
    }
}
