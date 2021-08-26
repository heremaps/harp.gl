/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoPolygon, Projection, ProjectionType } from "@here/harp-geoutils";
import { PerspectiveCamera } from "three";

import { PlaneViewBounds } from "./PlaneViewBounds";
import { SphereViewBounds } from "./SphereViewBounds";
import { ViewBounds } from "./ViewBounds";

/**
 * Generates Bounds for a camera view and a projection
 *
 * @internal
 */
export class BoundsGenerator {
    private m_viewBounds!: ViewBounds;

    constructor(
        private readonly m_view: {
            camera: PerspectiveCamera;
            projection: Projection;
            tileWrappingEnabled: boolean;
        }
    ) {
        this.createViewBounds();
    }

    /**
     * Generates a {@link @here/harp-geoutils#GeoPolygon} covering the visible map.
     * The coordinates are sorted to ccw winding, so a polygon could be drawn with them.
     * @returns The GeoPolygon with the view bounds or undefined if world is not in view.
     */
    generate(): GeoPolygon | undefined {
        if (this.m_view.projection !== this.m_viewBounds.projection) {
            this.createViewBounds();
        }
        return this.m_viewBounds.generate();
    }

    private createViewBounds() {
        this.m_viewBounds =
            this.m_view.projection.type === ProjectionType.Planar
                ? new PlaneViewBounds(this.m_view.camera, this.m_view.projection, this.m_view)
                : new SphereViewBounds(this.m_view.camera, this.m_view.projection);
    }
}
