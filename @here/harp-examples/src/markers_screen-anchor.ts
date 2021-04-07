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
    const BERLIN = new GeoCoordinates(52.5186234, 13.373993);
    const geoPosition = {
        lat: BERLIN.lat,
        lng: BERLIN.lng,
        alt: BERLIN.altitude ?? 0
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
        gui.add(geoPosition, "lat").step(0.0001).onChange(updateAnchors);
        gui.add(geoPosition, "lng").step(0.0001).onChange(updateAnchors);
        gui.add(geoPosition, "alt").step(0.0001).onChange(updateAnchors);
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
        if (mapAnchor !== undefined && mapAnchor.geoPosition !== undefined) {
            const scaleFactor = mapView.targetDistance / 10000;
            if (mapAnchor.scale.x !== scaleFactor) {
                mapAnchor.scale.set(scaleFactor, scaleFactor, scaleFactor);
                mapView.update();
            }
            if (
                mapAnchor.geoPosition.latitude !== geoPosition.lat ||
                mapAnchor.geoPosition.longitude !== geoPosition.lng ||
                mapAnchor.geoPosition.altitude !== geoPosition.alt
            ) {
                mapAnchor.geoPosition.latitude = geoPosition.lat;
                mapAnchor.geoPosition.longitude = geoPosition.lng;
                mapAnchor.geoPosition.altitude = geoPosition.alt;
                mapView.update();
            }
        }
    }

    function updateAnchors() {
        gui.updateDisplay();
        const screenpos = mapView.getScreenPosition({
            latitude: geoPosition.lat,
            longitude: geoPosition.lng,
            altitude: geoPosition.alt
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
        mapAnchor.geoPosition = BERLIN;
        mapAnchor.overlay = true;
        mapAnchor.renderOrder = Number.MAX_SAFE_INTEGER;
        mapView.mapAnchors.add(mapAnchor);
        return mapAnchor;
    }

    function addScreenAnchor(): HTMLDivElement {
        const screenAnchor = document.createElement("div");
        screenAnchor.id = "screenAnchor";
        screenAnchor.style.position = "absolute";
        screenAnchor.style.backgroundColor = "red";
        screenAnchor.style.width = "10px";
        screenAnchor.style.height = "10px";
        screenAnchor.style.pointerEvents = "none";
        document.body.appendChild(screenAnchor);
        return screenAnchor;
    }

    function addInfoMessage() {
        const message = document.createElement("div");
        message.innerHTML = `
  <br />  This example shows how MapView.getScreenPosition works for various cases
  <br />     the red square is painted on the screen in screen coordinates, whereas the green cube
  <br />     lives in the world.
  <br />  Use the arrow keys or the gui to change the geoPosition
  <br />  Jump to next worlds with "j" and "l"
  `;
        message.style.position = "absolute";
        message.style.cssFloat = "right";
        message.style.top = "10px";
        message.style.left = "100px";
        message.style.textAlign = "left";
        message.style.textShadow = "0px 0px 2px gray";
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
                geoPosition.lng -= step;
                break;
            case "ArrowRight":
                geoPosition.lng += step;
                break;
            case "ArrowUp":
                geoPosition.lat += step;
                break;
            case "ArrowDown":
                geoPosition.lat -= step;
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
