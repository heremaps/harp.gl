/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStandardTechnique } from "@here/harp-datasource-protocol";
import { chainCallbacks } from "@here/harp-utils";
import * as THREE from "three";

/**
 * Bitmask used for the depth pre-pass to prevent multiple fragments in the same screen position
 * from rendering color.
 */
export const DEPTH_PRE_PASS_STENCIL_MASK = 0x01;

/**
 * Check if technique requires (and not disables) use of depth prepass.
 *
 * Depth prepass is enabled if correct opacity is specified (in range `(0,1)`) _and_ not explicitly
 * disabled by `enableDepthPrePass` option.
 *
 * @param technique [[BaseStandardTechnique]] instance to be checked
 */
export function isRenderDepthPrePassEnabled(technique: BaseStandardTechnique) {
    return (
        technique.enableDepthPrePass !== false &&
        technique.opacity !== undefined &&
        technique.opacity > 0 &&
        technique.opacity < 1.0
    );
}

/**
 * Creates material for depth prepass.
 *
 * Creates material that writes only to the z-buffer. Updates the original material instance, to
 * support depth prepass.
 *
 * @param baseMaterial The base material of mesh that is updated to work with depth prepass
 *     and then used. This parameter is a template for depth prepass material that is returned.
 * @returns depth prepass material, which is a clone of `baseMaterial` with the adapted settings.
 */
export function createDepthPrePassMaterial(baseMaterial: THREE.Material): THREE.Material {
    baseMaterial.depthWrite = false;
    baseMaterial.depthFunc = THREE.EqualDepth;
    baseMaterial.colorWrite = true;
    baseMaterial.transparent = true;

    const depthPassMaterial = baseMaterial.clone();
    depthPassMaterial.depthWrite = true;
    depthPassMaterial.depthTest = true;
    depthPassMaterial.depthFunc = THREE.LessDepth;
    depthPassMaterial.colorWrite = false;
    depthPassMaterial.transparent = false;
    depthPassMaterial.opacity = 1.0;
    return depthPassMaterial;
}

// tslint:disable:max-line-length
/**
 * Clones a given mesh to render it in the depth prepass with another material. Both the original
 * and depth prepass meshes, when rendered in the correct order, create the proper depth prepass
 * effect. The original mesh material is slightly modified by [[createDepthPrePassMaterial]] to
 * support the depth prepass. This method is usable only if the material of this mesh has an
 * opacity value in the range `(0,1)`.
 *
 * About render order: the DepthPrePass object that is created has the same `renderOrder` as
 * the original mesh. The proper sort orders of both the depth and the color pass objects are
 * guaranteed by ThreeJS's handling of transparent objects, which renders them after opaque
 * objects:
 *   - since the depth prepass object is never transparent, it is rendered first
 *   - since the color pass object is transparent, it is rendered second
 *
 * @see [Material.transparent in ThreeJS's doc](https://threejs.org/docs/#api/harp-materials/Material.transparent).
 *
 * @param mesh original mesh
 * @returns `Mesh` depth pre pass
 */
// tslint:enable:max-line-length
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
    depthPassGeometry.addAttribute("position", positionAttribute);
    const uvAttribute = originalGeometry.getAttribute("uv");
    if (uvAttribute) {
        depthPassGeometry.addAttribute("uv", uvAttribute);
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
    depthPassMesh.renderOrder = mesh.renderOrder;

    return depthPassMesh;
}

/**
 * Sets up all the needed stencil logic needed for the depth pre-pass.
 *
 * This logic is in place to avoid z-fighting artifacts that can appear in geometries that have
 * coplanar triangles inside the same mesh.
 *
 * @param depthMesh Mesh created by `createDepthPrePassMesh`.
 * @param colorMesh Original mesh.
 */
export function setDepthPrePassStencil(depthMesh: THREE.Mesh, colorMesh: THREE.Mesh) {
    // Set up depth mesh stencil logic.
    // Set the depth pre-pass stencil bit for all processed fragments. We use `gl.ALWAYS` and not
    // `gl.NOTEQUAL` to force all fragments to pass the stencil test and write the correct depth
    // value.
    depthMesh.onBeforeRender = chainCallbacks(
        depthMesh.onBeforeRender,
        (renderer, scene, camera, geometry, material, group) => {
            const gl = renderer.context;
            renderer.state.buffers.stencil.setTest(true);
            renderer.state.buffers.stencil.setMask(DEPTH_PRE_PASS_STENCIL_MASK);
            renderer.state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.REPLACE);
            renderer.state.buffers.stencil.setFunc(gl.ALWAYS, 0xff, DEPTH_PRE_PASS_STENCIL_MASK);
        }
    );

    // Set up color mesh stencil logic.
    // Only write color for pixels with the depth pre-pass stencil bit set. Also, once a pixel is
    // rendered, set the stencil bit to 0 to prevent subsequent pixels in the same clip position
    // from rendering color again.
    colorMesh.onBeforeRender = chainCallbacks(
        colorMesh.onBeforeRender,
        (renderer, scene, camera, geometry, material, group) => {
            const gl = renderer.context;
            renderer.state.buffers.stencil.setTest(true);
            renderer.state.buffers.stencil.setMask(DEPTH_PRE_PASS_STENCIL_MASK);
            renderer.state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.ZERO);
            renderer.state.buffers.stencil.setFunc(gl.EQUAL, 0xff, DEPTH_PRE_PASS_STENCIL_MASK);
        }
    );

    // Disable stencil test after rendering each mesh.
    depthMesh.onAfterRender = renderer => {
        renderer.state.buffers.stencil.setTest(false);
        renderer.state.buffers.stencil.setMask(0xff);
    };
    colorMesh.onAfterRender = renderer => {
        renderer.state.buffers.stencil.setTest(false);
        renderer.state.buffers.stencil.setMask(0xff);
    };
}
