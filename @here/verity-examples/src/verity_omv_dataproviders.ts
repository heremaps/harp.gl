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

import { GeoCoordinates } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import {
    APIFormat,
    FeatureModifierId,
    OmvDataSource,
    OmvFeatureFilterDescriptionBuilder
} from "@here/omv-datasource";
import { OmvTileDecoder } from "@here/omv-datasource/lib/OmvDecoder";
import { bearerTokenProvider } from "./common";

/**
 * The MapView initialization creates a new MapView with an initial configuration. It returns
 * a [[MapView]] object.
 *
 * [[initializeMapView]] accepts a string which is the id of the DOM element, where the mapcanvas
 * will be added to. More information regardin this method can be found in [[HelloWorldExample]].
 *
 * This example shows the usage of different DataProviders for an OmvDataSource.
 *
 * The first DataSource created uses DataProviders with a REST API.
 * Therefore the ParameterList for the [[OmvDatasource]] is [[OmvWithRestClientParams]].
 * A minimal set of parameters is the [[OmvWithRestClientParams.baseUrl]] and a
 * [[OmvRestClient.APIFormat]].
 *
 * ```typescript
 * [[include:vislib_hello_world_example_5.ts]]
 * ```
 *
 * The HERE Vector Tiles Server needs sentry authentication. The necessary bearer token can be
 * created adding a config file with the access.key.id and the access.key.secret as described in the
 * [[oauth-requester]] module. Then the `getBearerToken`function can be passed.
 *
 * ```typescript
 * [[include:vislib_hello_world_example_7.ts]]
 * ```
 *
 * To use the Mapbox API an authenticationCode is required additionally to the baseUrl
 * ```typescript
 * [[include:vislib_hello_world_example_8.ts]]
 * ```
 * To use the Mapbox API an authenticationCode is required additionally to the baseUrl
 * ```typescript
 * [[include:vislib_hello_world_example_8.ts]]
 * ```
 *
 * To use the TomTom API an authenticationCode is required additionally to the baseUrl. As the
 * TomTom Tiles are structured differently a FeatureModifier is needed to be able to use the default
 * style file.
 * ```typescript
 * [[include:vislib_hello_world_example_9.ts]]
 * ```
 */
export namespace OmvDataProviders {
    document.body.innerHTML += `
    <style>
        #provider-selection {
            display: inline-block;
            background-color: rgba(255,255,255,0.5);
            margin: 20px 0 0 20px;
            padding: 10px; cursor: pointer;
            user-select: none;
        }
    </style>

      <form name="providerSelection" id="provider-selection" onSubmit="return false;">

        <input type="radio" id="here-rest"
         name="tileprovider" value="here-rest" checked/>
        <label for="here-rest">Here Rest API V1</label>

        <input type="radio" id="mapbox"
         name="tileprovider" value="mapbox" disabled/>
        <label for="mapbox">MapBox Rest API</label>

        <input type="text" id="mapbox-auth"
         name="mapbox-auth" value="<enter mapbox key>" />

        <input type="radio" id="tomtom"
         name="tileprovider" value="tomtom" disabled/>
        <label for="tomtom">TomTom Rest API</label>

        <input type="text" id="tomtom-auth"
         name="tomtom-auth" value="<enter tomtom key>" />

      </form>
`;
    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        // snippet:vislib_hello_world_example_0.ts
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // end:vislib_hello_world_example_0.ts

        // snippet:vislib_hello_world_example_1.ts
        const sampleMapView = new MapView({
            canvas,
            theme: "resources/day.json"
        });
        // end:vislib_hello_world_example_1.ts

        // snippet:vislib_hello_world_example_2.ts
        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 800);
        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // instantiate the default map controls, allowing the user to pan around freely.
        MapControls.create(sampleMapView);
        // end:vislib_hello_world_example_2.ts

        // snippet:vislib_hello_world_example_3.ts
        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });
        // end:vislib_hello_world_example_3.ts

        return sampleMapView;
    }

    function initToggleTileProvider(mapViewUsed: MapView) {
        const inputForm = document.getElementById("provider-selection");
        const radioButtons = document.getElementsByName("tileprovider");
        let previousSelection: HTMLInputElement;

        // tslint:disable-next-line:prefer-for-of
        for (let key = 0; key < radioButtons.length; key++) {
            radioButtons[key].onclick = function() {
                if (this !== previousSelection) {
                    previousSelection = this as HTMLInputElement;
                    omvDataSourceHereRestApi.enabled = false;
                    if (omvDataSourceMapBoxRestApi) {
                        omvDataSourceMapBoxRestApi.enabled = false;
                    }
                    if (omvDataSourceTomTom) {
                        omvDataSourceTomTom.enabled = false;
                    }
                    omvDataSourceHereRestApi.enabled = false;
                    switch (this.id) {
                        case "mapbox":
                            omvDataSourceMapBoxRestApi.enabled = true;
                            break;
                        case "tomtom":
                            omvDataSourceTomTom.enabled = true;
                            break;
                        case "here-rest":
                            omvDataSourceHereRestApi.enabled = true;
                            break;
                        default:
                            break;
                    }
                    //force clearing cache as the enable/disable
                    mapViewUsed.clearTileCache("omv");
                    mapViewUsed.update();
                }
            };
        }
        // Add MapBox Omv Datasource when authentication key is added
        const mapboxAuthElement = document.getElementById("mapbox-auth");
        if (mapboxAuthElement) {
            mapboxAuthElement.addEventListener("keyup", event => {
                event.preventDefault();
                // Number 13 is the "Enter" key on the keyboard
                if (event.keyCode === 13) {
                    const mapboxAuthCode = (mapboxAuthElement as HTMLInputElement).value;
                    // snippet:vislib_hello_world_example_8.ts
                    omvDataSourceMapBoxRestApi = new OmvDataSource({
                        baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
                        apiFormat: APIFormat.MapboxV4,
                        authenticationCode: mapboxAuthCode
                    });
                    // end:vislib_hello_world_example_8.ts
                    mapViewUsed.addDataSource(omvDataSourceMapBoxRestApi);

                    if (inputForm) {
                        inputForm.removeChild(mapboxAuthElement as HTMLElement);
                        if (document.getElementById("mapbox")) {
                            (document.getElementById(
                                "mapbox"
                            ) as HTMLInputElement).disabled = false;
                        }
                    }
                }
            });
        }

        // Add TomTom Omv Datasource when authentication key is added
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder({
            processLayersDefault: true
        });
        const filterDescription = filterBuilder.createDescription();
        const tomtomAuthElement = document.getElementById("tomtom-auth");
        if (tomtomAuthElement) {
            tomtomAuthElement.addEventListener("keyup", event => {
                event.preventDefault();
                // Number 13 is the "Enter" key on the keyboard
                if (event.keyCode === 13) {
                    const tomtomAuthCode = (tomtomAuthElement as HTMLInputElement).value;
                    // snippet:vislib_hello_world_example_9.ts
                    omvDataSourceTomTom = new OmvDataSource({
                        baseUrl: "https://api.tomtom.com/map/1/tile/basic/main/",
                        apiFormat: APIFormat.TomtomV1,
                        authenticationCode: tomtomAuthCode,
                        featureModifierId: FeatureModifierId.tomTom,
                        filterDescr: filterDescription,
                        maxZoomLevel: 18,
                        // needs its own decode as featureModifier and descr are decoder optiones
                        // and decoders per default are shared
                        decoder: new OmvTileDecoder()
                    });
                    // end:vislib_hello_world_example_9.ts
                    mapViewUsed.addDataSource(omvDataSourceTomTom);
                    omvDataSourceTomTom.enabled = false;

                    if (inputForm) {
                        inputForm.removeChild(tomtomAuthElement as HTMLElement);
                        if (document.getElementById("tomtom")) {
                            (document.getElementById(
                                "tomtom"
                            ) as HTMLInputElement).disabled = false;
                        }
                    }
                }
            });
        }
    }

    const mapView = initializeMapView("mapCanvas");

    // will be added in eventlistener after auth key input
    let omvDataSourceMapBoxRestApi: OmvDataSource;

    let omvDataSourceTomTom: OmvDataSource;

    const omvDataSourceHereRestApi = new OmvDataSource({
        baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
        apiFormat: APIFormat.HereV1,
        authenticationCode: bearerTokenProvider
    });

    mapView.addDataSource(omvDataSourceHereRestApi);

    initToggleTileProvider(mapView);
}
