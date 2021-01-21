/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, GeoCoordinates, webMercatorProjection } from "@here/harp-geoutils";
import { Math2D } from "@here/harp-utils";
import { Vector2, Vector3 } from "three";

/**
 * A clipping edge.
 *
 * @remarks
 * Clip lines using the Sutherland-Hodgman algorithm.
 *
 * @internal
 */
class ClipEdge {
    readonly p0: Vector2;
    readonly p1: Vector2;

    /**
     * Creates a clipping edge.
     *
     * @param x1 - The x coordinate of the first point of this ClipEdge.
     * @param y1 - The y coordinate of the first point of this ClipEdge.
     * @param x2 - The x coordinate of the second point of this ClipEdge.
     * @param y2 - The y coordinate of the second point of this ClipEdge.
     * @param isInside - The function used to test points against this ClipEdge.
     */
    constructor(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        private readonly isInside: (p: Vector2) => boolean
    ) {
        this.p0 = new Vector2(x1, y1);
        this.p1 = new Vector2(x2, y2);
    }

    /**
     * Tests if the given point is inside this clipping edge.
     */
    inside(point: Vector2): boolean {
        return this.isInside(point);
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * {@link https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
     *    | line-line intersection}.
     */
    computeIntersection(a: Vector2, b: Vector2): Vector2 {
        const result = new Vector2();
        Math2D.intersectLines(
            a.x,
            a.y,
            b.x,
            b.y,
            this.p0.x,
            this.p0.y,
            this.p1.x,
            this.p1.y,
            result
        );
        return result;
    }

    /**
     * Clip the input line against this edge.
     */
    clipLine(lineString: Vector2[]): Vector2[][] {
        const inputList = lineString;

        const result: Vector2[][] = [];

        lineString = [];
        result.push(lineString);

        const pushPoint = (point: Vector2) => {
            if (lineString.length === 0 || !lineString[lineString.length - 1].equals(point)) {
                lineString.push(point);
            }
        };

        for (let i = 0; i < inputList.length; ++i) {
            const currentPoint = inputList[i];
            const prevPoint = i > 0 ? inputList[i - 1] : undefined;

            if (this.inside(currentPoint)) {
                if (prevPoint !== undefined && !this.inside(prevPoint)) {
                    if (lineString.length > 0) {
                        lineString = [];
                        result.push(lineString);
                    }
                    pushPoint(this.computeIntersection(prevPoint, currentPoint));
                }
                pushPoint(currentPoint);
            } else if (prevPoint !== undefined && this.inside(prevPoint)) {
                pushPoint(this.computeIntersection(prevPoint, currentPoint));
            }
        }

        if (result[result.length - 1].length === 0) {
            result.length = result.length - 1;
        }

        return result;
    }

    /**
     * Clip the input lines against this edge.
     */
    clipLines(lineStrings: Vector2[][]) {
        const reuslt: Vector2[][] = [];
        lineStrings.forEach(lineString => {
            this.clipLine(lineString).forEach(clippedLine => {
                reuslt.push(clippedLine);
            });
        });
        return reuslt;
    }
}

/**
 * Clip the input line against the given bounds.
 *
 * @param lineString - The line to clip.
 * @param minX - The minimum x coordinate.
 * @param minY - The minimum y coordinate.
 * @param maxX - The maxumum x coordinate.
 * @param maxY - The maxumum y coordinate.
 */
export function clipLineString(
    lineString: Vector2[],
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): Vector2[][] {
    const clipEdge0 = new ClipEdge(minX, minY, minX, maxY, p => p.x > minX); // left
    const clipEdge1 = new ClipEdge(minX, maxY, maxX, maxY, p => p.y < maxY); // bottom
    const clipEdge2 = new ClipEdge(maxX, maxY, maxX, minY, p => p.x < maxX); // right
    const clipEdge3 = new ClipEdge(maxX, minY, minX, minY, p => p.y > minY); // top

    let lines = clipEdge0.clipLine(lineString);
    lines = clipEdge1.clipLines(lines);
    lines = clipEdge2.clipLines(lines);
    lines = clipEdge3.clipLines(lines);

    return lines;
}

/**
 * The result of wrapping a line string.
 */
interface WrappedLineString {
    left: GeoCoordinates[][];
    middle: GeoCoordinates[][];
    right: GeoCoordinates[][];
}

/**
 * Helper function to wrap a line string projected in web mercator.
 *
 * @param multiLineString The input to wrap
 * @param edges The clipping edges used to wrap the input.
 * @param offset The x-offset used to displace the result
 *
 * @internal
 */
function wrapMultiLineStringHelper(
    multiLineString: Vector2[][],
    edges: ClipEdge[],
    offset: number
): GeoCoordinates[][] | undefined {
    for (const clip of edges) {
        multiLineString = clip.clipLines(multiLineString);
    }

    const worldP = new Vector3();

    const coordinates: GeoCoordinates[][] = [];

    multiLineString.forEach(lineString => {
        if (lineString.length === 0) {
            return;
        }

        const coords = lineString.map(({ x, y }) => {
            worldP.set(x, y, 0);
            const geoPoint = webMercatorProjection.unprojectPoint(worldP);
            geoPoint.longitude += offset;
            return geoPoint;
        });

        coordinates.push(coords);
    });

    return coordinates.length > 0 ? coordinates : undefined;
}

/**
 * Wrap the given line string.
 *
 * @remarks
 * This function splits this input line string in three parts.
 *
 * The `left` member of the result contains the part of the line string with longitude less than `-180`.
 *
 * The `middle` member contains the part of the line string with longitude in the range `[-180, 180]`.
 *
 * The `right` member contains the part of the line string with longitude greater than `180`.
 *
 * @param coordinates The coordinates of the line string to wrap.
 */
export function wrapLineString(coordinates: GeoCoordinates[]): Partial<WrappedLineString> {
    const worldP = new Vector3();

    const lineString = coordinates.map(g => {
        const { x, y } = webMercatorProjection.projectPoint(g, worldP);
        return new Vector2(x, y);
    });

    const multiLineString = [lineString];

    return {
        left: wrapMultiLineStringHelper(multiLineString, WRAP_LEFT_CLIP_EDGES, 360),
        middle: wrapMultiLineStringHelper(multiLineString, WRAP_MIDDLE_CLIP_EDGES, 0),
        right: wrapMultiLineStringHelper(multiLineString, WRAP_RIGHT_CLIP_EDGES, -360)
    };
}

const ec = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
const border = 0;

const WRAP_MIDDLE_CLIP_EDGES = [
    new ClipEdge(0 - border, ec, 0 - border, 0, p => p.x > 0 - border),
    new ClipEdge(ec + border, 0, ec + border, ec, p => p.x < ec + border)
];

const WRAP_LEFT_CLIP_EDGES = [
    new ClipEdge(-ec - border, ec, -ec - border, 0, p => p.x > -ec - border),
    new ClipEdge(0 + border, 0, 0 + border, ec, p => p.x < 0 + border)
];

const WRAP_RIGHT_CLIP_EDGES = [
    new ClipEdge(ec - border, ec, ec - border, 0, p => p.x > ec - border),
    new ClipEdge(ec * 2 + border, 0, ec * 2 + border, ec, p => p.x < ec * 2 + border)
];
