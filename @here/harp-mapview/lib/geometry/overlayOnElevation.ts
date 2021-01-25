/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKind } from "@here/harp-datasource-protocol";
import { Projection } from "@here/harp-geoutils";
import { setDisplacementMapToMaterial } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import * as THREE from "three";

import { TileDisplacementMap } from "../DisplacementMap";
import { ElevationProvider } from "../ElevationProvider";
import { TextElement } from "../text/TextElement";
import { Tile, TileObject } from "../Tile";

/**
 * Overlays the specified object's geometry on the elevation represented by the given displacement
 * map .
 *
 * @param object - The object to be overlaid.
 * @param displacementMap - Texture representing the elevation data used to overlay the object.
 */
function overlayObject(object: TileObject, displacementMap: THREE.DataTexture): void {
    if (!("material" in object)) {
        return;
    }
    const setDisplacementMap = setDisplacementMapToMaterial.bind(null, displacementMap);
    const material = (object as any).material as THREE.Mesh["material"];

    if (Array.isArray(material)) {
        material.forEach(setDisplacementMap);
    } else if (material) {
        setDisplacementMap(material);
    }
}

/**
 * Overlays the specified coordinates on top of elevation data if available.
 *
 * @param worldCoords - World coordinates to overlay.
 * @param elevationProvider - Used to sample elevation data.
 * @param displacementMap - Elevation data to be sampled.
 * @param projection - Projection from geo to world space.
 * @returns `true` if the position was successfully overlaid, `false` otherwise (e.g. elevation
 * data not available).
 */
function overlayPosition(
    worldCoords: THREE.Vector3,
    elevationProvider: ElevationProvider,
    displacementMap: TileDisplacementMap,
    projection: Projection
): boolean {
    // TODO: Move calculation of text element geoCoordinates to decoder.
    const geoCoords = projection.unprojectPoint(worldCoords);

    if (displacementMap.geoBox.contains(geoCoords)) {
        geoCoords.altitude = elevationProvider.sampleHeight(geoCoords, displacementMap);
    } else {
        geoCoords.altitude = elevationProvider.getHeight(geoCoords, displacementMap.tileKey.level);
        if (geoCoords.altitude === undefined) {
            return false;
        }
    }
    projection.projectPoint(geoCoords, worldCoords);
    return true;
}

/**
 * Overlays the specified coordinates on top of elevation data if available.
 *
 * @param path - World coordinates to overlay.
 * @param elevationProvider - Used to sample elevation data.
 * @param displacementMap - Elevation data to be sampled.
 * @param projection - Projection from geo to world space.
 * @returns `true` if the position was successfully overlaid, `false` otherwise (e.g. elevation
 * data not available).
 */
function overlayPath(
    path: THREE.Vector3[],
    elevationProvider: ElevationProvider,
    displacementMap: TileDisplacementMap,
    projection: Projection
): boolean {
    for (const position of path) {
        if (!overlayPosition(position, elevationProvider, displacementMap, projection)) {
            return false;
        }
    }
    return true;
}

/**
 * Overlays a text element on top of elevation data if available.
 *
 * @param textElement - The text element whose geometry will be overlaid.
 * @param elevationProvider -  Used to sample elevation data.
 * @param displacementMap - Elevation data to be sampled.
 * @param projection - Projection from geo to world space.
 */
export function overlayTextElement(
    textElement: TextElement,
    elevationProvider: ElevationProvider,
    displacementMap: TileDisplacementMap,
    projection: Projection
) {
    assert(!textElement.elevated);
    if (!displacementMap) {
        return;
    }

    textElement.elevated = textElement.path
        ? overlayPath(textElement.path, elevationProvider, displacementMap, projection)
        : overlayPosition(textElement.position, elevationProvider, displacementMap, projection);
}

/**
 * Overlays the geometry in the given tile on top of elevation data if available. The tile's
 * elevation may be updated with a more precise range.
 *
 * @param tile - The tile whose geometry will be overlaid.
 */
export function overlayOnElevation(tile: Tile): void {
    const elevationProvider = tile.mapView.elevationProvider;

    if (elevationProvider === undefined || tile.objects.length === 0) {
        return;
    }
    const firstObject = tile.objects[0];
    if (
        !firstObject.userData ||
        !firstObject.userData.kind ||
        !firstObject.userData.kind.find((kind: GeometryKind) => {
            return kind !== GeometryKind.All && kind !== GeometryKind.Terrain;
        })
    ) {
        return;
    }

    const displacementMap = elevationProvider.getDisplacementMap(tile.tileKey);
    if (displacementMap === undefined) {
        return;
    }

    // TODO: HARP-8808 Apply displacement maps once per material.
    for (const object of tile.objects) {
        overlayObject(object, displacementMap.texture);
    }
}
