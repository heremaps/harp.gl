/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Class that holds the vertex and index attributes for a [[Lines]] object.
 */
export class LineGeometry {
    vertices: number[] = [];
    indices: number[] = [];
}

/**
 * Creates a [[LineGeometry]] object out of a polyline.
 *
 * @param polyline Array of `numbers` describing a polyline.
 * @param geometry [[LineGeometry]] object used to store the vertex and index attributes.
 * @param highPrecision If `true` will create high-precision vertex information.
 */
export function createLineGeometry(
    polyline: ArrayLike<number>,
    geometry = new LineGeometry(),
    highPrecision = false
): LineGeometry {
    if (polyline.length === 0) {
        return geometry;
    }

    const pointCount = polyline.length / 2;
    const V = geometry.vertices;
    const I = geometry.indices;

    const N: number[] = [];
    const L: number[] = [];
    const tangents: Array<[number, number]> = [];
    const baseVertex = geometry.vertices.length / 12;

    let sum = 0;
    L.push(0);
    for (let i = 0; i < pointCount - 1; ++i) {
        const dx = polyline[(i + 1) * 2] - polyline[i * 2];
        const dy = polyline[(i + 1) * 2 + 1] - polyline[i * 2 + 1];
        const len = Math.sqrt(dx * dx + dy * dy);
        N[i] = len;
        sum = sum + len;
        L.push(sum);
        tangents.push([dx, dy]);
    }

    const isClosed =
        polyline[0] === polyline[polyline.length - 2] &&
        polyline[1] === polyline[polyline.length - 1];
    for (let i = 0; i < pointCount; ++i) {
        const x = polyline[i * 2];
        const y = polyline[i * 2 + 1];
        const T1 =
            isClosed && i === 0 ? tangents[tangents.length - 1] : tangents[Math.max(0, i - 1)];
        const T2 =
            isClosed && i === pointCount - 1
                ? tangents[0]
                : tangents[Math.min(i, tangents.length - 1)];
        if (i > 0) {
            const L1 = L[i - 1];
            const L2 = L[i];
            if (!highPrecision) {
                V.push(x, y, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, +1, -1);
                V.push(x, y, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, +1, +1);
            } else {
                const hx = Math.fround(x);
                const hy = Math.fround(y);
                const lx = x - hx;
                const ly = y - hy;
                V.push(hx, hy, lx, ly, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, +1, -1);
                V.push(hx, hy, lx, ly, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, +1, +1);
            }
        }
        if (i + 1 < pointCount) {
            const L1 = L[Math.min(i, L.length - 1)];
            const L2 = L[Math.min(i + 1, L.length - 1)];
            if (!highPrecision) {
                V.push(x, y, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, -1, -1);
                V.push(x, y, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, -1, +1);
            } else {
                const hx = Math.fround(x);
                const hy = Math.fround(y);
                const lx = x - hx;
                const ly = y - hy;
                V.push(hx, hy, lx, ly, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, -1, -1);
                V.push(hx, hy, lx, ly, L1, L2, T1[0], T1[1], T2[0], T2[1], 0, 0, -1, +1);
            }
        }
    }

    for (let i = 0; i < pointCount - 1; ++i) {
        const base = baseVertex + i * 4;
        I.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }

    return geometry;
}

/**
 * Creates a [[LineGeometry]] object out of a polyline.
 *
 * @param polyline Array of `numbers` describing a polyline.
 * @param geometry [[LineGeometry]] object used to store the vertex and index attributes.
 */
export function createSimpleLineGeometry(
    polyline: ArrayLike<number>,
    geometry = new LineGeometry()
): LineGeometry {
    if (polyline.length === 0) {
        return geometry;
    }

    const pointCount = polyline.length / 2;
    const V = geometry.vertices;
    const I = geometry.indices;
    let index = V.length / 3;

    for (let i = 0; i < pointCount; ++i, index++) {
        const x = polyline[i * 2];
        const y = polyline[i * 2 + 1];
        if (i > 0) {
            I.push(index);
        }
        if (i < pointCount - 1) {
            I.push(index);
        }
        V.push(x, y, 0);
    }

    return geometry;
}

/**
 * Describes vertex attribute parameters of interleaved buffer.
 */
export interface VertexAttributeDescriptor {
    name: string;
    itemSize: number;
    offset: number;
}

/**
 * Declares all the vertex attributes used for rendering a line using the [[SolidLineMaterial]].
 */
export const LINE_VERTEX_ATTRIBUTE_DESCRIPTORS: VertexAttributeDescriptor[] = [
    { name: "position", itemSize: 2, offset: 0 },
    { name: "segment", itemSize: 2, offset: 2 },
    { name: "tangents", itemSize: 4, offset: 4 },
    { name: "angles", itemSize: 2, offset: 8 },
    { name: "texcoord", itemSize: 2, offset: 10 }
];

/**
 * Declares all the vertex attributes used for rendering a line using the
 * [[HighPrecisionLineMaterial]].
 */
export const HP_LINE_VERTEX_ATTRIBUTE_DESCRIPTORS: VertexAttributeDescriptor[] = [
    { name: "position", itemSize: 2, offset: 0 },
    { name: "positionLow", itemSize: 2, offset: 2 },
    { name: "segment", itemSize: 2, offset: 4 },
    { name: "tangents", itemSize: 4, offset: 6 },
    { name: "angles", itemSize: 2, offset: 10 },
    { name: "texcoord", itemSize: 2, offset: 12 }
];

/**
 * Class used to render width-variable lines.
 */
export class Lines {
    /**
     * Adds all the attribute data needed to a [[BufferGeometry]] object for rendering `Lines`.
     *
     * @param vertices Array of vertex positions.
     * @param indices Array of vertex indices.
     * @param geometry [[BufferGeometry]] object which will store all the `Lines` attribute data.
     * @param highPrecision If `true` will create high-precision vertex information.
     */
    static createGeometry(
        vertices: ArrayLike<number>,
        indices: ArrayLike<number>,
        geometry: THREE.BufferGeometry,
        highPrecision = false
    ): THREE.BufferGeometry {
        const buffer = new THREE.InterleavedBuffer(
            new Float32Array(vertices),
            highPrecision ? 14 : 12
        );

        const descriptors = highPrecision
            ? HP_LINE_VERTEX_ATTRIBUTE_DESCRIPTORS
            : LINE_VERTEX_ATTRIBUTE_DESCRIPTORS;

        descriptors.forEach(descr => {
            const attribute = new THREE.InterleavedBufferAttribute(
                buffer,
                descr.itemSize,
                descr.offset,
                false
            );
            geometry.addAttribute(descr.name, attribute);
        });

        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        return geometry;
    }

    private readonly g = new LineGeometry();

    constructor(public highPrecision = false) {}

    /**
     * Clears the list of line strips.
     */
    clear() {
        this.g.vertices = [];
        this.g.indices = [];
    }

    /**
     * Add the given points to this line set.
     *
     * @param points Sequence of (x,y) coordinates.
     * @param isSimple `true` to create simple (nonsolid, nonextruded) lines. Defaults to `false`.
     */
    add(points: ArrayLike<number>, isSimple: boolean = false): this {
        if (!isSimple) {
            createLineGeometry(points, this.g, this.highPrecision);
        } else {
            createSimpleLineGeometry(points, this.g);
        }
        return this;
    }

    /**
     * Returns the list of vertices.
     */
    get vertices(): number[] {
        return this.g.vertices;
    }

    /**
     * Returns the list of indices.
     */
    get indices(): number[] {
        return this.g.indices;
    }

    /**
     * Creates a three.js geometry.
     */
    createGeometry(geometry?: THREE.BufferGeometry): THREE.BufferGeometry {
        if (geometry === undefined) {
            geometry = new THREE.BufferGeometry();
        }
        return Lines.createGeometry(this.g.vertices, this.g.indices, geometry, this.highPrecision);
    }
}
