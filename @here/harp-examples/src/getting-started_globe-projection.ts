/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, sphereProjection, EarthConstants } from "@here/harp-geoutils";
import { MapControls, MapControlsUI, LongPressHandler } from "@here/harp-map-controls";
import { CopyrightElementHandler, CopyrightInfo, MapView, MapViewAtmosphere, MapAnchor, MapViewEventNames } from "@here/harp-mapview";
import { TopViewClipPlanesEvaluator, InterpolatedClipPlanesEvaluator } from "@here/harp-mapview/lib/ClipPlanesEvaluator";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
//import { MemoryInfo } from "@here/mapview-demo/src/MemoryInfo";
import { accessToken } from "../config";
import * as THREE from "three";
import { Vector3 } from "three";

export namespace GlobeExample {
    const scale = 100;
    const geometry = new THREE.BoxGeometry(1 * scale, 1 * scale, 1 * scale);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00fe
    });
    function createPinkCube(): MapAnchor<THREE.Mesh> {
        const mesh = new THREE.Mesh(geometry, material);
        // Make sure the cube overlaps everything else, is completely arbitrary.
        mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        return mesh;
    }

    function createAtmosphere(mapView: MapView): MapAnchor<THREE.Mesh> {
        const atmosphere = new MapViewAtmosphere({
            maxAltitude:  EarthConstants.EQUATORIAL_RADIUS * 0.025
        }, mapView.projection.type);
        return atmosphere.mesh;
    }

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function addMouseEventListener(mapView: MapView) {
        const canvas = mapView.canvas;

        // tslint:disable:no-unused-expression
        new LongPressHandler(canvas, event => {

            // Get the position of the mouse in geo space.
            const geoPosition = mapView.getGeoCoordinatesAt(event.pageX, event.pageY);
            if (geoPosition === null) {
                return;
            }

            const atmosphere = createAtmosphere(mapView);
            //atmosphere.geoPosition = mapView.geoCenter;
            atmosphere.worldPosition = new Vector3(0, 0, 0);//mapView.worldCenter.clone().negate();
            //atmosphere.worldPosition = mapView.camera.position.clone().negate();
            mapView.mapAnchors.add(atmosphere);

            // Request an update once the cube [[MapObject]] is added to [[MapView]].
            mapView.update();
        });
    }

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            projection: sphereProjection,
            theme: "resources/berlin_tilezen_base_globe.json",
            clipPlanesEvaluator: new InterpolatedClipPlanesEvaluator()
        });

        //const atmosphere = new MapViewAtmosphere({
        //    maxAltitude:  EarthConstants.MAX_ELEVATION * 2.0
        //}, mapView.projection.type);
        //atmosphere.add(mapView.scene);
        //atmosphere.addToMapView(mapView);

        addMouseEventListener(mapView);

        CopyrightElementHandler.install("copyrightNotice", mapView);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return mapView;
    }

    function main() {
        const map = initializeMapView("mapCanvas");

        const hereCopyrightInfo: CopyrightInfo = {
            id: "here.com",
            year: new Date().getFullYear(),
            label: "HERE",
            link: "https://legal.here.com/terms"
        };

        const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo: copyrights
        });

        //map.addDataSource(omvDataSource);

        const mapControls = new MapControls(map);
        const ui = new MapControlsUI(mapControls);
        map.canvas.parentElement!.appendChild(ui.domElement);

        const NY = new GeoCoordinates(40.71, -74.007);
        map.setCameraGeolocationAndZoom(NY, 3.2);

        const atmosphere = createAtmosphere(map);
        atmosphere.worldPosition = new Vector3(0, 0, 0);
        //map.mapAnchors.add(atmosphere);
    }

    main();
}
