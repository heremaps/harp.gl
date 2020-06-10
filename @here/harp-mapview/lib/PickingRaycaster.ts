/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Raycasting points is not supported as necessary in Three.js. This class extends a
 * [[THREE.Raycaster]] and adds the width / height of the canvas to allow picking of screen space
 * geometry.
 *
 * @internal
 */
export class PickingRaycaster extends THREE.Raycaster {
    /**
     * Constructor.
     *
     * @param width - the canvas width.
     * @param height - the canvas height.
     */
    constructor(public width: number, public height: number) {
        super();
    }
}
