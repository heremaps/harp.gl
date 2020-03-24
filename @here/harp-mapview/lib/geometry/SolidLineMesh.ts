/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrientedBox3 } from "@here/harp-geoutils";
import { SolidLineMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import {
    DisplacedBufferGeometry,
    DisplacementRange,
    expandBoxByDisplacementRange
} from "./DisplacedBufferGeometry";

const tmpSphere = new THREE.Sphere();
const tmpInverseMatrix = new THREE.Matrix4();
const tmpRay = new THREE.Ray();
const tmpLine1 = new THREE.Line3();
const tmpBox = new THREE.Box3();
const tmpPlane = new THREE.Plane();
const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();

// Strides to access the index buffer. See [[createLineGeometry]].
// Stride between the start vertex indices of consecutive segments, each one made of 2 triangles.
const SEGMENT_STRIDE = 6;
// Stride between the start and end vertex indices of a segment. Vertices are duplicated so that
// each copy is extruded in opposite directions in the vertex shader.
const VERTEX_STRIDE = 2;

function isSolidLineMaterial(material: THREE.Material | THREE.Material[]): boolean {
    return Array.isArray(material)
        ? material.every(mat => mat instanceof SolidLineMaterial)
        : material instanceof SolidLineMaterial;
}

/**
 * Computes the bounding sphere of the part of a given geometry corresponding to a feature.
 * @param geometry The geometry containing the feature.
 * @param featureBeginIndex The index where the feature starts in the geometry's indices attribute.
 * @param featureEndIndex The index where the feature end in the geometry's indices attribute.
 * @returns The feature bounding sphere.
 */
function computeFeatureBoundingSphere(
    geometry: THREE.BufferGeometry | DisplacedBufferGeometry,
    featureBeginIndex: number,
    featureEndIndex: number
): THREE.Sphere {
    let displacementRange: DisplacementRange | undefined;

    if (geometry instanceof DisplacedBufferGeometry) {
        displacementRange = geometry.displacementRange;
        geometry = geometry.originalGeometry;
    }

    const attributes = geometry.attributes;
    const pos = attributes.position as THREE.BufferAttribute;
    const indices = geometry.index!.array;
    const sphere = new THREE.Sphere();
    const bbox = tmpBox.makeEmpty();
    const vertex = tmpV1;

    // First compute the bounding box for all line segments.
    for (let i = featureBeginIndex; i < featureEndIndex; i += SEGMENT_STRIDE) {
        bbox.expandByPoint(vertex.fromBufferAttribute(pos, indices[i]));
        bbox.expandByPoint(vertex.fromBufferAttribute(pos, indices[i + VERTEX_STRIDE]));
    }

    const normal = tmpV2;
    if (displacementRange) {
        // If geometry is displaced, expand the bounding box to cover the whole displacement range,
        // and return the sphere bounding the box. This is a coarse estimation, but avoids having
        // to displace all vertices.
        return expandBoxByDisplacementRange(
            bbox,
            displacementRange,
            normal.fromBufferAttribute(geometry.attributes.normal as THREE.BufferAttribute, 0)
        ).getBoundingSphere(sphere);
    }

    // If geometry is not displaced, the bounding sphere is placed in the center of the computed
    // bounding box and expanded until it contains all vertices.
    const center = bbox.getCenter(sphere.center);
    let maxRSq = 0;
    for (let i = featureBeginIndex; i < featureEndIndex; i += SEGMENT_STRIDE) {
        maxRSq = Math.max(
            maxRSq,
            center.distanceToSquared(vertex.fromBufferAttribute(pos, indices[i])),
            center.distanceToSquared(vertex.fromBufferAttribute(pos, indices[i + VERTEX_STRIDE]))
        );
    }
    sphere.radius = Math.sqrt(maxRSq);
    return sphere;
}

/**
 * Finds the intersection of a ray with a extruded line.
 * @param ray Intersection ray in object local space.
 * @param line The centerline.
 * @param vExtrusion Line extrusion vector.
 * @param normal Extrusion plane normal.
 * @param hWidth Extrusion half width.
 * @returns Distance of the extruded line intersection to the ray origin.
 */
function intersectExtrudedLine(
    ray: THREE.Ray,
    line: THREE.Line3,
    vExtrusion: THREE.Vector3,
    normal: THREE.Vector3,
    hWidth: number
): number {
    const matrix = new THREE.Matrix4().makeBasis(
        line.delta(new THREE.Vector3()).normalize(),
        vExtrusion,
        normal
    );
    const obb = new OrientedBox3(
        line.getCenter(tmpV4),
        matrix,
        new THREE.Vector3(line.distance() / 2, hWidth, hWidth)
    );
    if (obb.contains(ray.origin)) {
        return 0;
    }
    return obb.intersectsRay(ray) ?? Infinity;
}

/**
 * Finds the intersection of a ray with the closest end cap of a extruded line.
 * @param ray Intersection ray in object local space.
 * @param line The centerline.
 * @param hWidth Extrusion half width.
 * @returns Distance of the end cap intersection to the ray origin.
 */
function intersectClosestEndCap(ray: THREE.Ray, line: THREE.Line3, hWidth: number): number {
    const sphere = new THREE.Sphere(line.start, hWidth);
    const startCapT = sphere.containsPoint(ray.origin)
        ? 0
        : ray.intersectSphere(sphere, tmpV4)
        ? tmpV4.sub(ray.origin).length()
        : Infinity;
    sphere.center.copy(line.end);
    const endCapT = sphere.containsPoint(ray.origin)
        ? 0
        : ray.intersectSphere(sphere, tmpV4)
        ? tmpV4.sub(ray.origin).length()
        : Infinity;
    return Math.min(startCapT, endCapT);
}

/**
 * Intersects line
 * @param ray Intersection ray in object local space.
 * @param line The line to intersect.
 * @param vExtrusion Line extrusion vector.
 * @param hWidth The line's extrusion half width.
 * @param hWidthSq The line's extrusion half width squared.
 * @param plane The extrusion plane.
 * @param interPlane The intersection of the ray with the extrusion plane.
 * @param interLine The ray intersetion with the extruded line.
 * @returns true if ray intersects the extruded line, false otherwise.
 */
function intersectLine(
    ray: THREE.Ray,
    line: THREE.Line3,
    vExtrusion: THREE.Vector3,
    hWidth: number,
    hWidthSq: number,
    plane: THREE.Plane,
    interPlane: THREE.Vector3,
    interLine: THREE.Vector3
): boolean {
    if (interPlane.equals(tmpRay.origin) && tmpRay.direction.dot(plane.normal) === 0) {
        // Corner case: ray is coplanar to extruded line, find distance to extruded line sides
        // and end caps.
        const extrLineT = intersectExtrudedLine(ray, line, vExtrusion, plane.normal, hWidth);
        const endCapT = intersectClosestEndCap(ray, line, hWidth);

        const minT = Math.min(extrLineT, endCapT);
        if (minT === Infinity) {
            return false;
        }
        ray.at(minT, interLine);
        return true;
    }

    // The plain intersection is also a line intersection only if it's closer to the line
    // than the extrusion half width.
    const distSq = interPlane.distanceToSquared(line.closestPointToPoint(interPlane, true, tmpV4));

    if (distSq > hWidthSq) {
        return false;
    }
    interLine.copy(interPlane);
    return true;
}

/**
 * Finds the intersections of a ray with a partition of a solid line mesh representing a feature.
 * @param mesh The mesh whose intersections will be found.
 * @param raycaster Contains the intersection ray.
 * @param localRay Same ray as raycaster.ray but in object local space.
 * @param intersects Array that will contain all intersections found between ray and feature.
 * @param halfWidth The line's extrusion half width.
 * @param lHalfWidth The line's extrusion half width in mesh local space.
 * @param lHalfWidthSq The line's extrusion half width squared in mesh local space.
 * @param beginIdx The index where the feature starts in the mesh geometry's indices attribute.
 * @param endIdx The index where the feature end in the mesh geometry's indices attribute.
 * @param bSphere The feature bounding sphere.
 * @returns feature
 */
function intersectFeature(
    mesh: THREE.Mesh,
    raycaster: THREE.Raycaster,
    localRay: THREE.Ray,
    intersects: THREE.Intersection[],
    halfWidth: number,
    lHalfWidth: number,
    lHalfWidthSq: number,
    beginIdx: number,
    endIdx: number,
    bSphere: THREE.Sphere
): void {
    const vExt = tmpV1;
    const plane = tmpPlane;
    const interPlane = tmpV2;
    const line = tmpLine1;

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const attributes = geometry.attributes;
    const position = attributes.position as THREE.BufferAttribute;
    const bitangent = attributes.bitangent;
    const indices = geometry.index!.array;

    tmpSphere.copy(bSphere);
    tmpSphere.applyMatrix4(mesh.matrixWorld);
    tmpSphere.radius += halfWidth;

    if (!raycaster.ray.intersectsSphere(tmpSphere)) {
        return;
    }

    for (let i = beginIdx; i < endIdx; i += SEGMENT_STRIDE) {
        const a = indices[i];
        const b = indices[i + VERTEX_STRIDE];

        // Find the plane containing the line segment, using the segment start, end and extrusion
        // vector.
        line.start.fromBufferAttribute(position, a);
        line.end.fromBufferAttribute(position, b);
        vExt.set(bitangent.getX(a), bitangent.getY(a), bitangent.getZ(a)).normalize();
        plane.setFromCoplanarPoints(line.start, tmpV3.copy(line.start).add(vExt), line.end);

        // The ray intersection if any, will be on the extrusion plane.
        if (!localRay.intersectPlane(plane, interPlane)) {
            continue;
        }

        const interLine = tmpV3;
        if (
            !intersectLine(
                localRay,
                line,
                vExt,
                lHalfWidth,
                lHalfWidthSq,
                plane,
                interPlane,
                interLine
            )
        ) {
            continue;
        }

        // Move back to world space for distance calculation
        const interLineWorld = interLine.applyMatrix4(mesh.matrixWorld);

        const distance = raycaster.ray.origin.distanceTo(interLineWorld);

        if (distance < raycaster.near || distance > raycaster.far) {
            continue;
        }

        intersects.push({
            distance,
            point: interLineWorld.clone(),
            index: i,
            object: mesh
        });
    }
}

const singleFeatureStart = [0];

/**
 * Finds the intersections of a ray with a group within a solid line mesh.
 * @param mesh The mesh whose intersections will be found.
 * @param material The material used by the group inside the mesh.
 * @param raycaster  Contains the intersection ray.
 * @param localRay Same ray as raycaster.ray but in object local space.
 * @param intersects  Array that will contain all intersections found between ray and feature.
 * @param firstFeatureIdx Index of the first feature in the group.
 * @param groupEndIdx Index of the last vertex in the group.
 * @returns The next feature index after the group.
 */
function intersectGroup(
    mesh: THREE.Mesh,
    material: THREE.Material,
    raycaster: THREE.Raycaster,
    localRay: THREE.Ray,
    intersects: THREE.Intersection[],
    firstFeatureIdx: number,
    groupEndIdx: number
): number {
    const bVolumes = mesh.userData.feature.boundingVolumes;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    assert(isSolidLineMaterial(material), "Unsupported material type");
    const solidLineMaterial = material as SolidLineMaterial;

    const halfWidth = (solidLineMaterial.lineWidth + solidLineMaterial.outlineWidth) / 2;
    const localHalfWidth = halfWidth / ((mesh.scale.x + mesh.scale.y + mesh.scale.z) / 3);
    const localHalfWidthSq = localHalfWidth * localHalfWidth;
    const featureStarts = mesh.userData.feature.starts ?? singleFeatureStart;

    let featureIdx = firstFeatureIdx;
    let beginIdx = featureStarts[featureIdx];
    const lastFeatureIdx = featureStarts.length - 1;

    while (beginIdx < groupEndIdx) {
        const bVolumeIdx = featureIdx;
        const endIdx = featureIdx < lastFeatureIdx ? featureStarts[++featureIdx] : groupEndIdx;
        if (bVolumeIdx >= bVolumes.length) {
            bVolumes.push(computeFeatureBoundingSphere(geometry, beginIdx, endIdx));
        }
        intersectFeature(
            mesh,
            raycaster,
            localRay,
            intersects,
            halfWidth,
            localHalfWidth,
            localHalfWidthSq,
            beginIdx,
            endIdx,
            bVolumes[bVolumeIdx]
        );
        beginIdx = endIdx;
    }
    return featureIdx;
}

/**
 * Mesh formed by extruding a polyline in the shaders. Overrides raycasting behaviour to account for
 * extrusion, see [[SolidLineMaterial]].
 * @internal
 */
export class SolidLineMesh extends THREE.Mesh {
    /**
     * Finds the intersections of a ray with a mesh, assuming the mesh is a polyline extruded in
     * the shaders (see [[SolidLineMaterial]]).
     * @param mesh The mesh whose intersections will be found.
     * @param raycaster Contains the intersection ray.
     * @param intersects Array that will contain all intersections found between ray and mesh.
     */
    static raycast(
        mesh: THREE.Mesh,
        raycaster: THREE.Raycaster,
        intersects: THREE.Intersection[]
    ): void {
        assert(mesh.geometry instanceof THREE.BufferGeometry, "Unsupported geometry type");
        const geometry = mesh.geometry as THREE.BufferGeometry;
        assert(geometry.index !== null, "Geometry does not have indices");
        const matrixWorld = mesh.matrixWorld;

        tmpInverseMatrix.getInverse(matrixWorld);
        const localRay = tmpRay.copy(raycaster.ray).applyMatrix4(tmpInverseMatrix);

        // Test intersection of ray with each of the features within the mesh.
        if (!mesh.userData.feature) {
            mesh.userData.feature = {};
        }
        if (!mesh.userData.feature.boundingVolumes) {
            mesh.userData.feature.boundingVolumes = [];
        }
        const indices = geometry.index!.array;

        if (Array.isArray(mesh.material)) {
            let nextFeatureIdx = 0;
            for (const group of geometry.groups) {
                const material = mesh.material[group.materialIndex!];
                const groupEndIdx = group.start + group.count;
                nextFeatureIdx = intersectGroup(
                    mesh,
                    material,
                    raycaster,
                    localRay,
                    intersects,
                    nextFeatureIdx,
                    groupEndIdx
                );
            }
        } else {
            intersectGroup(mesh, mesh.material, raycaster, localRay, intersects, 0, indices.length);
        }
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    get geometry(): THREE.BufferGeometry {
        return super.geometry as THREE.BufferGeometry;
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    set geometry(geometry: THREE.BufferGeometry) {
        super.geometry = geometry;
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    get material(): THREE.Material | THREE.Material[] {
        return super.material;
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    set material(material: THREE.Material | THREE.Material[]) {
        super.material = material;
        assert(isSolidLineMaterial(material), "Unsupported material type");
    }

    /**
     * Creates an instance of SolidLineMesh.
     * @param geometry Mesh geometry.
     * @param material Material(s) to be used by the mesh. They must be instances of
     * [[SolidLineMaterial]].
     */
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) {
        super(geometry, material);
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        SolidLineMesh.raycast(this, raycaster, intersects);
    }
}
