/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/** @module @here/geojson-datasource **/ /***/

import { webMercatorTilingScheme } from "@here/geoutils";
import { ConcurrentDecoderFacade } from "@here/mapview";
import { DataProvider, TileDataSource, TileFactory } from "@here/mapview-decoder";
import { GeoJsonTile } from "./GeoJsonTile";

/**
 * Parameters to initialize the data source.
 */
export interface GeoJsonDataSourceParameters {
    dataProvider: DataProvider;
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
            id: "geojson",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: params.dataProvider,
            decoder: ConcurrentDecoderFacade.getTileDecoder("geojson"),
            useWorker: true,
            concurrentDecoderServiceName: "geojson"
        });
    }

    async connect(): Promise<void> {
        await super.connect();
        await this.decoder.connect();
    }
}
