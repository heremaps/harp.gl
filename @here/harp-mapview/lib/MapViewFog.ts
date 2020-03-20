/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { HighPrecisionLineMaterial } from "@here/harp-materials";
import { assert, MathUtils } from "@here/harp-utils";
import * as THREE from "three";
import { MapView } from "./MapView";
import { MapViewUtils } from "./Utils";

/**
 * Manages the fog display in [[MapView]].
 */
export class MapViewFog {
    private m_enabled: boolean = true;
    private m_fog: THREE.Fog = new THREE.Fog(0x000000); // Default color asked by DefinitelyTyped.
    private m_fogIsDefined: boolean = false;
    private m_cachedTheme: Theme = { styles: {} };

    /**
     * Constructs a `MapViewFog` instance.
     *
     * @param m_scene The scene used in [[MapView]] that contains the map objects.
     */
    constructor(private m_scene: THREE.Scene) {}

    /**
     * Allows for disabling the fog, even if it is defined in the theme. Use this property for
     * custom views like the demo app's debug camera. However, if the theme does not define a
     * fog, enabling this property here has no effect.
     *
     * @param value A boolean that specifies whether the fog should be enabled or disabled.
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
     * Sets the fog depending on the [[Theme]] instance provided. This function is called when a
     * theme is loaded. Fog is added only if the theme contains a fog definition with a:
     * - `color` property, used to set the fog color.
     * - `startRatio` property, used to set the start distance of the fog as a ratio of the far
     * clipping plane distance.
     *
     * @param theme A [[Theme]] instance.
     */
    reset(theme: Theme) {
        this.m_cachedTheme = theme;
        if (
            theme !== undefined &&
            theme.fog !== undefined &&
            theme.fog.color !== undefined &&
            theme.fog.startRatio !== undefined
        ) {
            this.m_fogIsDefined = true;
            this.m_fog.color.set(theme.fog.color);
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
     * Updates the fog at runtime, depending on the camera.
     *
     * @param camera An instance of a `THREE.Camera` with a `far` property.
     */
    update(mapView: MapView, viewDistance?: number) {
        if (
            this.m_scene.fog !== null &&
            this.m_cachedTheme !== undefined &&
            this.m_cachedTheme.fog &&
            this.m_cachedTheme.fog.startRatio !== undefined &&
            (mapView.camera.far !== undefined || viewDistance !== undefined)
        ) {
            // If maximum visibility range is available use it instead of camera.far distance,
            // this makes fog independent from dynamic camera planes and keeps consistent
            // distance based "melting" (fog) effect during a tilt.
            const viewRange = viewDistance !== undefined ? viewDistance : mapView.camera.far;
            // TODO: We may move below constants to theme Fog definition
            // Density of the fog when viewing straight along the horizon line.
            const horizontalDensity = 1.0;
            // Theoretical density of the fog when viewing straight from top to down.
            const verticalDensity = 0.0;
            // The fraction of the maximum viewing distance along the eye vector
            // to start applying the fog.
            const startRatio = this.m_cachedTheme.fog.startRatio;
            // The fraction of maximum viewing range at which fog fully covers geometry.
            const endRatio = 1.0;
            assert(startRatio <= endRatio);
            const t = Math.abs(
                // tslint:disable-next-line: deprecation
                Math.cos(MapViewUtils.extractCameraTilt(mapView.camera, mapView.projection))
            );
            const density = MathUtils.smoothStep(horizontalDensity, verticalDensity, t);
            this.m_fog.near = MathUtils.lerp(viewRange * startRatio, viewRange, 1.0 - density);
            this.m_fog.far = MathUtils.lerp(viewRange * endRatio, viewRange, density);
            this.m_fog.near = Math.min(this.m_fog.near, mapView.camera.far);
            this.m_fog.far = Math.min(this.m_fog.far, mapView.camera.far);
        }
    }

    /**
     * Handles fog addition.
     */
    private add() {
        // When the fog is changed, ThreeJS takes care of recompiling its built-in materials...
        this.m_scene.fog = this.m_fog;
        // ...except the `RawShaderMaterial`, on purpose, so it needs to be updated from the app.
        this.setFogInRawShaderMaterials(true);
    }

    /**
     * Handles fog removal.
     */
    private remove() {
        // When the fog is changed, ThreeJS takes care of recompiling its built-in materials...
        this.m_scene.fog = null;
        // ...except the `RawShaderMaterial`, on purpose, so it needs to be updated from the app.
        this.setFogInRawShaderMaterials(false);
    }

    /**
     * ThreeJS lets users manage the `RawShaderMaterial` themselves, so they need to be modified
     * explicitly.
     *
     * @see https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLProgram.js#L298
     */
    private setFogInRawShaderMaterials(enableFog: boolean) {
        this.m_scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) {
                return;
            }
            if (!(object.material instanceof THREE.Material)) {
                return;
            }
            // HighPrecisionLineMaterial does not support fog
            if (object.material instanceof HighPrecisionLineMaterial) {
                return;
            }
            // We may skip redundant updates.
            if (object.material.fog === enableFog) {
                return;
            }
            object.material.fog = enableFog;
            // Fog properties can't be easily changed at runtime (once the material
            // is rendered at least once) and thus requires building of new shader
            // program - force material update.
            object.material.needsUpdate = true;
        });
    }
}
