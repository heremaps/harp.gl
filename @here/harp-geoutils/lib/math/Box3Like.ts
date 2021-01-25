/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "./Vector3Like";

/**
 * An interface representing bounding box in world coordinates.
 */
export interface Box3Like {
    /**
     * The minimum position in world coordinates of this bounding box.
     */
    readonly min: Vector3Like;

    /**
     * The maximum position in world coordinates of this bounding box.
     */
    readonly max: Vector3Like;
}

/**
 * Returns true if the given object implements the {@link Box3Like} interface.
 *
 * @param object - A valid object.
 */
export function isBox3Like(object: {}): object is Box3Like {
    const box3 = object as Partial<Box3Like>;
    return box3.min !== undefined && box3.max !== undefined;
}
