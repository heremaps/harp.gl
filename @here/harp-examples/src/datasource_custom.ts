/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Theme } from "@here/harp-datasource-protocol";
import { DebugTileDataSource } from "@here/harp-debug-datasource";
import { GeoCoordinates, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView, Tile } from "@here/harp-mapview";
import {
    DataProvider,
    TileDataSource,
    TileDataSourceOptions,
    TileFactory
} from "@here/harp-mapview-decoder";

import { CUSTOM_DECODER_SERVICE_TYPE } from "../decoder/custom_decoder_defs";

/**
 * This example shows how to create your own datasource with following features:
 * 1. Decoding and processing in a web-worker
 * 2. Usage of the styling engine in a custom datasource
 * 3. Creation of three.js objects in a web-worker
 * 4. Creating data that appears above and below ground level
 *
 * To achieve all this we have to implement a custom decoder:
 * ```typescript
 * [[include:custom_datasource_example_custom_decoder.ts]]
 * ```
 * A decoder is a class that encapsulates all the work that should be done in
 * a web-worker (i.e. decoding and processing).
 *
 * In this example we derive from [[ThemedTileDecoder]] b/c we also want to use
 * the styling capabilities of harp.gl. If styling is not needed one could also
 * derive from [[ITileDecoder]] directly.
 *
 * The main entry point for the decoder is the [[ThemedTileDecoder.decodeThemedTile]]
 * method (or [[ITileDecoder.decodeTile]] if no styling is needed). All CPU intensive
 * work, like decoding and processing, should go here, because this method is executed
 * in a web-worker. The input to this method (`data`) is coming from the main-thread
 * and is the result of the [[DataProvider.getTile]] method.
 *
 * The [[DataProvider]] is the component that is telling harp.gl where to get the data from.
 * The main method that has to be implemented is the [[DataProvider.getTile]] method.
 * This method is executed in the main thread and should not do any CPU intense work.
 * Normally you would just do a fetch here. The result is passed to a web-worker and gets
 * processed further. In this example we don't fetch any data, but just create some data on the
 * fly.
 * ```typescript
 * [[include:custom_datasource_example_custom_data_provider.ts]]
 * ```
 *
 * Finally we can create our `CustomDataSource`:
 * ```typescript
 * [[include:custom_datasource_example_custom_data_source.ts]]
 * ```
 * As you can see there is no functionality added but everything is used from [[TileDataSource]].
 * It is not mandatory to create a derived class but most likely it is needed at some point to
 * add custom logic.
 *
 * The more interesting part is the instantiation of our `CustomDataSource`:
 * ```typescript
 * [[include:custom_datasource_example_custom_data_source_create.ts]]
 * ```
 * There are two ways to tell the [[DataSource]] about our decoder. Either by setting a
 * [[TileDataSourceOptions.decoder|decoder]] instance or by specifying a
 * [[TileDataSourceOptions.concurrentDecoderServiceName|concurrentDecoderServiceName]].
 * The first approach would result in decoding the data in the main thread. That might
 * be useful for debugging or simple data sources, but we want to show the decoding in
 * a web-worker here, so we use
 * [[TileDataSourceOptions.concurrentDecoderServiceName|concurrentDecoderServiceName]].
 *
 * To understand the
 * [[TileDataSourceOptions.concurrentDecoderServiceName|concurrentDecoderServiceName]]
 * parameter we have to first understand the decoder bundle. All web-workers that are
 * created by harp.gl are loading the decoder bundle that
 * was specified in [[MapViewOptions.decoderUrl]] when creating the [[MapView]]:
 * ```typescript
 * [[include:custom_datasource_example_map_view_decoder_bundle.ts]]
 * ```
 * By default the url of the decoder bundle is "decoder.bundle.js" and is generated out of
 * {@link https://github.com/heremaps/harp.gl/blob/master/%40here/harp-examples/decoder/decoder.ts|decoder.ts}
 * (Assuming you created your app with the
 * {@link https://github.com/heremaps/harp.gl/blob/master/docs/GettingStartedGuide.md#yeoman|Yeoman generator}).
 *
 * The [[CustomDecoder]] has to be registered in the [[WorkerServiceManager]] during the
 * initialization of the decoder bundle. This is done in [[CustomDecoderService.start]]
 * ```typescript
 * [[include:custom_datasource_example_custom_decoder_service.ts]]
 * ```
 * We call [[CustomDecoderService.start]] in the previously mentioned decoder.ts.
 * ```typescript
 * [[include:custom_datasource_example_custom_decoder_service_start.ts]]
 * ```
 *
 * To properly geometry that is considerable higher or lower than the ground level, the bounding
 * boxes of the [[Tile]]s have to be enlarged to contain that geometry. If that is not done, the
 * tile may not be rendered at all, or the geometry may be clipped in some circumstances.
 *
 * In this example, the line is rendered at an altitude of -100m, making the line appear on
 * ground level when zoomed out, but increasingly far below ground level when zoomed in.
 *
 **/

export namespace CustomDatasourceExample {
    const MAX_GEOMETRY_HEIGHT = 100;
    const MIN_GEOMETRY_HEIGHT = -100;

    // snippet:custom_datasource_example_custom_data_provider.ts
    class CustomDataProvider extends DataProvider {
        // end:custom_datasource_example_custom_data_provider.ts
        connect() {
            // Here you could connect to the service.
            return Promise.resolve();
        }

        ready() {
            // Return true if connect was successful.
            return true;
        }

        getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
            // Generate some artificial data. Normally you would do a fetch here.
            // In this example we create some geometry in geo space that will be converted to
            // local world space by [[CustomDecoder.convertToLocalWorldCoordinates]]

            const data = new Array<number>();
            // Do some scaling so that the data fits into the tile.
            const scale = 10.0 / (1 << tileKey.level);
            data.push(0.0, 0.0);
            for (let t = 0.0; t < Math.PI * 4; t += 0.1) {
                const x = Math.cos(t) * t * scale * 0.5;
                const y = Math.sin(t) * t * scale;
                data.push(x, y);
            }
            return Promise.resolve(new Float32Array([data.length, ...data]));
        }

        /** @override */ dispose() {
            // Nothing to be done here.
        }
    }

    // It is not mandatory to create a derived class to represent the tiles from the
    // CustomDataSource. It is just done here to show that it's possible.
    class CustomTile extends Tile {}

    // snippet:custom_datasource_example_custom_data_source.ts
    class CustomDataSource extends TileDataSource<CustomTile> {
        // end:custom_datasource_example_custom_data_source.ts
        constructor(options: TileDataSourceOptions) {
            super(new TileFactory<CustomTile>(CustomTile), options);
        }
    }

    // Create a custom theme that will be used to style the data from the CustomDataSource.
    function customTheme(): Theme {
        const theme: Theme = {
            // Create some lights for the "standard" technique.
            lights: [
                {
                    type: "ambient",
                    color: "#FFFFFF",
                    name: "ambientLight",
                    intensity: 0.9
                },
                {
                    type: "directional",
                    color: "#CCCBBB",
                    name: "light1",
                    intensity: 0.8,
                    direction: {
                        x: 1,
                        y: 5,
                        z: 0.5
                    }
                },
                {
                    type: "directional",
                    color: "#F4DB9C",
                    name: "light2",
                    intensity: 0.8,
                    direction: {
                        x: -1,
                        y: -3,
                        z: 1
                    }
                }
            ],
            styles: {
                // "customStyleSet" has to match the StyleSetName that is passed when creating
                // the CustomDataSource.
                // We distinguish different data by using the layer attribute that comes with the
                // data.
                customStyleSet: [
                    {
                        when: ["==", ["get", "layer"], "line-layer"],
                        technique: "solid-line",
                        attr: {
                            color: "#ff0000",
                            lineWidth: "10px"
                        }
                    },
                    {
                        // We can have the same rule multiple times, so the source data will be
                        // used multiple times to generate the desired output geometry.
                        when: ["==", ["get", "layer"], "line-layer"],
                        technique: "dashed-line",
                        attr: {
                            color: "#ffff00",
                            dashSize: "30px",
                            gapSize: "20px",
                            lineWidth: "4px"
                        }
                    },
                    {
                        when: ["==", ["get", "layer"], "mesh-layer"],
                        technique: "standard",
                        attr: {
                            color: "#0000ff",
                            depthTest: true
                        }
                    }
                ]
            }
        };
        return theme;
    }

    // Create a new MapView for the HTMLCanvasElement of the given id.
    async function initializeMapView(id: string): Promise<MapView> {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const map = new MapView({
            canvas,
            theme: customTheme(),
            // The geometry below ground can create a large number of tiles at lower levels.
            // Increasing number of visible tiles to minimize gaps.
            maxVisibleDataSourceTiles: 300,
            // snippet:custom_datasource_example_map_view_decoder_bundle.ts
            decoderUrl: "decoder.bundle.js"
            // end:custom_datasource_example_map_view_decoder_bundle.ts
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt({ target: NY, zoomLevel: 16, tilt: 50, heading: -20 });
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);
        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        // snippet:custom_datasource_example_custom_data_source_create.ts
        const customDatasource = new CustomDataSource({
            name: "customDatasource",
            styleSetName: "customStyleSet",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: new CustomDataProvider(),
            // If you specify the decoder directly instead of the
            // concurrentDecoderServiceName the decoding will
            // happen in the main thread. This is useful for
            // debugging or if creating a decoder bundle is not
            // possible.
            // decoder: new CustomDecoder(),
            concurrentDecoderServiceName: CUSTOM_DECODER_SERVICE_TYPE,
            storageLevelOffset: -1,
            minGeometryHeight: MIN_GEOMETRY_HEIGHT,
            maxGeometryHeight: MAX_GEOMETRY_HEIGHT
        });
        map.addDataSource(customDatasource);
        // end:custom_datasource_example_custom_data_source_create.ts

        // Also visualize the tile borders:
        const debugDataSource = new DebugTileDataSource(webMercatorTilingScheme, "debug", 20);
        map.addDataSource(debugDataSource);

        return map;
    }

    initializeMapView("mapCanvas");
}
