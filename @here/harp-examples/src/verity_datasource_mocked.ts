/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { DebugTileDataSource } from "@here/debug-datasource";
import { GeoCoordinates, TileKey } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { DataProvider } from "@here/mapview-decoder";
import { OmvDataSource } from "@here/omv-datasource";

export namespace WebTileDataSourceExample {
    const staticTileMorton = 1486027398;

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
         * @param abortSignal - optional AbortSignal to be used by the fetch function
         */
        async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike> {
            const url = `${this.basePath}/${tileKey.mortonCode()}.bin`;
            const resp = await fetch(url, { signal: abortSignal });
            return resp.arrayBuffer();
        }
    }

    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/theme.json"
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        MapControls.create(sampleMapView);

        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 2200);

        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        // center the camera on the statically loaded tile (somewhere around center of Berlin)
        const tileKey = TileKey.fromMortonCode(staticTileMorton);
        const tileGeoCenter = omvTestDataSource.getTilingScheme().getGeoBox(tileKey).center;
        sampleMapView.geoCenter = tileGeoCenter;

        return sampleMapView;
    }

    /**
     * `new TestTilesDataProvider("./resources")` with "./resources" is used instead of
     * e.g. "./resources/tiles-test-berlin" beause the currently used postinstall copy script
     * supports only flat catalogue/file structure. See this issue for more details:
     * https://github.com/calvinmetcalf/copyfiles/issues/40
     */
    // snippet:vislib_datasource_mocked_1.ts
    const omvTestDataSource = new OmvDataSource({
        dataProvider: new TestTilesDataProvider("./resources"),
        maxZoomLevel: 14,
        minZoomLevel: 14
    });

    const debugDataSource = new DebugTileDataSource(
        omvTestDataSource.getTilingScheme(),
        "debug",
        14
    );

    const mapView = initializeMapView("mapCanvas");
    // end:vislib_datasource_mocked_1.ts

    // snippet:vislib_datasource_mocked_2.ts
    mapView.addDataSource(omvTestDataSource);
    mapView.addDataSource(debugDataSource);

    // end:vislib_datasource_mocked_2.ts
}
