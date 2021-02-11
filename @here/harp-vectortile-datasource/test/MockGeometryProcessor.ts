/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol";
import { Vector3 } from "three";

import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../lib/IGeometryProcessor";

export class MockGeometryProcessor implements IGeometryProcessor {
    storageLevelOffset?: number | undefined;
    processPointFeature(
        layerName: string,
        layerExtents: number,
        geometry: Vector3[],
        env: MapEnv,
        storageLevel: number
    ): void {}

    processLineFeature(
        layerName: string,
        layerExtents: number,
        geometry: ILineGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {}

    processPolygonFeature(
        layerName: string,
        layerExtents: number,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void {}
}
