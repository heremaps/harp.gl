/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CubemapSkyParams, GradientSkyParams } from "@here/harp-datasource-protocol";
import { ProjectionType } from "@here/harp-geoutils";
import { SkyCubemapTexture } from "./SkyCubemapTexture";
import { SkyGradientTexture } from "./SkyGradientTexture";

import * as THREE from "three";

/**
 * Class that handles [[MapView]]'s sky background.
 */
export class SkyBackground {
    private m_skyTexture?: SkyGradientTexture | SkyCubemapTexture;

    /**
     * Constructs a new `SkyBackground`.
     *
     * @param m_params Sky configuration parameters.
     * @param m_projectionType [[MapView]]'s projection type.
     * @param camera [[MapView]]'s camera.
     */
    constructor(
        private m_params: GradientSkyParams | CubemapSkyParams,
        private m_projectionType: ProjectionType,
        camera: THREE.Camera
    ) {
        switch (this.m_params.type) {
            case "gradient":
                this.m_skyTexture = new SkyGradientTexture(this.m_params, this.m_projectionType);
                this.updateCamera(camera);
                break;
            case "cubemap": {
                this.m_skyTexture = new SkyCubemapTexture(this.m_params);
                break;
            }
        }
    }

    /**
     * Disposes allocated resources.
     */
    dispose() {
        this.m_skyTexture!.dispose();
    }

    /**
     * Sky texture.
     */
    get texture(): THREE.Texture {
        return this.m_skyTexture!.texture;
    }

    /**
     * This method updates the skybox based on the camera position (needed for some types of sky).
     *
     * @param camera The camera used in the map view.
     */
    updateCamera(camera: THREE.Camera) {
        if (this.m_params.type === "gradient") {
            (this.m_skyTexture! as SkyGradientTexture).update(camera);
        }
    }

    /**
     * Updates the sky texture with new parameters.
     *
     * @param params New sky configuration parameters.
     */
    updateTexture(params: GradientSkyParams | CubemapSkyParams) {
        const isSameSkyType = this.m_params.type === params.type;
        switch (params.type) {
            case "gradient":
                if (isSameSkyType) {
                    (this.m_skyTexture! as SkyGradientTexture).updateTexture(params);
                } else {
                    this.m_skyTexture = new SkyGradientTexture(params, this.m_projectionType);
                }
                break;
            case "cubemap": {
                if (isSameSkyType) {
                    (this.m_skyTexture! as SkyCubemapTexture).updateTexture(params);
                } else {
                    this.m_skyTexture = new SkyCubemapTexture(params);
                }
                break;
            }
        }
        this.m_params = params;
    }
}
