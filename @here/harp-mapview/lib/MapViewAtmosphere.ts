/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Atmosphere, Theme } from "@here/harp-datasource-protocol";
import { EarthConstants, Projection, ProjectionType } from "@here/harp-geoutils";

import {
    AtmosphereMaterial,
    AtmosphereOuterMaterial,
    AtmosphereOuterShader
} from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { MapAnchor, MapView } from "./MapView";
import { Vector3 } from "three";

enum MaterialVariant {
    Shader,
    SimpleColor,
    Phong
}

const materialVariant = MaterialVariant.Shader;

/**
 * Class that provides [[MapView]]'s atmospheric scattering effect.
 */
export class MapViewAtmosphere {
    private m_enabled: boolean = true;
    private m_geometry: THREE.BufferGeometry;
    private m_material: THREE.Material;
    private m_mesh: THREE.Mesh;
    private m_cachedTheme: Theme = { styles: {} };
    private readonly m_shaderUniforms: { [uniformName: string]: THREE.IUniform } =
        AtmosphereOuterShader.uniforms;

    private readonly m_matrixWorldInverse = new THREE.Matrix4();
    private readonly m_lightDirection = new Vector3(0.0, 0.0, 1.0);

    /**
     * Constructs a new `MapViewAtmosphere`.
     *
     * @param m_atmosphere Atmosphere configuration parameters.
     * @param m_projectionType [[MapView]]'s projection type.
     */
    constructor(private m_atmosphere: Atmosphere, private m_projectionType: ProjectionType) {
        let geometry: THREE.Geometry;
        switch (this.m_projectionType) {
            case ProjectionType.Spherical:
                geometry = new THREE.SphereGeometry(
                    EarthConstants.EQUATORIAL_RADIUS + this.m_atmosphere.maxAltitude,
                    180 / 5,
                    180 / 5
                );
                break;
            default: {
                geometry = new THREE.PlaneGeometry(200, 200);
                break;
            }
        }

        geometry.translate(0, 0, 0);
        this.m_geometry = new THREE.BufferGeometry();
        this.m_geometry.fromGeometry(geometry);
        geometry.dispose();

        if (materialVariant === MaterialVariant.Shader) {
            this.m_material = new AtmosphereOuterMaterial();
        } else if (materialVariant === MaterialVariant.SimpleColor) {
            this.m_material = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0xff0000),
                opacity: 0.4,
                visible: true,
                depthTest: false,
                depthWrite: false
            });
        } else {
            this.m_material = new THREE.MeshStandardMaterial({
                color: 0x00ff00fe,
                normalScale: new THREE.Vector2(-1, -1),
                wireframe: true
            });
        }

        this.m_mesh = new THREE.Mesh(this.m_geometry, this.m_material);
        this.m_mesh.userData = {
            name: "Atmosphere"
        };

        this.setupForRendering();
    }

    get mesh(): THREE.Mesh {
        return this.m_mesh;
    }

    /**
     * Disposes allocated resources.
     */
    dispose() {
        this.m_geometry.dispose();
        // TODO: Remove object from scene
    }

    /**
     * Allows for disabling the atmosphere, even if it is defined in the theme.
     *
     * Use this property for custom views like the demo app's debug camera.
     * However, if the theme does not define a atmosphere, enabling this property
     * here has no effect.
     *
     * @param value A boolean that specifies whether the atmosphere should be enabled or disabled.
     * @param scene The optional scene reference, that may be used to automatically add or remove
     * atmosphere from scene.
     */
    setEnabled(enableAtmosphere: boolean, scene?: THREE.Scene) {
        this.m_enabled = enableAtmosphere;
        if (enableAtmosphere && scene !== undefined) {
            this.add(scene);
        } else if (!enableAtmosphere && scene !== undefined) {
            this.remove(scene);
        }
    }

    /**
     * Returns the current atmosphere status, enabled or disabled.
     */
    isEnabled(): boolean {
        return this.m_enabled;
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
        this.m_cachedTheme = theme;
    }

    addToMapView(mapView: MapView) {
        mapView.mapAnchors.add(this.createAnchor());

        // Request an update once the anchor is added to [[MapView]].
        mapView.update();
    }

    removeFromMapView(mapView: MapView) {
        mapView.mapAnchors.remove(this.mesh);
        mapView.update();
    }

    /**
     * Handles atmosphere addition.
     */
    add(scene: THREE.Scene) {
        assert(!this.isPresent(scene), "Atmosphere already added");
        scene.add(this.m_mesh);
    }

    /**
     * Handles atmosphere removal.
     */
    remove(scene: THREE.Scene) {
        if (this.isPresent(scene)) {
            scene.remove(this.m_mesh);
        }
    }

    isPresent(scene: THREE.Scene): boolean {
        let present: boolean = false;
        scene.traverse(obj => {
            if (!present && obj === this.m_mesh) {
                present = true;
            }
        });
        return present;
    }

    /**
     * Updates the atmosphere at runtime, depending on the camera and projection settings.
     *
     * @param camera An instance of a `THREE.Camera`.
     * @param projection An instance of Projection currently in use.
     */
    update(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, projection: Projection) {
        assert(
            projection.type === this.m_projectionType,
            "Projection type changed, please re-create MapViewAtmosphere"
        );
    }

    private setupForRendering(): void {
        if (materialVariant !== MaterialVariant.Shader) {
            return;
        }
        this.m_mesh.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.Geometry | THREE.BufferGeometry,
            _material: THREE.Material,
            _group: THREE.Group
        ) => {
            // TODO: Create custom mesh objects that contains mvp matrix.
            this.m_matrixWorldInverse.getInverse(this.mesh.matrixWorld);
            AtmosphereMaterial.updateUniforms(
                this.shaderMaterial!,
                this.m_matrixWorldInverse,
                this.m_lightDirection,
                camera,
            );
        };
    }

    get shaderMaterial(): THREE.ShaderMaterial | null {
        if (materialVariant === MaterialVariant.Shader) {
            return this.m_material as THREE.ShaderMaterial;
        }
        return null;
    }

    private createAnchor(): MapAnchor<THREE.Mesh> {
        const anchor = this.m_mesh as MapAnchor<THREE.Mesh>;
        anchor.renderOrder = Number.MAX_SAFE_INTEGER;
        anchor.worldPosition = new THREE.Vector3(0, 0, 0);
        return anchor;
    }

    /**
     * This method updates the effect based on the camera position (needed for some types of sky).
     *
     * @param camera The camera used in the map view.
     */
    private updateCamera(camera: THREE.Camera) {
        if (this.m_projectionType !== ProjectionType.Spherical) {
            // TODO: Update plane geometry position and size
        }
    }
}
