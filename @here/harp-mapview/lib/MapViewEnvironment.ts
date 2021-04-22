/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GradientSky, Light, Sky } from "@here/harp-datasource-protocol";
import { ProjectionType, Vector3Like } from "@here/harp-geoutils";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import THREE = require("three");

import { BackgroundDataSource } from "./BackgroundDataSource";
import { MapView, MapViewOptions } from "./MapView";
import { MapViewFog } from "./MapViewFog";
import { SkyBackground } from "./SkyBackground";
import { createLight } from "./ThemeHelpers";

const logger = LoggerManager.instance.create("MapViewEnvironment");

//  the default breaks the ibct tests, seems it had not been used in all cases before

export const DEFAULT_CLEAR_COLOR = 0xffffff; //0xefe9e1;

const cache = {
    vector3: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    frustumPoints: [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ]
};

export type MapViewEnvironmentOptions = Pick<
    MapViewOptions,
    "addBackgroundDatasource" | "backgroundTilingScheme"
>;
/**
 * Class handling the Scene Environment, like fog, sky, background datasource, clearColor etc
 *  for MapView
 */
export class MapViewEnvironment {
    private readonly m_fog: MapViewFog;
    private m_skyBackground?: SkyBackground;
    private m_createdLights?: THREE.Light[];
    private m_overlayCreatedLights?: THREE.Light[];
    private readonly m_backgroundDataSource?: BackgroundDataSource;

    constructor(private readonly m_mapView: MapView, options: MapViewEnvironmentOptions) {
        this.m_fog = new MapViewFog(this.m_mapView.scene);
        if (options.addBackgroundDatasource !== false) {
            this.m_backgroundDataSource = new BackgroundDataSource();
            this.m_mapView.addDataSource(this.m_backgroundDataSource);
        }
        if (
            options.backgroundTilingScheme !== undefined &&
            this.m_backgroundDataSource !== undefined
        ) {
            this.m_backgroundDataSource.setTilingScheme(options.backgroundTilingScheme);
        }
        this.updateClearColor();
    }

    get lights(): THREE.Light[] {
        return this.m_createdLights ?? [];
    }

    get fog(): MapViewFog {
        return this.m_fog;
    }

    updateBackgroundDataSource() {
        if (this.m_backgroundDataSource) {
            this.m_backgroundDataSource.updateStorageLevelOffset();
        }
    }

    clearBackgroundDataSource() {
        if (this.m_backgroundDataSource !== undefined) {
            this.m_mapView.clearTileCache(this.m_backgroundDataSource.name);
        }
    }

    update() {
        this.m_fog.update(this.m_mapView, this.m_mapView.viewRanges.maximum);
        if (
            this.m_skyBackground !== undefined &&
            this.m_mapView.projection.type === ProjectionType.Planar
        ) {
            this.m_skyBackground.updateCamera(this.m_mapView.camera);
        }
        this.updateLights();
    }

    updateClearColor(clearColor?: string, clearAlpha?: number) {
        if (clearColor !== undefined) {
            this.m_mapView.renderer.setClearColor(new THREE.Color(clearColor), clearAlpha);
        } else {
            this.m_mapView.renderer.setClearColor(DEFAULT_CLEAR_COLOR, clearAlpha);
        }
    }

    updateSkyBackground(sky?: Sky, clearColor?: string) {
        if (this.m_skyBackground instanceof SkyBackground && sky !== undefined) {
            // there is a sky in the view and there is a sky option in the theme. Update the colors
            this.updateSkyBackgroundColors(sky, clearColor);
        } else if (this.m_skyBackground === undefined && sky !== undefined) {
            // there is no sky in the view but there is a sky option in the theme
            this.addNewSkyBackground(sky, clearColor);
            return;
        } else if (this.m_skyBackground instanceof SkyBackground && sky === undefined) {
            // there is a sky in the view, but not in the theme
            this.removeSkyBackGround();
        }
    }

    updateLighting(lights?: Light[]) {
        if (this.m_createdLights) {
            this.m_createdLights.forEach((light: THREE.Light) => {
                this.m_mapView.scene.remove(light);
            });
        }

        this.m_overlayCreatedLights?.forEach(light => {
            this.m_mapView.overlayScene.remove(light);
            if (light instanceof THREE.DirectionalLight) {
                this.m_mapView.overlayScene.remove(light.target);
            }
        });

        if (lights !== undefined) {
            this.m_createdLights = [];
            this.m_overlayCreatedLights = [];

            lights.forEach((lightDescription: Light) => {
                const light = createLight(lightDescription);
                if (!light) {
                    logger.warn(
                        `MapView: failed to create light ${lightDescription.name} of type ${lightDescription.type}`
                    );
                    return;
                }
                this.m_mapView.scene.add(light);

                if ((light as any).isDirectionalLight) {
                    const directionalLight = light as THREE.DirectionalLight;
                    // This is needed so that the target is updated automatically, see:
                    // https://threejs.org/docs/#api/en/lights/DirectionalLight.target
                    this.m_mapView.scene.add(directionalLight.target);
                }
                this.m_createdLights!.push(light);

                const clonedLight: THREE.Light = light.clone() as THREE.Light;
                this.m_mapView.overlayScene.add(clonedLight);
                if (clonedLight instanceof THREE.DirectionalLight) {
                    this.m_mapView.overlayScene.add(clonedLight.target.clone());
                }
            });
        }
    }

    /**
     * Update the directional light camera. Note, this requires the cameras to first be updated.
     */
    updateLights() {
        // TODO: HARP-9479 Globe doesn't support shadows.
        if (
            !this.m_mapView.shadowsEnabled ||
            this.m_mapView.projection.type === ProjectionType.Spherical ||
            this.m_createdLights === undefined ||
            this.m_createdLights.length === 0
        ) {
            return;
        }

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
        const transformedPoints = points.map((p, i) =>
            this.m_mapView.ndcToView(p, cache.frustumPoints[i])
        );

        this.m_createdLights.forEach(element => {
            const directionalLight = element as THREE.DirectionalLight;
            if (directionalLight.isDirectionalLight === true) {
                const lightDirection = cache.vector3[0];
                lightDirection.copy(directionalLight.target.position);
                lightDirection.sub(directionalLight.position);
                lightDirection.normalize();

                const normal = cache.vector3[1];
                if (this.m_mapView.projection.type === ProjectionType.Planar) {
                    // -Z points to the camera, we can't use Projection.surfaceNormal, because
                    // webmercator and mercator give different results.
                    normal.set(0, 0, -1);
                } else {
                    // Enable shadows for globe...
                    //this.projection.surfaceNormal(target, normal);
                }

                // The camera of the shadow has the same height as the map camera, and the target is
                // also the same. The position is then calculated based on the light direction and
                // the height
                // using basic trigonometry.
                const tilt = this.m_mapView.tilt;
                const cameraHeight =
                    this.m_mapView.targetDistance * Math.cos(THREE.MathUtils.degToRad(tilt));
                const lightPosHyp = cameraHeight / normal.dot(lightDirection);

                directionalLight.target.position
                    .copy(this.m_mapView.worldTarget)
                    .sub(this.m_mapView.camera.position);
                directionalLight.position.copy(this.m_mapView.worldTarget);
                directionalLight.position.addScaledVector(lightDirection, -lightPosHyp);
                directionalLight.position.sub(this.m_mapView.camera.position);
                directionalLight.updateMatrixWorld();
                directionalLight.shadow.updateMatrices(directionalLight);

                const camera = directionalLight.shadow.camera;
                const pointsInLightSpace = transformedPoints.map(p =>
                    this.viewToLightSpace(p.clone(), camera)
                );

                const box = new THREE.Box3();
                pointsInLightSpace.forEach(point => {
                    box.expandByPoint(point);
                });
                camera.left = box.min.x;
                camera.right = box.max.x;
                camera.top = box.max.y;
                camera.bottom = box.min.y;
                // Moving back to the light the near plane in order to catch high buildings, that
                // are not visible by the camera, but existing on the scene.
                camera.near = -box.max.z * 0.95;
                camera.far = -box.min.z;
                camera.updateProjectionMatrix();
            }
        });
    }

    private addNewSkyBackground(sky: Sky, clearColor: string | undefined) {
        if (sky.type === "gradient" && (sky as GradientSky).groundColor === undefined) {
            sky.groundColor = getOptionValue(clearColor, "#000000");
        }
        this.m_skyBackground = new SkyBackground(
            sky,
            this.m_mapView.projection.type,
            this.m_mapView.camera
        );
        this.m_mapView.scene.background = this.m_skyBackground.texture;
    }

    private removeSkyBackGround() {
        this.m_mapView.scene.background = null;
        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.dispose();
            this.m_skyBackground = undefined;
        }
    }

    private updateSkyBackgroundColors(sky: Sky, clearColor: string | undefined) {
        if (sky.type === "gradient" && (sky as GradientSky).groundColor === undefined) {
            sky.groundColor = getOptionValue(clearColor, "#000000");
        }
        if (this.m_skyBackground !== undefined) {
            this.m_skyBackground.updateTexture(sky, this.m_mapView.projection.type);
            this.m_mapView.scene.background = this.m_skyBackground?.texture;
        }
    }

    /**
     * Transfer from view space to camera space.
     * @param viewPos - position in view space, result is stored here.
     */
    private viewToLightSpace(viewPos: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
        return viewPos.applyMatrix4(camera.matrixWorldInverse);
    }
}
