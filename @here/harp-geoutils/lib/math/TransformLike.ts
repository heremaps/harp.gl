/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "./Vector3Like";

/**
 * The interface {@link TransformLike} is used to represent transforms with
 * only translation and rotation.
 */
export interface TransformLike {
    /**
     * The position of this transform.
     */
    readonly position: Vector3Like;

    /**
     * The x-axis of this transform.
     */
    readonly xAxis: Vector3Like;

    /**
     * The y-axis of this transform.
     */
    readonly yAxis: Vector3Like;

    /**
     * The z-axis of this transform.
     */
    readonly zAxis: Vector3Like;
}

/**
 * Returns true if the given object implements the interface {@link TransformLike}.
 *
 * @param object - The object.
 */
export function isTransformLike(object: {}): object is TransformLike {
    const transform = object as Partial<TransformLike>;
    return (
        transform.position !== undefined &&
        transform.xAxis !== undefined &&
        transform.yAxis !== undefined &&
        transform.zAxis !== undefined
    );
}
