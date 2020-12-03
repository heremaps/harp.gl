/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MapView } from "../MapView";
import { PoiRenderer } from "./PoiRenderer";

export class PoiRendererFactory {
    /**
     * Creates an instance of poi renderer factory.
     * @param m_mapView -
     */
    constructor(private readonly m_mapView: MapView) {}

    /**
     * Creates poi renderer
     * @param textCanvas -
     * @returns
     */
    createPoiRenderer(): PoiRenderer {
        return new PoiRenderer(this.m_mapView);
    }
}
