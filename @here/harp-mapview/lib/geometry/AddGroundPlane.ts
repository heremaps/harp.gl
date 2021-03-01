/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKind, Pickability } from "@here/harp-datasource-protocol";
import {
    EdgeLengthGeometrySubdivisionModifier,
    SubdivisionMode
} from "@here/harp-geometry/lib/EdgeLengthGeometrySubdivisionModifier";
import { SphericalGeometrySubdivisionModifier } from "@here/harp-geometry/lib/SphericalGeometrySubdivisionModifier";
import { Projection, ProjectionType } from "@here/harp-geoutils";
import { MapMeshBasicMaterial, MapMeshStandardMaterial } from "@here/harp-materials";
import * as THREE from "three";

import { Tile } from "../Tile";
import { LodMesh } from "./LodMesh";
import { projectTilePlaneCorners } from "./ProjectTilePlaneCorners";
import { registerTileObject } from "./RegisterTileObject";

const tmpV = new THREE.Vector3();

/**
 * Creates and adds a background plane mesh for the tile.
 * @param tile - The tile to which the ground plane belongs.
 * @param renderOrder - The plane render order.
 * @param materialOrColor - The plane material or a color for a default material.
 * @param opacity - The plane opacity.
 * @param createTexCoords - Whether to create texture coordinates.
 * @param receiveShadow - Whether the plane should receive shadows.
 * @param createMultiLod - Whether to generate multiple LODs for sphere projection.
 * @internal
 */
export function addGroundPlane(
    tile: Tile,
    renderOrder: number,
    materialOrColor: THREE.Material | THREE.Material[] | number = tile.mapView.clearColor,
    opacity: number = 1,
    createTexCoords: boolean = false,
    receiveShadow: boolean = tile.mapView.shadowsEnabled,
    createMultiLod: boolean = tile.mapView.enableMixedLod !== false
): THREE.Mesh {
    const mesh = createGroundPlane(
        tile,
        createTexCoords,
        receiveShadow,
        materialOrColor,
        createMultiLod,
        opacity
    );
    mesh.receiveShadow = receiveShadow;
    mesh.renderOrder = renderOrder;
    registerTileObject(tile, mesh, GeometryKind.Background, { pickability: Pickability.transient });
    tile.objects.push(mesh);
    return mesh;
}

function createGroundPlane(
    tile: Tile,
    createTexCoords: boolean,
    receiveShadow: boolean,
    materialOrColor: THREE.Material | THREE.Material[] | number,
    createMultiLod: boolean,
    opacity: number
): THREE.Mesh {
    const { dataSource, projection } = tile;
    const sourceProjection = dataSource.getTilingScheme().projection;
    const shouldSubdivide = projection.type === ProjectionType.Spherical;
    const useLocalTargetCoords = !shouldSubdivide;

    const material =
        typeof materialOrColor === "number"
            ? createGroundPlaneMaterial(
                  new THREE.Color(materialOrColor),
                  receiveShadow,
                  projection.type === ProjectionType.Spherical,
                  opacity
              )
            : materialOrColor;

    const geometry = createGroundPlaneGeometry(
        tile,
        useLocalTargetCoords,
        createTexCoords,
        receiveShadow
    );

    if (!shouldSubdivide) {
        return new THREE.Mesh(geometry, material);
    }

    const geometries: THREE.BufferGeometry[] = [];
    const sphericalModifier = new SphericalGeometrySubdivisionModifier(
        THREE.MathUtils.degToRad(10),
        sourceProjection
    );

    if (!createMultiLod) {
        sphericalModifier.modify(geometry);
        toLocalTargetCoords(geometry, sourceProjection, tile);

        return new THREE.Mesh(geometry, material);
    }

    // Use a [[LodMesh]] to adapt tesselation of tile depending on zoom level
    for (let zoomLevelOffset = 0; zoomLevelOffset < 4; ++zoomLevelOffset) {
        const subdivision = Math.pow(2, zoomLevelOffset);
        const zoomLevelGeometry = geometry.clone();
        if (subdivision > 1) {
            const edgeModifier = new EdgeLengthGeometrySubdivisionModifier(
                subdivision,
                tile.geoBox,
                SubdivisionMode.All,
                sourceProjection
            );
            edgeModifier.modify(zoomLevelGeometry);
        }
        sphericalModifier.modify(zoomLevelGeometry);
        toLocalTargetCoords(zoomLevelGeometry, sourceProjection, tile);
        geometries.push(zoomLevelGeometry);
    }
    return new LodMesh(geometries, material);
}

function toLocalTargetCoords(geom: THREE.BufferGeometry, srcProjection: Projection, tile: Tile) {
    const attr = geom.getAttribute("position") as THREE.BufferAttribute;
    const oldArray = attr.array as Float64Array;
    // Convert to single precision before rendering (WebGL does not support double
    // precision).
    const newArray = new Float32Array(oldArray.length);
    for (let i = 0; i < attr.array.length; i += 1) {
        tmpV.fromBufferAttribute(attr, i);
        tile.projection.reprojectPoint(srcProjection, tmpV, tmpV).sub(tile.center);
        tmpV.toArray(newArray, i * 3);
    }
    attr.array = newArray;
    attr.needsUpdate = true;
}

function createGroundPlaneGeometry(
    tile: Tile,
    useLocalTargetCoords: boolean,
    createTexCoords: boolean,
    receiveShadow: boolean
): THREE.BufferGeometry {
    const { dataSource, projection } = tile;
    const sourceProjection = dataSource.getTilingScheme().projection;
    const tmpV = new THREE.Vector3();

    const geometry = new THREE.BufferGeometry();
    const tileCorners = projectTilePlaneCorners(tile, sourceProjection);
    const cornersArray = [tileCorners.sw, tileCorners.se, tileCorners.nw, tileCorners.ne];
    if (useLocalTargetCoords) {
        for (const corner of cornersArray) {
            projection.reprojectPoint(sourceProjection, corner, corner).sub(tile.center);
        }
    }
    // Use 64bits floats for world coordinates to avoid precision issues on coordinate
    // tranformations. The array must be converted to single precision before rendering.
    const bufferArray = useLocalTargetCoords ? new Float32Array(12) : new Float64Array(12);
    const posAttr = new THREE.BufferAttribute(bufferArray, 3).copyVector3sArray(cornersArray);
    geometry.setAttribute("position", posAttr);

    if (receiveShadow) {
        // Webmercator needs to have it negated to work correctly.
        sourceProjection.surfaceNormal(tileCorners.sw, tmpV).negate();
        const normAttr = new THREE.BufferAttribute(new Float32Array(12), 3).copyVector3sArray(
            Array(4).fill(tmpV)
        );
        geometry.setAttribute("normal", normAttr);
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));

    if (createTexCoords) {
        const uvAttr = new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2);
        geometry.setAttribute("uv", uvAttr);
    }

    return geometry;
}

function createGroundPlaneMaterial(
    color: THREE.Color,
    receiveShadow: boolean,
    depthWrite: boolean,
    opacity: number
): THREE.Material {
    if (receiveShadow) {
        return new MapMeshStandardMaterial({
            color,
            visible: true,
            depthWrite,
            removeDiffuseLight: true,
            opacity
        });
    } else {
        return new MapMeshBasicMaterial({
            color,
            visible: true,
            depthWrite,
            opacity
        });
    }
}
