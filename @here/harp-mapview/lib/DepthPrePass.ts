/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, ExtrudedPolygonTechnique } from "@here/harp-datasource-protocol";
import { ColorUtils } from "@here/harp-datasource-protocol/lib/ColorUtils";
import { enforceBlending, MapMeshStandardMaterial } from "@here/harp-materials";
import * as THREE from "three";

import { evaluateBaseColorProperty } from "./DecodedTileHelpers";

/**
 * Bitmask used for the depth pre-pass to prevent multiple fragments in the same screen position
 * from rendering color.
 * @internal
 */
export const DEPTH_PRE_PASS_STENCIL_MASK = 0x01;

/**
 * Render order offset for the depth pre-pass to ensure that it's rendered first.
 */
const DEPTH_PRE_PASS_RENDER_ORDER_OFFSET = 1e-6;

/**
 * Check if technique requires (and not disables) use of depth prepass.
 *
 * @remarks
 * Depth prepass is enabled if correct opacity is specified (in range `(0,1)`) _and_ not explicitly
 * disabled by `enableDepthPrePass` option.
 *
 * @param technique - `BaseStandardTechnique` instance to be checked
 * @param env - {@link @here/harp-datasource-protocol#Env} instance used
 *              to evaluate {@link @here/harp-datasource-protocol#Expr}
 *              based properties of `Technique`
 *
 * @internal
 */
export function isRenderDepthPrePassEnabled(technique: ExtrudedPolygonTechnique, env: Env) {
    // Depth pass explicitly disabled
    if (technique.enableDepthPrePass === false) {
        return false;
    }
    let transparent =
        technique.opacity !== undefined && technique.opacity > 0.0 && technique.opacity < 1.0;
    // If not opaque then check if transparency may be modified via alpha in base color.
    // Otherwise we don't need to even test base color because opacity mixed with any base alpha,
    // will always produce some transparency effect.
    if (!transparent) {
        // We do not support switching depth pass during alpha interpolation, ignore zoom level
        // when calculating base color value.
        const color = evaluateBaseColorProperty(technique, env);
        if (color !== undefined) {
            const alpha = ColorUtils.getAlphaFromHex(color);
            transparent = alpha > 0.0 && alpha < 1.0;
        }
    }
    return transparent;
}

/**
 * Property identifying a material that is being used as a DepthPrePass material.
 */
export interface DepthPrePassProperties {
    /**
     * This material is a special depth prepass material.
     */
    isDepthPrepassMaterial?: true;
}

/**
 * Creates material for depth prepass.
 *
 * @remarks
 * Creates material that writes only to the z-buffer. Updates the original material instance, to
 * support depth prepass.
 *
 * @param baseMaterial - The base material of mesh that is updated to work with depth prepass
 *     and then used. This parameter is a template for depth prepass material that is returned.
 * @returns depth prepass material, which is a clone of `baseMaterial` with the adapted settings.
 *
 * @internal
 */
export function createDepthPrePassMaterial(baseMaterial: THREE.Material): THREE.Material {
    baseMaterial.depthWrite = false;
    baseMaterial.depthFunc = THREE.EqualDepth;
    baseMaterial.colorWrite = true;
    enforceBlending(baseMaterial);

    const depthPassMaterial: THREE.Material & DepthPrePassProperties = baseMaterial.clone();
    depthPassMaterial.isDepthPrepassMaterial = true;
    depthPassMaterial.depthWrite = true;
    depthPassMaterial.depthTest = true;
    depthPassMaterial.depthFunc = THREE.LessDepth;
    depthPassMaterial.colorWrite = false;
    depthPassMaterial.opacity = 1.0;
    depthPassMaterial.blending = THREE.NoBlending;
    return depthPassMaterial;
}

/**
 * Checks if a given object is a depth prepass mesh.
 *
 * @param object - The object to check whether it's a depth prepass mesh.
 * @returns `true` if the object is a depth prepass mesh, `false` otherwise.
 *
 * @internal
 */
export function isDepthPrePassMesh(object: THREE.Object3D): boolean {
    if ((object as any).isMesh !== true) {
        return false;
    }
    const mesh = object as THREE.Mesh;
    return mesh.material instanceof Array
        ? mesh.material.every(material => (material as any).isDepthPrepassMaterial === true)
        : (mesh.material as any).isDepthPrepassMaterial === true;
}

/**
 * Clones a given mesh to render it in the depth prepass with another material.
 *
 * @remarks
 * Both the original
 * and depth prepass meshes, when rendered in the correct order, create the proper depth prepass
 * effect. The original mesh material is slightly modified by [[createDepthPrePassMaterial]] to
 * support the depth prepass. This method is usable only if the material of this mesh has an
 * opacity value in the range `(0,1)`.
 *
 * The DepthPrePass object is created wis a slightly smaller `renderOrder` as the original mesh
 * to ensure that it's rendered first.
 *
 * @param mesh - original mesh
 * @returns `Mesh` depth pre pass
 *
 * @internal
 */
export function createDepthPrePassMesh(mesh: THREE.Mesh): THREE.Mesh {
    const originalGeometry = mesh.geometry;

    if (!(originalGeometry instanceof THREE.BufferGeometry)) {
        throw new Error("#createDepthPassMesh only BufferGeometry is supported");
    }
    const positionAttribute = originalGeometry.getAttribute("position");
    if (!positionAttribute) {
        throw new Error("#createDepthPassMesh position attribute not found");
    }

    const depthPassGeometry = new THREE.BufferGeometry();
    depthPassGeometry.setAttribute("position", positionAttribute);
    const uvAttribute = originalGeometry.getAttribute("uv");
    if (uvAttribute) {
        depthPassGeometry.setAttribute("uv", uvAttribute);
    }
    const normalAttribute = originalGeometry.getAttribute("normal");
    if (normalAttribute) {
        depthPassGeometry.setAttribute("normal", normalAttribute);
    }
    const extrusionAxisAttribute = originalGeometry.getAttribute("extrusionAxis");
    if (extrusionAxisAttribute) {
        depthPassGeometry.setAttribute("extrusionAxis", extrusionAxisAttribute);
    }

    if (originalGeometry.index) {
        depthPassGeometry.setIndex(originalGeometry.index);
    }

    for (const group of originalGeometry.groups) {
        const { start, count, materialIndex } = group;
        depthPassGeometry.addGroup(start, count, materialIndex);
    }

    const depthPassMaterial =
        mesh.material instanceof Array
            ? mesh.material.map(createDepthPrePassMaterial)
            : createDepthPrePassMaterial(mesh.material);

    const depthPassMesh = new THREE.Mesh(depthPassGeometry, depthPassMaterial);
    depthPassMesh.renderOrder = mesh.renderOrder - DEPTH_PRE_PASS_RENDER_ORDER_OFFSET;

    return depthPassMesh;
}

/**
 * Sets up all the needed stencil logic needed for the depth pre-pass.
 *
 * @remarks
 * This logic is in place to avoid z-fighting artifacts that can appear in geometries that have
 * coplanar triangles inside the same mesh.
 *
 * @param depthMesh - Mesh created by `createDepthPrePassMesh`.
 * @param colorMesh - Original mesh.
 * @internal
 */
export function setDepthPrePassStencil(depthMesh: THREE.Mesh, colorMesh: THREE.Mesh) {
    function setupDepthMaterialStencil(depthMeshMaterial: THREE.Material) {
        // Set up depth mesh stencil logic.
        // Set the depth pre-pass stencil bit for all processed fragments. We use
        // `THREE.AlwaysStencilFunc` and not `THREE.NotEqualStencilFunc` to force all fragments to pass
        // the stencil test and write the correct depth value.
        const depthMaterial = depthMeshMaterial as MapMeshStandardMaterial;
        depthMaterial.stencilWrite = true;
        depthMaterial.stencilFail = THREE.KeepStencilOp;
        depthMaterial.stencilZFail = THREE.KeepStencilOp;
        depthMaterial.stencilZPass = THREE.ReplaceStencilOp;
        depthMaterial.stencilFunc = THREE.AlwaysStencilFunc;
        depthMaterial.stencilRef = 0xff;
        (depthMaterial as any).stencilFuncMask = DEPTH_PRE_PASS_STENCIL_MASK;
    }

    function setupColorMaterialStencil(colorMeshMaterial: THREE.Material) {
        // Set up color mesh stencil logic.
        // Only write color for pixels with the depth pre-pass stencil bit set. Also, once a pixel is
        // rendered, set the stencil bit to 0 to prevent subsequent pixels in the same clip position
        // from rendering color again.
        const colorMaterial = colorMeshMaterial as MapMeshStandardMaterial;
        colorMaterial.stencilWrite = true;
        colorMaterial.stencilFail = THREE.KeepStencilOp;
        colorMaterial.stencilZFail = THREE.KeepStencilOp;
        colorMaterial.stencilZPass = THREE.ZeroStencilOp;
        colorMaterial.stencilFunc = THREE.EqualStencilFunc;
        colorMaterial.stencilRef = 0xff;
        (colorMaterial as any).stencilFuncMask = DEPTH_PRE_PASS_STENCIL_MASK;
    }

    if (depthMesh.material instanceof Array) {
        depthMesh.material.map(setupDepthMaterialStencil);
    } else {
        setupDepthMaterialStencil(depthMesh.material);
    }

    if (colorMesh.material instanceof Array) {
        colorMesh.material.map(setupColorMaterialStencil);
    } else {
        setupColorMaterialStencil(colorMesh.material);
    }
}
