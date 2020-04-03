/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { EarthConstants, Projection, ProjectionType } from "@here/harp-geoutils";

import { GroundAtmosphereMaterial, SkyAtmosphereMaterial } from "@here/harp-materials";
import { MapView, WorldAnchor } from "./MapView";

import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { InterpolatedClipPlanesEvaluator } from "./ClipPlanesEvaluator";

/**
 * Atmosphere effect variants.
 */
enum AtmosphereVariant {
    Ground = 0x1,
    Sky = 0x2,
    SkyAndGround = 0x3
}

/**
 * Atmosphere shader variants.
 */
enum AtmosphereShadingVariant {
    ScatteringShader,
    SimpleColor,
    Wireframe
}

/**
 * Lists light modes.
 */
export enum AtmosphereLightMode {
    LightOverhead = 0,
    LightDynamic = 1
}

/**
 * Class that provides [[MapView]]'s atmospheric scattering effect.
 */
export class MapViewAtmosphere {
    /**
     * User data name attribute assigned to created mesh.
     */
    static SkyAtmosphereUserName: string = "SkyAtmosphere";
    /**
     * User data name attribute assigned to created mesh.
     */
    static GroundAtmosphereUserName: string = "GroundAtmosphere";

    /**
     * Check if scene and map view has already atmosphere effect added.
     * @param where [[MapView]] or [[THREE.Scene]] instance.
     */
    static isPresent(where: MapView | THREE.Scene): boolean {
        const scene = where instanceof MapView ? where.scene : where;
        if (scene.getObjectByName(MapViewAtmosphere.SkyAtmosphereUserName)) {
            return true;
        } else if (scene.getObjectByName(MapViewAtmosphere.GroundAtmosphereUserName)) {
            return true;
        }
        return false;
    }

    private m_enabled: boolean = true;
    private m_skyGeometry?: THREE.BufferGeometry;
    private m_skyMaterial?: THREE.Material;
    private m_skyMesh?: THREE.Mesh;
    private m_groundGeometry?: THREE.BufferGeometry;
    private m_groundMaterial?: THREE.Material;
    private m_groundMesh?: THREE.Mesh;

    // tslint:disable-next-line:deprecation
    private m_clipPlanesEvaluator = new InterpolatedClipPlanesEvaluator(
        0.1,
        0.1,
        50.0,
        EarthConstants.EQUATORIAL_RADIUS * 0.6
    );
    // TODO: Support for Theme definition should be added.
    //private m_cachedTheme: Theme = { styles: {} };

    private readonly m_lightDirection = new THREE.Vector3(0.0, 1.0, 0.0);

    /**
     * Creates and adds `Atmosphere` effects.
     *
     * @note Currently works only with globe projection.
     *
     * @param m_mapView [[MapView]] instance where the effect will be added.
     * @param m_atmosphere Atmosphere configuration parameters.
     */
    constructor(
        private m_mapView: MapView,
        private m_atmosphereVariant: AtmosphereVariant = AtmosphereVariant.SkyAndGround,
        // TODO: To be removed just for debugging purposed.
        private m_materialVariant = AtmosphereShadingVariant.ScatteringShader
    ) {
        // tslint:disable-next-line: no-bitwise
        if (this.m_atmosphereVariant & AtmosphereVariant.Sky) {
            this.createSkyGeometry();
        }
        // tslint:disable-next-line: no-bitwise
        if (this.m_atmosphereVariant & AtmosphereVariant.Ground) {
            this.createGroundGeometry();
        }
        this.addToMapView(this.m_mapView);
    }

    get skyMesh(): THREE.Mesh | undefined {
        return this.m_skyMesh;
    }

    get groundMesh(): THREE.Mesh | undefined {
        return this.m_groundMesh;
    }

    /**
     * Allows to enable/disable the atmosphere effect, regardless of the theme settings.
     *
     * Use this method to change the setup in runtime without defining corresponding theme setup.
     *
     * @param enable A boolean that specifies whether the atmosphere should be enabled or disabled.
     */
    set enabled(enable: boolean) {
        // Check already disposed.
        if (this.disposed) {
            return;
        }
        if (this.m_enabled === enable) {
            return;
        }
        this.m_enabled = enable;
        const isAdded = MapViewAtmosphere.isPresent(this.m_mapView);
        if (enable && !isAdded) {
            this.addToMapView(this.m_mapView);
        } else if (!enable && isAdded) {
            this.removeFromMapView(this.m_mapView);
        }
    }

    /**
     * Returns the current atmosphere status, enabled or disabled.
     */
    get enabled(): boolean {
        return this.m_enabled;
    }

    set lightMode(lightMode: AtmosphereLightMode) {
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            return;
        }
        const dynamicLight = lightMode === AtmosphereLightMode.LightDynamic;
        if (this.m_groundMaterial !== undefined) {
            const groundMat = this.m_groundMaterial as GroundAtmosphereMaterial;
            groundMat.setDynamicLighting(dynamicLight);
        }
        if (this.m_skyMaterial !== undefined) {
            const skyMat = this.m_skyMaterial as SkyAtmosphereMaterial;
            skyMat.setDynamicLighting(dynamicLight);
        }
    }

    /**
     * Disposes allocated resources.
     */
    dispose() {
        // Unlink from scene and mapview anchors
        if (this.enabled) {
            this.enabled = false;
        }

        this.m_skyMaterial?.dispose();
        this.m_groundMaterial?.dispose();

        this.m_skyGeometry?.dispose();
        this.m_groundGeometry?.dispose();

        // After disposal we may no longer enable effect.
        this.m_skyGeometry = undefined;
        this.m_groundGeometry = undefined;

        this.m_skyMaterial = undefined;
        this.m_groundMaterial = undefined;

        this.m_skyMesh = undefined;
        this.m_groundMesh = undefined;
    }

    /**
     * Sets the atmosphere depending on the [[Theme]] instance provided.
     *
     * This function is called when a theme is loaded. Atmosphere is added only if the theme
     * contains a atmosphere definition with a:
     * - `color` property, used to set the atmosphere color.
     *
     * @param theme A [[Theme]] instance.
     */
    reset(theme: Theme) {
        //this.m_cachedTheme = theme;
    }

    /**
     * Updates the atmosphere at runtime, depending on the camera and projection settings.
     *
     * @param camera An instance of a `THREE.Camera`.
     * @param projection An instance of Projection currently in use.
     */
    update(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, projection: Projection) {
        assert(
            projection.type === this.m_mapView.projection.type,
            "Projection type changed, please re-create MapViewAtmosphere"
        );
    }

    private get disposed() {
        return this.m_skyMesh === undefined && this.m_groundMesh === undefined;
    }

    /**
     * Handles atmosphere effect adding.
     */
    private addToMapView(mapView: MapView) {
        assert(!MapViewAtmosphere.isPresent(mapView.scene), "Atmosphere already added");
        if (this.m_skyMesh !== undefined) {
            mapView.worldAnchors.add(createWorldAnchor(this.m_skyMesh, Number.MIN_SAFE_INTEGER));
        }
        if (this.m_groundMesh !== undefined) {
            mapView.worldAnchors.add(createWorldAnchor(this.m_groundMesh, Number.MAX_SAFE_INTEGER));
        }

        // Request an update once the anchor is added to [[MapView]].
        mapView.update();
    }

    /**
     * Handles atmosphere effect removal.
     */
    private removeFromMapView(mapView: MapView) {
        if (!MapViewAtmosphere.isPresent(mapView.scene)) {
            return;
        }
        let update = false;
        if (this.m_skyMesh !== undefined) {
            mapView.worldAnchors.remove(this.m_skyMesh);
            update = true;
        }
        if (this.m_groundMesh !== undefined) {
            mapView.worldAnchors.remove(this.m_groundMesh);
            update = true;
        }
        if (update) {
            mapView.update();
        }
    }

    private createSkyGeometry() {
        let skyGeometry: THREE.Geometry;
        switch (this.m_mapView.projection.type) {
            case ProjectionType.Spherical:
                skyGeometry = new THREE.SphereGeometry(
                    EarthConstants.EQUATORIAL_RADIUS * 1.025, //+ this.m_atmosphere.maxAltitude,
                    256,
                    256
                );
                break;
            default: {
                skyGeometry = new THREE.PlaneGeometry(200, 200);
                break;
            }
        }

        skyGeometry.translate(0, 0, 0);
        this.m_skyGeometry = new THREE.BufferGeometry();
        this.m_skyGeometry.fromGeometry(skyGeometry);
        skyGeometry.dispose();

        if (this.m_materialVariant === AtmosphereShadingVariant.ScatteringShader) {
            this.m_skyMaterial = new SkyAtmosphereMaterial();
        } else if (this.m_materialVariant === AtmosphereShadingVariant.SimpleColor) {
            this.m_skyMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0xc4f8ed),
                opacity: 0.4,
                transparent: false,
                depthTest: true, // hide atmosphere behind globe (note: transparent changes order)
                depthWrite: false,
                side: THREE.BackSide,
                blending: THREE.NormalBlending,
                fog: false
            });
        } else {
            this.m_skyMaterial = new THREE.MeshStandardMaterial({
                color: 0x7fffff,
                depthTest: false,
                depthWrite: false,
                normalScale: new THREE.Vector2(-1, -1),
                side: THREE.BackSide, // not truly supported in wireframe mode
                wireframe: true
            });
        }

        this.m_skyMesh = new THREE.Mesh(this.m_skyGeometry, this.m_skyMaterial);
        // Assign custom name so sky object may be easily recognized withing the scene.
        this.m_skyMesh.name = MapViewAtmosphere.SkyAtmosphereUserName;
        this.setupSkyForRendering();
    }

    private createGroundGeometry() {
        let groundGeometry: THREE.Geometry;
        switch (this.m_mapView.projection.type) {
            case ProjectionType.Spherical:
                groundGeometry = new THREE.SphereGeometry(
                    EarthConstants.EQUATORIAL_RADIUS * 1.001, //+ this.m_atmosphere.minAltitude,
                    256,
                    256
                );
                break;
            default: {
                groundGeometry = new THREE.PlaneGeometry(200, 200);
                break;
            }
        }
        groundGeometry.translate(0, 0, 0);
        this.m_groundGeometry = new THREE.BufferGeometry();
        this.m_groundGeometry.fromGeometry(groundGeometry);
        groundGeometry.dispose();

        if (this.m_materialVariant === AtmosphereShadingVariant.ScatteringShader) {
            this.m_groundMaterial = new GroundAtmosphereMaterial();
        } else if (this.m_materialVariant === AtmosphereShadingVariant.SimpleColor) {
            this.m_groundMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0x00c5ff),
                opacity: 0.4,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.FrontSide,
                blending: THREE.NormalBlending,
                fog: false
            });
        } else {
            this.m_groundMaterial = new THREE.MeshStandardMaterial({
                color: 0x11899a,
                depthTest: true, // FrontSide is not fully supported, so need depth test
                depthWrite: false,
                side: THREE.FrontSide,
                wireframe: true
            });
        }

        this.m_groundMesh = new THREE.Mesh(this.m_groundGeometry, this.m_groundMaterial);
        // Assign name so object may be recognized withing the scene.
        this.m_groundMesh.name = MapViewAtmosphere.GroundAtmosphereUserName;

        this.setupGroundForRendering();
    }

    private setupSkyForRendering(): void {
        if (this.m_skyMesh === undefined) {
            return;
        }
        // Depending on material variant we need to update uniforms or only
        // update camera near/far planes cause camera need to see further then
        // actual earth geometry.
        let onBeforeCallback: (_camera: THREE.Camera, _material: THREE.Material) => void;
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            // Setup only further clip planes before rendering.
            onBeforeCallback = (camera: THREE.Camera, _material: THREE.Material) => {
                this.overrideClipPlanes(camera);
            };
        } else {
            // Setup proper clip planes and update uniforms values.
            onBeforeCallback = (camera: THREE.Camera, material: THREE.Material) => {
                this.overrideClipPlanes(camera);
                // Check material wasn't swapped.
                assert(material instanceof SkyAtmosphereMaterial);
                const mat = this.m_skyMaterial as SkyAtmosphereMaterial;
                mat.updateUniforms(mat, this.m_skyMesh!, camera, this.m_lightDirection);
            };
        }

        // Sky material should be already created with mesh.
        assert(this.m_skyMaterial !== undefined);
        this.m_skyMesh.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.Geometry | THREE.BufferGeometry,
            material: THREE.Material,
            _group: THREE.Group
        ) => {
            onBeforeCallback(camera, material);
        };

        this.m_skyMesh.onAfterRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.Geometry | THREE.BufferGeometry,
            _material: THREE.Material,
            _group: THREE.Group
        ) => {
            this.revertClipPlanes(camera);
        };
    }

    private setupGroundForRendering(): void {
        if (this.m_groundMesh === undefined) {
            return;
        }
        if (this.m_materialVariant !== AtmosphereShadingVariant.ScatteringShader) {
            return;
        }
        // Ground material should be already created.
        assert(this.m_groundMaterial !== undefined);
        // Ground mesh does not need custom clip planes and uses the same camera setup as
        // real (data source based) geometry.
        this.m_groundMesh.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.Geometry | THREE.BufferGeometry,
            material: THREE.Material,
            _group: THREE.Group
        ) => {
            assert(material instanceof GroundAtmosphereMaterial);
            const mat = this.m_groundMaterial as GroundAtmosphereMaterial;
            mat.updateUniforms(mat, this.m_groundMesh!, camera, this.m_lightDirection);
        };
    }

    private overrideClipPlanes(camera: THREE.Camera) {
        const { projection, elevationProvider } = this.m_mapView;
        const viewRanges = this.m_clipPlanesEvaluator.evaluateClipPlanes(
            camera,
            projection,
            elevationProvider
        );
        assert(camera instanceof THREE.PerspectiveCamera);
        const c = camera as THREE.PerspectiveCamera;
        c.near = viewRanges.near;
        c.far = viewRanges.far;
        c.updateProjectionMatrix();
    }

    private revertClipPlanes(camera: THREE.Camera) {
        const viewRanges = this.m_mapView.viewRanges;
        assert(camera instanceof THREE.PerspectiveCamera);
        const cam = camera as THREE.PerspectiveCamera;
        cam.near = viewRanges.near;
        cam.far = viewRanges.far;
        cam.updateProjectionMatrix();
    }
}

function createWorldAnchor(mesh: THREE.Mesh, renderOrder: number): WorldAnchor<THREE.Mesh> {
    const anchor = mesh as WorldAnchor<THREE.Mesh>;
    anchor.renderOrder = renderOrder;
    anchor.pickable = false;
    anchor.worldPosition = new THREE.Vector3(0, 0, 0);
    return anchor;
}
