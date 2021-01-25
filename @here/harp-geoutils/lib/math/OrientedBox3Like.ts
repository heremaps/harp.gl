/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransformLike } from "./TransformLike";
import { Vector3Like } from "./Vector3Like";

/**
 * The interface {@link OrientedBox3Like} is used to represent oriented bounding box.
 */
export interface OrientedBox3Like extends TransformLike {
    /**
     * The extents of this bounding box.
     */
    readonly extents: Vector3Like;
}

/**
 * Returns true if the given object implements the interface {@link OrientedBox3Like}.
 *
 * @param object - The object.
 */
export function isOrientedBox3Like(object: {}): object is OrientedBox3Like {
    const obb = object as Partial<OrientedBox3Like>;
    return (
        obb.position !== undefined &&
        obb.xAxis !== undefined &&
        obb.yAxis !== undefined &&
        obb.zAxis !== undefined &&
        obb.extents !== undefined
    );
}
