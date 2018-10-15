import { BaseStandardTechnique } from "@here/datasource-protocol";
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
 * Create material for depth prepass.
 *
 * Creates material that writes only to z-buffer. Updates original material instance, to support
 * depth prepass.
 *
 * @param baseMaterial base material of mesh, will be updated in order to work with depth prepass
 *     and used; template for returned depth prepass material
 * @returns depth prepass material - clone of `baseMaterial` with adapted settings
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
 * and "depth prepass" meshes, when rendered in the correct order, create the proper depth prepass
 * effect. The original mesh material is slightly modified by [[createDepthPrePassMaterial]] to
 * support the depth prepass. Usable only if the material of this mesh has an opacity value in the
 * range `(0,1)`.
 *
 * Note about render order: the created "depth prepass" object has the same `renderOrder` as the
 * original mesh. The proper sort orders of both the depth and color pass objects are guaranteed by
 * the handling of transparent objects in ThreeJS, that renders them after opaque objects:
 *   - depth prepass object is never transparent - rendered first
 *   - color pass object is transparent - rendered second
 *
 * @see [Material.transparent in ThreeJS's doc](https://threejs.org/docs/#api/materials/Material.transparent).
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
 * Apply depth increasing polygon offset units to mesh group.
 *
 * Based on the assumption, that `meshes[0]` is rendered in `front-to-back` order, apply
 * z-increasing `polygonOffsetUnits` to mesh groups (mesh refers to `THREE.Mesh`) rendered in one
 * frame:
 *
 * * each mesh group will have non-overlapping `polygonOffsetUnits` increasing with distance from
 *   camera;
 * * first mesh in group - which should be depth pass mesh - will have a slightly higher offset, see
 *   [[DEPTH_PASS_POLYGON_OFFSET_UNITS]];
 * * all mesh groups rendered later, will have higher `polygonOffsetUnits`.
 *
 * Values of `polygonOffsetUnits` applied to each mesh group are separated by `multiplier` "units",
 * so minimal correct value is `[[DEPTH_PASS_POLYGON_OFFSET_UNITS]] + 1`.
 *
 * Ideally, a value of `2` for `multiplier` should be enough, as WebGL specifies that the internal
 * coefficient used for `polygonOffsetUnits` guarantees separation in z-buffer
 * (https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/glPolygonOffset.xhtml).
 * However, some WebGL stacks show higher fragility to z-fighting, so it may be increased if
 * z-fighting artifacts are visible on extruded-building (note, they are especially visible on
 * overlapping areas of tiles, when building is very near to camera).
 *
 * The function [[resetDepthBasedPolygonOffsetIndex]] should be called after a frame has been
 * rendered to reset the counters
 *
 * This is useful, for transparent extruded buildings on tiles, to prevent z-fighting of same
 * buildings coming from two or more tiles. Thanks to this mechanism, building from a tile that is
 * nearest to camera will have a smallest `polygonOffsetUnits` and will prevent z-fighting with
 * other copies of this building from farther tiles.
 *
 * @param multiplier `polygonOffsetUnits` multiplier, if unsure, use
 *  [[DEFAULT_DEPTH_BASED_POLYGON_OFFSET_MULTIPLIER]]
 * @param meshes `Mesh` group that will have same `polygonOffsetUnits` applied
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
 * Reset depth based mesh index.
 *
 * Resets index used for maintaining increasing `polygonOffsetUnits` used by
 * [[applyDepthBasedPolygonOffset]]. Should be called after a frame has been rendered to reset the
 * counters.
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
