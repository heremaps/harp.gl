/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueMap } from "@here/harp-datasource-protocol";
import { Vector3 } from "three";

import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../lib/IGeometryProcessor";

export class MockGeometryProcessor implements IGeometryProcessor {
    storageLevelOffset?: number | undefined;
    processPointFeature(
        layerName: string,
        tileExtents: number,
        geometry: Vector3[],
        properties: ValueMap
    ): void {}

    processLineFeature(
        layerName: string,
        tileExtents: number,
        geometry: ILineGeometry[],
        properties: ValueMap
    ): void {}

    processPolygonFeature(
        layerName: string,
        tileExtents: number,
        geometry: IPolygonGeometry[],
        properties: ValueMap
    ): void {}
}
