/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { HiddenThreeJSMaterialProperties } from "./MapMeshMaterials";

/**
 * Parameters used when constructing a new implementor of [[DisplacementFeature]].
 */
export interface DisplacementFeatureParameters {
    /**
     * Texture used for vertex displacement along their normals.
     */
    displacementMap?: THREE.Texture;
}

/**
 * Interface to be implemented by materials that use displacement maps to overlay geometry
 * on elevation data.
 */
export interface DisplacementFeature extends HiddenThreeJSMaterialProperties {
    displacementMap: THREE.Texture | null;
}

/**
 * Determines whether a given material supports displacement maps for elevation overlay.
 * @param material The material to check.
 * @returns Whether the given material supports displacement maps for elevation overlay.
 */
export function hasDisplacementFeature(material: any): material is DisplacementFeature {
    return "displacementMap" in material;
}
