/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from "@here/harp-datasource-protocol";
import { ProjectionType } from "@here/harp-geoutils";
import {
    HorizontalAlignment,
    MeasurementParameters,
    TextCanvas,
    VerticalAlignment
} from "@here/harp-text-canvas";
import { assert, Math2D, MathUtils } from "@here/harp-utils";
import * as THREE from "three";
import { PoiManager } from "../poi/PoiManager";
import { PoiRenderer } from "../poi/PoiRenderer";
import { CollisionBox, DetailedCollisionBox, IBox, ScreenCollisions } from "../ScreenCollisions";
import { ScreenProjector } from "../ScreenProjector";
import { RenderState } from "./RenderState";
import { PoiInfo, poiIsRenderable, TextElement } from "./TextElement";
import { TextElementState } from "./TextElementState";
import { TextElementType } from "./TextElementType";
import { ViewState } from "./ViewState";

/**
 * Minimum number of pixels per character. Used during estimation if there is enough screen space
 * available to render a text.
 */
const MIN_AVERAGE_CHAR_WIDTH = 5;

/**
 * Functions related to text element placement.
 */

const tmpPosition = new THREE.Vector3(0, 0, 0);
const tmpCameraDir = new THREE.Vector3(0, 0, 0);
const COS_TEXT_ELEMENT_FALLOFF_ANGLE = 0.5877852522924731; // Math.cos(0.3 * Math.PI)

/**
 * Checks whether the distance of the specified text element to the center of the given view is
 * lower than a maximum threshold.
 * @param textElement The textElement of which the view distance will be checked, with coordinates
 * in world space.
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

    // For sphere projection: Filter labels that are close to the horizon
    tmpPosition.copy(textElement.position).normalize();
    camera.getWorldPosition(tmpCameraDir).normalize();
    const cosAlpha = tmpPosition.dot(tmpCameraDir);
    const viewDistance =
        cosAlpha > COS_TEXT_ELEMENT_FALLOFF_ANGLE && textDistance <= maxViewDistance
            ? textDistance
            : undefined;

    return viewDistance;
}

/**
 * Computes the distance of the specified text element to the given position.
 * @param refPosition The world coordinates used a reference position to calculate the distance.
 * @param textElement The textElement of which the view distance will be checked. It must have
 * coordinates in world space.
 * @returns The text element view distance.
 * `undefined`.
 */
export function computeViewDistance(refPosition: THREE.Vector3, textElement: TextElement): number {
    let viewDistance: number;

    if (Array.isArray(textElement.points) && textElement.points.length > 1) {
        const viewDistance0 = refPosition.distanceTo(textElement.points[0]);
        const viewDistance1 = refPosition.distanceTo(
            textElement.points[textElement.points.length - 1]
        );

        viewDistance = Math.min(viewDistance0, viewDistance1);
    } else {
        viewDistance = refPosition.distanceTo(textElement.points as THREE.Vector3);
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
 * Defines possible text placement relative to anchor.
 */
interface AnchorPlacement {
    h: HorizontalAlignment;
    v: VerticalAlignment;
}

/**
 * @hidden
 * Possible placement scenarios in clock-wise order, based on centered placements.
 *
 * TODO: HARP-6487 This array should be parsed from the theme style definition.
 */
const anchorPlacementsCentered: AnchorPlacement[] = [
    { h: HorizontalAlignment.Center, v: VerticalAlignment.Above },
    { h: HorizontalAlignment.Left, v: VerticalAlignment.Center },
    { h: HorizontalAlignment.Center, v: VerticalAlignment.Below },
    { h: HorizontalAlignment.Right, v: VerticalAlignment.Center }
];

/**
 * @hidden
 * Placement anchors in clock-wise order, for corner based placements.
 *
 * TODO: HARP-6487 This array should be parsed from the theme style definition.
 */
const anchorPlacementsCornered: AnchorPlacement[] = [
    { h: HorizontalAlignment.Left, v: VerticalAlignment.Above },
    { h: HorizontalAlignment.Left, v: VerticalAlignment.Below },
    { h: HorizontalAlignment.Right, v: VerticalAlignment.Below },
    { h: HorizontalAlignment.Right, v: VerticalAlignment.Above }
];

const tmpPlacementPosition = new THREE.Vector3();
const tmpPlacementBounds = new THREE.Box2();

/**
 * Applies early rejection tests for a given text element meant to avoid trying to place labels
 * that are not visible, not ready, duplicates etc...
 * @param textElement The Text element to check.
 * @param viewState The view for which the text element will be placed.
 * @param viewCamera The view's camera.
 * @param m_poiManager To prepare pois for rendering.
 * @param [maxViewDistance] If specified, text elements farther than this max distance will be
 * rejected.
 * @returns An object with the result code and the text element view distance
 * ( or `undefined` of the checks failed) as second.
 */
export function checkReadyForPlacement(
    textElement: TextElement,
    viewState: ViewState,
    viewCamera: THREE.Camera,
    poiManager: PoiManager,
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

    viewDistance =
        maxViewDistance === undefined
            ? computeViewDistance(viewState.worldCenter, textElement)
            : checkViewDistance(
                  viewState.worldCenter,
                  textElement,
                  viewState.projection.type,
                  viewCamera,
                  maxViewDistance
              );

    if (viewDistance === undefined) {
        return { result: PrePlacementResult.TooFar, viewDistance };
    }

    return { result: PrePlacementResult.Ok, viewDistance };
}

/**
 * Computes the offset for a point text accordingly to text alignment (and icon, if any).
 * @param textElement The text element of which the offset will computed. It must be a point
 * label with [[layoutStyle]] and [[bounds]] already computed.
 * @param hAlign Text horizontal alignment.
 * @param vAlign The vertical alignment.
 * @param scale The scaling factor (due to distance, etc.).
 * @param offset The offset result.
 */
function computePointTextOffset(
    textElement: TextElement,
    hAlign: HorizontalAlignment,
    vAlign: VerticalAlignment,
    scale: number,
    offset: THREE.Vector2 = new THREE.Vector2()
): THREE.Vector2 {
    assert(textElement.type === TextElementType.PoiLabel);
    assert(textElement.layoutStyle !== undefined);
    assert(textElement.bounds !== undefined);

    switch (hAlign) {
        case HorizontalAlignment.Right:
            offset.x = -textElement.xOffset;
            break;
        default:
            offset.x = textElement.xOffset;
            break;
    }

    switch (vAlign) {
        case VerticalAlignment.Below:
            offset.y = -textElement.yOffset;
            break;
        case VerticalAlignment.Above:
            offset.y = textElement.yOffset - textElement.bounds!.min.y;
            break;
        default:
            offset.y =
                textElement.yOffset - 0.5 * (textElement.bounds!.max.y + textElement.bounds!.min.y);
            break;
    }

    if (textElement.poiInfo !== undefined && poiIsRenderable(textElement.poiInfo)) {
        assert(textElement.poiInfo.computedWidth !== undefined);
        assert(textElement.poiInfo.computedHeight !== undefined);

        offset.x += textElement.poiInfo.computedWidth! * (0.5 + hAlign);
        offset.y += textElement.poiInfo.computedHeight! * (0.5 + vAlign);
    }

    offset.multiplyScalar(scale);
    return offset;
}

const tmpBox = new THREE.Box2();
const tmpBoxes: THREE.Box2[] = [];
const tmpMeasurementParams: MeasurementParameters = {};
const tmpCollisionBoxes: CollisionBox[] = [];
const tmpCollisionBox = new CollisionBox();
const tmpScreenPosition = new THREE.Vector2();
const tmpTextOffset = new THREE.Vector2();
const tmp2DBox = new Math2D.Box();
const pointLabelMargin = new THREE.Vector2(4, 2);

export enum PlacementResult {
    Ok,
    Rejected,
    Invisible
}

/**
 * Places an icon on screen.
 * @param iconRenderState The icon state.
 * @param poiInfo Icon information necessary to compute its dimensions.
 * @param screenPosition Screen position of the icon.
 * @param scaleFactor Scaling factor to apply to the icon dimensions.
 * @param screenCollisions Used to check the icon visibility and collisions.
 * @param env Current map env.
 * @returns `PlacementResult.Ok` if icon can be placed, `PlacementResult.Rejected` if there's
 * a collision, `PlacementResult.Invisible` if it's not visible.
 */
export function placeIcon(
    iconRenderState: RenderState,
    poiInfo: PoiInfo,
    screenPosition: THREE.Vector2,
    scaleFactor: number,
    env: Env,
    screenCollisions: ScreenCollisions
): PlacementResult {
    PoiRenderer.computeIconScreenBox(poiInfo, screenPosition, scaleFactor, env, tmp2DBox);
    if (!screenCollisions.isVisible(tmp2DBox)) {
        return PlacementResult.Invisible;
    }

    const iconSpaceAvailable =
        poiInfo.mayOverlap === true || !screenCollisions.isAllocated(tmp2DBox);

    if (!iconSpaceAvailable) {
        return iconRenderState.isVisible() ? PlacementResult.Rejected : PlacementResult.Invisible;
    }
    return PlacementResult.Ok;
}

/**
 * Place a point label text using single or multiple optional placements.
 *
 * @param labelState State of the point label to place.
 * @param screenPosition Position of the label in screen coordinates.
 * @param scale Scale factor to be applied to label dimensions.
 * @param isRejected Whether the label is already rejected (e.g. because its icon was rejected). If
 * `true`, text won't be checked for collision, result will be either `PlacementResult.Invisible`
 * for newly placed (upcoming) label or `PlacementResult.Rejected` if the label was persistent.
 * @param textCanvas The text canvas where the label will be placed.
 * @param screenCollisions Used to check collisions with other labels.
 * @param outScreenPosition The final label screen position after applying any offsets.
 * @param multiAnchor The parameter decides if multi-anchor placement algorithm should be
 * used, be default [[false]] meaning try to place label using current alignment settings only.
 * @returns `PlacementResult.Ok` if point __label can be placed__ at the base or any optional
 * anchor point. `PlacementResult.Rejected` if there's a collision for all placements or it's
 * __persistent label with icon rejected and text visible__. Finally `PlacementResult.Invisible`
 * if it's text is not visible at any placement position or it's __new label with text or icon__
 * __rejected__.
 */
export function placePointLabel(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    scale: number,
    textCanvas: TextCanvas,
    screenCollisions: ScreenCollisions,
    isRejected: boolean,
    outScreenPosition: THREE.Vector3,
    multiAnchor: boolean = false
): PlacementResult {
    assert(labelState.element.layoutStyle !== undefined);

    const layoutStyle = labelState.element.layoutStyle!;

    // For the new labels with rejected icons we don't need to go further.
    // Make them invisible.
    const newLabel = !labelState.visible;
    if (isRejected && newLabel) {
        return PlacementResult.Invisible;
    }
    // For centered point labels and labels with icon rejected, do only current anchor testing.
    // TODO: HARP-6487 Placements options should be provided from theme style definition.
    if (
        !multiAnchor ||
        isRejected ||
        (layoutStyle.verticalAlignment === VerticalAlignment.Center &&
            layoutStyle.horizontalAlignment === HorizontalAlignment.Center)
    ) {
        return placePointLabelAtCurrentAnchor(
            labelState,
            screenPosition,
            scale,
            textCanvas,
            screenCollisions,
            isRejected,
            false,
            outScreenPosition
        );
    }
    // Otherwise test also alternative text placements.
    else {
        return placePointLabelChoosingAnchor(
            labelState,
            screenPosition,
            scale,
            textCanvas,
            screenCollisions,
            outScreenPosition
        );
    }
}

/**
 * Try to place a point label text using multiple optional placements.
 *
 * @note Function should be called only for labels with icons not rejected.
 *
 * @param labelState State of the point label to place.
 * @param screenPosition Position of the label in screen coordinates.
 * @param scale Scale factor to be applied to label dimensions.
 * @param textCanvas The text canvas where the label will be placed.
 * @param screenCollisions Used to check collisions with other labels.
 * @param outScreenPosition The final label screen position after applying any offsets.
 * @returns `PlacementResult.Ok` if label can be placed at the base or optional anchor point,
 * `PlacementResult.Rejected` if there's a collision for all placements, `PlacementResult.Invisible`
 * if it's not visible at any placement position.
 *
 * @internal
 * @hidden
 */
function placePointLabelChoosingAnchor(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    scale: number,
    textCanvas: TextCanvas,
    screenCollisions: ScreenCollisions,
    outScreenPosition: THREE.Vector3
): PlacementResult {
    assert(labelState.element.layoutStyle !== undefined);

    const label = labelState.element;
    // Store label state - persistent or new label.
    const persistent = labelState.visible;

    // The current implementation does not provide placements options via theme style yet,
    // so function tries the anchor placements from pre-defined placements arrays.
    // TODO: HARP-6487 Placements options should be loaded from the theme.

    // Start with currently set alignment settings.
    const basePlacement = {
        h: label.layoutStyle!.horizontalAlignment,
        v: label.layoutStyle!.verticalAlignment
    };
    const placementCentered =
        basePlacement.h === HorizontalAlignment.Center ||
        basePlacement.v === VerticalAlignment.Center;
    // Placements options will be read from label.layoutStyle.placements in final solution.
    const placements = placementCentered ? anchorPlacementsCentered : anchorPlacementsCornered;
    const placementsNum = placements.length;
    // Find current anchor placement on the optional placements list or best matching position.
    // Index of exact match.
    let matchIdx = -1;
    // Index of closest placement to the base one.
    let closeIdxOff = 0;
    let closeDiff = Infinity;
    for (let i = 0; i < placementsNum; ++i) {
        const placement = placements[i];
        const hDiff = placement.h - basePlacement.h;
        const vDiff = placement.v - basePlacement.v;
        const manhattanDist = Math.abs(hDiff) + Math.abs(vDiff);
        if (manhattanDist === 0) {
            matchIdx = i;
            closeIdxOff = 0;
            break;
        } else if (manhattanDist < closeDiff) {
            closeDiff = manhattanDist;
            closeIdxOff = i;
        }
    }

    // Will be true if all text placements are invisible.
    let allInvisible: boolean = true;
    // If current anchor found on the list we start from it.
    // If not listed in placements list (matchIdx === -1) we start from current anchor setup, but
    // then immediately jump to the best matching option and iterate the over rest of placements.
    // The number of iterations varies from `placementsNum` if perfect match found to
    // `placementsNum + 1` otherwise (current placement + all optional).
    const triesNum = matchIdx < 0 ? placementsNum + 1 : placementsNum;
    for (let i = matchIdx, tryIdx = 0; tryIdx < triesNum; ++i, ++tryIdx) {
        const anchorPlacement =
            i < 0 ? basePlacement : placements[(i + closeIdxOff) % placementsNum];
        // Override label text alignment for measurements and leave it so if passed collisions test.
        // NOTE: This actually writes also to:
        // textCanvas.textLayoutStyle.verticalAlignment/horizontalAlignment.
        // which is needed for text measurements being done on canvas.
        label.layoutStyle!.horizontalAlignment = anchorPlacement.h;
        label.layoutStyle!.verticalAlignment = anchorPlacement.v;

        // Bounds may be already calculated for persistent label, force re-calculation for
        // for alternative placements.
        const basePlacementTest = tryIdx === 0;
        // Compute label bounds, visibility or collision according to new layout settings.
        const placementResult = placePointLabelAtCurrentAnchor(
            labelState,
            screenPosition,
            scale,
            textCanvas,
            screenCollisions,
            false,
            !basePlacementTest,
            outScreenPosition
        );

        if (basePlacementTest) {
            assert(label.bounds !== undefined);
            tmpPlacementPosition.copy(outScreenPosition);
            tmpPlacementBounds.copy(label.bounds!);
        }
        // Check the text allocation
        if (placementResult === PlacementResult.Invisible) {
            // Persistent label out of screen or the new label that is colliding - next iteration.
            continue;
        } else {
            // This placement is visible, but surely colliding.
            allInvisible = false;
        }

        // If text rejected (label collides), proceed to test further placements.
        if (placementResult === PlacementResult.Rejected) {
            continue;
        }

        // Glyphs arrangement have been changed remove text buffer object and apply
        // new text layout to the label.
        if (i !== 0) {
            label.textBufferObject = undefined;
        }
        // Proper placement found.
        return PlacementResult.Ok;
    }
    // Revert recent screen position.
    outScreenPosition.copy(tmpPlacementPosition);
    label.bounds!.copy(tmpPlacementBounds);

    // No placement found - revert back the original alignment.
    label.layoutStyle!.horizontalAlignment = basePlacement.h;
    label.layoutStyle!.verticalAlignment = basePlacement.v;

    return allInvisible
        ? // All text's placements out of the screen.
          PlacementResult.Invisible
        : persistent
        ? // All placements are either colliding or out of screen for persistent label.
          PlacementResult.Rejected
        : // No placement found for the new label.
          PlacementResult.Invisible;
}

/**
 * Places a point label on a specified text canvas using the alignment (anchor) currently set.
 *
 * @param labelState State of the point label to place.
 * @param screenPosition Position of the label in screen coordinates.
 * @param scale Scale factor to be applied to label dimensions.
 * @param isRejected Whether the label is already rejected (e.g. because its icon was rejected). If
 * `true`, text won't be checked for collision, result will be either `PlacementResult.Invisible` or
 * `PlacementResult.Rejected`.
 * @param textCanvas The text canvas where the label will be placed.
 * @param screenCollisions Used to check collisions with other labels.
 * @param forceMeasurement Set to true if you need label bounds invalidation (recalculation), this
 * may be required due to text layout or render style changes.
 * @param outScreenPosition The final label screen position after applying any offsets.
 * @returns `PlacementResult.Ok` if point label can be placed, `PlacementResult.Rejected` if there's
 * a collision, `PlacementResult.Invisible` if it's not visible.
 *
 * @internal
 * @hidden
 */
function placePointLabelAtCurrentAnchor(
    labelState: TextElementState,
    screenPosition: THREE.Vector2,
    scale: number,
    textCanvas: TextCanvas,
    screenCollisions: ScreenCollisions,
    isRejected: boolean,
    forceMeasurement: boolean,
    outScreenPosition: THREE.Vector3
): PlacementResult {
    const label = labelState.element;
    assert(label.glyphs !== undefined);
    assert(label.layoutStyle !== undefined);

    const measureText = label.bounds === undefined || forceMeasurement;
    if (label.bounds === undefined) {
        label.bounds = new THREE.Box2();
    }

    if (measureText) {
        // Setup measurements parameters for textCanvas.measureText().
        tmpMeasurementParams.outputCharacterBounds = undefined;
        tmpMeasurementParams.path = undefined;
        tmpMeasurementParams.pathOverflow = false;
        tmpMeasurementParams.letterCaseArray = label.glyphCaseArray!;
        // Compute label bounds according to layout settings.
        textCanvas.measureText(label.glyphs!, label.bounds, tmpMeasurementParams);
    }

    // Compute text offset from the anchor point
    const hAlign = label.layoutStyle!.horizontalAlignment;
    const vAlign = label.layoutStyle!.verticalAlignment;
    const textOffset = computePointTextOffset(label, hAlign, vAlign, scale, tmpTextOffset);
    textOffset.add(screenPosition);
    tmpBox.copy(label.bounds!);
    tmpBox.min.multiplyScalar(scale);
    tmpBox.max.multiplyScalar(scale);
    // Add margin after scaling, this ensures the margin is consistent across all
    // labels - regardless of distance scaling (or any other) factor.
    // TODO: Make the margin configurable
    tmpBox.expandByVector(pointLabelMargin);
    tmpBox.translate(textOffset);
    tmp2DBox.set(
        tmpBox.min.x,
        tmpBox.min.y,
        tmpBox.max.x - tmpBox.min.x,
        tmpBox.max.y - tmpBox.min.y
    );

    // Update output screen position.
    outScreenPosition.set(textOffset.x, textOffset.y, labelState.renderDistance);

    // Check the text visibility if invisible finish immediately
    // regardless of the persistence state - no fading required.
    if (!screenCollisions.isVisible(tmp2DBox)) {
        return PlacementResult.Invisible;
    }

    const persistent = labelState.visible;
    // Check if icon's label was already rejected.
    if (isRejected) {
        // Allows to fade out persistent label and simply ignore new one.
        // NOTE:
        // It might be changed if we would like to render text without icon (at border, etc.).
        return persistent ? PlacementResult.Rejected : PlacementResult.Invisible;
    }
    // Check label's text collision.
    if (!label.textMayOverlap && screenCollisions.isAllocated(tmp2DBox)) {
        // Allows to fade persistent and ignore new label.
        return persistent ? PlacementResult.Rejected : PlacementResult.Invisible;
    }

    // Don't allocate space for rejected text. When zooming, this allows placement of a
    // lower priority text element that was displaced by a higher priority one (not
    // present in the new zoom level) before an even lower priority one takes the space.
    // Otherwise the lowest priority text will fade in and back out.
    // TODO: Add a unit test for this scenario.
    if (label.textReservesSpace) {
        screenCollisions.allocate(tmp2DBox);
    }

    return PlacementResult.Ok;
}

/**
 * Places a path label along a given path on a specified text canvas.
 * @param labelState The state of the path label to place.
 * @param textPath The text path along which the label will be placed.
 * @param screenPosition Position of the label in screen coordinates.
 * @param textCanvas The text canvas where the label will be placed.
 * @param screenCollisions Used to check collisions with other labels.
 * @returns `PlacementResult.Ok` if path label can be placed, `PlacementResult.Rejected` if there's
 * a collision or text doesn't fit into path, `PlacementResult.Invisible` if it's not visible.
 */
export function placePathLabel(
    labelState: TextElementState,
    textPath: THREE.Path,
    screenPosition: THREE.Vector2,
    textCanvas: TextCanvas,
    screenCollisions: ScreenCollisions
): PlacementResult {
    // Recalculate the text bounds for this path label. If measurement fails, the whole
    // label doesn't fit the path and should be discarded.
    tmpMeasurementParams.path = textPath;
    tmpMeasurementParams.outputCharacterBounds = tmpBoxes;
    tmpMeasurementParams.letterCaseArray = labelState.element.glyphCaseArray!;

    // TODO: HARP-7648. TextCanvas.measureText does the placement as in TextCanvas.addText but
    // without storing the result. If the measurement succeeds, the placement work is done
    // twice.
    // This could be done in one step (e.g measureAndAddText). Collision test could be injected
    // in the middle as a function.
    if (!textCanvas.measureText(labelState.element.glyphs!, tmpBox, tmpMeasurementParams)) {
        return PlacementResult.Rejected;
    }

    // Coarse collision check.
    tmpCollisionBox.copy(tmpBox.translate(screenPosition));
    if (!screenCollisions.isVisible(tmpCollisionBox)) {
        return PlacementResult.Invisible;
    }

    let checkGlyphCollision = false;
    let candidateBoxes: IBox[] | undefined;
    if (!labelState.element.textMayOverlap) {
        candidateBoxes = screenCollisions.search(tmpCollisionBox);
        checkGlyphCollision = candidateBoxes.length > 0;
    }

    const checkGlyphVisible = !screenCollisions.isFullyVisible(tmpCollisionBox);

    // Perform per-character collision checks.
    tmpCollisionBoxes.length = tmpBoxes.length;
    for (let i = 0; i < tmpBoxes.length; ++i) {
        const glyphBox = tmpBoxes[i].translate(screenPosition);
        let collisionBox = tmpCollisionBoxes[i];
        if (collisionBox === undefined) {
            collisionBox = new CollisionBox(glyphBox);
            tmpCollisionBoxes[i] = collisionBox;
        } else {
            collisionBox.copy(glyphBox);
        }
        if (checkGlyphVisible && !screenCollisions.isVisible(collisionBox)) {
            return PlacementResult.Invisible;
        }

        if (
            checkGlyphCollision &&
            screenCollisions.intersectsDetails(collisionBox, candidateBoxes!)
        ) {
            return PlacementResult.Rejected;
        }
    }
    // Allocate collision info if needed.
    if (labelState.element.textReservesSpace) {
        const collisionBox = new DetailedCollisionBox(tmpCollisionBox, tmpCollisionBoxes.slice());
        tmpCollisionBoxes.length = 0;
        screenCollisions.allocate(collisionBox);
    }
    return PlacementResult.Ok;
}

/**
 * Check if a given path label is too small to be rendered.
 * @param textElement The text element to check.
 * @param screenProjector Used to project coordinates from world to screen space.
 * @param outScreenPoints Label path projected to screen space.
 * @returns `true` if label is too small, `false` otherwise.
 */
export function isPathLabelTooSmall(
    textElement: TextElement,
    screenProjector: ScreenProjector,
    outScreenPoints: THREE.Vector2[]
): boolean {
    assert(textElement.type === TextElementType.PathLabel);

    // Get the screen points that define the label's segments and create a path with
    // them.
    outScreenPoints.length = 0;
    let anyPointVisible = false;

    for (const pt of textElement.points as THREE.Vector3[]) {
        // Skip invisible points at the beginning of the path.
        const screenPoint = anyPointVisible
            ? screenProjector.project(pt, tmpScreenPosition)
            : screenProjector.projectOnScreen(pt, tmpScreenPosition);
        if (screenPoint === undefined) {
            continue;
        }
        anyPointVisible = true;

        outScreenPoints.push(tmpScreenPosition.clone());
    }

    // TODO: (HARP-3515)
    //      The rendering of a path label that contains just a single point that is not
    //      visible is impossible, which is problematic with long paths.
    //      Fix: Skip/clip the invisible points at beginning and end of the path to get
    //      the visible part of the path.

    // If not a single point is visible, skip the path
    if (!anyPointVisible) {
        return true;
    }

    // Check/guess if the screen box can hold a string of that length. It is important
    // to guess that value without measuring the font first to save time.
    const minScreenSpace = textElement.text.length * MIN_AVERAGE_CHAR_WIDTH;

    tmpBox.setFromPoints(outScreenPoints);
    const boxDiagonalSq = tmpBox.max.sub(tmpBox.min).lengthSq();

    if (boxDiagonalSq < minScreenSpace * minScreenSpace) {
        textElement.dbgPathTooSmall = true;
        return true;
    }

    return false;
}
