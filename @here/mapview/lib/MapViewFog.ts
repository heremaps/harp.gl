/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/datasource-protocol";
import { HighPrecisionLineMaterial, SolidLineMaterial } from "@here/materials";
import { Fog, Material, Mesh } from "three";

/**
 * `MapViewFog` manages the fog display in [[MapView]].
 */
export class MapViewFog {
    private m_enabled: boolean = true;
    private m_fog: THREE.Fog = new Fog(0x000000); // Default color asked by DefinitelyTyped.
    private m_fogIsDefined: boolean = false;
    private m_cachedTheme: Theme = { styles: {} };

    /**
     * Constructs a `MapViewFog` instance.
     *
     * @param m_scene The scene used in [[MapView]] that contains the map objects.
     */
    constructor(private m_scene: THREE.Scene) {}

    /**
     * Allow disabling the fog, even if defined in the theme. Use for custom views like the debug
     * camera of the demo app. If the theme does not define a fog however, enabling it here would
     * have no effect.
     *
     * @param value The boolean telling whether the fog should be enabled or disabled.
     */
    set enabled(enableFog: boolean) {
        this.m_enabled = enableFog;
        if (enableFog && this.m_fogIsDefined && this.m_scene.fog === null) {
            this.add();
        } else if (!enableFog && this.m_scene.fog !== null) {
            this.remove();
        }
    }

    /**
     * Returns the current fog status, enabled or disabled.
     */
    get enabled(): boolean {
        return this.m_enabled;
    }

    /**
     * Set the fog depending on the provided [[Theme]] instance. Called when a theme is loaded. Fog
     * will be added only if the theme contains a sky definition with a `colorBottom` property, used
     * to set the fog color, and a fog definition with a `startRatio` property, used to set the
     * start distance of the fog as a ratio of the far culling plane distance.
     *
     * @param theme A [[Theme]] instance.
     */
    reset(theme: Theme) {
        this.m_cachedTheme = theme;
        if (
            theme !== undefined &&
            theme.sky !== undefined &&
            theme.sky.colorBottom !== undefined &&
            theme.fog !== undefined &&
            theme.fog.startRatio !== undefined // This will be necessary in the `update` method.
        ) {
            this.m_fogIsDefined = true;
            this.m_fog.color.set(theme.sky.colorBottom);
            if (this.m_enabled && this.m_scene.fog === null) {
                this.add();
            }
        } else {
            this.m_fogIsDefined = false;
            if (this.m_scene.fog !== null) {
                this.remove();
            }
        }
    }

    /**
     * Update the fog at runtime, depending on the camera.
     *
     * @param camera an instance of a `THREE.Camera` with a `far` property.
     */
    update(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
        if (
            this.m_scene.fog !== null &&
            camera.far !== undefined &&
            this.m_cachedTheme !== undefined &&
            this.m_cachedTheme.fog &&
            this.m_cachedTheme.fog.startRatio !== undefined
        ) {
            this.m_fog.far = camera.far;
            this.m_fog.near = camera.far * this.m_cachedTheme.fog.startRatio;
        }
    }

    /**
     * Handle fog addition.
     */
    add() {
        // When the fog is changed, ThreeJS takes care of recompiling its built-in materials...
        this.m_scene.fog = this.m_fog;
        // ...except the `RawShaderMaterial`, on purpose, so it needs to be updated from the app.
        this.setFogInRawShaderMaterials(true);
    }

    /**
     * Handle fog removal.
     */
    remove() {
        // When the fog is changed, ThreeJS takes care of recompiling its built-in materials...
        this.m_scene.fog = null;
        // ...except the `RawShaderMaterial`, on purpose, so it needs to be updated from the app.
        this.setFogInRawShaderMaterials(false);
    }

    /**
     * ThreeJS lets its users manage the `RawShaderMaterial` themselves, so they need to be modified
     * explicitely.
     *
     * @see https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLProgram.js#L298
     */
    private setFogInRawShaderMaterials(enableFog: boolean) {
        this.m_scene.traverse(object => {
            if (object instanceof Mesh) {
                if (object.material instanceof Material) {
                    if (
                        object.material instanceof Material &&
                        // HighPrecisionLineMaterial does not support fog
                        !(object.material instanceof HighPrecisionLineMaterial)
                    ) {
                        if (object.material instanceof SolidLineMaterial) {
                            const material = object.material;
                            (material as SolidLineMaterial).updateFog(enableFog);
                        }
                        object.material.fog = enableFog;
                        object.material.needsUpdate = true;
                    }
                }
            }
        });
    }
}
