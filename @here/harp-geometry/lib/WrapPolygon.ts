/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, GeoCoordinates, webMercatorProjection } from "@here/harp-geoutils";
import { Vector2, Vector3 } from "three";

import { ClippingEdge } from "./ClipPolygon";

class ClipEdge extends ClippingEdge {
    constructor(
        private readonly p0: [number, number],
        private readonly p1: [number, number],
        private readonly isInside: (p: Vector2) => boolean
    ) {
        super();
    }

    inside(point: Vector2, extent: number): boolean {
        return this.isInside(point);
    }

    computeIntersection(a: Vector2, b: Vector2, extent: number): Vector2 {
        const { x: x1, y: y1 } = a;
        const { x: x2, y: y2 } = b;
        const [x3, y3] = this.p0;
        const [x4, y4] = this.p1;
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
        const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
        return new Vector2(px, py);
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
