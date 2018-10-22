/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Precision issue arise when projecting vertices to another coordinate space.
 */
const ERROR_PRECISION = 0.01;

/**
 * Checks if and index should be added or not. It avoids, for example, to draw an outline in the
 * middle of a polygon if this one lays between two tiles.
 *
 * @param v0x The x component of the starting vertex composing the segment.
 * @param v0y The y component of the starting vertex composing the segment.
 * @param v1x The x component of the ending vertex composing the segment.
 * @param v1y The y component of the ending vertex composing the segment.
 * @param tileExtents The value that defines the extension of the tile.
 */
export function indexNeeded(
    v0x: number,
    v0y: number,
    v1x: number,
    v1y: number,
    tileExtents: number
): boolean {
    return (
        pointInsideTileExtents(v0x, v0y, tileExtents) ||
        pointInsideTileExtents(v1x, v1y, tileExtents) ||
        pointsOnYAxisAlignedTileBorder(v0x, v0y, v1x, v1y, tileExtents) ||
        pointsOnXAxisAlignedTileBorder(v0x, v0y, v1x, v1y, tileExtents) ||
        pointsAreToDiagonalTileBorder(v0x, v0y, v1x, v1y, tileExtents) ||
        pointsAreFromDiagonalTileBorder(v0x, v0y, v1x, v1y, tileExtents)
    );
}
/**
 * Check if a point is inside the tile extents.
 * @param vx X component of the point.
 * @param vy Y component of the point.
 * @param tileExtents Size of the tile extents.
 */
export function pointInsideTileExtents(vx: number, vy: number, tileExtents: number) {
    return isInsideTileBoarder(vx, tileExtents) && isInsideTileBoarder(vy, tileExtents);
}

/**
 * Check if the points are on the y borders of the tile, for example, if one is on the left border
 * and the other one on the right border, it returns true.
 *
 * @param v0x X component of the starting point.
 * @param v0y Y component of the starting point.
 * @param v1x X component of the ending point.
 * @param v1y Y component of the ending point.
 * @param tileExtents Size of the tile extents.
 */
export function pointsOnYAxisAlignedTileBorder(
    v0x: number,
    v0y: number,
    v1x: number,
    v1y: number,
    tileExtents: number
) {
    return (
        isOnTileBorder(v0x, tileExtents) &&
        isInsideTileBoarder(v0y, tileExtents) &&
        isOnTileBorder(v1x, tileExtents) &&
        isInsideTileBoarder(v1y, tileExtents) &&
        tileExtents - Math.abs(v0x - v1x) <= 0
    );
}

/**
 * Check if the points are on the z borders of the tile, for example, if one is on the top border
 * and the other one on the bottom border, it returns true.
 *
 * @param v0x X component of the starting point.
 * @param v0y Y component of the starting point.
 * @param v1x X component of the ending point.
 * @param v1y Y component of the ending point.
 * @param tileExtents Size of the tile extents.
 */
export function pointsOnXAxisAlignedTileBorder(
    v0x: number,
    v0y: number,
    v1x: number,
    v1y: number,
    tileExtents: number
) {
    return (
        isInsideTileBoarder(v0x, tileExtents) &&
        isOnTileBorder(v0y, tileExtents) &&
        isInsideTileBoarder(v1x, tileExtents) &&
        isOnTileBorder(v1y, tileExtents) &&
        tileExtents - Math.abs(v0y - v1y) <= 0
    );
}

/**
 * Check If the starting point is on the x axis and the ending point is going out of the tile
 * crossing the x axis.
 *
 * @param v0x X component of the starting point.
 * @param v0y Y component of the starting point.
 * @param v1x X component of the ending point.
 * @param v1y Y component of the ending point.
 * @param tileExtents Size of the tile extents.
 */
export function pointsAreFromDiagonalTileBorder(
    v0x: number,
    v0y: number,
    v1x: number,
    v1y: number,
    tileExtents: number
) {
    return (
        isOnTileBorder(v0x, tileExtents) &&
        isInsideTileBoarder(v0y, tileExtents) &&
        isInsideTileBoarder(v1x, tileExtents) &&
        isOutsideOfTileBoarder(v1y, tileExtents)
    );
}

/**
 * Check If the ending point is on the x axis and the starting point is going out of the tile
 * crossing the x axis.
 *
 * @param v0x X component of the starting point.
 * @param v0y Y component of the starting point.
 * @param v1x X component of the ending point.
 * @param v1y Y component of the ending point.
 * @param tileExtents Size of the tile extents.
 */
export function pointsAreToDiagonalTileBorder(
    v0x: number,
    v0y: number,
    v1x: number,
    v1y: number,
    tileExtents: number
) {
    return (
        isInsideTileBoarder(v0x, tileExtents) &&
        isOutsideOfTileBoarder(v0y, tileExtents) &&
        isOnTileBorder(v1x, tileExtents) &&
        isInsideTileBoarder(v1y, tileExtents)
    );
}

function isOnTileBorder(value: number, extents: number) {
    return extents - Math.abs(value) <= ERROR_PRECISION;
}

function isInsideTileBoarder(value: number, extents: number) {
    return extents - Math.abs(value) > ERROR_PRECISION;
}

function isOutsideOfTileBoarder(value: number, extents: number) {
    return extents - Math.abs(value) < ERROR_PRECISION;
}
