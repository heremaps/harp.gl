/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKindSet } from "@here/harp-datasource-protocol";

/**
 * State parameters of a view that are required by the text renderer.
 */
export interface ViewState {
    worldCenter: THREE.Vector3; // View's center world coordinates.
    cameraIsMoving: boolean; // Whether view's camera is currently moving.
    maxVisibilityDist: number; // Maximum far plane distance.
    zoomLevel: number; // View's zoom level.
    frameNumber: number; // Current frame number.
    lookAtDistance: number; // Distance to the lookAt pooint.
    isDynamic: boolean; // Whether a new frame for the view is already requested.
    hiddenGeometryKinds: GeometryKindSet | undefined; // Kinds of geometries that are disabled.
}
