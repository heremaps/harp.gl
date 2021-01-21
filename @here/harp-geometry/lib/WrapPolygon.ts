/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, GeoCoordinates, webMercatorProjection } from "@here/harp-geoutils";
import { Math2D } from "@here/harp-utils";
import { Vector2, Vector3 } from "three";

import { ClippingEdge } from "./ClipPolygon";

class ClipEdge extends ClippingEdge {
    readonly p0: Vector2;
    readonly p1: Vector2;

    constructor(
        p0: [number, number],
        p1: [number, number],
        private readonly isInside: (p: Vector2) => boolean
    ) {
        super();
        this.p0 = new Vector2().fromArray(p0);
        this.p1 = new Vector2().fromArray(p1);
    }

    inside(point: Vector2, extent: number): boolean {
        return this.isInside(point);
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * {@link https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
     *    | line-line intersection}.
     */
    computeIntersection(a: Vector2, b: Vector2, extent: number): Vector2 {
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
}

const ec = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

const border = ec * 0.05;

const WRAP_MIDDLE_CLIP_EDGES = [
    new ClipEdge([0 - border, ec], [0 - border, 0], p => p.x > 0 - border),
    new ClipEdge([ec + border, 0], [ec + border, ec], p => p.x < ec + border)
];

const WRAP_LEFT_CLIP_EDGES = [
    new ClipEdge([-ec - border, ec], [-ec - border, 0], p => p.x > -ec - border),
    new ClipEdge([0 + border, 0], [0 + border, ec], p => p.x < 0 + border)
];

const WRAP_RIGHT_CLIP_EDGES = [
    new ClipEdge([ec - border, ec], [ec - border, 0], p => p.x > ec - border),
    new ClipEdge([ec * 2 + border, 0], [ec * 2 + border, ec], p => p.x < ec * 2 + border)
];

function wrapPolygonHelper(
    polygon: Vector2[],
    edges: ClippingEdge[],
    offset: number
): GeoCoordinates[] | undefined {
    for (const clip of edges) {
        polygon = clip.clipPolygon(polygon, 0);
    }

    const worldP = new Vector3();

    const coordinates = polygon.map(({ x, y }) => {
        worldP.set(x, y, 0);
        const geoPoint = webMercatorProjection.unprojectPoint(worldP);
        geoPoint.longitude += offset;
        return geoPoint;
    });

    return coordinates.length > 0 ? coordinates : undefined;
}

interface WrappedPolygon {
    left: GeoCoordinates[];
    middle: GeoCoordinates[];
    right: GeoCoordinates[];
}

/**
 * Wrap the given polygon.
 *
 * @remarks
 * This function splits this input polygon in three parts.
 *
 * The `left` member of the result contains the part of the polygon with longitude less than `-180`.
 *
 * The `middle` member contains the part of the polygon with longitude in the range `[-180, 180]`.
 *
 * The `right` member contains the part of the polygon with longitude greater than `180`.
 *
 * @param coordinates The coordinates of the polygon to wrap.
 */
export function wrapPolygon(coordinates: GeoCoordinates[]): Partial<WrappedPolygon> {
    const worldP = new Vector3();

    const projectedPolygon = coordinates.map(g => {
        const { x, y } = webMercatorProjection.projectPoint(g, worldP);
        return new Vector2(x, y);
    });

    return {
        left: wrapPolygonHelper(projectedPolygon, WRAP_LEFT_CLIP_EDGES, 360),
        middle: wrapPolygonHelper(projectedPolygon, WRAP_MIDDLE_CLIP_EDGES, 0),
        right: wrapPolygonHelper(projectedPolygon, WRAP_RIGHT_CLIP_EDGES, -360)
    };
}
