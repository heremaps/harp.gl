/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CubemapSky, GradientSky } from "@here/harp-datasource-protocol";
import { ProjectionType } from "@here/harp-geoutils";
import * as THREE from "three";

import { SkyCubemapTexture } from "./SkyCubemapTexture";
import { SkyGradientTexture } from "./SkyGradientTexture";

/**
 * Class that handles {@link MapView}'s sky background.
 */
export class SkyBackground {
    private m_skyTexture?: SkyGradientTexture | SkyCubemapTexture;

    /**
     * Constructs a new `SkyBackground`.
     *
     * @param m_sky - Sky configuration parameters.
     * @param m_projectionType - {@link MapView}'s projection type.
     * @param camera - {@link MapView}'s camera.
     */
    constructor(
        private m_sky: GradientSky | CubemapSky,
        private m_projectionType: ProjectionType,
        camera: THREE.Camera
    ) {
        switch (this.m_sky.type) {
            case "gradient":
                this.m_skyTexture = new SkyGradientTexture(this.m_sky, this.m_projectionType);
                this.updateCamera(camera);
                break;
            case "cubemap": {
                this.m_skyTexture = new SkyCubemapTexture(this.m_sky);
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
     * @param camera - The camera used in the map view.
     */
    updateCamera(camera: THREE.Camera) {
        if (this.m_sky.type === "gradient") {
            (this.m_skyTexture! as SkyGradientTexture).update(camera);
        }
    }

    /**
     * Updates the sky texture with new parameters.
     *
     * @param params - New sky configuration parameters.
     * @param projectionType - Which projection is used, this may also change (in which case the
     * textures should be recreated).
     */
    updateTexture(params: GradientSky | CubemapSky, projectionType: ProjectionType) {
        const isSameSkyType =
            this.m_sky.type === params.type && this.m_projectionType === projectionType;
        switch (params.type) {
            case "gradient":
                if (isSameSkyType) {
                    (this.m_skyTexture! as SkyGradientTexture).updateTexture(params);
                } else {
                    this.m_skyTexture = new SkyGradientTexture(params, projectionType);
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
        this.m_projectionType = projectionType;
        this.m_sky = params;
    }
}
