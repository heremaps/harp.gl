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

import { EarthcoreTileDataSource } from "@here/earthcore-datasource";
import { GeoCoordinates } from "@here/geoutils";
import { HRN } from "@here/hype";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import * as THREE from "three";
import { appCode, appId } from "../config";

export namespace EarthCore_3D_CitiesExample {
    interface Location {
        place: string;
        position: GeoCoordinates;
    }

    const locations: Location[] = [
        { place: "Munich", position: new GeoCoordinates(48.138137, 11.575682) },
        { place: "Berlin", position: new GeoCoordinates(52.515276, 13.377689000000002) },
        { place: "Cologne", position: new GeoCoordinates(50.93873, 6.95236) },
        { place: "Detroit", position: new GeoCoordinates(42.33644, -83.05396) },
        { place: "Frankfurt", position: new GeoCoordinates(50.112704, 8.672141) },
        { place: "Ingolstadt", position: new GeoCoordinates(48.76141, 11.428085) },
        { place: "San Francisco", position: new GeoCoordinates(37.791701227, -122.4023777977) },
        { place: "Paris", position: new GeoCoordinates(48.85319, 2.348585) }
    ];

    function selectLocation(index: number) {
        // reset the camera
        mapView.camera.lookAt(new THREE.Vector3(0, 0, 0));
        mapView.camera.position.set(0, 0, 1000);

        mapView.geoCenter = locations[index].position;
    }

    /**
     * This function creates a new [[MapView]] for the HTMLCanvasElement of a specified `id` using
     * the [[EarthcoreTileDataSource]] with a specified `appId`, `appCode` and `HRN`. These
     * parameters are passed as [[EarthcoreDataSourceParameters]] or [[DataStoreClientParameters]]
     * objects.
     *
     * ```typescript
     * [[include:vislib_earthcore_3D_cities_0.ts]]
     * ```
     */
    export function initializeMapView(id: string) {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/theme.json"
        });

        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 400);

        // instantiate the default map controls, allowing the user to pan around freely.
        const controls = new MapControls(sampleMapView);

        controls.tiltEnabled = true;
        controls.minZoomLevel = 15;

        //snippet:vislib_earthcore_3D_cities_0.ts
        const ecDataSource = new EarthcoreTileDataSource({
            hrn: HRN.fromString("hrn:here:datastore:::here-rich3dcities-1"),
            appId,
            appCode
        });

        sampleMapView.addDataSource(ecDataSource);
        // end:vislib_earthcore_3D_cities_0.ts

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        return { mapView: sampleMapView, controls };
    }

    /**
     *  This function initializes the view adding options to select a city to be shown.
     *
     * ```typescript
     * [[include:vislib_earthcore_3D_cities_1.ts]]
     * ```
     */
    export function initializeUI() {
        // snippet:vislib_earthcore_3D_cities_1.ts
        const locationOptions = document.createElement("select");
        locationOptions.style.cssFloat = "right";

        locations.forEach(({ place }) => {
            const opt = document.createElement("option");
            opt.innerText = place;
            locationOptions.add(opt);
        });

        document.body.appendChild(locationOptions);

        locationOptions.onchange = () => {
            selectLocation(locationOptions.selectedIndex);
        };

        selectLocation(0);
        // end:vislib_earthcore_3D_cities_1.ts
    }

    const { mapView } = initializeMapView("mapCanvas");

    initializeUI();
}
