/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransformLike } from "./TransformLike";

import * as THREE from "three";

/**
 * Concrete class which represents affine transformations (translation and rotation).
 */
export class Transform implements TransformLike {
    position = new THREE.Vector3();
    xAxis = new THREE.Vector3();
    yAxis = new THREE.Vector3();
    zAxis = new THREE.Vector3();
}
