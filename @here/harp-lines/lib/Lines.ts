/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Projection } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";

// Preallocate temp variables used during line generation.
const tmpV = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpTangent0 = new THREE.Vector3();
const tmpTangent1 = new THREE.Vector3();
const tmpBitangent = new THREE.Vector3();
const SEGMENT_OFFSET = 0.1;

/**
 * Describes vertex attribute parameters of interleaved buffer.
 */
interface VertexAttributeDescriptor {
    name: string;
    itemSize: number;
    offset: number;
}

interface VertexDescriptor {
    attributes: VertexAttributeDescriptor[];
    stride: number;
}

/**
 * Declares all the vertex attributes used for rendering a line using the [[SolidLineMaterial]].
 */

/** Base line vertex attributes. */
const LINE_VERTEX_ATTRIBUTES: VertexDescriptor = {
    attributes: [
        // The "extrusionCoord" is a vec4 which represents:
        // xy: Extrusion coordinates
        // sign(xy): Extrusion direction
        // z: Line length
        { name: "extrusionCoord", itemSize: 3, offset: 0 },
        { name: "position", itemSize: 3, offset: 3 },
        { name: "tangent", itemSize: 3, offset: 6 },
        { name: "bitangent", itemSize: 4, offset: 9 }
    ],
    stride: 13
};

/** Optional normal and uv coordinates. */
const NORMAL_UV_VERTEX_ATTRIBUTES: VertexDescriptor = {
    attributes: [
        { name: "uv", itemSize: 2, offset: LINE_VERTEX_ATTRIBUTES.stride },
        { name: "normal", itemSize: 3, offset: LINE_VERTEX_ATTRIBUTES.stride + 2 }
    ],
    stride: 5
};

/** Base line vertex attributes plus normals and uv coordinates. */
const LINE_VERTEX_ATTRIBUTES_NUV: VertexDescriptor = {
    attributes: [...LINE_VERTEX_ATTRIBUTES.attributes, ...NORMAL_UV_VERTEX_ATTRIBUTES.attributes],
    stride: LINE_VERTEX_ATTRIBUTES.stride + NORMAL_UV_VERTEX_ATTRIBUTES.stride
};

/**
 * Declares all the vertex attributes used for rendering a line using the
 * [[HighPrecisionLineMaterial]].
 */
const HP_LINE_VERTEX_ATTRIBUTES: VertexDescriptor = {
    attributes: [
        { name: "extrusionCoord", itemSize: 2, offset: 0 },
        { name: "position", itemSize: 3, offset: 2 },
        { name: "positionLow", itemSize: 3, offset: 5 },
        { name: "tangent", itemSize: 3, offset: 8 },
        { name: "bitangent", itemSize: 4, offset: 11 }
    ],
    stride: 15
};

/** High precision line vertex attributes plus normals and uv coordinates. */
const HP_LINE_VERTEX_ATTRIBUTES_NUV: VertexDescriptor = {
    attributes: [
        ...HP_LINE_VERTEX_ATTRIBUTES.attributes,
        ...NORMAL_UV_VERTEX_ATTRIBUTES.attributes
    ],
    stride: HP_LINE_VERTEX_ATTRIBUTES.stride + NORMAL_UV_VERTEX_ATTRIBUTES.stride
};

/**
 * Class that holds the vertex and index attributes for a [[Lines]] object.
 */
export class LineGeometry {
    vertices: number[] = [];
    vertexColors: number[] = [];
    indices: number[] = [];
}

function getVertexDescriptor(hasNormalsAndUvs: boolean, highPrecision: boolean): VertexDescriptor {
    if (highPrecision) {
        return hasNormalsAndUvs ? HP_LINE_VERTEX_ATTRIBUTES_NUV : HP_LINE_VERTEX_ATTRIBUTES;
    } else {
        return hasNormalsAndUvs ? LINE_VERTEX_ATTRIBUTES_NUV : LINE_VERTEX_ATTRIBUTES;
    }
}

/**
 * Creates a [[LineGeometry]] object out of a polyline.
 *
 * @param center - Center of the polyline.
 * @param polyline - Array of `numbers` describing a polyline.
 * @param offsets - Array of `numbers` representing line segment offsets.
 * @param uvs - Array of `numbers` representing texture coordinates.
 * @param colors - Array of `numbers` describing a polyline's colors.
 * @param geometry - [[LineGeometry]] object used to store the vertex and index attributes.
 * @param highPrecision - If `true` will create high-precision vertex information.
 */
export function createLineGeometry(
    center: THREE.Vector3,
    polyline: ArrayLike<number>,
    projection: Projection,
    offsets?: ArrayLike<number>,
    uvs?: ArrayLike<number>,
    colors?: ArrayLike<number>,
    geometry = new LineGeometry(),
    highPrecision: boolean = false
): LineGeometry {
    if (polyline.length === 0) {
        return geometry;
    }

    const stride = getVertexDescriptor(uvs !== undefined, highPrecision).stride;

    const pointCount = polyline.length / 3;
    const segments = new Array<number>(pointCount);
    const tangents = new Array<number>(polyline.length - 3);
    const baseVertex = geometry.vertices.length / stride;

    const hasSegmentOffsets = offsets !== undefined && offsets.length > 0;
    const hasTexCoords = uvs !== undefined && uvs.length > 0;
    const vertexColors = colors !== undefined && colors.length && polyline.length;

    assert(!hasSegmentOffsets || offsets!.length === pointCount);
    assert(!hasTexCoords || uvs!.length / 2 === pointCount);
    assert(!vertexColors || colors!.length === polyline.length);

    // Compute segments and tangents.
    let sum = SEGMENT_OFFSET;
    segments[0] = sum;
    for (let i = 0; i < pointCount - 1; ++i) {
        let sqrLength = 0;
        for (let j = 0; j < 3; ++j) {
            const d = polyline[(i + 1) * 3 + j] - polyline[i * 3 + j];
            tangents[i * 3 + j] = d;
            sqrLength += d * d;
        }
        const len = Math.sqrt(sqrLength);
        sum = sum + len;
        segments[i + 1] = sum;
    }

    const lineCoverage = hasSegmentOffsets
        ? Math.abs(offsets![offsets!.length - 1] - offsets![0])
        : 1.0;
    const lineLength = segments[segments.length - 1] / lineCoverage;

    // Override the segments if offsets are explicitly provided.
    if (hasSegmentOffsets) {
        for (let i = 0; i < pointCount; ++i) {
            segments[i] = offsets![i] * lineLength + SEGMENT_OFFSET;
        }
    }

    // Check if we're working with a closed line.
    let isClosed = true;
    for (let j = 0; j < 3; ++j) {
        isClosed = isClosed && polyline[j] === polyline[polyline.length - 3 + j];
    }

    const tmpVertices: number[] = [];

    const addVertexPair = (
        i: number,
        T1: number,
        T2: number,
        segment: number,
        extrusionCoord: number
    ) => {
        tmpVertices.length = 0;

        // Store the segment and extrusionCoord attributes.
        geometry.vertices.push(segment, extrusionCoord * -1, lineLength);
        tmpVertices.push(segment, extrusionCoord * 1, lineLength);

        // Store the position attribute (component-dependant).
        for (let j = 0; j < 3; ++j) {
            if (!highPrecision) {
                geometry.vertices.push(polyline[i * 3 + j]);
                tmpVertices.push(polyline[i * 3 + j]);
            } else {
                const highComp = Math.fround(polyline[i * 3 + j]);
                const lowComp = polyline[i * 3 + j] - highComp;
                geometry.vertices.push(highComp, lowComp);
                tmpVertices.push(highComp, lowComp);
            }
            tmpNormal.setComponent(j, polyline[i * 3 + j]);
        }

        // Store the bitangent attribute (component-dependant).
        for (let j = 0; j < 3; ++j) {
            tmpTangent0.setComponent(j, tangents[T1 + j]);
            tmpTangent1.setComponent(j, tangents[T2 + j]);
        }
        tmpTangent0.normalize();
        geometry.vertices.push(tmpTangent0.x, tmpTangent0.y, tmpTangent0.z);
        tmpVertices.push(tmpTangent0.x, tmpTangent0.y, tmpTangent0.z);
        tmpNormal.add(center); // tmpNormal contains world position
        projection.surfaceNormal(tmpNormal, tmpNormal);
        const angle = computeBitangent(
            tmpNormal,
            tmpTangent0,
            tmpTangent1.normalize(),
            tmpBitangent
        );
        geometry.vertices.push(tmpBitangent.x, tmpBitangent.y, tmpBitangent.z, angle);
        tmpVertices.push(tmpBitangent.x, tmpBitangent.y, tmpBitangent.z, angle);

        if (hasTexCoords) {
            // uvs
            geometry.vertices.push(uvs![i * 2], uvs![i * 2 + 1]);
            tmpVertices.push(uvs![i * 2], uvs![i * 2 + 1]);
            // normals
            geometry.vertices.push(tmpNormal.x, tmpNormal.y, tmpNormal.z);
            tmpVertices.push(tmpNormal.x, tmpNormal.y, tmpNormal.z);
        }

        geometry.vertices.push(...tmpVertices);

        // Add vertex colors (if supplied).
        if (vertexColors) {
            geometry.vertexColors.push(colors![i * 3], colors![i * 3 + 1], colors![i * 3 + 2]);
            geometry.vertexColors.push(colors![i * 3], colors![i * 3 + 1], colors![i * 3 + 2]);
        }
    };

    for (let i = 0; i < pointCount; ++i) {
        // Retrieve the per-point tangents.
        const T1 = isClosed && i === 0 ? tangents.length - 3 : Math.max(0, i - 1) * 3;
        const T2 = isClosed && i === pointCount - 1 ? 0 : Math.min(i * 3, tangents.length - 3);

        // Process v0 and v1.
        if (i > 0) {
            addVertexPair(i, T1, T2, segments[i - 1], segments[i]);
        }

        // Process v2 and v3.
        if (i + 1 < pointCount) {
            addVertexPair(
                i,
                T1,
                T2,
                segments[Math.min(i, segments.length - 1)] * -1,
                segments[Math.min(i + 1, segments.length - 1)]
            );
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
 * @param polyline - Array of `numbers` describing a polyline.
 * @param colors - Array of `numbers` describing a polyline's colors.
 * @param geometry - [[LineGeometry]] object used to store the vertex and index attributes.
 */
export function createSimpleLineGeometry(
    polyline: ArrayLike<number>,
    colors?: ArrayLike<number>,
    geometry = new LineGeometry()
): LineGeometry {
    if (polyline.length === 0) {
        return geometry;
    }

    const pointCount = polyline.length / 3;
    let index = geometry.vertices.length / 3;

    const vertexColors = colors !== undefined && colors.length && polyline.length;

    for (let i = 0; i < pointCount; ++i, index++) {
        if (i > 0) {
            geometry.indices.push(index);
        }
        if (i < pointCount - 1) {
            geometry.indices.push(index);
        }
        for (let j = 0; j < 3; ++j) {
            geometry.vertices.push(polyline[i * 3 + j]);
            if (vertexColors) {
                geometry.vertexColors.push(colors![i * 3 + j]);
            }
        }
    }

    return geometry;
}

/**
 * Class used to render groups (or batches) of width-variable lines (in the same tile).
 */
export class LineGroup {
    /**
     * Adds all the attribute data needed to a [[BufferGeometry]] object for rendering `Lines`.
     *
     * @param vertices - Array of vertex attributes.
     * @param colors - Array of vertex colors.
     * @param indices - Array of vertex indices.
     * @param geometry - [[BufferGeometry]] object which will store all the `Lines` attribute data.
     * @param hasNormalsAnUvs - Whether vertices have normal and uv coordinates as attributes.
     * @param highPrecision - If `true` will create high-precision vertex information.
     * @param isSimple - `true` to create simple (nonsolid, nonextruded) lines. Defaults to `false`.
     */
    static createGeometry(
        vertices: ArrayLike<number>,
        colors: ArrayLike<number>,
        indices: ArrayLike<number>,
        geometry: THREE.BufferGeometry,
        hasNormalsAndUvs: boolean = false,
        highPrecision = false,
        isSimple = false
    ): THREE.BufferGeometry {
        if (isSimple) {
            geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(new Float32Array(vertices), 3)
            );
            if (colors.length === vertices.length) {
                geometry.setAttribute(
                    "color",
                    new THREE.BufferAttribute(new Float32Array(colors), 3)
                );
            }
            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            return geometry;
        } else {
            const vertexDescriptor = getVertexDescriptor(hasNormalsAndUvs, highPrecision);

            const buffer = new THREE.InterleavedBuffer(
                new Float32Array(vertices),
                vertexDescriptor.stride
            );
            vertexDescriptor.attributes.forEach(descr => {
                const attribute = new THREE.InterleavedBufferAttribute(
                    buffer,
                    descr.itemSize,
                    descr.offset,
                    false
                );
                geometry.setAttribute(descr.name, attribute);
            });
            if (colors.length === vertices.length) {
                geometry.setAttribute(
                    "color",
                    new THREE.BufferAttribute(new Float32Array(colors), 3)
                );
            }

            geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

            return geometry;
        }
    }

    private readonly m_geometry: LineGeometry;

    constructor(
        readonly hasNormalsAndUvs: boolean = false,
        readonly highPrecision: boolean = false,
        readonly isSimple: boolean = false
    ) {
        this.m_geometry = new LineGeometry();
    }

    /**
     * Clears the list of line strips.
     */
    clear() {
        this.m_geometry.vertices = [];
        this.m_geometry.vertexColors = [];
        this.m_geometry.indices = [];
    }

    /**
     * Add the given points to this line group.
     *
     * @param center - World center of the provided points.
     * @param points - Sequence of (x,y,z) coordinates.
     * @param offsets - Sequence of line segment offsets.
     * @param uvs - Sequence of (u,v) texture coordinates.
     * @param colors - Sequence of (r,g,b) color components.
     */
    add(
        center: THREE.Vector3,
        points: ArrayLike<number>,
        projection: Projection,
        offsets?: ArrayLike<number>,
        uvs?: ArrayLike<number>,
        colors?: ArrayLike<number>
    ): this {
        if (!this.isSimple) {
            assert(!this.hasNormalsAndUvs || uvs !== undefined);
            createLineGeometry(
                center,
                points,
                projection,
                offsets,
                uvs,
                colors,
                this.m_geometry,
                this.highPrecision
            );
        } else {
            createSimpleLineGeometry(points, colors, this.m_geometry);
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
     * Returns the list of vertex colors.
     */
    get vertexColors(): number[] {
        return this.m_geometry.vertexColors;
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
        return getVertexDescriptor(this.hasNormalsAndUvs, this.highPrecision).attributes;
    }

    /**
     * Returns the vertex attribute stride.
     */
    get stride(): number {
        return getVertexDescriptor(this.hasNormalsAndUvs, this.highPrecision).stride;
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
            this.m_geometry.vertexColors,
            this.m_geometry.indices,
            geometry,
            this.hasNormalsAndUvs,
            this.highPrecision
        );
    }
}

function computeBitangent(
    n: THREE.Vector3,
    t0: THREE.Vector3,
    t1: THREE.Vector3,
    bt: THREE.Vector3
): number {
    let angle = 0;
    if (!t0.equals(t1)) {
        angle = Math.acos(t0.dot(t1)) * Math.sign(n.dot(tmpV.copy(t0).cross(t1)));
        if (Number.isNaN(angle)) {
            angle = 0;
        }
    }
    bt.copy(t0).add(t1).normalize().cross(n).normalize();
    return angle;
}
