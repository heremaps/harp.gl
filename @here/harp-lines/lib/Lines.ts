/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

// Preallocate temp variables used during line generation.
const tmpTangent0_2D = new THREE.Vector2();
const tmpTangent1_2D = new THREE.Vector2();
const tmpBitangent_2D = new THREE.Vector2();
const tmpTangent0_3D = new THREE.Vector3();
const tmpTangent1_3D = new THREE.Vector3();
const tmpBitangent_3D = new THREE.Vector3();
const SEGMENT_OFFSET = 0.00001;

/**
 * Describes vertex attribute parameters of interleaved buffer.
 */
interface VertexAttributeDescriptor {
    name: string;
    itemSize: number;
    offset: number;
}

/**
 * Declares all the vertex attributes used for rendering a line using the [[SolidLineMaterial]].
 */
const LINE_VERTEX_ATTRIBUTES: VertexAttributeDescriptor[][] = [
    [
        { name: "texcoord", itemSize: 2, offset: 0 },
        { name: "position", itemSize: 2, offset: 2 },
        { name: "bitangent", itemSize: 3, offset: 4 }
    ],
    [
        { name: "texcoord", itemSize: 2, offset: 0 },
        { name: "position", itemSize: 3, offset: 2 },
        { name: "bitangent", itemSize: 4, offset: 5 }
    ]
];

/** Stride size for line vertex data. */
const LINE_STRIDE = [7, 9];

/**
 * Declares all the vertex attributes used for rendering a line using the
 * [[HighPrecisionLineMaterial]].
 */
const HP_LINE_VERTEX_ATTRIBUTES: VertexAttributeDescriptor[][] = [
    [
        { name: "texcoord", itemSize: 2, offset: 0 },
        { name: "position", itemSize: 2, offset: 2 },
        { name: "positionLow", itemSize: 2, offset: 4 },
        { name: "bitangent", itemSize: 3, offset: 6 }
    ],
    [
        { name: "texcoord", itemSize: 2, offset: 0 },
        { name: "position", itemSize: 3, offset: 2 },
        { name: "positionLow", itemSize: 3, offset: 5 },
        { name: "bitangent", itemSize: 4, offset: 8 }
    ]
];

/** Stride size for high precision line vertex data. */
const HP_LINE_STRIDE = [9, 12];

/**
 * Class that holds the vertex and index attributes for a [[Lines]] object.
 */
export class LineGeometry {
    readonly dimensions: 2 | 3;
    vertices: number[] = [];
    indices: number[] = [];

    constructor(params: { dimensions: 2 | 3 }) {
        this.dimensions = params.dimensions;
    }
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
    geometry = new LineGeometry({ dimensions: 2 }),
    highPrecision: boolean = false
): LineGeometry {
    if (polyline.length === 0) {
        return geometry;
    }

    const is3D = geometry.dimensions === 3;
    const stride = highPrecision
        ? HP_LINE_STRIDE[geometry.dimensions - 2]
        : LINE_STRIDE[geometry.dimensions - 2];

    const pointCount = polyline.length / geometry.dimensions;
    const segments = new Array<number>(pointCount);
    const tangents = new Array<number>(polyline.length - geometry.dimensions);
    const baseVertex = geometry.vertices.length / stride;

    // Compute segments and tangents.
    let sum = SEGMENT_OFFSET;
    segments[0] = sum;
    for (let i = 0; i < pointCount - 1; ++i) {
        let sqrLength = 0;
        for (let j = 0; j < geometry.dimensions; ++j) {
            const d =
                polyline[(i + 1) * geometry.dimensions + j] - polyline[i * geometry.dimensions + j];
            tangents[i * geometry.dimensions + j] = d;
            sqrLength += d * d;
        }
        const len = Math.sqrt(sqrLength);
        sum = sum + len;
        segments[i + 1] = sum;
    }

    // Check if we're working with a closed line.
    let isClosed = true;
    for (let j = 0; j < geometry.dimensions; ++j) {
        isClosed = isClosed && polyline[j] === polyline[polyline.length - geometry.dimensions + j];
    }

    // Select the correct dimensions for the tangents.
    const tmpTangent0 = is3D ? tmpTangent0_3D : tmpTangent0_2D;
    const tmpTangent1 = is3D ? tmpTangent1_3D : tmpTangent1_2D;
    const tmpBitangent = is3D ? tmpBitangent_3D : tmpBitangent_2D;

    for (let i = 0; i < pointCount; ++i) {
        // Retrieve the per-point tangents.
        const T1 =
            isClosed && i === 0
                ? tangents.length - geometry.dimensions
                : Math.max(0, i - 1) * geometry.dimensions;
        const T2 =
            isClosed && i === pointCount - 1
                ? 0
                : Math.min(i * geometry.dimensions, tangents.length - geometry.dimensions);

        // Process v0 and v1.
        if (i > 0) {
            for (let v = -1; v <= 1; v += 2) {
                // Store the segment and texcoord attributes.
                geometry.vertices.push(segments[i - 1], segments[i] * v);

                // Store the position attribute (component-dependant).
                for (let j = 0; j < geometry.dimensions; ++j) {
                    if (!highPrecision) {
                        geometry.vertices.push(polyline[i * geometry.dimensions + j]);
                    } else {
                        const highComp = Math.fround(polyline[i * geometry.dimensions + j]);
                        const lowComp = polyline[i * geometry.dimensions + j] - highComp;
                        geometry.vertices.push(highComp, lowComp);
                    }
                }

                // Store the bitangent attribute (component-dependant).
                for (let j = 0; j < geometry.dimensions; ++j) {
                    tmpTangent0.setComponent(j, tangents[T1 + j]);
                    tmpTangent1.setComponent(j, tangents[T2 + j]);
                }
                const angle = is3D
                    ? computeBitangent3D(
                          tmpTangent0_3D.normalize(),
                          tmpTangent1_3D.normalize(),
                          tmpBitangent_3D
                      )
                    : computeBitangent2D(
                          tmpTangent0_2D.normalize(),
                          tmpTangent1_2D.normalize(),
                          tmpBitangent_2D
                      );
                geometry.vertices.push(...tmpBitangent.toArray(), angle);
            }
        }

        // Process v2 and v3.
        if (i + 1 < pointCount) {
            for (let v = -1; v <= 1; v += 2) {
                // Store the segment and texcoord attributes.
                geometry.vertices.push(
                    segments[Math.min(i, segments.length - 1)] * -1,
                    segments[Math.min(i + 1, segments.length - 1)] * v
                );

                // Store the position attribute (component-dependant).
                for (let j = 0; j < geometry.dimensions; ++j) {
                    if (!highPrecision) {
                        geometry.vertices.push(polyline[i * geometry.dimensions + j]);
                    } else {
                        const highComp = Math.fround(polyline[i * geometry.dimensions + j]);
                        const lowComp = polyline[i * geometry.dimensions + j] - highComp;
                        geometry.vertices.push(highComp, lowComp);
                    }
                }

                // Store the bitangent attribute (component-dependant).
                for (let j = 0; j < geometry.dimensions; ++j) {
                    tmpTangent0.setComponent(j, tangents[T1 + j]);
                    tmpTangent1.setComponent(j, tangents[T2 + j]);
                }
                const angle = is3D
                    ? computeBitangent3D(
                          tmpTangent0_3D.normalize(),
                          tmpTangent1_3D.normalize(),
                          tmpBitangent_3D
                      )
                    : computeBitangent2D(
                          tmpTangent0_2D.normalize(),
                          tmpTangent1_2D.normalize(),
                          tmpBitangent_2D
                      );
                geometry.vertices.push(...tmpBitangent.toArray(), angle);
            }
        }
    }

    // Store the triangle indices in the final index buffer.
    for (let i = 0; i < pointCount - 1; ++i) {
        const base = baseVertex + i * 4;
        geometry.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
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
    geometry = new LineGeometry({ dimensions: 2 })
): LineGeometry {
    if (polyline.length === 0) {
        return geometry;
    }

    const pointCount = polyline.length / geometry.dimensions;
    let index = geometry.vertices.length / geometry.dimensions;

    for (let i = 0; i < pointCount; ++i, index++) {
        if (i > 0) {
            geometry.indices.push(index);
        }
        if (i < pointCount - 1) {
            geometry.indices.push(index);
        }
        for (let j = 0; j < geometry.dimensions; ++j) {
            geometry.vertices.push(polyline[i * geometry.dimensions + j]);
        }
    }

    return geometry;
}

/**
 * Class used to render groups (or batches) of width-variable lines.
 */
export class LineGroup {
    /**
     * Adds all the attribute data needed to a [[BufferGeometry]] object for rendering `Lines`.
     *
     * @param vertices Array of vertex positions.
     * @param indices Array of vertex indices.
     * @param geometry [[BufferGeometry]] object which will store all the `Lines` attribute data.
     * @param dimensionality Number of components per polyline point.
     * @param highPrecision If `true` will create high-precision vertex information.
     */
    static createGeometry(
        vertices: ArrayLike<number>,
        indices: ArrayLike<number>,
        geometry: THREE.BufferGeometry,
        dimensionality: 2 | 3 = 2,
        highPrecision = false
    ): THREE.BufferGeometry {
        const stride = highPrecision
            ? HP_LINE_STRIDE[dimensionality - 2]
            : LINE_STRIDE[dimensionality - 2];
        const descriptors = highPrecision
            ? HP_LINE_VERTEX_ATTRIBUTES[dimensionality - 2]
            : LINE_VERTEX_ATTRIBUTES[dimensionality - 2];

        const buffer = new THREE.InterleavedBuffer(new Float32Array(vertices), stride);
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

    readonly dimensions: 2 | 3 = 2;
    readonly highPrecision: boolean = false;
    private readonly m_geometry: LineGeometry;

    constructor(params?: { dimensions: 2 | 3; highPrecision?: boolean }) {
        if (params !== undefined) {
            this.dimensions = params.dimensions;
            if (params.highPrecision !== undefined) {
                this.highPrecision = params.highPrecision;
            }
        }
        this.m_geometry = new LineGeometry({ dimensions: this.dimensions });
    }

    /**
     * Clears the list of line strips.
     */
    clear() {
        this.m_geometry.vertices = [];
        this.m_geometry.indices = [];
    }

    /**
     * Add the given points to this line set.
     *
     * @param points Sequence of (x,y) coordinates.
     * @param isSimple `true` to create simple (nonsolid, nonextruded) lines. Defaults to `false`.
     */
    add(points: ArrayLike<number>, isSimple: boolean = false): this {
        if (!isSimple) {
            createLineGeometry(points, this.m_geometry, this.highPrecision);
        } else {
            createSimpleLineGeometry(points, this.m_geometry);
        }
        return this;
    }

    /**
     * Returns the list of vertices.
     */
    get vertices(): number[] {
        return this.m_geometry.vertices;
    }

    /**
     * Returns the list of indices.
     */
    get indices(): number[] {
        return this.m_geometry.indices;
    }

    /**
     * Returns the list of [[VertexAttributeDescriptor]]s.
     */
    get vertexAttributes(): VertexAttributeDescriptor[] {
        return this.highPrecision
            ? HP_LINE_VERTEX_ATTRIBUTES[this.dimensions - 2]
            : LINE_VERTEX_ATTRIBUTES[this.dimensions - 2];
    }

    /**
     * Returns the vertex attribute stride.
     */
    get stride(): number {
        return this.highPrecision
            ? HP_LINE_STRIDE[this.dimensions - 2]
            : LINE_STRIDE[this.dimensions - 2];
    }

    /**
     * Creates a three.js geometry.
     */
    createGeometry(geometry?: THREE.BufferGeometry): THREE.BufferGeometry {
        if (geometry === undefined) {
            geometry = new THREE.BufferGeometry();
        }
        return LineGroup.createGeometry(
            this.m_geometry.vertices,
            this.m_geometry.indices,
            geometry,
            this.dimensions,
            this.highPrecision
        );
    }
}

function computeBitangent2D(t0: THREE.Vector2, t1: THREE.Vector2, bt: THREE.Vector2): number {
    const angle = Math.atan2(t0.x * t1.y - t0.y * t1.x, t0.x * t1.x + t0.y * t1.y);
    bt.copy(t0)
        .add(t1)
        .normalize()
        .set(bt.y, -bt.x);
    return angle;
}

function computeBitangent3D(t0: THREE.Vector3, t1: THREE.Vector3, bt: THREE.Vector3): number {
    // NOTE: We're assuming a 2D projection on the XY plane here.
    // TODO: Add projection information to the lines to get appropriate bitangents.
    const angle = Math.atan2(t0.x * t1.y - t0.y * t1.x, t0.x * t1.x + t0.y * t1.y);
    bt.copy(t0)
        .add(t1)
        .normalize()
        .set(bt.y, -bt.x, bt.z);
    return angle;
}
