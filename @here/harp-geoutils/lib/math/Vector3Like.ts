/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface representing a Vector3.
 */
export interface Vector3Like {
    /**
     * The X position.
     */
    x: number;

    /**
     * The Y position.
     */
    y: number;

    /**
     * The Z position.
     */
    z: number;
}

export function isVector3Like(v: any): v is Vector3Like {
    return v && typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number";
}
