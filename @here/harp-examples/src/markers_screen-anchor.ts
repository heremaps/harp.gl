/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapAnchor, MapView, MapViewEventNames } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { GUI } from "dat.gui";
import THREE = require("three");

import { apikey } from "../config";

export namespace GeoToScreenExample {
    document.body.innerHTML += `
        <style>
        .message {
            position: absolute;
            top: 10px;
            left: 100px;
            text-align: left;
            max-width: 40%;
            color: #eee;
        }
        @media screen and (max-width: 600px) {
            .message {
                display: none;
            }
        }
        </style>
    `;
    const BERLIN = new GeoCoordinates(52.5186234, 13.373993);
    const geoPosition = {
        latitude: BERLIN.lat,
        longitude: BERLIN.lng,
        altitude: BERLIN.altitude ?? 0
    };

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        // Look at BERLIN
        const map = new MapView({
            canvas,
            projection: mercatorProjection,
            tileWrappingEnabled: false,
            theme: "resources/berlin_tilezen_night_reduced.json",
            target: BERLIN,
            zoomLevel: 8,
            tilt: 45,
            heading: -80
        });
        map.renderLabels = false;

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 180;

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addVectorTileDataSource(map);

        return map;
    }

    function addGuiElements() {
        const gui = new GUI({ width: 300 });
        gui.add(geoPosition, "latitude").step(0.0001).onChange(updateAnchors);
        gui.add(geoPosition, "longitude").step(0.0001).onChange(updateAnchors);
        gui.add(geoPosition, "altitude").step(0.0001).onChange(updateAnchors);
        gui.add(mapView, "tileWrappingEnabled").onChange((value: boolean) => {
            mapView.tileWrappingEnabled = value;
        });
        const options = {
            projection: "mercatorProjection"
        };
        gui.add(options, "projection", ["sphereProjection", "mercatorProjection"]).onChange(
            (value: string) => {
                mapView.projection =
                    value === "sphereProjection" ? sphereProjection : mercatorProjection;
            }
        );
        return gui;
    }

    function addVectorTileDataSource(map: MapView) {
        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        map.addDataSource(omvDataSource);

        return map;
    }

    function updateScreenAnchor(screenpos?: THREE.Vector2) {
        if (screenAnchor !== undefined && screenpos !== undefined) {
            screenAnchor.style.left = screenpos.x.toString() + "px";
            screenAnchor.style.top = screenpos.y.toString() + "px";
            screenAnchor.style.opacity = "0.8";
        } else {
            screenAnchor.style.opacity = "0.1";
        }
    }
    function updateScreenAnchorValues(screenpos?: THREE.Vector2) {
        if (screenAnchor !== undefined && screenpos !== undefined) {
            screenAnchorValues.innerHTML =
                "x: " + Math.round(screenpos.x) + " y: " + Math.round(screenpos.y);
        } else {
            screenAnchorValues.innerHTML = "x: undefined , y: undefined";
        }
    }
    function updateMapAnchor() {
        if (mapAnchor !== undefined && mapAnchor.anchor !== undefined) {
            const scaleFactor = mapView.targetDistance / 10000;
            if (mapAnchor.scale.x !== scaleFactor) {
                mapAnchor.scale.set(scaleFactor, scaleFactor, scaleFactor);
                mapView.update();
            }
            if (!(mapAnchor.anchor as GeoCoordinates).equals(geoPosition)) {
                mapAnchor.anchor = GeoCoordinates.fromObject(geoPosition);
                mapView.update();
            }
        }
    }

    function updateAnchors() {
        gui.updateDisplay();
        const screenpos = mapView.getScreenPosition({
            latitude: geoPosition.latitude,
            longitude: geoPosition.longitude,
            altitude: geoPosition.altitude
        });
        updateScreenAnchor(screenpos);
        updateScreenAnchorValues(screenpos);
        updateMapAnchor();
    }

    function addMapAnchor(mapView: MapView): MapAnchor<THREE.Object3D> {
        const mapAnchor = new THREE.Mesh(
            new THREE.BoxBufferGeometry(100, 100, 100),
            new THREE.MeshBasicMaterial({ color: "green" })
        ) as MapAnchor;
        mapAnchor.anchor = BERLIN;
        mapAnchor.overlay = true;
        mapAnchor.renderOrder = Number.MAX_SAFE_INTEGER;
        mapView.mapAnchors.add(mapAnchor);
        return mapAnchor;
    }

    function addScreenAnchor(): HTMLDivElement {
        const screenAnchor = document.createElement("div");
        screenAnchor.id = "screenAnchor";
        screenAnchor.style.position = "absolute";
        screenAnchor.style.zIndex = "-1"; // move it below GUI controls
        screenAnchor.style.backgroundColor = "red";
        screenAnchor.style.width = "10px";
        screenAnchor.style.height = "10px";
        screenAnchor.style.pointerEvents = "none";
        document.body.appendChild(screenAnchor);
        return screenAnchor;
    }

    function addInfoMessage() {
        const message = document.createElement("div");
        message.className = "message";
        message.innerHTML = `
   <p>
     This example shows how MapView.getScreenPosition works for various cases
     the red square is painted on the screen in screen coordinates, whereas the green cube
     lives in the world.
   </p>
   <p>
     Use the arrow keys or the GUI to change the position.
     Jump to next worlds with "j" and "l"
   </p>
   `;
        document.body.appendChild(message);
    }

    function addScreenAnchorValues(): HTMLDivElement {
        const screenAnchorOutput = document.createElement("div");
        screenAnchorOutput.id = "screenAnchorOutput";
        screenAnchorOutput.style.position = "absolute";
        screenAnchorOutput.style.cssFloat = "bottom-right";
        screenAnchorOutput.style.bottom = "10px";
        screenAnchorOutput.style.left = "10px";
        screenAnchorOutput.style.textAlign = "left";
        screenAnchorOutput.style.textShadow = "0px 0px 2px gray";
        document.body.appendChild(screenAnchorOutput);
        return screenAnchorOutput;
    }

    window.addEventListener("keydown", event => {
        switch (event.key) {
            case "ArrowLeft":
            case "ArrowRight":
            case "ArrowUp":
            case "ArrowDown":
                startAnchorUpdate(event.key);
                break;
            default:
                break;
        }
    });

    let anchorUpdateTimeout: number;
    function startAnchorUpdate(direction: string) {
        const step = 1 / Math.pow(mapView.zoomLevel, 2);
        switch (direction) {
            case "ArrowLeft":
                geoPosition.longitude -= step;
                break;
            case "ArrowRight":
                geoPosition.longitude += step;
                break;
            case "ArrowUp":
                geoPosition.latitude += step;
                break;
            case "ArrowDown":
                geoPosition.latitude -= step;
                break;
            default:
                stopAnchorUpdate();
                break;
        }

        anchorUpdateTimeout = setTimeout(updateAnchors, 0.1) as any;
    }

    function stopAnchorUpdate() {
        if (anchorUpdateTimeout !== undefined || anchorUpdateTimeout !== 0) {
            clearTimeout(anchorUpdateTimeout);
        }
    }

    window.addEventListener("keyup", event => {
        switch (event.key) {
            case "ArrowLeft":
            case "ArrowRight":
            case "ArrowUp":
            case "ArrowDown":
                stopAnchorUpdate();
                break;
            case "j":
                mapView.lookAt({
                    target: new GeoCoordinates(
                        mapView.target.latitude,
                        (mapView.target.longitude -= 360)
                    )
                });
                break;
            case "l":
                mapView.lookAt({
                    target: new GeoCoordinates(
                        mapView.target.latitude,
                        (mapView.target.longitude += 360)
                    )
                });
                break;
            case "p":
                // eslint-disable-next-line no-console
                console.log(
                    "target: ",
                    mapView.target,
                    " tilt: ",
                    mapView.tilt,
                    " heading: ",
                    mapView.heading,
                    " zoom: ",
                    mapView.zoomLevel,
                    " canvassize: ",
                    mapView.canvas.height,
                    mapView.canvas.width,
                    "near: ",
                    mapView.camera.near,
                    "far: ",
                    mapView.camera.far
                );
                break;
            default:
                break;
        }
    });

    export const mapView = initializeMapView("mapCanvas");
    const gui = addGuiElements();
    const screenAnchor = addScreenAnchor();
    const screenAnchorValues = addScreenAnchorValues();
    const mapAnchor = addMapAnchor(mapView);
    addInfoMessage();
    mapView.addEventListener(MapViewEventNames.Update, updateAnchors);
}
