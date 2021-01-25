/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const POINTS = [0, 1, 2, 1, 3, 2];
const BEVEL_POINTS = [0, 1, 3, 3, 1, 2, 0, 3, 4, 5, 4, 3];

const SECTORS_IN_CIRCLE = 8;
const STEP = Math.PI / SECTORS_IN_CIRCLE;

/**
 * Adds a half-circle geometry to original line
 *
 * @param x - The line end X (used as circle center X)
 * @param y - The line end Y (used as circle center Y)
 * @param lineAngle - The cap incline angle
 * @param radius - The cap (circle) radius
 * @param vertices - The input vertex buffer (cap vertices are added there)
 * @param indices - The input index buffer (cap indices are is added there)
 */
function addCircle(
    x: number,
    y: number,
    lineAngle: number,
    radius: number,
    vertices: number[],
    indices: number[]
) {
    const baseVertex = vertices.length / 3;

    // Add cap center to vertices directly (it doesn't need rotation)
    vertices.push(x, y, 0);

    for (let i = 0; i < SECTORS_IN_CIRCLE + 1; ++i) {
        const angle = STEP * i + Math.PI / 2 + lineAngle; // Start angle is -90deg
        vertices.push(x + radius * Math.cos(angle), y + radius * Math.sin(angle), 0);

        indices.push(
            baseVertex,
            baseVertex + i + 1,
            baseVertex + ((i + 1) % (SECTORS_IN_CIRCLE + 1)) + 1
        );
    }
}

/**
 * Returns the number of points in circle used for caps.
 *
 * @param lineWidth - Width of line.
 */
export function numCirclePoints(lineWidth: number): number {
    return SECTORS_IN_CIRCLE + 1;
}

/**
 * Create a triangle mesh from the given polyline.
 *
 * @param points - Sequence of (x,y,z) coordinates.
 * @param width - The width of the extruded line.
 * @param vertices - The output vertex buffer.
 * @param indices - The output index buffer.
 * @param startWithCircle - `true` if the line should start will a circle.
 * @param endWithCircle - `true` if the line should end with a circle.
 */
export function triangulateLine(
    points: ArrayLike<number>,
    width: number,
    vertices: number[],
    indices: number[],
    startWithCircle = true,
    endWithCircle = startWithCircle
) {
    if (points.length < 3) {
        return;
    }

    // This vector is used for computing cap angle
    const angleVec = new THREE.Vector2();

    if (startWithCircle) {
        // Define lineAngle as (direction - origin) vector angle to X axis
        const lineAngle =
            points.length !== 3
                ? angleVec.set(points[3] - points[0], points[4] - points[1]).angle()
                : 0;

        addCircle(points[0], points[1], lineAngle, width, vertices, indices);
    }

    const baseVertex = vertices.length / 3;

    // bt = Bitangent (i.e. extrusion vector)
    const prevBt = new THREE.Vector3();
    const p = new THREE.Vector3(); // current point
    const n = new THREE.Vector3(); // next point
    const bt = new THREE.Vector3();
    const averageBt = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const p3 = new THREE.Vector3();

    const N = points.length / 3;

    let vertexOffset = 0;
    for (let i = 0; i < N; ++i) {
        let useBevel = false;
        p.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);

        if (i + 1 < N) {
            n.set(points[(i + 1) * 3], points[(i + 1) * 3 + 1], points[(i + 1) * 3 + 2]);

            bt.copy(n).sub(p).normalize().cross(UNIT_Z);

            averageBt.copy(bt);

            if (i > 0) {
                averageBt.add(prevBt).multiplyScalar(1.0 - 0.5 * bt.dot(prevBt));

                useBevel = prevBt.angleTo(bt) > Math.PI / 2;

                if (useBevel) {
                    const inclineWidth = width / Math.cos(bt.angleTo(prevBt) / 2);

                    p0.copy(bt).add(prevBt).normalize().multiplyScalar(-inclineWidth).add(p);

                    p1.copy(prevBt).multiplyScalar(width).add(p);

                    // p2 is used for "miter" connections
                    p2.copy(bt).add(prevBt).normalize().multiplyScalar(inclineWidth).add(p);

                    p3.copy(bt).multiplyScalar(width).add(p);
                }
            }

            if (useBevel) {
                vertices.push(
                    p0.x,
                    p0.y,
                    p0.z,
                    p1.x,
                    p1.y,
                    p1.z,
                    p2.x,
                    p2.y,
                    p2.z,
                    p3.x,
                    p3.y,
                    p3.z
                );
            } else {
                p0.copy(averageBt).multiplyScalar(-width).add(p);

                p1.copy(averageBt).multiplyScalar(width).add(p);

                vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
            }

            prevBt.copy(bt);
        } else {
            p0.copy(prevBt).multiplyScalar(-width).add(p);

            p1.copy(prevBt).multiplyScalar(width).add(p);

            vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }

        if (i !== N - 1) {
            (useBevel ? BEVEL_POINTS : POINTS).forEach(o =>
                indices.push(baseVertex + vertexOffset + o)
            );
            vertexOffset += useBevel ? 4 : 2;
        }
    }

    if (endWithCircle) {
        const lineAngle =
            points.length !== 2
                ? angleVec
                      .set(
                          points[(N - 3) * 3] - points[(N - 2) * 3],
                          points[(N - 3) * 3 + 1] - points[(N - 2) * 3 + 1]
                      )
                      .angle()
                : Math.PI;

        addCircle(
            points[(N - 2) * 3],
            points[(N - 2) * 3 + 1],
            lineAngle,
            width,
            vertices,
            indices
        );
    }
}

/**
 * Reconstruct the original points of a line from the vertices of the triangulated line.
 *
 * @param inBuffer - Buffer with vertices.
 * @param startOffset - Start index, will differ from `0` if the line has caps.
 * @returns Buffer containing the original points of the triangulated line.
 */
export function reconstructLine(inBuffer: Float32Array, startOffset: number): Float32Array {
    const outBuffer = new Float32Array(inBuffer.length / 2);

    for (let i = startOffset * 3, i2 = i * 2; i < outBuffer.length; i += 3, i2 += 6) {
        outBuffer[i] = inBuffer[i2] + (inBuffer[i2 + 3] - inBuffer[i2]) * 0.5;
        outBuffer[i + 1] = inBuffer[i2 + 1] + (inBuffer[i2 + 3 + 1] - inBuffer[i2 + 1]) * 0.5;
        outBuffer[i + 2] = inBuffer[i2 + 2] + (inBuffer[i2 + 3 + 2] - inBuffer[i2 + 2]) * 0.5;
    }
    return outBuffer;
}

/**
 * Extract the line width from a triangulated line.
 *
 * @param inBuffer - Array of vertex elements of a triangulated line.
 * @param startIndex - Start index, will differ from `0` if the line has caps.
 */
export function reconstructLineWidth(inBuffer: Float32Array, startIndex: number): number {
    const xd = inBuffer[startIndex * 2 + 3] - inBuffer[startIndex * 2];
    const yd = inBuffer[startIndex * 2 + 3 + 1] - inBuffer[startIndex * 2 + 1];
    const zd = inBuffer[startIndex * 2 + 3 + 2] - inBuffer[startIndex * 2 + 2];

    return Math.sqrt(xd * xd + yd * yd + zd * zd) * 0.5;
}
