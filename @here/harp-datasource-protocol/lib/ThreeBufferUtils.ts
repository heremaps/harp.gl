/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute as ThreeBufferAttribute,
    BufferGeometry as ThreeBufferGeometry,
    InterleavedBufferAttribute as ThreeInterleavedBufferAttribute
} from "three";

import {
    BufferAttribute,
    BufferElementType,
    Geometry,
    GeometryType,
    InterleavedBufferAttribute
} from "./DecodedTile";

/**
 * Collection of helper methods to convert
 * {@link https://threejs.org/docs/index.html#api/en/core/BufferGeometry|three.js BufferGeometry}
 * to [[Geometry]] that allows creation and transfering of THREE BufferGeometry in webworkers.
 * See also [[CustomDatasourceExample]].
 */
export namespace ThreeBufferUtils {
    export function getBufferElementType(buffer: ArrayBufferView): BufferElementType {
        if (buffer instanceof Int8Array) {
            return "int8";
        } else if (buffer instanceof Uint8Array) {
            return "uint8";
        } else if (buffer instanceof Int16Array) {
            return "int16";
        } else if (buffer instanceof Uint16Array) {
            return "uint16";
        } else if (buffer instanceof Int32Array) {
            return "int32";
        } else if (buffer instanceof Uint32Array) {
            return "uint32";
        } else if (buffer instanceof Float32Array) {
            return "float";
        }

        throw new Error(`Unsupported buffer type ${name}`);
    }

    export function fromThreeBufferAttribute(
        bufferAttribute: ThreeBufferAttribute
    ): BufferAttribute {
        const buffer = (bufferAttribute.array as any) as ArrayBufferView;
        return {
            name: bufferAttribute.name,
            buffer: buffer.buffer,
            type: getBufferElementType(buffer),
            itemCount: bufferAttribute.itemSize,
            normalized: bufferAttribute.normalized
        };
    }

    export function fromThreeInterleavedBufferAttribute(
        bufferAttribute: ThreeInterleavedBufferAttribute
    ): InterleavedBufferAttribute {
        throw new Error("Not implemented yet");
    }

    export function fromThreeBufferGeometry(
        bufferGeometry: ThreeBufferGeometry,
        techniqueIndex: number
    ): Geometry {
        const vertexAttributes: BufferAttribute[] = [];
        const attributeNames = Object.getOwnPropertyNames(bufferGeometry.attributes);
        for (const name of attributeNames) {
            const attribute = bufferGeometry.attributes[name];
            // FIXME: Also support InterleavedBufferAttribute
            const vertexAttribute = fromThreeBufferAttribute(attribute as ThreeBufferAttribute);
            vertexAttribute.name = name;
            vertexAttributes.push(vertexAttribute);
        }
        const index =
            bufferGeometry.index !== null
                ? fromThreeBufferAttribute(bufferGeometry.index)
                : undefined;

        let count = 0;
        if (index !== undefined) {
            count = bufferGeometry.index === null ? 0 : bufferGeometry.index.count;
        } else {
            // If there is no index buffer, try to deduce the count from the position attribute.
            const posAttr = bufferGeometry.attributes.position as ThreeBufferAttribute;
            if (posAttr === undefined) {
                throw new Error("Missing position attibute to deduce item count");
            }
            count = posAttr.count;
        }

        return {
            type: GeometryType.Unspecified,
            vertexAttributes,
            index,
            groups: [{ start: 0, count, technique: techniqueIndex }]
        };
    }
}
