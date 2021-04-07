/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import "three/examples/js/controls/TrackballControls";

import { Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView, MapViewEventNames } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { HereWebTileDataSource } from "@here/harp-webtile-datasource";
import { GUI } from "dat.gui";
import * as THREE from "three";

import { apikey } from "../config";

const SunCalc = require("suncalc");

const FADE_DURATION = 30 * 60 * 1000; // in ms
const COLOR_CHANGE_DURATION = 2 * FADE_DURATION; // in ms
const TOTAL_FADE_DURATION = FADE_DURATION + COLOR_CHANGE_DURATION;
const COLOR_INTENSITY_FACTOR = 1.5;
const SUNRISE_COLOR = new THREE.Color("hsl(45, 100%, 75%)");
const SUNSET_COLOR = new THREE.Color("hsl(30, 100%, 60%)");

let map: MapView;
let mapControls: MapControls;
let trackball: any;
let debugCamera: THREE.PerspectiveCamera;
let directionalLightHelper: THREE.DirectionalLightHelper;
let shadowCameraHelper: THREE.CameraHelper;
let sun: THREE.DirectionalLight;
let MAX_SUN_INTENSITY: number;
const MAIN_SUN_COLOR = new THREE.Color();

const HERE = new GeoCoordinates(52.530932, 13.3849151);

const date = new Date();
const guiOptions = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    time: date.getHours() + date.getMinutes() / 60,
    timeIndicator: `${date.getHours()}:${date.getMinutes()}`,
    debugCamera: false,
    enableRasterTiles: false
};
// Reference solar noon time is used to calculate time offsets at specific coordinates.
const refSolarNoon = SunCalc.getTimes(date, 0, 0).solarNoon;
// Main time offset.
const refTime = refSolarNoon.getTime() + date.getTimezoneOffset() * 60 * 1000;

function swapCamera() {
    mapControls.enabled = !mapControls.enabled;
    trackball.enabled = !trackball.enabled;
    map.pointOfView = mapControls.enabled ? undefined : debugCamera;
    directionalLightHelper.visible = !directionalLightHelper.visible;
    shadowCameraHelper.visible = !shadowCameraHelper.visible;
}

const hereWebTileDataSource = new HereWebTileDataSource({
    apikey,
    renderingOptions: { renderOrder: 50 },
    name: "raster-tiles"
});

function setupDebugStuff() {
    const mapCameraHelper = new THREE.CameraHelper(map["m_rteCamera"]);
    mapCameraHelper.renderOrder = Number.MAX_SAFE_INTEGER;
    map.scene.add(mapCameraHelper);

    debugCamera = new THREE.PerspectiveCamera(
        map.camera.fov,
        map.canvas.width / map.canvas.height,
        100,
        100000
    );
    map.scene.add(debugCamera);
    debugCamera.position.set(6000, 2000, 1000);

    trackball = new (THREE as any).TrackballControls(debugCamera, map.canvas);
    trackball.enabled = false;
    trackball.addEventListener("start", () => {
        map.beginAnimation();
    });
    trackball.addEventListener("end", () => {
        map.endAnimation();
    });
    trackball.addEventListener("change", () => {
        map.update();
    });

    trackball.staticMoving = true;
    trackball.rotateSpeed = 3.0;
    trackball.zoomSpeed = 4.0;
    trackball.panSpeed = 2.0;

    directionalLightHelper = new THREE.DirectionalLightHelper(sun, 500);
    directionalLightHelper.visible = false;
    map.scene.add(directionalLightHelper);

    shadowCameraHelper = new THREE.CameraHelper(sun.shadow.camera);
    shadowCameraHelper.visible = false;
    map.scene.add(shadowCameraHelper);

    let lastZoomLevel = map.zoomLevel;
    map.addEventListener(MapViewEventNames.Render, () => {
        const trackballTarget = trackball.target as THREE.Vector3;
        if (lastZoomLevel !== map.zoomLevel) {
            trackballTarget.set(0, 0, -map.targetDistance);
            lastZoomLevel = map.zoomLevel;
        }
        trackball.update();

        const enableCameraHelpers = map.pointOfView !== undefined;
        if (enableCameraHelpers) {
            mapCameraHelper.update();
        }
        mapCameraHelper.visible = enableCameraHelpers;

        directionalLightHelper.update();
        shadowCameraHelper.update();
    });
}

function update() {
    guiOptions.time = guiOptions.hours + guiOptions.minutes / 60;
    guiOptions.timeIndicator = `${guiOptions.hours}:${guiOptions.minutes}`;

    const { latitude, longitude } = map.geoCenter;
    const lightPos = sun.position;
    // Dirty time is a time without taking into account the time offset at the specific coordinates.
    const dirtyTime = new Date(
        guiOptions.year,
        guiOptions.month - 1,
        guiOptions.day,
        guiOptions.hours,
        guiOptions.minutes,
        0
    );

    // Calculating time offset at current location.
    const timeOffset = SunCalc.getTimes(date, latitude, longitude).solarNoon.getTime() - refTime;
    // Time with corrected offset.
    const locationDate = new Date(dirtyTime.getTime() + timeOffset);

    const sunTimes = SunCalc.getTimes(locationDate, latitude, longitude);
    const sunPosition = SunCalc.getPosition(locationDate, latitude, longitude);

    const azimuth = sunPosition.azimuth;
    const altitude = sunPosition.altitude - Math.PI / 2;

    const r = map.targetDistance;
    lightPos.setX(r * Math.sin(altitude) * Math.sin(azimuth));
    lightPos.setY(r * Math.sin(altitude) * Math.cos(azimuth));
    lightPos.setZ(r * Math.cos(altitude) - r);
    // Resetting the target is important, because this is overriden in the MapView.
    // This is an ugly hack and HARP-10353 should improve this.
    sun.target.position.set(0, 0, -r);

    sun.color.set(MAIN_SUN_COLOR);

    const location_ms = locationDate.getTime();
    const sunriseDiff = location_ms - sunTimes.sunriseEnd.getTime();
    const sunsetDiff = sunTimes.sunsetStart.getTime() - location_ms;
    if (sunriseDiff > 0 && sunsetDiff > 0) {
        if (sunriseDiff < TOTAL_FADE_DURATION || sunsetDiff < TOTAL_FADE_DURATION) {
            let color: THREE.Color;
            let colorDiff: number;
            if (azimuth < 0) {
                color = SUNRISE_COLOR;
                colorDiff = sunriseDiff;
            } else {
                color = SUNSET_COLOR;
                colorDiff = sunsetDiff;
            }
            sun.color.lerpHSL(
                color,
                THREE.MathUtils.clamp(1 - (colorDiff - FADE_DURATION) / COLOR_CHANGE_DURATION, 0, 1)
            );

            if (colorDiff <= FADE_DURATION) {
                sun.intensity = THREE.MathUtils.lerp(
                    0,
                    MAX_SUN_INTENSITY * COLOR_INTENSITY_FACTOR,
                    colorDiff / FADE_DURATION
                );
            } else {
                sun.intensity = THREE.MathUtils.lerp(
                    MAX_SUN_INTENSITY,
                    MAX_SUN_INTENSITY * COLOR_INTENSITY_FACTOR,
                    THREE.MathUtils.clamp(
                        1 - (colorDiff - FADE_DURATION) / COLOR_CHANGE_DURATION,
                        0,
                        1
                    )
                );
            }
        } else {
            sun.intensity = MAX_SUN_INTENSITY;
        }
    } else {
        sun.intensity = 0;
    }

    map.update();
}

function initializeMapView(id: string, theme: Theme): MapView {
    const canvas = document.getElementById(id) as HTMLCanvasElement;
    map = new MapView({
        canvas,
        theme,
        enableShadows: true
    });
    map.renderLabels = false;
    map.fog.enabled = false;

    CopyrightElementHandler.install("copyrightNotice", map);

    mapControls = new MapControls(map);
    mapControls.maxTiltAngle = 50;

    const ui = new MapControlsUI(mapControls);
    canvas.parentElement!.appendChild(ui.domElement);

    map.lookAt({ target: HERE, zoomLevel: 17 });

    map.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => {
        map.resize(window.innerWidth, window.innerHeight);
    });

    addVectorTileDataSource().then(() => {
        const light = map.lights.find(item => item instanceof THREE.DirectionalLight) as
            | THREE.DirectionalLight
            | undefined;
        if (light === undefined) {
            throw new Error("Light for a sun was not found.");
        }
        sun = light;
        MAX_SUN_INTENSITY = sun.intensity;
        MAIN_SUN_COLOR.copy(sun.color);

        map.addEventListener(MapViewEventNames.MovementFinished, update);

        addGuiElements();
        setupDebugStuff();
        update();
    });

    return map;
}

const addVectorTileDataSource = (): Promise<void> => {
    const omvDataSource = new VectorTileDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        authenticationCode: apikey
    });

    return map.addDataSource(omvDataSource);
};

function addGuiElements() {
    // Control light direction
    const gui = new GUI({ width: 300 });
    gui.add(guiOptions, "year").onChange(update);
    gui.add(guiOptions, "month").onChange(update);
    gui.add(guiOptions, "day").onChange(update);
    const timeSlider = gui.add(guiOptions, "time", 0, 24, 0.01);
    const timeIndicator = gui.add(guiOptions, "timeIndicator");
    timeSlider.onChange(() => {
        guiOptions.hours = Math.floor(guiOptions.time);
        guiOptions.minutes = Math.floor((guiOptions.time - guiOptions.hours) * 60);

        update();
        timeIndicator.updateDisplay();
    });
    timeIndicator.onChange(() => {
        const time = guiOptions.timeIndicator.split(":");
        guiOptions.hours = parseInt(time[0], 10);
        guiOptions.minutes = parseInt(time[1], 10);

        update();
        timeSlider.updateDisplay();
    });
    gui.add(guiOptions, "debugCamera").onChange(swapCamera);
    gui.add(guiOptions, "enableRasterTiles").onChange((enable: boolean) => {
        const rasterSource = map.getDataSourceByName("raster-tiles");
        if (rasterSource && !enable) {
            map.removeDataSource(rasterSource);
        } else if (!rasterSource && enable) {
            map.addDataSource(hereWebTileDataSource);
        }
    });
}

export namespace RealTimeShadows {
    const theme: Theme = {
        extends: "resources/berlin_tilezen_base.json",
        lights: [
            {
                type: "ambient",
                color: "#ffffff",
                name: "ambientLight",
                intensity: 0.9
            },
            {
                type: "directional",
                color: "#ffffff",
                name: "light1",
                intensity: 1,
                // Will be overriden immediately, see `update`
                direction: {
                    x: 0,
                    y: 0.01,
                    z: -1
                },
                castShadow: true
            }
        ],
        definitions: {
            // Opaque buildings
            defaultBuildingColor: { value: "#EDE7E1FF" }
        }
    };
    initializeMapView("mapCanvas", theme);
}
