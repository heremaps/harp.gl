/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
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
    min: Vector3Like;

    /**
     * The maximum position in world coordinates of this bounding box.
     */
    max: Vector3Like;
}
