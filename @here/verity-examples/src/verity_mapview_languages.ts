/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { GeoCoordinates } from "@here/geoutils";
import { LandmarkTileDataSource } from "@here/landmark-datasource";
import { MapControls } from "@here/map-controls";
import { MapView, MapViewUtils } from "@here/mapview";
import { OmvDataSource } from "@here/omv-datasource";
import { appCode, appId, hrn } from "../config";

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
            theme: "./resources/theme.json"
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
        hrn,
        appId,
        appCode
    });

    const landmarkTileDataSource = new LandmarkTileDataSource({
        hrn,
        appId,
        appCode
    });

    mapView.addDataSource(omvDataSource);
    mapView.addDataSource(landmarkTileDataSource);
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
