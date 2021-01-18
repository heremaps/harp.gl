/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
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
     * Note, [[screenSpaceLines]] is only used as a performance improvement and contains no
     * useful information. They are used to contain the screen space coordinates of the
     * points. By allocating the space here, we avoid per frame allocations, see
     * [[TextElementsRenderer.prepopulateScreenWithBlockingElements]].
     */
    readonly screenSpaceLines: THREE.Line3[];

    /**
     * Constructs a path from a list of points.
     * Pre allocates the [[screenSpaceLines]] used to render.
     * @param points - Points in world coordinates.
     */
    constructor(readonly points: Vector3Like[]) {
        this.screenSpaceLines = new Array<THREE.Line3>(points.length >= 2 ? points.length - 1 : 0);
        for (let i = 0; i < this.screenSpaceLines.length; i++) {
            this.screenSpaceLines[i] = new THREE.Line3(new THREE.Vector3(), new THREE.Vector3());
        }
    }
}
