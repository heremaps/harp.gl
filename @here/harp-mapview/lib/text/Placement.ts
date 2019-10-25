/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProjectionType } from "@here/harp-geoutils";
import { MathUtils } from "@here/harp-utils";
import * as THREE from "three";
import { PoiManager } from "../poi/PoiManager";
import { Tile } from "../Tile";
import { TextElement } from "./TextElement";
import { ViewState } from "./ViewState";

/**
 * Functions related to text element placement.
 */

const tempTextElementPosition = new THREE.Vector3(0, 0, 0);

/**
 * Checks whether the distance of the specified text element to the center of the given view is
 * lower than a maximum threshold.
 * @param textElement The textElement of which the view distance will be checked.
 * @param mapView The view that will be used as reference to calculate the distance.
 * @param maxViewDistance The maximum distance value.
 * @returns The text element view distance if it's lower than the maximum value, otherwise
 * `undefined`.
 */
function checkViewDistance(
    worldCenter: THREE.Vector3,
    textElement: TextElement,
    projectionType: ProjectionType,
    camera: THREE.Camera,
    maxViewDistance: number
): number | undefined {
    const textDistance = computeViewDistance(worldCenter, textElement);

    if (projectionType !== ProjectionType.Spherical) {
        return textDistance <= maxViewDistance ? textDistance : undefined;
    }

    // Spherical projection
    tempTextElementPosition.copy(textElement.position).add(textElement.tileCenter!);
    tempTextElementPosition.normalize();
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    // TODO: Revisit, why is this angle check needed and where does the constant -0.6 come from?
    return tempTextElementPosition.dot(cameraDir) < -0.6 && textDistance <= maxViewDistance
        ? textDistance
        : undefined;
}

/**
 * Computes the distance of the specified text element to the given position.
 * @param refPosition The world coordinates used a reference position to calculate the distance.
 * @param textElement The textElement of which the view distance will be checked.
 * @returns The text element view distance.
 * `undefined`.
 */
export function computeViewDistance(refPosition: THREE.Vector3, textElement: TextElement): number {
    let viewDistance: number;

    if (Array.isArray(textElement.points) && textElement.points.length > 1) {
        tempTextElementPosition.copy(textElement.points[0]).add(textElement.tileCenter!);
        const viewDistance0 = refPosition.distanceTo(tempTextElementPosition);

        tempTextElementPosition
            .copy(textElement.points[textElement.points.length - 1])
            .add(textElement.tileCenter!);
        const viewDistance1 = refPosition.distanceTo(tempTextElementPosition);

        viewDistance = Math.min(viewDistance0, viewDistance1);
    } else {
        tempTextElementPosition.copy(textElement.position).add(textElement.tileCenter!);
        viewDistance = refPosition.distanceTo(tempTextElementPosition);
    }

    return viewDistance;
}

/**
 * Computes the maximum view distance for text elements as a ratio of the given view's maximum far
 * plane distance.
 * @param viewState The view for which the maximum view distance will be calculated.
 * @param farDistanceLimitRatio The ratio to apply to the maximum far plane distance.
 * @returns Maximum view distance.
 */
export function getMaxViewDistance(viewState: ViewState, farDistanceLimitRatio: number): number {
    return viewState.maxVisibilityDist * farDistanceLimitRatio;
}

/**
 * State of fading.
 */
export enum PrePlacementResult {
    Ok = 0,
    NotReady,
    Invisible,
    TooFar,
    Duplicate,
    Count
}

/**
 * Applies early rejection tests for a given text element meant to avoid trying to place labels
 * that are not visible, not ready, duplicates etc...
 * @param textElement The Text element to check.
 * @param tile The tile to which the text element belongs.
 * @param worldOffsetX The tile's X offset.
 * @param viewState The view for which the text element will be placed.
 * @param viewCamera The view's camera.
 * @param m_poiManager To prepare pois for rendering.
 * @param projectionType The projection type currently used from geo to world space.
 * @param [maxViewDistance] If specified, text elements farther than this max distance will be
 * rejected.
 * @returns An object with the result code and the text element view distance
 * ( or `undefined` of the checks failed) as second.
 */
export function checkReadyForPlacement(
    textElement: TextElement,
    tile: Tile,
    worldOffsetX: number,
    viewState: ViewState,
    viewCamera: THREE.Camera,
    poiManager: PoiManager,
    projectionType: ProjectionType,
    maxViewDistance?: number
): { result: PrePlacementResult; viewDistance: number | undefined } {
    let viewDistance: number | undefined;

    if (!textElement.visible) {
        return { result: PrePlacementResult.Invisible, viewDistance };
    }

    // If a PoiTable is specified in the technique, the table is required to be
    // loaded before the POI can be rendered.
    if (!poiManager.updatePoiFromPoiTable(textElement)) {
        // PoiTable has not been loaded, but is required to determine
        // visibility.
        return { result: PrePlacementResult.NotReady, viewDistance };
    }

    // Text element visibility and zoom level ranges must be checked after calling
    // updatePoiFromPoiTable, since that function may change those values.
    if (
        !textElement.visible ||
        !MathUtils.isClamped(
            viewState.zoomLevel,
            textElement.minZoomLevel,
            textElement.maxZoomLevel
        )
    ) {
        return { result: PrePlacementResult.Invisible, viewDistance };
    }

    if (textElement.tileCenter === undefined) {
        textElement.tileCenter = new THREE.Vector3(
            tile.center.x + worldOffsetX,
            tile.center.y,
            tile.center.z
        );
    } else {
        textElement.tileCenter.set(tile.center.x + worldOffsetX, tile.center.y, tile.center.z);
    }

    viewDistance =
        maxViewDistance === undefined
            ? computeViewDistance(viewState.worldCenter, textElement)
            : checkViewDistance(
                  viewState.worldCenter,
                  textElement,
                  projectionType,
                  viewCamera,
                  maxViewDistance
              );

    if (viewDistance === undefined) {
        return { result: PrePlacementResult.TooFar, viewDistance };
    }

    return { result: PrePlacementResult.Ok, viewDistance };
}
