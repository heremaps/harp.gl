/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box3Like, GeoBox, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import { Vector3 } from "three";

import { SubdivisionModifier } from "./SubdivisionModifier";

const VERTEX_POSITION_CACHE = [new Vector3(), new Vector3()];

export enum SubdivisionMode {
    /**
     * Subdivide all edges
     */
    All,
    /**
     * Only subdivide horizontal and vertical edges
     */
    NoDiagonals
}

/**
 * The [[EdgeLengthGeometrySubdivisionModifier]] subdivides triangle mesh depending on
 * length of edges.
 */
export class EdgeLengthGeometrySubdivisionModifier extends SubdivisionModifier {
    private readonly m_projectedBox: Box3Like;
    private readonly m_maxLength: number;
    private readonly m_maxLengthX: number;
    private readonly m_maxLengthY: number;

    /**
     * Constructs a new [[EdgeLengthGeometrySubdivisionModifier]].
     *
     * @param subdivision - The subdivision factor
     * @param geoBox - The geo bounding box of a tile
     * @param subdivisionMode - Configures what edges to divide
     * @param projection - The projection that defines the world space of this geometry.
     */
    constructor(
        readonly subdivision: number,
        readonly geoBox: GeoBox,
        readonly subdivisionMode: SubdivisionMode = SubdivisionMode.All,
        readonly projection: Projection
    ) {
        super();

        assert(
            projection.type === ProjectionType.Planar,
            "EdgeLengthGeometrySubdivisionModifier only supports planar projections"
        );

        const northEast = projection.projectPoint(geoBox.northEast, VERTEX_POSITION_CACHE[0]);
        const southWest = projection.projectPoint(geoBox.southWest, VERTEX_POSITION_CACHE[1]);
        this.m_projectedBox = {
            min: {
                x: Math.min(northEast.x, southWest.x),
                y: Math.min(northEast.y, southWest.y),
                z: Math.min(northEast.z, southWest.z)
            },
            max: {
                x: Math.max(northEast.x, southWest.x),
                y: Math.max(northEast.y, southWest.y),
                z: Math.max(northEast.z, southWest.z)
            }
        };
        this.m_maxLengthX = (this.m_projectedBox.max.x - this.m_projectedBox.min.x) / subdivision;
        this.m_maxLengthY = (this.m_projectedBox.max.y - this.m_projectedBox.min.y) / subdivision;

        // Increase max length slightly to account for precision errors
        if (this.subdivisionMode === SubdivisionMode.All) {
            this.m_maxLengthX *= 1.1;
            this.m_maxLengthY *= 1.1;
        }
        this.m_maxLength = Math.sqrt(
            this.m_maxLengthX * this.m_maxLengthX + this.m_maxLengthY * this.m_maxLengthY
        );
    }

    /**
     * Return upper bound for length of diagonal edges
     */
    get maxLength() {
        return this.m_maxLength;
    }

    /**
     * Return upper bound for edge length in x direction
     */
    get maxLengthX() {
        return this.m_maxLengthX;
    }

    /**
     * Return upper bound for edge length in y direction
     */
    get maxLengthY() {
        return this.m_maxLengthY;
    }

    /** @override */
    protected shouldSplitTriangle(a: Vector3, b: Vector3, c: Vector3): number | undefined {
        const shouldSplitAB = this.shouldSplitEdge(a, b);
        const shouldSplitBC = this.shouldSplitEdge(b, c);
        const shouldSplitCA = this.shouldSplitEdge(c, a);
        const shouldSplit = shouldSplitAB || shouldSplitBC || shouldSplitCA;

        if (!shouldSplit) {
            return;
        }

        const ab = a.distanceTo(b);
        const bc = b.distanceTo(c);
        const ca = c.distanceTo(a);
        const maxDistance = Math.max(
            shouldSplitAB ? ab : 0,
            shouldSplitBC ? bc : 0,
            shouldSplitCA ? ca : 0
        );
        if (ab === maxDistance) {
            return 0;
        } else if (bc === maxDistance) {
            return 1;
        } else if (ca === maxDistance) {
            return 2;
        }

        throw new Error("Could not split triangle.");
    }

    private shouldSplitEdge(a: Vector3, b: Vector3): boolean {
        switch (this.subdivisionMode) {
            case SubdivisionMode.All:
                return (
                    (a.y === b.y && Math.abs(a.x - b.x) > this.m_maxLengthX) ||
                    (a.x === b.x && Math.abs(a.y - b.y) > this.m_maxLengthY) ||
                    a.distanceTo(b) > this.m_maxLength
                );
            case SubdivisionMode.NoDiagonals:
                return (
                    (a.y === b.y && Math.abs(a.x - b.x) > this.m_maxLengthX) ||
                    (a.x === b.x && Math.abs(a.y - b.y) > this.m_maxLengthY)
                );
        }
    }
}
