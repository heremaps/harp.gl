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

import { GeoCoordinates, TileKey, TilingScheme, webMercatorTilingScheme } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { DataSource, MapView, Tile } from "@here/mapview";
import * as THREE from "three";

// creates a new MapView for the HTMLCanvasElement of the given id
function initializeMapView(id: string): MapView {
    const canvas = document.getElementById(id) as HTMLCanvasElement;

    const sampleMapView = new MapView({
        canvas,
        theme: {} // dummy theme
    });

    // let the camera float over the map, looking straight down
    sampleMapView.camera.position.set(0, 0, 800);
    // center the camera somewhere around Berlin geo locations
    sampleMapView.geoCenter = new GeoCoordinates(52.51622, 13.37036, 0);

    // instantiate the default map controls, allowing the user to pan around freely.
    const controls = new MapControls(sampleMapView);
    controls.tiltEnabled = true;

    // resize the mapView to maximum
    sampleMapView.resize(window.innerWidth, window.innerHeight);

    // react on resize events
    window.addEventListener("resize", () => {
        sampleMapView.resize(window.innerWidth, window.innerHeight);
    });

    return sampleMapView;
}

/**
 * A simple Hello World Data Source. Paints a single red dot in the center of every tile at zoom
 * level 14. All data sources extend the [[DataSource]] class:
 *
 * ```typescript
 * class HelloDataSource extends DataSource {
 * ```
 *
 * In the constructor, the constructor of the super class is called first passing the `name` of the
 * data source. Then, the [[DataSource.cacheable]] property is set to true to inform that the tiles
 * generated by this data source can be cached and [[MapView]] should manage the lifetime of
 * [[Tile]] objects created by this data source:
 *
 * ```typescript
 * [[include:vislib_datasource_hello_1.ts]]
 * ```
 *
 * Next the [[TilingScheme]] the generated [[Tile]] objects adhere to by overriding the
 * [[DataSource.getTilingScheme]] method. In this example, the [[webMercatorTilingScheme]] is used:
 *
 * ```typescript
 * [[include:vislib_datasource_hello_2.ts]]
 * ```
 *
 * Currently rendering is limited to zoom level 14 by overriding [[DataSource.shouldRender]]:
 *
 * ```typescript
 * [[include:vislib_datasource_hello_3.ts]]
 * ```
 *
 * Lastly, the red dot needs to be rendered. For that, a geometry and a material is needed passed to
 * the THREE.js object:
 *
 * ```typescript
 * [[include:vislib_datasource_hello_4.ts]]
 * ```
 *
 * Here, a basic material with a red color, and a circle geometry with radius 100 and 32 segments
 * is declared:
 *
 * ```typescript
 * [[include:vislib_datasource_hello_5.ts]]
 * ```
 *
 * At first a new [[Tile]] object was created. Every tile can have zero or more [[THREE]] objects,
 * in this case, there is a new Mesh with a geometry and material created. [[MapView]] handles
 * caching the tile.
 */
export namespace HelloDataSourceExample {
    export class HelloDataSource extends DataSource {
        // snippet:vislib_datasource_hello_4.ts
        readonly material = new THREE.MeshBasicMaterial({
            color: 0xff0000
        });

        // the geometry of our circle. Radius is 100, segment count is 32
        readonly geometry = new THREE.CircleGeometry(100, 32);
        // end:vislib_datasource_hello_4.ts

        // snippet:vislib_datasource_hello_1.ts
        constructor() {
            super("HelloDataSource");
            this.cacheable = true;
        }
        // end:vislib_datasource_hello_1.ts

        // snippet:vislib_datasource_hello_2.ts
        getTilingScheme(): TilingScheme {
            return webMercatorTilingScheme;
        }

        // snippet:vislib_datasource_hello_3.ts
        // tslint:disable-next-line:no-unused-variable
        shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
            return tileKey.level === 14;
        }
        // end:vislib_datasource_hello_3.ts

        // snippet:vislib_datasource_hello_5.ts
        getTile(tileKey: TileKey): Tile | undefined {
            // Create a new tile.
            const tile = new Tile(this, tileKey);

            // add a red circle
            tile.objects.push(new THREE.Mesh(this.geometry, this.material));

            // and finally return it
            return tile;
        }
        // end:vislib_datasource_hello_5.ts
    }

    const mapView = initializeMapView("mapCanvas");
    mapView.addDataSource(new HelloDataSource());
}
