/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKindSet } from "@here/harp-datasource-protocol";
import { MapView } from "../MapView";
import { ViewState } from "./ViewState";

/**
 * View state obtained from a MapView instance.
 */
export class MapViewState implements ViewState {
    constructor(private readonly m_mapView: MapView) {}

    get worldCenter(): THREE.Vector3 {
        return this.m_mapView.worldCenter;
    }
    get cameraIsMoving(): boolean {
        return this.m_mapView.cameraIsMoving;
    }
    get maxVisibilityDist(): number {
        return this.m_mapView.viewRanges.maximum;
    }
    get zoomLevel(): number {
        return this.m_mapView.zoomLevel;
    }
    get frameNumber(): number {
        return this.m_mapView.frameNumber;
    }
    get lookAtDistance(): number {
        return this.m_mapView.lookAtDistance;
    }
    get isDynamic(): boolean {
        return this.m_mapView.isDynamicFrame;
    }
    get hiddenGeometryKinds(): GeometryKindSet | undefined {
        return this.m_mapView.tileGeometryManager === undefined
            ? undefined
            : this.m_mapView.tileGeometryManager.hiddenGeometryKinds;
    }
}
