/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    GeoCoordinates,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    DataSource,
    MapView,
    TextElement,
    Tile
} from "@here/harp-mapview";
import { FontUnit } from "@here/harp-text-canvas";
import { assert } from "@here/harp-utils";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey, copyrightInfo } from "../config";

const USER_MARKER_DATASOURCE = "user-markers-datasource";

/**
 * This example illustrates how to add user markers in [[MapView]]. Markers can be added and
 * removed interactively in this example. The marker data is handled in a [[DataSource]].
 *
 * First we create a base map. For more details, check the `hello` example.
 *
 * ```typescript
 * [[include:datasource_user_markers_1.ts]]
 * ```
 *
 * We implement a [[DataSource]] to store the user markers. It allows to add a marker at a
 * specified location, remove a single marker, as well as remove all markers. In this example all
 * markers are stored in the "root" tile of the datasource, which simplifies the datasource,
 * because there is no tiling involved. A very large numbers of markers may impact performance,
 * though.
 *
 * ```typescript
 * [[include:datasource_user_markers_datasource.ts]]
 * ```
 *
 * To show images along with the markers, they have to be declared in the [[ImageCache]]. The
 * name for the PNG image used here is "poi-icon". This name is used in all [[TextElement]]s that
 * use the icon.
 *
 * ```typescript
 * [[include:datasource_user_markers_add_datasource.ts]]
 * ```
 *
 * The picking code is simple, since the markers get a reference to themselves added in their
 * "userData". If an existing marker is picked, it will be removed.
 *
 * ```typescript
 * [[include:datasource_user_markers_handle_pick.ts]]
 * ```
 *
 * An event handler is attached to handle mouse clicks in the canvas of [[MapView]]. If valid
 * geo coordinate can be determined, a new marker is added at that location.
 *
 * ```typescript
 * [[include:datasource_user_markers_handle_clicks.ts]]
 * ```
 */

export namespace UserMarkersExample {
    // snippet:datasource_user_markers_datasource.ts
    class UserMarkerDataSource extends DataSource {
        private tile?: Tile;
        private nextFeatureId: number = 0;
        constructor() {
            super({ name: USER_MARKER_DATASOURCE });
            this.cacheable = true;
        }

        /** @override */ getDataZoomLevel(_zoomLevel: number): number {
            return 0;
        }

        /** @override */ getTile(tileKey: TileKey): Tile | undefined {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return this.getRootTile();
        }

        getRootTile(): Tile {
            if (this.tile === undefined) {
                this.tile = new Tile(this, TileKey.fromRowColumnLevel(0, 0, 0));
                // Mark the tile has ready to be rendered, needed for tiles with only text elements.
                this.tile.forceHasGeometry(true);
            }
            return this.tile;
        }

        addMarker(geoPoint: GeoCoordinates) {
            const tile = this.getRootTile();
            // Compute world space location where the market will be placed.
            const projectedPoint = this.projection.projectPoint(geoPoint, new THREE.Vector3());

            const text = "Marker " + this.nextFeatureId;
            const textElement = new TextElement(
                text,
                projectedPoint,
                // text render style parameters
                {
                    fontSize: { unit: FontUnit.Pixel, size: 12, backgroundSize: 12 },
                    color: new THREE.Color("red")
                },
                // text layout style parameters
                {}
            );

            // Unique feature id identifying the text element. Two text elements sharing the same
            // feature id are considered to belong to the same map object (e.g. two icons
            // representing the same POI on different zoom levels). This feature id is also returned
            // when the text element is picked.
            textElement.featureId = this.nextFeatureId;

            // Text drawing order is controlled by this attribute. The lower the value, the sooner
            // its drawn.
            textElement.renderOrder = this.nextFeatureId;
            ++this.nextFeatureId;
            // Allow the text in the marker to overlap other text elements.
            textElement.mayOverlap = true;
            textElement.yOffset = -15;
            textElement.poiInfo = {
                technique: {
                    name: "labeled-icon",
                    iconYOffset: 20,
                    renderOrder: this.nextFeatureId
                },

                mayOverlap: true, // Allow the icon in the marker to overlap other text elements.
                renderTextDuringMovements: true, // draw text on camera movements.
                imageTextureName: "poi-icon",
                textElement
            };
            // User data returned when the text element is picked.
            textElement.userData = { textElement };
            tile.addUserTextElement(textElement);
            this.requestUpdate();
        }

        removeMarker(marker: TextElement) {
            this.getRootTile().removeUserTextElement(marker);
            this.requestUpdate();
        }

        /** @override */ getTilingScheme(): TilingScheme {
            return webMercatorTilingScheme;
        }

        clearMarkers() {
            this.getRootTile().clearTextElements();
            this.nextFeatureId = 0;
            this.requestUpdate();
        }
        // end:datasource_user_markers_datasource.ts
    }

    // Basic initialization of the MapView.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });
        CopyrightElementHandler.install("copyrightNotice", mapView);

        mapView.geoCenter = new GeoCoordinates(52.5, 13.4, 60000);

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls);
        mapView.canvas.parentElement!.appendChild(ui.domElement);

        // react on resize events
        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return mapView;
    }

    function attachDataSources(mapView: MapView) {
        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxDataLevel: 17,
            authenticationCode: apikey,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "apikey"
            },
            copyrightInfo
        });
        mapView.addDataSource(omvDataSource);

        // snippet:datasource_user_markers_add_datasource.ts
        const userMarkersDataSource = new UserMarkerDataSource();
        mapView.addDataSource(userMarkersDataSource).then(() => {
            mapView.imageCache.addImage("poi-icon", "resources/poi_marker.png", true);
            mapView.poiManager.addImageTexture({
                name: "poi-icon",
                image: "poi-icon"
            });
        });
        // end:datasource_user_markers_add_datasource.ts
    }

    // snippet:datasource_user_markers_handle_pick.ts
    // Handle picking. Returns `true` if the picking activity has been handled, `false` otherwise.
    function handlePick(
        mapView: MapView,
        markerDataSource: UserMarkerDataSource,
        x: number,
        y: number
    ): boolean {
        // Retrieve all map objects at screen coordinate, and filter all found items, keeping those
        // that have the property "textElement" defined, which is the case for the user markers
        // added previously.
        const results = mapView
            .intersectMapObjects(x, y)
            .filter(item => item.userData?.textElement !== undefined ?? false);

        if (results.length === 0) {
            // Nothing found at coordinate.
            return false;
        }

        // Remove the marker we found from the datasource.
        markerDataSource.removeMarker(results[0].userData!.textElement);
        return true;
    }
    // end:datasource_user_markers_handle_pick.ts

    function attachClickEvents(mapView: MapView) {
        const userMarkersDataSource = mapView.getDataSourceByName(
            USER_MARKER_DATASOURCE
        ) as UserMarkerDataSource;

        assert(userMarkersDataSource !== undefined, "Needs UserMarkerDataSource");

        // snippet:datasource_user_markers_handle_clicks.ts
        mapView.canvas.addEventListener("click", event => {
            if (event.shiftKey) {
                if (handlePick(mapView, userMarkersDataSource, event.pageX, event.pageY)) {
                    // pick has been handled.
                    return;
                }
                const geo = mapView.getGeoCoordinatesAt(event.clientX, event.clientY);
                if (geo !== null) {
                    // Clicked on a valid map coordinate, adding a marker.
                    userMarkersDataSource.addMarker(geo);
                }
            }
        });
        // end:datasource_user_markers_handle_clicks.ts

        window.addEventListener("keypress", event => {
            if (event.key === "c") {
                userMarkersDataSource.clearMarkers();
            }
        });

        const instructions = `
Shift + Left-Click to add a marker<br/>
or pick one to be removed.<br/>
Press 'c' to clear the map.<br/>`;
        const message = document.createElement("div");
        message.style.position = "absolute";
        message.style.cssFloat = "right";
        message.style.top = "10px";
        message.style.right = "10px";
        message.style.backgroundColor = "grey";
        message.innerHTML = instructions;
        document.body.appendChild(message);
    }

    // snippet:datasource_user_markers_1.ts
    const map = initializeMapView("mapCanvas");
    // end:datasource_user_markers_1.ts

    attachDataSources(map);
    attachClickEvents(map);
}
