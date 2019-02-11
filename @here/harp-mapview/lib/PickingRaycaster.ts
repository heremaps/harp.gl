/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { MapView } from "./MapView";

/**
 * Raycasting points is not supported as necessary in Three.js. This class extends a
 * [[THREE.Raycaster]] except that it holds a reference to [[MapView]] allowing to access the
 * camera and the renderer from [[MapViewPoints]], in order to project the points in screen space.
 */
export class PickingRaycaster extends THREE.Raycaster {
    /**
     * Constructs a `MapViewRaycaster`. It keeps a reference to [[MapView]] in order to access the
     * active camera when calling the custom method `raycastPoints`.
     *
     * @param m_mapView the active [[MapView]].
     */
    constructor(public mapView: MapView) {
        super();
    }
}
