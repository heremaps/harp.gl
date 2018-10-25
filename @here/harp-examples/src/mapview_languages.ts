/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { MapView, MapViewUtils } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";

/**
 * This example shows a way to change a map's language by direc use of mapview's language property.
 */
export namespace LanguagesExample {
    document.body.innerHTML += `
    <label>Primary language:</label>
    <select id="primaryLang">
        <option value="en">English</option>
        <option value="de">German</option>
        <option value="ru">Russian</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="ar">Arabic</option>
        <option value="zh">Chinese</option>
    </select>
    <label>Secondary language:</label>
    <select id="secondaryLang">
        <option value="en">English</option>
        <option value="de">German</option>
        <option value="ru">Russian</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="ar">Arabic</option>
        <option value="zh">Chinese</option>
    </select>
`;
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "./resources/day.json"
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

        window.addEventListener("languagechange", () => {
            sampleMapView.languages = MapViewUtils.getBrowserLanguages();
        });

        return sampleMapView;
    }

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });

    mapView.addDataSource(omvDataSource);
    mapView.setCameraGeolocationAndZoom(new GeoCoordinates(52.5145, 13.3501), 8);

    function initLanguages() {
        const primaryLanguageComponent = document.getElementById("primaryLang") as any;
        const secondaryLanguageComponent = document.getElementById("secondaryLang") as any;

        if (primaryLanguageComponent) {
            primaryLanguageComponent.onchange = () => {
                mapView.languages = [
                    primaryLanguageComponent.value,
                    secondaryLanguageComponent.value
                ];
            };
        }
        if (secondaryLanguageComponent) {
            secondaryLanguageComponent.onchange = () => {
                mapView.languages = [
                    primaryLanguageComponent.value,
                    secondaryLanguageComponent.value
                ];
            };
        }
    }

    window.onload = () => {
        initLanguages();
    };
}
