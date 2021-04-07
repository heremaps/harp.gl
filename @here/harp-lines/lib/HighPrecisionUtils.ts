/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    HighPrecisionLineMaterial,
    HighPrecisionLineMaterialParameters,
    HighPrecisionPointMaterial,
    isHighPrecisionPointMaterial
} from "@here/harp-materials";
import {
    BufferAttribute,
    BufferGeometry,
    Camera,
    Float32BufferAttribute,
    InterleavedBuffer,
    InterleavedBufferAttribute,
    Matrix4,
    PointsMaterialParameters,
    ShaderMaterial,
    Vector3
} from "three";

import * as HPL from "./HighPrecisionLines";
import * as HPP from "./HighPrecisionPoints";
import { triangulateLine } from "./TriangulateLines";

export namespace HighPrecisionUtils {
    /**
     * Extract the `float` parts of all vector members, Making this a `Vector3` of `float`.
     * precision.
     *
     * @param v -
     */
    export function doubleToFloatVec(v: Vector3): Vector3 {
        return new Vector3(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z));
    }

    /**
     * Convert a `Vector3` to `float` (in place!) Returns the minor float vector, which is the
     * difference of the double elements and their float counterparts.
     *
     * @param v - Vector3 to convert to float IN-PLACE!
     */
    export function makeFloatVec(v: Vector3): Vector3 {
        const majorX = Math.fround(v.x);
        const majorY = Math.fround(v.y);
        const majorZ = Math.fround(v.z);

        const minorVec = new Vector3(v.x - majorX, v.y - majorY, v.z - majorZ);

        v.x = Math.fround(majorX);
        v.y = Math.fround(majorY);
        v.z = Math.fround(majorZ);

        return minorVec;
    }

    /**
     * Describes addtional postion data needed to render high-precision vertices. Created by
     * [[createHighPrecisionCameraPos]].
     */
    export interface HighPrecisionCameraInfo {
        /**
         * View Projection matrix of this high-precision camera.
         */
        viewProjection: Matrix4;

        /**
         * Low-order bits of the high-precision camera's position.
         */
        eyePosLo: Vector3;

        /**
         * High-order bits of the high-precision camera's position.
         */
        eyePosHi: Vector3;
    }

    /**
     * Describes different properties used when creating a [[HighPrecisionLine]] or
     * a [[HighPrecisionWireFrameLine]].
     */
    export interface HighPrecisionLineParams extends HighPrecisionLineMaterialParameters {
        /**
         * Width of the rendered line (specified in world units).
         */
        lineWidth?: number;

        /**
         * Add rounded caps to the extremes of the line if set to `true`.
         */
        addCircles?: boolean;

        /**
         * Renders a wireframe line if set to `true`.
         */
        wireFrame?: boolean;
    }

    /**
     * Calculate high-precision camera position used in vertex shader of high-precision materials.
     *
     * @param camera - Camera used to get the high-precision position.
     * @param objectInverseWorldMatrix - Inverse World Matrix of the rendered
     *                                   [[HighPrecisionObject]].
     */
    export function createHighPrecisionCameraPos(
        camera: Camera,
        objectInverseWorldMatrix: Matrix4
    ): HighPrecisionCameraInfo {
        const _projScreenMatrix = new Matrix4().copy(camera.projectionMatrix);
        const mvp = _projScreenMatrix.multiply(camera.matrixWorldInverse);
        const eyePos = new Vector3(0, 0, 0).applyMatrix4(objectInverseWorldMatrix);

        // split the double float vector into hi and lo parts
        const eyePosFloat = doubleToFloatVec(eyePos);

        const eyePosLo = doubleToFloatVec(eyePos.sub(eyePosFloat));

        return {
            viewProjection: mvp,
            eyePosHi: eyePosFloat,
            eyePosLo
        };
    }

    /**
     * Updates the high-precision uniform data of a material used to render a
     * [[HighPrecisionObject]].
     *
     * @param object - [[HighPrecisionObject]] used for rendering.
     * @param camera - Camera used to get the high-precision position.
     * @param shaderMaterial - Material which uniforms will be updated.
     */
    export function updateHpUniforms(
        object: HPL.HighPrecisionObject,
        camera: Camera,
        shaderMaterial: ShaderMaterial
    ): void {
        const highPrecisionCameraInfo = createHighPrecisionCameraPos(
            camera,
            object.matrixWorldInverse
        );
        const mvp = highPrecisionCameraInfo.viewProjection;

        if (shaderMaterial !== undefined && shaderMaterial.isMaterial) {
            if (
                shaderMaterial.uniforms &&
                shaderMaterial.uniforms.u_mvp &&
                shaderMaterial.uniforms.u_eyepos &&
                shaderMaterial.uniforms.u_eyepos_lowpart
            ) {
                shaderMaterial.uniforms.u_mvp.value = new Float32Array(mvp.elements);
                shaderMaterial.uniforms.u_eyepos.value = new Float32Array(
                    highPrecisionCameraInfo.eyePosHi.toArray()
                );
                shaderMaterial.uniforms.u_eyepos_lowpart.value = new Float32Array(
                    highPrecisionCameraInfo.eyePosLo.toArray()
                );
            } else {
                throw Error("High pecision material has missing uniforms");
            }
        } else {
            throw Error("High pecision line has no high precision material");
        }
    }

    /**
     * Assembles the necessary attribute buffers needed to render [[HighPrecisionObject]].
     *
     * @param positions - Array of positions.
     */
    export function createAttributes(
        positions: ArrayLike<number> | ArrayLike<Vector3>
    ): {
        positionHigh: BufferAttribute;
        positionLow: BufferAttribute;
    } {
        if (positions.length > 0) {
            const v = positions[0];

            if (v === undefined || v === null) {
                throw Error("Empty element in positions");
            }

            const positionVec = new Array<number>();
            const positionVecLow = new Array<number>();

            const addHPValue = (...values: number[]) => {
                for (const value of values) {
                    const major = Math.fround(value);
                    positionVecLow.push(value - major);
                    positionVec.push(major);
                }
            };

            const addHPVector = (vec: Vector3) => {
                addHPValue(vec.x, vec.y, vec.z);
            };

            const vAny = v as any;
            if (vAny.z !== undefined) {
                (positions as Vector3[]).forEach(vec => {
                    addHPVector(vec);
                });
            } else {
                if (positionVec.length % 3 !== 0) {
                    throw Error("Positions must be 3D, not 2D");
                }
                (positions as number[]).forEach((n: number): void => {
                    addHPValue(n);
                });
            }

            return {
                positionHigh: new Float32BufferAttribute(positionVec, 3),
                positionLow: new Float32BufferAttribute(positionVecLow, 3)
            };
        } else {
            return {
                positionHigh: new Float32BufferAttribute([], 3),
                positionLow: new Float32BufferAttribute([], 3)
            };
        }
    }

    /**
     * Assembles an interleaved buffer containing the position attribute data for a
     * [[HighPrecisionObject]].
     *
     * @param positions - Array of positions.
     * @param stride - Stride of the elements in the `positions` array.
     * @param positionOffset - Offset into the `positions` array.
     */
    export function addInterleavedAttributes3(
        positions: ArrayLike<number>,
        stride: number,
        positionOffset = 0
    ): ArrayLike<number> {
        const newPositions = new Array<number>();

        const end = positions.length;

        for (let i = 0; i < end; i += stride) {
            for (let j = 0; j < positionOffset; j++) {
                newPositions.push(positions[i + j]);
            }

            const x = positions[i + positionOffset];
            const y = positions[i + positionOffset + 1];
            const z = positions[i + positionOffset + 2];
            const majorX = Math.fround(x);
            const minorX = x - majorX;
            const majorY = Math.fround(y);
            const minorY = y - majorY;
            const majorZ = Math.fround(z);
            const minorZ = z - majorZ;

            // insert values in interleaved buffer
            newPositions.push(majorX, majorY, majorZ, minorX, minorY, minorZ);

            for (let j = positionOffset + 3; j < stride; j++) {
                newPositions.push(positions[i + j]);
            }
        }

        return newPositions;
    }

    /**
     * Adds the high-precision position attribute data to a [[HighPrecisionObject]].
     *
     * @param object - [[HighPrecisionObject]] which position attribute will be set.
     * @param positions - Array of positions.
     */
    export function setPositions(
        object: HPL.HighPrecisionObject,
        positions: ArrayLike<number> | ArrayLike<Vector3>
    ): number {
        const attributes = createAttributes(positions);

        object.bufferGeometry.setAttribute("position", attributes.positionHigh);
        object.bufferGeometry.setAttribute("positionLow", attributes.positionLow);

        return attributes.positionHigh.itemSize;
    }

    /**
     * Convert positions from `Array<Vector3>` to `Array<number>`.
     *
     * @param positions - Array of positions.
     */
    export function convertPositions(
        positions: ArrayLike<number> | ArrayLike<Vector3>
    ): { positions: number[] } {
        if (positions.length <= 0) {
            return { positions: [] };
        }

        const v = positions[0];

        if (v === undefined || v === null) {
            throw Error("Empty element in positions");
        }

        const vAny = v as any;
        if (vAny.y === undefined && vAny.z === undefined) {
            return { positions: positions as number[] };
        }

        const returnPositions = new Array<number>();
        (positions as Vector3[]).forEach(vec => {
            returnPositions.push(vec.x, vec.y, vec.z);
        });

        return { positions: returnPositions };
    }

    /**
     * Creates a [[HighPrecisionLine]] or [[HighPrecisionWireFrameLine]] object.
     *
     * @param linePositions - Array of 2D/3D positions.
     * @param params - Parameters used to configure the created [[HighPrecisionObject]].
     */
    export function createLine(
        linePositions: ArrayLike<number>,
        params: HighPrecisionLineParams
    ): HPL.HighPrecisionLine | HPL.HighPrecisionWireFrameLine {
        const lineWidth = params.lineWidth !== undefined ? params.lineWidth : 5;
        const addCircles = params.addCircles !== undefined ? params.addCircles : false;
        const wireFrame = params.wireFrame !== undefined ? params.wireFrame : false;

        const positions: number[] = [];
        const indices: number[] = [];

        triangulateLine(linePositions, lineWidth, positions, indices, addCircles);

        const hpLineGeometry = new BufferGeometry();
        const hpPositions = addInterleavedAttributes3(positions, 3);
        const buffer = new InterleavedBuffer(new Float32Array(hpPositions), 6);

        const positionAttribute = new InterleavedBufferAttribute(buffer, 3, 0, false);
        const positionLowAttribute = new InterleavedBufferAttribute(buffer, 3, 3, false);

        hpLineGeometry.setAttribute("position", positionAttribute);
        hpLineGeometry.setAttribute("positionLow", positionLowAttribute);
        hpLineGeometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));

        const hpSolidMaterial = new HighPrecisionLineMaterial(params);

        const lineObject = wireFrame
            ? new HPL.HighPrecisionWireFrameLine(hpLineGeometry, hpSolidMaterial)
            : new HPL.HighPrecisionLine(hpLineGeometry, hpSolidMaterial);

        lineObject.setupForRendering();

        return lineObject;
    }

    /**
     * Creates a group of [[HighPrecisionPoints]].
     *
     * @param pointPositions - Array of 2D/3D positions.
     * @param materialParameters - Parameters used to configure the material used to render the
     * created [[HighPrecisionPoints]].
     */
    export function createPoints(
        pointPositions: ArrayLike<number>,
        materialParameters?: PointsMaterialParameters | HighPrecisionPointMaterial
    ): HPP.HighPrecisionPoints {
        const indices: number[] = [];

        for (let i = 0; i < pointPositions.length; i++) {
            indices.push(indices.length / 3);
        }

        const hpPointsGeometry = new BufferGeometry();

        const hpPointsMaterial = isHighPrecisionPointMaterial(materialParameters)
            ? materialParameters
            : new HighPrecisionPointMaterial(materialParameters);

        const pointsObject = new HPP.HighPrecisionPoints(hpPointsGeometry, hpPointsMaterial);

        setPositions(pointsObject, pointPositions);

        pointsObject.setupForRendering();

        return pointsObject;
    }
}
