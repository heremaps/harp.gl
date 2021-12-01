/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, GeometryKindSet } from "@here/harp-datasource-protocol";
import { Projection } from "@here/harp-geoutils";
import * as THREE from "three";

import { ElevationProvider } from "../ElevationProvider";
import { MapView } from "../MapView";
import { ViewState } from "./ViewState";

/**
 * View state obtained from a MapView instance.
 */
export class MapViewState implements ViewState {
    private readonly m_lookAtVector = new THREE.Vector3();
    constructor(
        private readonly m_mapView: MapView,
        private readonly m_renderedTilesChangeCheck: () => boolean
    ) {}

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

    get env(): Env {
        return this.m_mapView.env;
    }

    get frameNumber(): number {
        return this.m_mapView.frameNumber;
    }

    get lookAtVector(): THREE.Vector3 {
        return this.m_mapView.camera.getWorldDirection(this.m_lookAtVector);
    }

    get lookAtDistance(): number {
        return this.m_mapView.targetDistance;
    }

    get isDynamic(): boolean {
        return this.m_mapView.isDynamicFrame;
    }

    get hiddenGeometryKinds(): GeometryKindSet | undefined {
        return this.m_mapView.tileGeometryManager === undefined
            ? undefined
            : this.m_mapView.tileGeometryManager.hiddenGeometryKinds;
    }

    get renderedTilesChanged(): boolean {
        return this.m_renderedTilesChangeCheck();
    }

    get projection(): Projection {
        return this.m_mapView.projection;
    }

    get elevationProvider(): ElevationProvider | undefined {
        return this.m_mapView.elevationProvider;
    }
}
