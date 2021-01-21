/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { FontCatalog } from "../rendering/FontCatalog";
import { SdfTextMaterial } from "../rendering/TextMaterials";

/**
 * Material parameters passed on [[SdfTextMaterial]] creation when using the `
 * `createSdfTextMaterial` helper function.
 */
export interface SdfTextMaterialParameters {
    fontCatalog: FontCatalog;
    rendererCapabilities: THREE.WebGLCapabilities;
    isBackground?: boolean;
    vertexSource?: string;
    fragmentSource?: string;
}

/**
 * Helper function designed to create [[SdfTextMaterials]] that can be rendered using
 * [[TextCanvas]].
 *
 * @param params - Material parameters.
 *
 * @returns New `SdfTextMaterial`.
 */
export function createSdfTextMaterial(params: SdfTextMaterialParameters): SdfTextMaterial {
    return new SdfTextMaterial({
        texture: params.fontCatalog.texture,
        textureSize: params.fontCatalog.textureSize,
        size: params.fontCatalog.size,
        distanceRange: params.fontCatalog.distanceRange,
        isMsdf: params.fontCatalog.type === "msdf",
        isBackground: params.isBackground === true,
        vertexSource: params.vertexSource,
        fragmentSource: params.fragmentSource,
        rendererCapabilities: params.rendererCapabilities
    });
}
