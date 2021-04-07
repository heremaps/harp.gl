/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CubemapSky } from "@here/harp-datasource-protocol";
import { LoggerManager } from "@here/harp-utils";
import { CubeTexture, CubeTextureLoader, Texture } from "three";

const logger = LoggerManager.instance.create("SkyCubemapTexture");

/**
 * Number of faces that form a [[SkyCubemapTexture]].
 */
export const SKY_CUBEMAP_FACE_COUNT = 6;

/**
 * Maps the faceId to the expected position in the threejs faces array.
 */
export enum SkyCubemapFaceId {
    "positiveX",
    "negativeX",
    "positiveY",
    "negativeY",
    "positiveZ",
    "negativeZ"
}

/**
 * Class that handles loading all 6 faces of a [[CubeTexture]], to be used with [[SkyBackground]].
 */
export class SkyCubemapTexture {
    private m_skybox: CubeTexture;

    /**
     * Constructs a new `SkyCubemapTexture`.
     *
     * @param sky - Initial [[CubemapSky]] configuration.
     */
    constructor(sky: CubemapSky) {
        const faces = this.createCubemapFaceArray(sky);
        this.m_skybox =
            faces !== undefined ? new CubeTextureLoader().load(faces) : new CubeTexture();
    }

    /**
     * Disposes allocated resources.
     */
    dispose() {
        this.m_skybox.dispose();
    }

    /**
     * `SkyCubemapTexture`'s texture resource.
     */
    get texture(): Texture {
        return this.m_skybox;
    }

    /**
     * Updates the `SkyCubemapTexture` with new parameters.
     *
     * @param params - New [[CubemapSky]] configuration.
     */
    updateTexture(sky: CubemapSky) {
        const faces = this.createCubemapFaceArray(sky);
        if (faces === undefined) {
            return;
        }
        this.m_skybox = new CubeTextureLoader().load(faces);
    }

    private createCubemapFaceArray(sky: CubemapSky): string[] | undefined {
        const faces: Array<string | undefined> = [
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        ];
        for (let i = 0; i < SKY_CUBEMAP_FACE_COUNT; ++i) {
            const face: string | undefined = (sky as any)[SkyCubemapFaceId[i]];
            if (face === undefined) {
                logger.error(`Face "${SkyCubemapFaceId[i]}" was not defined.`);
                return;
            }
            faces[i] = face;
        }

        return faces as string[];
    }
}
