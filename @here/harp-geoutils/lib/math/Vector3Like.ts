/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { isVector2Like, Vector2Like } from "./Vector2Like";

/**
 * Interface representing a Vector3.
 */
export interface Vector3Like extends Vector2Like {
    /**
     * The Z position.
     */
    z: number;
}

export function isVector3Like(v: any): v is Vector3Like {
    return isVector2Like(v) && typeof (v as any).z === "number";
}
