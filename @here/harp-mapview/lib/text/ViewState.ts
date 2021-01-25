/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, GeometryKindSet } from "@here/harp-datasource-protocol";
import { Projection } from "@here/harp-geoutils";

import { ElevationProvider } from "../ElevationProvider";

/**
 * State parameters of a view that are required by the text renderer.
 */
export interface ViewState {
    worldCenter: THREE.Vector3; // View's center world coordinates.
    cameraIsMoving: boolean; // Whether view's camera is currently moving.
    maxVisibilityDist: number; // Maximum far plane distance.
    zoomLevel: number; // View's zoom level.
    env: Env;
    frameNumber: number; // Current frame number.
    lookAtVector: THREE.Vector3; // Normalized camera viewing direction.
    lookAtDistance: number; // Distance to the lookAt point.
    isDynamic: boolean; // Whether a new frame for the view is already requested.
    hiddenGeometryKinds?: GeometryKindSet; // Kinds of geometries that are disabled.
    renderedTilesChanged: boolean; // True if rendered tiles changed since previous frame.
    projection: Projection; // geo to world space projection.
    elevationProvider?: ElevationProvider; // Elevation data provider if available.
}
