/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    isLiteralDefinition,
    StandardStyle,
    Style,
    StyleDeclaration,
    Theme
} from "@here/harp-datasource-protocol";
import { isJsonExpr } from "@here/harp-datasource-protocol/lib/Expr";
import { GeoCoordinates, Vector3Like } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    MapView,
    MapViewEventNames,
    MapViewUtils,
    ThemeLoader
} from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { assert } from "@here/harp-utils";
import { GUI } from "dat.gui";
import * as THREE from "three";
import "three/examples/js/controls/TrackballControls";
import { ShadowMapViewer } from "three/examples/jsm/utils/ShadowMapViewer";
import { apikey, copyrightInfo } from "../config";

let directionalLight: THREE.DirectionalLight;
let directionalLightCameraHelper: THREE.CameraHelper;
let map: MapView;

const guiOptions = {
    xpos: 0,
    ypos: 0,
    zpos: 0
};

const swapCamera = (
    mapControls: MapControls,
    trackBall: any,
    debugCamera: THREE.PerspectiveCamera
) => {
    mapControls.enabled = !mapControls.enabled;
    trackBall.enabled = !trackBall.enabled;
    map.pointOfView = mapControls.enabled ? undefined : debugCamera;
};

const setupDebugCamera = (mapControls: MapControls) => {
    // tslint:disable-next-line: no-string-literal
    const mapCamera = new THREE.CameraHelper(map["m_rteCamera"]);
    mapCamera.renderOrder = Number.MAX_SAFE_INTEGER;
    map.scene.add(mapCamera);

    const debugCamera = new THREE.PerspectiveCamera(
        map.camera.fov,
        map.canvas.width / map.canvas.height,
        100,
        100000
    );
    map.scene.add(debugCamera);
    debugCamera.position.set(6000, 2000, 1000);

    const m_trackball = new (THREE as any).TrackballControls(debugCamera, map.canvas);
    m_trackball.enabled = false;
    m_trackball.addEventListener("start", () => {
        map.beginAnimation();
    });
    m_trackball.addEventListener("end", () => {
        map.endAnimation();
    });
    m_trackball.addEventListener("change", () => {
        map.update();
    });

    m_trackball.staticMoving = true;
    m_trackball.rotateSpeed = 3.0;
    m_trackball.zoomSpeed = 4.0;
    m_trackball.panSpeed = 2.0;

    let lastZoomLevel = map.zoomLevel;
    // Update the debug controls before rendering.
    map.addEventListener(MapViewEventNames.Render, () => {
        if (m_trackball !== undefined) {
            const trackballTarget = m_trackball.target as THREE.Vector3;
            if (lastZoomLevel !== map.zoomLevel) {
                trackballTarget.set(0, 0, -map.targetDistance);
                lastZoomLevel = map.zoomLevel;
            }
            m_trackball.update();
        }
        const enableCameraHelpers = map.pointOfView !== undefined;
        if (enableCameraHelpers) {
            mapCamera.update();
            directionalLightCameraHelper.update();
        }
        mapCamera.visible = enableCameraHelpers;
        if (directionalLightCameraHelper !== undefined) {
            directionalLightCameraHelper.visible = enableCameraHelpers;
        }
    });

    window.addEventListener("keypress", event => {
        if (event.key === "s") {
            swapCamera(mapControls, m_trackball, debugCamera);
            map.update();
        }
    });
};

const computeShadowFrustum = () => {
    if (directionalLight === undefined) {
        return;
    }

    const NDCToView = (vector: Vector3Like): THREE.Vector3 => {
        return (
            new THREE.Vector3(vector.x, vector.y, vector.z)
                .applyMatrix4(map.camera.projectionMatrixInverse)
                // Make sure to apply rotation, hence use the rte camera
                // tslint:disable-next-line: no-string-literal
                .applyMatrix4(map["m_rteCamera"].matrixWorld)
        );
    };
    const ViewToLightSpace = (worldPos: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 => {
        return worldPos.applyMatrix4(camera.matrixWorldInverse);
    };
    const points: Vector3Like[] = [
        // near plane points
        { x: -1, y: -1, z: -1 },
        { x: 1, y: -1, z: -1 },
        { x: -1, y: 1, z: -1 },
        { x: 1, y: 1, z: -1 },

        // far planes points
        { x: -1, y: -1, z: 1 },
        { x: 1, y: -1, z: 1 },
        { x: -1, y: 1, z: 1 },
        { x: 1, y: 1, z: 1 }
    ];
    const transformedPoints = points
        .map(p => NDCToView(p))
        .map(p => ViewToLightSpace(p, directionalLight.shadow.camera));
    const box = new THREE.Box3();
    transformedPoints.forEach(point => {
        box.expandByPoint(point);
    });
    Object.assign(directionalLight.shadow.camera, {
        left: box.min.x,
        right: box.max.x,
        top: box.max.y,
        bottom: box.min.y,
        near: -box.max.z,
        far: -box.min.z
    });
    directionalLight.shadow.camera.updateProjectionMatrix();

    const lightDirection = new THREE.Vector3();
    lightDirection.copy(directionalLight.target.position);
    lightDirection.sub(directionalLight.position);
    lightDirection.normalize();

    const target = MapViewUtils.getWorldTargetFromCamera(map.camera, map.projection);
    if (target === null) {
        return;
    }
    const normal = map.projection.surfaceNormal(target, new THREE.Vector3());
    // Should point down.
    normal.negate();

    // The camera of the shadow has the same height as the map camera, and the target is also the
    // same. The position is then calculated based on the light direction and the height using basic
    // trigonometry.
    const tilt = MapViewUtils.extractCameraTilt(map.camera, map.projection);
    const cameraHeight = map.targetDistance * Math.cos(tilt);
    const lightPosHyp = cameraHeight / normal.clone().dot(lightDirection);

    directionalLight.target.position.copy(target).sub(map.camera.position);
    directionalLight.position.copy(target);
    directionalLight.position.addScaledVector(lightDirection, -lightPosHyp);
    directionalLight.position.sub(map.camera.position);
};

// Gets the light from the list of objects in the scene and adds some debug helpers.
const setLightAndDebugHelpers = () => {
    map.scene.children.forEach((obj: THREE.Object3D) => {
        if ((obj as any).isDirectionalLight) {
            // Only one directional light works in this example.
            assert(directionalLight === undefined);
            // Keep reference to the light.
            directionalLight = obj as THREE.DirectionalLight;
            // Add the camera helper to help debug the lights orthographic camera.
            directionalLightCameraHelper = new THREE.CameraHelper(
                (obj as THREE.DirectionalLight).shadow.camera
            );
            map.scene.add(directionalLightCameraHelper);
            // This is needed so that the target is updated automatically, see:
            // https://threejs.org/docs/#api/en/lights/DirectionalLight.target
            map.scene.add(directionalLight.target);
        }
    });
};

// Callback when the light direction is updated.
const updateLight = () => {
    if (directionalLight === undefined) {
        throw new Error("Missing directional light");
    }
    const lightPos = directionalLight.position;
    lightPos.setX(guiOptions.xpos);
    lightPos.setY(guiOptions.ypos);
    lightPos.setZ(guiOptions.zpos);
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

    const mapControls = new MapControls(map);
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
        setLightAndDebugHelpers();
    });

    map.addEventListener(MapViewEventNames.Render, computeShadowFrustum);

    setupDebugCamera(mapControls);

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
            const standardStyle = (style as any) as StandardStyle;
            if (standardStyle.attr !== undefined) {
                standardStyle.attr.enableShadows = true;
            }
        } else if (style.technique === "extruded-polygon") {
            if (style.attr !== undefined) {
                style.attr.enableShadows = true;
            }
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

    // Add the shadow map texture viewer
    const lightShadowMapViewer = new ShadowMapViewer(directionalLight) as any;
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
        addGuiElements();
    });
}
