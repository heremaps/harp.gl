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
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import * as THREE from "three";
import { apikey } from "../config";

const USER_MARKER_DATASOURCE = "user-markers-datasource";

/**
 * Basic example showing how to create a custom data source providing user text elements
 * that change on arbitrary events.
 */
export namespace LabellingUserMarkers {
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
            tile.addTextElement(textElement);
            this.requestUpdate();
        }

        removeMarker(marker: TextElement) {
            this.getRootTile().removeTextElement(marker);
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
    }

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
            authenticationCode: apikey
        });
        mapView.addDataSource(omvDataSource);

        const userMarkersDataSource = new UserMarkerDataSource();
        mapView.addDataSource(userMarkersDataSource).then(() => {
            mapView.imageCache.addImage("poi-icon", "resources/poi_marker.png", true);
            mapView.poiManager.addImageTexture({
                name: "poi-icon",
                image: "poi-icon"
            });
        });
    }

    function handlePick(
        mapView: MapView,
        markerDataSource: UserMarkerDataSource,
        x: number,
        y: number
    ): boolean {
        const results = mapView
            .intersectMapObjects(x, y)
            .filter(item => item.userData?.textElement !== undefined ?? false);

        if (results.length === 0) {
            return false;
        }

        markerDataSource.removeMarker(results[0].userData!.textElement);
        return true;
    }

    function attachClickEvents(mapView: MapView) {
        const userMarkersDataSource = mapView.getDataSourceByName(
            USER_MARKER_DATASOURCE
        ) as UserMarkerDataSource;

        assert(userMarkersDataSource !== undefined, "Needs ScreenBlockingDatasource");

        mapView.canvas.addEventListener("click", event => {
            if (event.shiftKey) {
                if (handlePick(mapView, userMarkersDataSource, event.pageX, event.pageY)) {
                    return;
                }
                const geo = mapView.getGeoCoordinatesAt(event.clientX, event.clientY);
                if (geo !== null) {
                    userMarkersDataSource.addMarker(geo);
                }
            }
        });

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

    const map = initializeMapView("mapCanvas");
    attachDataSources(map);
    attachClickEvents(map);
}
