/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKind } from "@here/harp-datasource-protocol";
import { DisplacementFeature, MapMeshBasicMaterial } from "@here/harp-materials";
import * as THREE from "three";
import { Tile } from "../Tile";

/**
 * Overlays the geometry in the given tile on top of elevation data if available.
 *
 * @param tile The tile whose geometry will be overlaid.
 */
export function overlayOnElevation(tile: Tile): void {
    const elevationProvider = tile.mapView.elevationProvider;

    if (elevationProvider === undefined || tile.objects.length === 0) {
        return;
    }
    const displacementMap = elevationProvider.getDisplacementMap(tile.tileKey);
    if (displacementMap === undefined) {
        return;
    }

    for (const object of tile.objects) {
        if (
            object.userData === undefined ||
            object.userData.kind === undefined ||
            object.userData.kind.indexOf(GeometryKind.Area) === -1
        ) {
            continue;
        }

        const mesh = object as THREE.Mesh;
        const material = mesh.material as MapMeshBasicMaterial;
        if (material === undefined) {
            continue;
        }

        material.displacementMap = displacementMap.texture;
        DisplacementFeature.addRenderHelper(object);
    }
}
