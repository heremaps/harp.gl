/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
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
