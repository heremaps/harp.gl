/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Frustum, Matrix4, Plane, Ray, Vector3 } from "three";

import { OrientedBox3Like } from "./OrientedBox3Like";

function intersectsSlab(
    rayDir: Vector3,
    p: Vector3,
    axis: Vector3,
    extent: number,
    t: { min: number; max: number }
): boolean {
    const epsilon = 1e-20;
    const e = axis.dot(p);
    const f = axis.dot(rayDir);
    if (Math.abs(f) < epsilon) {
        // ray parallel to near/far slab lines.
        return Math.abs(e) <= extent;
    }

    // ray intersects near/far slab lines.
    const finv = 1 / f;
    const t1 = (e + extent) * finv;
    const t2 = (e - extent) * finv;
    if (t1 > t2) {
        // t1 is far intersect, t2 is near.
        if (t2 > t.min) {
            t.min = t2;
        }
        if (t1 < t.max) {
            t.max = t1;
        }
    } else {
        // t1 is near intersect, t2 is far.
        if (t1 > t.min) {
            t.min = t1;
        }
        if (t2 < t.max) {
            t.max = t2;
        }
    }
    return t.min <= t.max && t.max >= 0;
}

const tmpVec = new Vector3();
const tmpT = { min: -Infinity, max: Infinity };

export class OrientedBox3 implements OrientedBox3Like {
    /**
     * The position of the center of this `OrientedBox3`.
     */
    readonly position = new Vector3();

    /**
     * The x-axis of this `OrientedBox3`.
     */
    readonly xAxis = new Vector3(1, 0, 0);

    /**
     * The y-axis of this `OrientedBox3`.
     */
    readonly yAxis = new Vector3(0, 1, 0);

    /**
     * The z-axis of this `OrientedBox3`.
     */
    readonly zAxis = new Vector3(0, 0, 1);

    /**
     * The extents of this `OrientedBox3`.
     */
    readonly extents = new Vector3();

    /**
     * Creates a new `OrientedBox3`.
     */
    constructor();

    /**
     * Creates a new `OrientedBox3` with the given position, orientation and extents.
     *
     * @param position - The position of the center of the `OrientedBox3`.
     * @param rotationMatrix - The rotation of the `OrientedBox3`.
     * @param extents - The extents of the `OrientedBox3`.
     */
    constructor(position: Vector3, rotationMatrix: Matrix4, extents: Vector3);

    /**
     * Creates a new `OrientedBox3`.
     *
     * @hideconstructor
     */
    constructor(position?: Vector3, rotationMatrix?: Matrix4, extents?: Vector3) {
        if (position !== undefined) {
            this.position.copy(position);
        }

        if (rotationMatrix !== undefined) {
            rotationMatrix.extractBasis(this.xAxis, this.yAxis, this.zAxis);
        }

        if (extents !== undefined) {
            this.extents.copy(extents);
        }
    }

    /**
     * Create a copy of this [[OrientedBoundingBox]].
     */
    clone(): OrientedBox3 {
        const newBox = new OrientedBox3();
        newBox.copy(this);
        return newBox;
    }

    /**
     * Copies the values of `other` to this {@link OrientedBox3}.
     * @param other - The other {@link OrientedBox3} to copy.
     */
    copy(other: OrientedBox3) {
        this.position.copy(other.position);
        this.xAxis.copy(other.xAxis);
        this.yAxis.copy(other.yAxis);
        this.zAxis.copy(other.zAxis);
        this.extents.copy(other.extents);
    }

    /**
     * Gets the center position of this {@link OrientedBox3}.
     *
     * @param center - The returned center position.
     */
    getCenter(center = new Vector3()): Vector3 {
        return center.copy(this.position);
    }

    /**
     * Gets the size of this {@link OrientedBox3}.
     *
     * @param size - The returned size.
     */
    getSize(size = new Vector3()): Vector3 {
        return size.copy(this.extents).multiplyScalar(2);
    }

    /**
     * Gets the orientation matrix of this `OrientedBox3`.
     * @param matrix - The output orientation matrix.
     */
    getRotationMatrix(matrix: Matrix4 = new Matrix4()): Matrix4 {
        return matrix.makeBasis(this.xAxis, this.yAxis, this.zAxis);
    }

    /**
     * Checks intersection with the given `THREE.Frustum` or array of `THREE.Plane`s.
     *
     * @param frustumOrPlanes - Frustum or array of planes.
     */
    intersects(frustumOrPlanes: Plane[] | Frustum): boolean {
        const planes: Plane[] = Array.isArray(frustumOrPlanes)
            ? frustumOrPlanes
            : frustumOrPlanes.planes;

        for (const plane of planes) {
            const r =
                Math.abs(plane.normal.dot(this.xAxis) * this.extents.x) +
                Math.abs(plane.normal.dot(this.yAxis) * this.extents.y) +
                Math.abs(plane.normal.dot(this.zAxis) * this.extents.z);

            const d = plane.distanceToPoint(this.position);

            if (d + r < 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks intersection with the given ray.
     *
     * @param ray - The ray to test.
     * @returns distance from ray origin to intersection point if it exist, undefined otherwise.
     */
    intersectsRay(ray: Ray): number | undefined {
        // Slabs intersection algorithm.
        tmpT.min = -Infinity;
        tmpT.max = Infinity;
        tmpVec.copy(this.position).sub(ray.origin);
        if (!intersectsSlab(ray.direction, tmpVec, this.xAxis, this.extents.x, tmpT)) {
            return undefined;
        }
        if (!intersectsSlab(ray.direction, tmpVec, this.yAxis, this.extents.y, tmpT)) {
            return undefined;
        }
        if (!intersectsSlab(ray.direction, tmpVec, this.zAxis, this.extents.z, tmpT)) {
            return undefined;
        }

        return tmpT.min > 0 ? tmpT.min : tmpT.max;
    }

    /**
     * Returns true if this {@link OrientedBox3} contains the given point.
     *
     * @param point - A valid point.
     */
    contains(point: Vector3): boolean {
        const dx = point.x - this.position.x;
        const dy = point.y - this.position.y;
        const dz = point.z - this.position.z;
        const x = Math.abs(dx * this.xAxis.x + dy * this.xAxis.y + dz * this.xAxis.z);
        const y = Math.abs(dx * this.yAxis.x + dy * this.yAxis.y + dz * this.yAxis.z);
        const z = Math.abs(dx * this.zAxis.x + dy * this.zAxis.y + dz * this.zAxis.z);
        if (x > this.extents.x || y > this.extents.y || z > this.extents.z) {
            return false;
        }
        return true;
    }

    /**
     * Returns the distance from this {@link OrientedBox3} and the given `point`.
     *
     * @param point - A point.
     */
    distanceToPoint(point: Vector3): number {
        return Math.sqrt(this.distanceToPointSquared(point));
    }

    /**
     * Returns the squared distance from this {@link OrientedBox3} and the given `point`.
     *
     * @param point - A point.
     */
    distanceToPointSquared(point: Vector3): number {
        const d = new Vector3();
        d.subVectors(point, this.position);

        const lengths = [d.dot(this.xAxis), d.dot(this.yAxis), d.dot(this.zAxis)];

        let result = 0;

        for (let i = 0; i < 3; ++i) {
            const length = lengths[i];
            const extent = this.extents.getComponent(i);
            if (length < -extent) {
                const dd = extent + length;
                result += dd * dd;
            } else if (length > extent) {
                const dd = length - extent;
                result += dd * dd;
            }
        }

        return result;
    }
}
