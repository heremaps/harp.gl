/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";

/**
 * State parameters of a view that are required by the text renderer.
 */
export interface ViewState {
    worldCenter: THREE.Vector3; // View's center world coordinates.
    cameraIsMoving: boolean; // Whether view's camera is currently moving.
    viewRanges: ViewRanges;
    zoomLevel: number; // View's zoom level.
    yaw: number;
    pitch: number;
    roll: number;
    frameNumber: number; // Current frame number.
    targetDistance: number; // Distance to the lookAt point.
    isDynamic: boolean; // Whether a new frame for the view is already requested.
    renderedTilesChanged: boolean; // True if rendered tiles changed since previous frame.
}
