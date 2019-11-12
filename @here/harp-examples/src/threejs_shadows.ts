/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    isValueDefinition,
    StandardStyle,
    Style,
    StyleDeclaration,
    Theme
} from "@here/harp-datasource-protocol";
import { isJsonExpr } from "@here/harp-datasource-protocol/lib/Expr";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    MapViewEventNames,
    ThemeLoader
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { ShadowMapViewer } from "three/examples/jsm/utils/ShadowMapViewer";
import { accessToken } from "../config";
import { Box3, Euler } from "three";

export namespace ThreejsShadows {
    function initializeMapView(id: string, theme: Theme): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const map = new MapView({ canvas, theme, enableShadows: true });
        map.renderLabels = false;

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt(NY, 200, 0, 0);
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);
        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addOmvDataSource(map);

        map.update();

        return map;
    }

    function addOmvDataSource(map: MapView) {
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

        const promise = map.addDataSource(omvDataSource);

        const options = {
            top: 100,
            left: -100,
            right: 100,
            bottom: -100,
            far: 100,
            near: 0
        };

        map.renderer.shadowMap.enabled = true;
        map.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        let shadowMapViewerCreated = false;
        const updateLightCamera = (light: THREE.DirectionalLight) => {
            const lightCamera = light.shadow.camera;
            const lightQuaternion = lightCamera.quaternion;
            const camera = new THREE.Camera();
            camera.projectionMatrixInverse.copy(map.camera.projectionMatrixInverse);
            const w = 1;
            const h = 1;

            const NDCToView = (x: number, y: number, z: number) => {
                return new THREE.Vector3(x, y, z).unproject(camera);
                // .applyQuaternion(lightQuaternion)
                // .sub(lightCamera.position);
            };
            // near
            const n1 = NDCToView(-w, -h, -1);
            const n2 = NDCToView(w, -h, -1);
            const n3 = NDCToView(-w, h, -1);
            const n4 = NDCToView(w, h, -1);

            // far
            const f1 = NDCToView(-w, -h, 1);
            const f2 = NDCToView(w, -h, 1);
            const f3 = NDCToView(-w, h, 1);
            const f4 = NDCToView(w, h, 1);

            // console.log(new Euler().setFromQuaternion(lightQuaternion));
            const frustumPoints = [n1, n2, n3, n4, f1, f2, f3, f4];
            // console.log(n1);
            // console.log(n2);
            // console.log(n3);
            // console.log(n4);
            // console.log(f1);
            // console.log(f2);
            // console.log(f3);
            // console.log(f4);
            const box = new Box3();
            frustumPoints.forEach(point => box.expandByPoint(point));
            // options.left = box.min.x;
            // options.right = box.max.x;
            // options.top = box.max.y;
            // options.bottom = box.min.y;
            // options.near = box.min.z;
            // options.far = box.max.z;
            // console.log(box);

            if (shadowMapViewerCreated === false) {
                shadowMapViewerCreated = true;
                const lightShadowMapViewer = new ShadowMapViewer(light) as any;
                lightShadowMapViewer.position.x = 10;
                lightShadowMapViewer.position.y = 10;
                lightShadowMapViewer.size.width = 4096 / 16;
                lightShadowMapViewer.size.height = 4096 / 16;
                lightShadowMapViewer.update();
                map.addEventListener(MapViewEventNames.AfterRender, () => {
                    lightShadowMapViewer.render(map.renderer);
                });
            }
            Object.assign(light.shadow.camera, options);
            light.shadow.camera.updateProjectionMatrix();
        };

        const updateLights = () => {
            map.scene.children.forEach((obj: THREE.Object3D) => {
                if ((obj as any).isDirectionalLight) {
                    const light = obj as THREE.DirectionalLight;
                    updateLightCamera(light);
                }
            });
            map.update();
        };
        promise.then(updateLights);

        const gui = new GUI({ width: 300 });
        gui.add(options, "top", 0, 10000).onChange(updateLights);
        gui.add(options, "left", -10000, 0).onChange(updateLights);
        gui.add(options, "right", 0, 10000).onChange(updateLights);
        gui.add(options, "bottom", -10000, 0).onChange(updateLights);
        gui.add(options, "near", -10000, 10000).onChange(updateLights);
        gui.add(options, "far", -10000, 10000).onChange(updateLights);

        // const updateLightPosition = () => {
        //     map.scene.children.forEach((obj: THREE.Object3D) => {
        //         if ((obj as any).isDirectionalLight) {
        //             const light = obj as THREE.DirectionalLight;

        //             const time = Date.now() / 1000;
        //             light.position.set(Math.cos(time), Math.sin(time), 1);
        //             map.update();
        //         }
        //     });

        //     setTimeout(updateLightPosition, 10);
        // };
        // setTimeout(() => {
        //     updateLightPosition();
        // }, 1000);

        return map;
    }

    function patchFillStyle(styleDeclaration: StyleDeclaration) {
        if (!isJsonExpr(styleDeclaration)) {
            const style = styleDeclaration as Style;
            if (style.technique === "fill") {
                (style as any).technique = "standard";
                // ((style as any) as StandardStyle).attr!.roughness = 1.0;
            }
        }
    }

    /**
     * Replace all occurences of "fill" technique in the theme with "standard" technique.
     * "standard" technique is using three.js MeshStandardMaterial and is needed to receive
     * shadows.
     * @param theme The theme to patch
     */
    function patchTheme(theme: Theme) {
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
                    y: 0.1,
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
                if (!isValueDefinition(definition)) {
                    const styleDeclaration = definition as StyleDeclaration;
                    patchFillStyle(styleDeclaration);
                }
            }
        }
        theme.styles.tilezen.forEach((styleDeclaration: StyleDeclaration) => {
            patchFillStyle(styleDeclaration);
        });
    }

    ThemeLoader.load("resources/berlin_tilezen_base.json").then((theme: Theme) => {
        patchTheme(theme);
        initializeMapView("mapCanvas", theme);
    });
}
