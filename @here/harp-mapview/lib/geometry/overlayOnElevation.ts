/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKind } from "@here/harp-datasource-protocol";
import * as THREE from "three";
import { ElevationProvider } from "../ElevationProvider";
import { TextElement } from "../text/TextElement";
import { Tile, TileObject } from "../Tile";

/**
 * Overlays the specified object's geometry on the elevation represented by the given displacement
 * map .
 *
 * @param object The object to be overlaid.
 * @param displacementMap Texture representing the elevation data used to overlay the object.
 */
function overlayObject(object: TileObject, displacementMap: THREE.DataTexture): void {
    if (!("material" in object)) {
        return;
    }

    const material = (object as any).material;

    if ("displacementMap" in material) {
        (material as any).displacementMap = displacementMap;
    }
}

/**
 * Overlays the specified coordinates on top of elevation data if available.
 *
 * @param worldCoords World coordinates to overlay.
 * @param elevationProvider Used to get elevation data.
 * @param tile The tile to which the coordinates are relative.
 */
function overlayPosition(
    worldCoords: THREE.Vector3,
    elevationProvider: ElevationProvider,
    tile: Tile
) {
    const geoCoords = tile.mapView.projection.unprojectPoint(worldCoords);
    const height = elevationProvider.getHeight(geoCoords);

    if (height !== undefined) {
        geoCoords.altitude = height;
        tile.mapView.projection.projectPoint(geoCoords, worldCoords);
    }
}

/**
 * Overlays a text element on top of elevation data if available.
 *
 * @param textElement The text element whose geometry will be overlaid.
 * @param elevationProvider Used to get elevation data.
 * @param tile The tile the text element belongs to.
 */
function overlayTextElement(
    textElement: TextElement,
    elevationProvider: ElevationProvider,
    tile: Tile
) {
    // TODO: Move calculation of text element geoCoordinates to decoder.
    if (textElement.path === undefined) {
        overlayPosition(textElement.position, elevationProvider, tile);
        return;
    }

    for (const position of textElement.path) {
        overlayPosition(position, elevationProvider, tile);
    }
}

// Overlay of text elements within a tile is spread through this many frames to minimize the time
// spent per frame on elevation overlay.
const TEXT_OVERLAY_SPREAD_FRAME_COUNT = 60;

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
    if (displacementMap === undefined || tile.objects.length === 0) {
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

    for (const object of tile.objects) {
        overlayObject(object, displacementMap.texture);
    }

    // TODO: Start overlaying text elements as soon as there's some text.
    if (!tile.allGeometryLoaded) {
        return;
    }

    if (tile.allTextElementsOverlaid) {
        return;
    }

    const textElementsPerFrame = Math.ceil(
        tile.textElementGroups.count() / TEXT_OVERLAY_SPREAD_FRAME_COUNT
    );

    const groups = tile.textElementGroups.sortedGroups;
    let { groupIndex, elementIndex } = tile.nextTextElementToOverlay;
    let textElementsCount = 0;

    while (groupIndex < groups.length) {
        const group = groups[groupIndex];
        while (textElementsCount < textElementsPerFrame && elementIndex < group.elements.length) {
            overlayTextElement(group.elements[elementIndex], elevationProvider, tile);
            elementIndex++;
            textElementsCount++;
        }

        if (elementIndex >= group.elements.length) {
            ++groupIndex;
            elementIndex = 0;
        } else {
            break;
        }
    }
    tile.nextTextElementToOverlay = { groupIndex, elementIndex };
    tile.textElementsChanged = true;
    tile.mapView.update();
}
