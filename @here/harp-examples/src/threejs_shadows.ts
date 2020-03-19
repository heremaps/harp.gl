/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    isLiteralDefinition,
    Style,
    StyleDeclaration,
    Theme
} from "@here/harp-datasource-protocol";
import { isJsonExpr } from "@here/harp-datasource-protocol/lib/Expr";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    MapView,
    MapViewEventNames,
    ThemeLoader
} from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { assert } from "@here/harp-utils";
import { GUI } from "dat.gui";
import * as THREE from "three";
import "three/examples/js/controls/TrackballControls";
import { ShadowMapViewer } from "three/examples/jsm/utils/ShadowMapViewer";
import { apikey, copyrightInfo } from "../config";

let map: MapView;
let mapControls: MapControls;
let trackball: any;
let debugCamera: THREE.PerspectiveCamera;
let directionalLight: THREE.DirectionalLight | undefined;

const guiOptions = {
    xpos: 700,
    ypos: 300,
    zpos: 0,
    enabled: true,
    debugCamera: false
};

const swapCamera = () => {
    mapControls.enabled = !mapControls.enabled;
    trackball.enabled = !trackball.enabled;
    map.pointOfView = mapControls.enabled ? undefined : debugCamera;
};

const setupDebugCamera = () => {
    // tslint:disable-next-line: no-string-literal
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

    let lastZoomLevel = map.zoomLevel;
    // Update the debug controls before rendering.
    map.addEventListener(MapViewEventNames.Render, () => {
        if (trackball !== undefined) {
            const trackballTarget = trackball.target as THREE.Vector3;
            if (lastZoomLevel !== map.zoomLevel) {
                trackballTarget.set(0, 0, -map.targetDistance);
                lastZoomLevel = map.zoomLevel;
            }
            trackball.update();
        }
        const enableCameraHelpers = map.pointOfView !== undefined;
        if (enableCameraHelpers) {
            mapCameraHelper.update();
        }
        mapCameraHelper.visible = enableCameraHelpers;
    });

    if (directionalLight !== undefined) {
        const directionalLightHelper = new THREE.DirectionalLightHelper(directionalLight, 50000);
        map.scene.add(directionalLightHelper);
        const cameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
        map.scene.add(cameraHelper);
        map.addEventListener(MapViewEventNames.Render, () => {
            directionalLightHelper.update();
            cameraHelper.update();
        });
    }
};

const getDirectionalLight = (): THREE.DirectionalLight | undefined => {
    for (const obj of map.scene.children) {
        if ((obj as THREE.DirectionalLight).isDirectionalLight) {
            return obj as THREE.DirectionalLight;
        }
    }
    return undefined;
};

// Callback when the light direction is updated.
const updateLight = () => {
    assert(directionalLight !== undefined);
    const lightPos = directionalLight!.position;
    lightPos.setX(guiOptions.xpos);
    lightPos.setY(guiOptions.ypos);
    lightPos.setZ(guiOptions.zpos);
    map.shadowsEnabled = guiOptions.enabled;
    if (
        (guiOptions.debugCamera && map.pointOfView === undefined) ||
        (!guiOptions.debugCamera && map.pointOfView !== undefined)
    ) {
        swapCamera();
    }
    map.update();
};

const initializeMapView = (id: string, theme: Theme): MapView => {
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

    const NY = new GeoCoordinates(40.707, -74.01);
    map.lookAt(NY, 2000, 0, 0);

    map.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => {
        map.resize(window.innerWidth, window.innerHeight);
    });

    const added = addOmvDataSource();
    added.then(() => {
        directionalLight = getDirectionalLight();
        setupDebugCamera();
        updateLight();
        addGuiElements();
    });

    map.update();
    return map;
};

const addOmvDataSource = (): Promise<void> => {
    const omvDataSource = new OmvDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        },
        copyrightInfo
    });

    return map.addDataSource(omvDataSource);
};

const patchFillStyle = (styleDeclaration: StyleDeclaration) => {
    if (!isJsonExpr(styleDeclaration)) {
        const style = styleDeclaration as Style;
        if (style.technique === "fill") {
            (style as any).technique = "standard";
        }
    }
};

/**
 * Replace all occurences of "fill" technique in the theme with "standard" technique.
 * "standard" technique is using three.js MeshStandardMaterial and is needed to receive
 * shadows.
 * @param theme The theme to patch
 */
const patchTheme = (theme: Theme) => {
    theme.lights = [
        {
            type: "ambient",
            color: "#ffffff",
            name: "ambientLight",
            intensity: 0.9
        },
        {
            type: "directional",
            color: "#ffcccc",
            name: "light1",
            intensity: 1,
            direction: {
                x: 0,
                y: 0.01,
                z: 1
            },
            castShadow: true
        }
    ];
    if (theme.styles === undefined || theme.styles.tilezen === undefined) {
        throw Error("Theme has no tilezen styles");
    }

    if (theme.definitions !== undefined) {
        for (const definitionName in theme.definitions) {
            if (!theme.definitions.hasOwnProperty(definitionName)) {
                continue;
            }
            const definition = theme.definitions[definitionName];
            if (!isLiteralDefinition(definition)) {
                const styleDeclaration = definition as StyleDeclaration;
                patchFillStyle(styleDeclaration);
            }
        }
    }
    theme.styles.tilezen.forEach((styleDeclaration: StyleDeclaration) => {
        patchFillStyle(styleDeclaration);
    });
};

const addGuiElements = () => {
    // Instructions
    const message = document.createElement("div");
    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "120px";
    message.style.right = "10px";
    message.innerHTML = `Press 's' to toggle the debug camera.`;
    document.body.appendChild(message);

    // Control light direction
    const gui = new GUI({ width: 300 });
    gui.add(guiOptions, "xpos", -2000, 2000).onChange(updateLight);
    gui.add(guiOptions, "ypos", -2000, 2000).onChange(updateLight);
    gui.add(guiOptions, "zpos", -2000, 2000).onChange(updateLight);
    gui.add(guiOptions, "enabled").onChange(updateLight);
    gui.add(guiOptions, "debugCamera").onChange(updateLight);

    // Add the shadow map texture viewer
    const lightShadowMapViewer = new ShadowMapViewer(directionalLight!) as any;
    lightShadowMapViewer.position.x = 10;
    lightShadowMapViewer.position.y = 10;
    lightShadowMapViewer.size.width = 4096 / 16;
    lightShadowMapViewer.size.height = 4096 / 16;
    lightShadowMapViewer.update();
    map.addEventListener(MapViewEventNames.AfterRender, () => {
        lightShadowMapViewer.render(map.renderer);
    });
};

export namespace ThreejsShadows {
    ThemeLoader.load("resources/berlin_tilezen_base.json").then((theme: Theme) => {
        patchTheme(theme);
        initializeMapView("mapCanvas", theme);
    });
}
