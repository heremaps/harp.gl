/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

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
    // We allocate the memory here to avoid allocating each frame
    readonly lines: THREE.Line3[];
    constructor(readonly points: THREE.Vector3[]) {
        this.lines = new Array<THREE.Line3>(points.length >= 2 ? points.length - 1 : 0);
        for (let i = 0; i < this.lines.length; i++) {
            this.lines[i] = new THREE.Line3(new THREE.Vector3(), new THREE.Vector3());
        }
    }
}
