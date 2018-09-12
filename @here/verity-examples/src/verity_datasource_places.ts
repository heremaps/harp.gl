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
import { PoiTechnique } from "@here/datasource-protocol";
import { GeoCoordinates, hereTilingScheme, TileKey, TilingScheme } from "@here/geoutils";
import { GeoCoordinatesLike } from "@here/geoutils/lib/coordinates/GeoCoordinatesLike";
import { MapControls } from "@here/map-controls";
import {
    DataSource,
    DEFAULT_TEXT_DISTANCE_SCALE,
    MapView,
    MapViewEventNames,
    TextElement,
    Tile
} from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";
import * as places from "@here/places";
import { LoggerManager } from "@here/utils";
import * as THREE from "three";

import { appCode, appId } from "../config";
import { bearerTokenProvider } from "./common";

const logger = LoggerManager.instance.create("verity_datasource_places");

document.body.innerHTML += `
    <style>
        #search-box {
            position: absolute;
            top: 0;
            lefT: 0;
        }

        #search-query {
            margin: 20px 0 0 20px;
        }

        #search-btn {
            width: 150px;
        }
    </style>

    <div class="search-box">
        <input id="search-query" type="search">
        <button id="search-btn">SEARCH</div>
    </div>
`;

/**
 * This example leverages the points of interest (POIs) search via the HERE Places (Search) API.
 * The `@here/places` helper utility library is used for that purpose, and specifically the
 * [[PlacesService]] class. For a detailed description of the search method used in this example
 * please refer to the following detailed documentation:
 *    https://developer.here.com/documentation/places/topics_api/resource-search.html
 *
 * The way the [[PlacesService]] service is invoked within the `searchPoints(searchString: string)`
 * function:
 *
 * ```typescript
 * [[include:vislib_search_datasource_1.ts]]
 * ```
 *
 * This example uses also the [[SearchResultDataSource]] data source to show search results on the
 * map.
 *
 * ```typescript
 * [[include:vislib_search_datasource_0.ts]]
 * ```
 */
export namespace SearchResultDataSourceExample {
    /**
     * This class enables showing search results on a map. The instance of
     * [[SearchResultDataSource]] can be created in the following way:
     *
     * ```typescript
     * [[include:vislib_search_datasource_0.ts]]
     * ```
     */
    export class SearchResultDataSource extends DataSource {
        static getCoordinates(link: places.PlaceLink): GeoCoordinatesLike {
            return { latitude: link.position[0], longitude: link.position[1] };
        }

        private m_tile: Tile | undefined;

        // Define the common traits of the POI icon. Would normally be part of the theme / style.
        private m_poiTechnique: PoiTechnique = {
            name: "labeled-icon",
            screenHeight: 32,
            iconYOffset: 16
        };

        constructor(name = "search") {
            super(name);
        }

        setSearchResult(result: places.SearchResult) {
            this.getRootTile().clear();

            for (const link of result.results.items) {
                if (!places.isPlaceLink(link)) {
                    continue;
                }
                this.appendLink(link);
            }

            this.requestUpdate();
        }

        // tslint:disable-next-line:no-unused-variable
        shouldRender(zoomLevel: number, tileKey: TileKey) {
            return tileKey.mortonCode() === 1;
        }

        getTilingScheme(): TilingScheme {
            return hereTilingScheme;
        }

        getTile(tileKey: TileKey): Tile | undefined {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return this.getRootTile();
        }

        private getRootTile(): Tile {
            if (this.m_tile === undefined) {
                this.m_tile = new Tile(this, TileKey.fromRowColumnLevel(0, 0, 0));
            }
            return this.m_tile;
        }

        private appendLink(link: places.PlaceLink) {
            const tile = this.getRootTile();
            const location = SearchResultDataSource.getCoordinates(link);
            const iconCoords = this.projection.projectPoint(location, new THREE.Vector3());
            const labelCoords = iconCoords.clone();

            // Tile geomentry & labels must be relative to tile center
            iconCoords.sub(tile.center);
            labelCoords.sub(tile.center);

            // create TextElement for label
            const label: string = link.title;
            const priority = 1000;
            const scale = 0.5;
            // The link id is a string, so we cannot set it as the featureId. The userData field
            // is used to reference the link object. See below.
            const featureId = 0;
            const textElement = new TextElement(
                label,
                labelCoords,
                priority,
                scale,
                0,
                -12,
                featureId,
                "placeMarker"
            );

            // Relative to other labels only, not other map elements! A value of >= 1 will make
            // these TextElements render in front of all other map elements.
            textElement.renderOrder = 10;

            textElement.mayOverlap = false;
            textElement.reserveSpace = true;

            // Set the userData of the TextElement to the link, then it will be available for
            // picking.
            textElement.userData = link;

            const textIsOptional = true;
            const iconIsOptional = false;
            const renderTextDuringMovements = true;
            const mayOverlap = false;
            const reserveSpace = false;
            const distanceScale = DEFAULT_TEXT_DISTANCE_SCALE;
            const imageTextureName = "location";

            textElement.poiInfo = {
                technique: this.m_poiTechnique,
                imageTextureName,
                textElement,
                textIsOptional,
                iconIsOptional,
                renderTextDuringMovements,
                mayOverlap,
                reserveSpace,
                featureId
            };

            textElement.distanceScale = distanceScale;

            tile.addUserTextElement(textElement);
        }
    }

    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/day.json"
        });

        // Wait for theme to be loaded, and schedule registering the image for the POI.
        // This is a necessary workaround until HARP-3354 is implemented.
        sampleMapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
            window.setTimeout(() => {
                sampleMapView.imageCache.addImage("location", "resources/location.png", true);
                sampleMapView.poiManager.addImageTexture({
                    name: "location",
                    image: "location"
                });
            }, 0);
        });

        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 800);
        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // instantiate the default map controls, allowing the user to pan around freely.
        // tslint:disable-next-line:no-unused-expression
        new MapControls(sampleMapView);

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        return sampleMapView;
    }

    const mapView = initializeMapView("mapCanvas");

    // snippet:vislib_search_datasource_0.ts
    const searchResultDataSource = new SearchResultDataSource();

    mapView.addDataSource(searchResultDataSource);
    // end:vislib_search_datasource_0.ts

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
        apiFormat: APIFormat.HereV1,
        authenticationCode: bearerTokenProvider
    });
    mapView.addDataSource(omvDataSource);

    /**
     * Points (or POIs) search is done using HERE
     * Places (Search) API
     *
     * `@here/places` is used as helper utility library.
     *
     * Search method used in this example is documented here:
     *    https://developer.here.com/documentation/places/topics_api/resource-search.html
     */
    // snippet:vislib_search_datasource_1.ts
    const placesService = new places.PlacesService(appId, appCode);

    function searchPoints(searchString: string) {
        const query = searchString;
        const options: places.AutoSuggestOptions = {
            textFormat: "plain",
            size: 50
        };
        const location = mapView.geoCenter;

        logger.log("#searchPoints searching for %s", query);
        placesService
            .search(query, location, options)
            .then((result: places.SearchResult) => {
                logger.log("#searchPoints: ok, %s items found", result.results.items.length);
                searchResultDataSource.setSearchResult(result);
            })
            .catch((error: Error) => {
                logger.error("#searchPoints: failed", error);
            });
    }
    // end:vislib_search_datasource_1.ts

    function initSearchButton() {
        const searchQuery = document.getElementById("search-query") as HTMLInputElement;
        const searchButton = document.getElementById("search-btn");

        if (searchQuery === null || searchButton === null) {
            return;
        }

        searchQuery.value = "restaurant";
        searchButton.onclick = () => {
            logger.log("#search-btn", searchQuery.value);
            searchPoints(searchQuery.value);
        };
    }

    window.onload = () => {
        initSearchButton();
    };
}
