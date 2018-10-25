/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStandardTechnique } from "@here/harp-datasource-protocol";
import * as THREE from "three";

/**
 * The depth pass mesh needs to have small depth buffer offset, so we can use `THREE.LessDepth`
 * operator instead of `THREE.LessEqualDepth`.
 *
 * `THREE.LessDepth` depth function gives better visual effects.
 */
export const DEPTH_PASS_POLYGON_OFFSET_UNITS = 1;

/**
 * Default multiplier to be used with [[applyDepthBasedPolygonOffset]].
 */
export const DEFAULT_DEPTH_BASED_POLYGON_OFFSET_MULTIPLIER = DEPTH_PASS_POLYGON_OFFSET_UNITS + 1;

/**
 * Check if technique requires (and not disables) use of depth prepass.
 *
 * Depth prepass is enabled if correct opacity is specified (in range `(0,1)`) _and_ not explicitly
 * disabled by `enableDepthPrePass` option.
 *
 * @param technique [[BaseStandardTechnique]] instance to be checked
 */
export function isRenderDepthPrePassEnabled(technique: BaseStandardTechnique) {
    //
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
export function createDepthPrePassMaterial(
    baseMaterial: THREE.MeshMaterialType
): THREE.MeshMaterialType {
    baseMaterial.depthWrite = true;
    baseMaterial.depthFunc = THREE.LessDepth;
    baseMaterial.colorWrite = true;
    baseMaterial.transparent = true;

    const depthPassMaterial = baseMaterial.clone();

    depthPassMaterial.depthWrite = true;
    depthPassMaterial.depthTest = true;
    depthPassMaterial.colorWrite = false;
    depthPassMaterial.transparent = false;
    depthPassMaterial.opacity = 1.0;
    depthPassMaterial.polygonOffset = true;
    depthPassMaterial.polygonOffsetUnits = DEPTH_PASS_POLYGON_OFFSET_UNITS;
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
 * Applies depth increasing polygon offset units to the mesh group specified.
 *
 * Based on the assumption that `meshes[0]` is rendered in `front-to-back` order, this method
 * applies z-increasing `polygonOffsetUnits` to mesh groups (mesh refers to `THREE.Mesh`) rendered
 * in one frame, where:
 *
 * * each mesh group has non-overlapping `polygonOffsetUnits` increasing with distance from
 *   camera
 * * the first mesh in the group, typically depth pass mesh, has a slightly higher offset, see
 *   [[DEPTH_PASS_POLYGON_OFFSET_UNITS]]
 * * all mesh groups rendered later have higher `polygonOffsetUnits`
 *
 * The values of `polygonOffsetUnits` applied to each mesh group are separated by `multiplier`
 * "units", so that the minimal correct value is `[[DEPTH_PASS_POLYGON_OFFSET_UNITS]] + 1`.
 *
 * Ideally, a value of `2` for the `multiplier` should suffice, as WebGL specifies that the
 * internal coefficient used for `polygonOffsetUnits` guarantees separation in the z-buffer
 * (https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/glPolygonOffset.xhtml).
 * However, some WebGL stacks show higher fragility to z-fighting, so you can increase this value
 * if z-fighting artifacts are visible on an extruded-building. Note that these artifacts are
 * especially visible on overlapping areas of tiles, when the building is very near the camera.
 *
 * Call the [[resetDepthBasedPolygonOffsetIndex]] function after a frame has been rendered, to
 * reset the counters.
 *
 * This mechanism is useful, for transparent extruded buildings on tiles, to prevent z-fighting of
 * same buildings that come from two or more tiles. Consequently, building from a tile that is
 * nearest the to camera has the smallest `polygonOffsetUnits` and prevents z-fighting with
 * other copies of this building from farther tiles.
 *
 * @param multiplier The `polygonOffsetUnits` multiplier. If unsure, use
 *  [[DEFAULT_DEPTH_BASED_POLYGON_OFFSET_MULTIPLIER]].
 * @param meshes A `mesh` group that has the same `polygonOffsetUnits` applied.
 */
export function applyDepthBasedPolygonOffset(multiplier: number, ...meshes: THREE.Mesh[]) {
    for (const mesh of meshes) {
        forEachMeshMaterial(mesh, material => {
            material.polygonOffset = true;
            material.polygonOffsetFactor = 0;
        });
    }

    meshes[0].onBeforeRender = () => {
        const polygonOffsetUnits = depthBasedPolygonOffsetMeshIndex++ * multiplier;

        for (let i = 0; i < meshes.length; ++i) {
            const mesh = meshes[i];
            const depthPassFactor = i === 0 ? DEPTH_PASS_POLYGON_OFFSET_UNITS : 0;
            forEachMeshMaterial(mesh, material => {
                material.polygonOffsetUnits = polygonOffsetUnits + depthPassFactor;
            });
        }
    };
}

let depthBasedPolygonOffsetMeshIndex = 0;

/**
 * Resets the depth-based mesh index.
 *
 * Resets the index used to maintain the increasing `polygonOffsetUnits` used by
 * [[applyDepthBasedPolygonOffset]]. Call this function after a frame has been rendered, to reset
 * the counters.
 */
export function resetDepthBasedPolygonOffsetIndex() {
    depthBasedPolygonOffsetMeshIndex = 0;
}

function forEachMeshMaterial(mesh: THREE.Mesh, callback: (material: THREE.Material) => void) {
    if (mesh.material instanceof Array) {
        mesh.material.forEach(callback);
    } else {
        callback(mesh.material);
    }
}
