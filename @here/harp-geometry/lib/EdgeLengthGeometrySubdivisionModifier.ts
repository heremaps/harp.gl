/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box3Like, GeoBox, Projection, sphereProjection } from "@here/harp-geoutils";
import { Vector3 } from "three";
import { SubdivisionModifier } from "./SubdivisionModifier";

const VERTEX_POSITION_CACHE = [new Vector3(), new Vector3()];

export enum SubdivisionMode {
    /**
     * Subdivide all edges
     */
    All,
    /**
     * Only subdivide edges that are on the geobox boundaries
     */
    OnlyEdges,
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
    private m_projectedBox: Box3Like;
    private m_maxLength: number;
    /**
     * Constructs a new [[EdgeLengthGeometrySubdivisionModifier]].
     *
     * @param subdivision The subdivision factor
     * @param geoBox The geo bounding box of a tile
     * @param subdivisionMode Configures what edges to divide
     * @param projection The projection that defines the world space of this geometry.
     */
    constructor(
        readonly subdivision: number,
        readonly geoBox: GeoBox,
        readonly subdivisionMode: SubdivisionMode = SubdivisionMode.All,
        readonly projection: Projection = sphereProjection
    ) {
        super();

        const northEast = projection.projectPoint(geoBox.northEast, VERTEX_POSITION_CACHE[0]);
        const southWest = projection.projectPoint(geoBox.southWest, VERTEX_POSITION_CACHE[1]);
        this.m_projectedBox = {
            min: {
                x: Math.min(Math.fround(northEast.x), Math.fround(southWest.x)),
                y: Math.min(Math.fround(northEast.y), Math.fround(southWest.y)),
                z: Math.min(Math.fround(northEast.z), Math.fround(southWest.z))
            },
            max: {
                x: Math.max(Math.fround(northEast.x), Math.fround(southWest.x)),
                y: Math.max(Math.fround(northEast.y), Math.fround(southWest.y)),
                z: Math.max(Math.fround(northEast.z), Math.fround(southWest.z))
            }
        };
        this.m_maxLength =
            Math.max(
                this.m_projectedBox.max.x - this.m_projectedBox.min.x,
                this.m_projectedBox.max.y - this.m_projectedBox.min.y,
                this.m_projectedBox.max.z - this.m_projectedBox.min.z
            ) / subdivision;

        // Increase max length slightly to account for precision errors
        if (subdivisionMode === SubdivisionMode.All) {
            this.m_maxLength *= 1.1;
        }
    }

    /**
     * Return upper bound for edge length
     */
    get maxLength() {
        return this.m_maxLength;
    }

    /** @override */
    protected shouldSplitTriangle(a: Vector3, b: Vector3, c: Vector3): number | undefined {
        const ab = this.getLength(a, b);
        const bc = this.getLength(b, c);
        const ca = this.getLength(c, a);

        // find the maximum angle
        const maxLength = Math.max(ab, bc, ca);

        // split the triangle if needed.
        if (maxLength < this.m_maxLength) {
            return undefined;
        }

        if (maxLength === ab) {
            return 0;
        } else if (maxLength === bc) {
            return 1;
        } else if (maxLength === ca) {
            return 2;
        }

        throw new Error("failed to split triangle");
    }

    private getLength(a: Vector3, b: Vector3): number {
        switch (this.subdivisionMode) {
            case SubdivisionMode.All:
                return a.distanceTo(b);
            case SubdivisionMode.NoDiagonals:
                // Compute length only for horizontal and vertical lines
                if (a.x === b.x || a.y === b.y) {
                    return a.distanceTo(b);
                }
                break;
            case SubdivisionMode.OnlyEdges:
                // Compute length only for lines on the edge of the tile
                if (
                    (a.x === this.m_projectedBox.min.x && b.x === this.m_projectedBox.min.x) ||
                    (a.y === this.m_projectedBox.min.y && b.y === this.m_projectedBox.min.y) ||
                    (a.x === this.m_projectedBox.max.x && b.x === this.m_projectedBox.max.x) ||
                    (a.y === this.m_projectedBox.max.y && b.y === this.m_projectedBox.max.y)
                ) {
                    return a.distanceTo(b);
                }
                break;
        }

        return 0;
    }
}
