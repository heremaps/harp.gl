/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "@here/harp-geoutils";
import * as THREE from "three";

/**
 * This path in world coordinates is projected to screen space and blocks all other labels.
 *
 * It could be used for example:
 * - Border rejects labels.
 * - Route blocks street labels from being rendered underneath.
 *
 * Could potentially be expanded in future to have a priority, however for now, this isn't required.
 */

export class PathBlockingElement {
    /**
     * Note, lines is only used as a performance improvement and contains no useful information.
     */
    readonly lines: THREE.Line3[];

    /**
     * Constructs a path from a list of points.
     * @param points Points in world coordinates.
     */
    constructor(readonly points: Vector3Like[]) {
        this.lines = new Array<THREE.Line3>(points.length >= 2 ? points.length - 1 : 0);
        for (let i = 0; i < this.lines.length; i++) {
            this.lines[i] = new THREE.Line3(new THREE.Vector3(), new THREE.Vector3());
        }
    }
}
