/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryType } from "@here/harp-datasource-protocol";
import { reconstructLineWidth } from "@here/harp-lines";
import { assert, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

const logger = LoggerManager.instance.create("TileGeometry");

/**
 * Interface to access lines. Allows read access for some important attributes.
 */
export interface ILineAccessor {
    /**
     * Hint for the original type of geometry.
     */
    geometryType: GeometryType;

    /**
     * Get the color from materials.
     */
    color: THREE.Color | undefined | Array<THREE.Color | undefined>;

    /**
     * Get the width. May have to be reconstructed from triangulated line mesh.
     */
    width: number | undefined;

    /**
     * Render order.
     */
    renderOrder: number;

    /**
     * Helper for function `isLineAccessor`.
     *
     * @returns `true` if it is a line accessor.
     */
    isLineAccessor(): boolean;

    /**
     * Clear the object from the mesh.
     */
    clear(): void;

    /**
     * Get vertices from the object.
     */
    getVertices(): Float32Array | undefined;
}

/**
 * Helper function to check if an accessor is of type `ILineAccessor`.
 *
 * @param arg - `true` if `arg` is `ILineAccessor`.
 * @internal
 */
export function isLineAccessor(arg: any): arg is ILineAccessor {
    /**
     * Get vertices from the object.
     *
     * @param mode - Specifies which part of the vertices should be returned.
     */

    return typeof arg.isLineAccessor === "function" && arg.isLineAccessor() === true;
}

/**
 * Accessor for unspecified 3D objects, like landmarks.
 */
export interface IObject3dAccessor {
    /**
     * Hint for the original type of geometry.
     */
    geometryType: GeometryType;

    /**
     * Get the color from materials.
     */
    color: THREE.Color | undefined | Array<THREE.Color | undefined>;

    /**
     * Render order.
     */
    renderOrder: number;

    /**
     * Helper for function `isObject3dAccessor`.
     *
     * @returns `true` if it is a line accessor.
     */
    isObject3dAccessor(): boolean;

    /**
     * Clear the object from the mesh.
     */
    clear(): void;

    getVertices(): Float32Array | undefined;
}

/**
 * Helper function to check if an accessor is of type `IObject3dAccessor`.
 *
 * @param arg - `true` if `arg` is `IObject3dAccessor`.
 * @internal
 */
export function isObject3dAccessor(arg: any): arg is IObject3dAccessor {
    return typeof arg.isObject3dAccessor === "function" && arg.isObject3dAccessor() === true;
}

/**
 * Basic interface for geometry accessors.
 */
export interface IGeometryAccessor {
    /**
     * Get the number of primitives (vertices of triangles).
     *
     * @returns Number of primitives.
     */
    getCount(): number;

    /**
     * Set range of primitives in this object related to one or more buffers.
     *
     * @param start - Start index in buffers.
     * @param end - End index in buffers (+1).
     */
    setRange(start: number, end: number): void;
}

/**
 * Geometry accessor for both indexed and nonindexed `BufferedGeometry`.
 */
export abstract class BufferedGeometryAccessorBase implements IGeometryAccessor {
    protected start: number = -1;
    protected end: number = -1;
    protected startCapSize: number = 0;
    protected endCapSize: number = 0;
    protected position: THREE.BufferAttribute;
    protected itemSize: number;

    constructor(
        readonly object: THREE.Mesh,
        readonly geometryType: GeometryType,
        protected readonly bufferGeometry: THREE.BufferGeometry
    ) {
        assert(!!object);

        if (bufferGeometry.type !== "BufferGeometry") {
            logger.error(
                "IndexedBufferedGeometryAccessor#constructor: BufferGeometry has wrong " + "type"
            );
        }
        assert(
            bufferGeometry.type === "BufferGeometry",
            "IndexedBufferedGeometryAccessor#constructor: BufferGeometry has wrong type"
        );

        // we know its a BufferAttribute because it is a BufferGeometry
        this.position = this.bufferGeometry.getAttribute("position") as THREE.BufferAttribute;
        this.itemSize = this.position.itemSize;

        if (!this.position) {
            logger.warn(
                "BufferedGeometryAccessor#constructor: BufferGeometry has no position " +
                    "attribute"
            );
        }

        if (this.position.array.constructor !== Float32Array) {
            logger.warn(
                "BufferedGeometryAccessor#constructor: BufferGeometry.position: " +
                    "unsupported ArrayBuffer"
            );
        }
    }

    /**
     * Get the number of accessible geometries in this buffer.
     *
     * @returns Number of primitives in this geometry.
     */
    getCount(): number {
        return this.position.count;
    }

    /**
     * Get `renderOrder` of object.
     *
     * @returns `renderOrder` of the object.
     */
    get renderOrder(): number {
        return this.object.renderOrder;
    }

    setRange(start: number, end: number, startCapSize: number = 0, endCapSize: number = 0) {
        assert(start >= 0);
        assert(end >= 0);
        assert(start <= end);
        this.start = start;
        this.end = end;
        this.startCapSize = startCapSize;
        this.endCapSize = endCapSize;
    }

    /**
     * Get one or more colors from materials.
     */
    get color(): THREE.Color | undefined | Array<THREE.Color | undefined> {
        /**
         * TODO: Get color(s) from vertex colors
         */
        const getColor = (material: THREE.Material) => {
            const meshMaterial = material as THREE.MeshBasicMaterial;
            if (
                meshMaterial.type === "MeshBasicMaterial" ||
                meshMaterial.type === "MeshStandardMaterial"
            ) {
                return meshMaterial.color;
            } else if (meshMaterial.type === "RawShaderMaterial") {
                const rawShaderMaterial = material as THREE.RawShaderMaterial;

                if (rawShaderMaterial.name === "SolidLineMaterial") {
                    return rawShaderMaterial.uniforms.diffuse.value as THREE.Color;
                }

                logger.warn(
                    "BufferedGeometryAccessor#color: unknown shader material name",
                    rawShaderMaterial.name
                );
            } else {
                logger.warn(
                    "BufferedGeometryAccessor#color: unknown material type",
                    meshMaterial.type
                );
            }

            return undefined;
        };

        if (Array.isArray(this.object.material)) {
            const results = new Array<THREE.Color | undefined>();
            const materials = this.object.material as THREE.Material[];

            for (const material of materials) {
                results.push(getColor(material));
            }

            return results;
        } else {
            return getColor(this.object.material);
        }
    }
}

/**
 * Abstract base class of an accessor for nonindexed geometry.
 */
export abstract class BufferedGeometryAccessor extends BufferedGeometryAccessorBase {
    /**
     * Create an object of type `BufferedGeometryAccessor`
     *
     * @param object - mesh object
     * @param geometryType - type of geometry to be used
     * @param bufferGeometry - which buffer geometry to use
     * @param stride - geometry stride length
     */
    constructor(
        readonly object: THREE.Mesh,
        readonly geometryType: GeometryType,
        protected readonly bufferGeometry: THREE.BufferGeometry,
        protected stride: number
    ) {
        super(object, geometryType, bufferGeometry);
    }

    clear(): void {
        assert(this.checkSetUp(), "BufferedGeometryAccessor not setup");

        const positionsArray = this.position.array as number[];

        const start = this.start * this.itemSize;
        const end = this.end * this.itemSize;

        for (let i = start; i < end; i++) {
            positionsArray[i] = 0;
        }

        this.position.needsUpdate = true;
    }

    getVertices(): Float32Array | undefined {
        assert(this.checkSetUp(), "BufferedGeometryAccessor not setup");

        const start = this.start;
        const end = this.end;

        return (this.position.array as Float32Array).subarray(
            start * this.itemSize,
            end * this.itemSize
        );
    }

    protected checkSetUp(): boolean {
        return (
            this.position !== undefined &&
            this.start !== undefined &&
            this.end !== undefined &&
            this.start >= 0 &&
            this.end <= this.position.count &&
            this.start <= this.end
        );
    }
}

/**
 * Accessor for nonindexed line geometry.
 */
export class BufferedGeometryLineAccessor
    extends BufferedGeometryAccessor
    implements ILineAccessor {
    constructor(
        readonly object: THREE.Mesh,
        readonly geometryType: GeometryType,
        readonly bufferGeometry: THREE.BufferGeometry
    ) {
        super(object, geometryType, bufferGeometry, 3);
    }

    isLineAccessor(): boolean {
        return true;
    }

    get width(): number | undefined {
        //TODO: There is no implementation of such a line, yet...
        assert(this.checkSetUp(), "RoBufferedGeometryLineAccessor not setup");
        return undefined;
    }
}

/**
 * Accessor for nonindexed unspecified (`Object3D`) geometry.
 */
export class BufferedGeometryObject3dAccessor
    extends BufferedGeometryAccessor
    implements IObject3dAccessor {
    constructor(
        readonly object: THREE.Mesh,
        readonly geometryType: GeometryType,
        readonly bufferGeometry: THREE.BufferGeometry
    ) {
        super(object, geometryType, bufferGeometry, 1);
    }

    isObject3dAccessor(): boolean {
        return true;
    }

    /** @override */
    getVertices(): Float32Array | undefined {
        return super.getVertices();
    }
}

/**
 * Abstract base class of indexed geometry.
 */
export abstract class IndexedBufferedGeometryAccessor extends BufferedGeometryAccessorBase {
    indices: number[];

    /**
     * Creates an abstract class `IndexedBufferedGeometryAccessor`.
     *
     * @param object - mesh to be used
     * @param geometryType - type of geometry
     * @param bufferGeometry - geometry used
     * @param start -
     * @param end -
     */
    constructor(
        readonly object: THREE.Mesh,
        readonly geometryType: GeometryType,
        protected readonly bufferGeometry: THREE.BufferGeometry,
        start?: number,
        end?: number
    ) {
        super(object, geometryType, bufferGeometry);

        this.indices =
            this.bufferGeometry.index !== null
                ? (this.bufferGeometry.index.array as number[])
                : ((undefined as any) as number[]);

        if (!this.indices) {
            logger.warn(
                "IndexedBufferedGeometryAccessor#constructor: BufferGeometry has no " + "index"
            );
            assert(!!this.indices);
        } else {
            if (!(this.indices instanceof Uint32Array)) {
                logger.warn(
                    "IndexedBufferedGeometryAccessor#constructor: BufferGeometry index " +
                        "has wrong type"
                );
                assert(this.indices instanceof Uint32Array);
            }
        }
    }

    /**
     * Returns number of primitives, which is not known in this base class, so we return the number
     * of indices.
     *
     * @returns The number of indices in the geometry.
     * @override
     */
    getCount(): number {
        return this.indices.length;
    }

    protected checkSetUp(): boolean {
        return (
            !!this.indices &&
            this.start !== undefined &&
            this.end !== undefined &&
            this.start >= 0 &&
            this.end <= this.indices.length &&
            this.start <= this.end
        );
    }
}

/**
 * Accessor for lines in an indexed geometry.
 */
export class IndexedBufferedGeometryLineAccessor
    extends IndexedBufferedGeometryAccessor
    implements ILineAccessor {
    constructor(
        readonly object: THREE.Mesh,
        readonly geometryType: GeometryType,
        readonly bufferGeometry: THREE.BufferGeometry
    ) {
        super(object, geometryType, bufferGeometry, 3);
    }

    isLineAccessor(): boolean {
        return true;
    }

    /**
     * Reconstructs line width from triangulated geometry.
     *
     * @returns Line width.
     */
    get width(): number | undefined {
        assert(this.checkSetUp(), "RoIndexedBufferedGeometryLineAccessor not setup");

        if (this.geometryType === GeometryType.ExtrudedLine) {
            const start = this.start + this.startCapSize;
            const positionArray = this.position.array as Float32Array;
            return reconstructLineWidth(positionArray, start);
        }

        return undefined;
    }

    clear(): void {
        assert(this.checkSetUp(), "RoIndexedBufferedGeometryLineAccessor not setup");

        const start = this.start;
        const end = this.end;

        for (let i = start; i < end; i++) {
            this.indices[i] = 0;
        }

        if (this.bufferGeometry.index !== null) {
            this.bufferGeometry.index.needsUpdate = true;
        }
    }

    getVertices(): Float32Array | undefined {
        assert(this.checkSetUp(), "RoIndexedBufferedGeometryLineAccessor not setup");

        const itemSize = this.itemSize;

        const start = this.start;
        const end = this.end;

        const result = new Float32Array((end - start) * itemSize);
        const positionArray = this.position.array;

        if (itemSize === 2) {
            for (let i = start, j = 0; i < end; i++, j += itemSize) {
                const index = this.indices[i];
                result[j + 0] = positionArray[index * itemSize + 0];
                result[j + 1] = positionArray[index * itemSize + 1];
            }
        }
        if (itemSize === 3) {
            for (let i = start, j = 0; i < end; i++, j += itemSize) {
                const index = this.indices[i];
                result[j + 0] = positionArray[index * itemSize + 0];
                result[j + 1] = positionArray[index * itemSize + 1];
                result[j + 2] = positionArray[index * itemSize + 2];
            }
        } else {
            for (let i = start, j = 0; i < end; i++, j++) {
                const index = this.indices[i];
                for (let k = 0; k < itemSize; k++) {
                    result[j * itemSize + k] = positionArray[index * itemSize + k];
                }
            }
        }

        return result;
    }
}
