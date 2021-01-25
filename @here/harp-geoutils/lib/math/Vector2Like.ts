/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface representing a Vector2.
 */
export interface Vector2Like {
    /**
     * The X position.
     */
    x: number;

    /**
     * The Y position.
     */
    y: number;
}

export function isVector2Like(v: any): v is Vector2Like {
    return v && typeof v.x === "number" && typeof v.y === "number";
}
