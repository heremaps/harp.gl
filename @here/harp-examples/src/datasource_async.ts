/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, TileKey, TilingScheme, webMercatorTilingScheme } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { DataSource, MapView, Tile } from "@here/mapview";
import * as THREE from "three";
/**
 * An example of using the [[AsyncDataSource]] data source. Create a [[AsyncDataSource]]
 * and then add the terrainDataSource to your [[MapView]] and check if it renders on the map canvas.
 *
 * ```typescript
 * [[include:vislib_async_datasource_0.ts]]
 * ```
 */
export namespace AsyncDataSourceExample {
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
     * The [[AsyncDataSourceTile]]'s function [[AsyncDataSourceTile.createGeometries]] is called
     * once the tile is decoded:
     *
     * ```typescript
     * [[include:vislib_async_datasource_1.ts]]
     * ```
     */
    export class AsyncDataSourceTile extends Tile {
        geometry?: THREE.Geometry;
        material?: THREE.MeshMaterialType | THREE.MeshMaterialType[];

        // this is called once the tile is decoded. Populate our geometries
        // snippet:vislib_async_datasource_1.ts
        createGeometries(): void {
            this.objects.push(new THREE.Mesh(this.geometry, this.material));
        }
        // end:vislib_async_datasource_1.ts
    }

    /**
     * The [[AsyncDataSource]] class shows an example of two asynchronous processes in use:
     * Asynchronous initialization in [[AsyncDataSource.connect]]:
     *
     * ```typescript
     * [[include:vislib_async_datasource_2.ts]]
     * ```
     *
     * Asynchronous tile population in [[AsyncDataSource.getTile]]:
     *
     * ```typescript
     * [[include:vislib_async_datasource_3.ts]]
     * ```
     *
     */
    export class AsyncDataSource extends DataSource {
        // a simple red solid material
        readonly material = new THREE.MeshBasicMaterial({
            color: 0xff0000
        });

        // the geometry of our circle. Radius is 100, segment count is 32
        readonly geometry = new THREE.CircleGeometry(100, 32);

        // a flag that indicates whether the connection is active or not.
        isConnected = false;

        constructor(name: string = "asyncDataSource") {
            // Call our parent's constructor, passing the name of our data source
            super(name);

            this.cacheable = true;
        }

        // this function returns whether our data source was connected.
        ready(): boolean {
            return this.isConnected;
        }

        // tell which tiling scheme this data source uses.
        getTilingScheme(): TilingScheme {
            return webMercatorTilingScheme;
        }

        // snippet:vislib_async_datasource_2.ts
        // if datasource needs to be initialized asynchronously, reimplement the connect() method
        connect(): Promise<void> {
            // call some async method, then set isConnected to true.
            return new Promise<void>(resolve => {
                setTimeout(() => {
                    this.isConnected = true;
                    resolve();
                }, 500);
            });
        }
        // end:vislib_async_datasource_2.ts

        // snippet:vislib_async_datasource_3.ts
        // getTile will not be called before [[DataSource]] is actually connected, e.g. connect()
        // is resolved).
        getTile(tileKey: TileKey): Tile | undefined {
            // create a new tile object
            const tile = new AsyncDataSourceTile(this, tileKey);
            tile.geometry = this.geometry;
            tile.material = this.material;

            // Asynchronously create the geometries of the tile
            setTimeout(() => {
                tile.createGeometries();
                // since the geometries are updated asynchronously, MapView needs to be informed to
                // update the scene
                this.requestUpdate();
            }, 500);

            return tile;
        }
        // end:vislib_async_datasource_3.ts

        // tell MapView to only render tiles at level 14
        // tslint:disable-next-line:no-unused-variable
        shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
            return tileKey.level === 14;
        }
    }

    //snippet:vislib_async_datasource_0.ts
    const mapView = initializeMapView("mapCanvas");
    mapView.addDataSource(new AsyncDataSource());
    //end:vislib_async_datasource_0.ts
}
