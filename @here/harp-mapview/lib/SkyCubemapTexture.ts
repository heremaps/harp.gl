/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CubemapSkyParams } from "@here/harp-datasource-protocol";
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
     * @param m_params Initial [[CubemapSkyParams]].
     */
    constructor(params: CubemapSkyParams) {
        const faces = this.createCubemapFaceArray(params);
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
     * @param params New [[CubemapSkyParams]].
     */
    updateTexture(params: CubemapSkyParams) {
        const faces = this.createCubemapFaceArray(params);
        if (faces === undefined) {
            return;
        }
        this.m_skybox = new CubeTextureLoader().load(faces);
    }

    private createCubemapFaceArray(params: CubemapSkyParams): string[] | undefined {
        const faces: Array<string | undefined> = [
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined
        ];
        for (let i = 0; i < SKY_CUBEMAP_FACE_COUNT; ++i) {
            const face: string | undefined = (params as any)[SkyCubemapFaceId[i]];
            if (face === undefined) {
                logger.error(`Face "${SkyCubemapFaceId[i]}" was not defined.`);
                return;
            }
            faces[i] = face;
        }

        return faces as string[];
    }
}
