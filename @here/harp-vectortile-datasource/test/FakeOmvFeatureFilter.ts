/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { OmvFeatureFilter } from "../lib/OmvDataFilter";
import { OmvGeometryType } from "../lib/OmvDecoderDefs";

export class FakeOmvFeatureFilter implements OmvFeatureFilter {
    hasKindFilter: boolean = false;
    wantsLayer(layer: string, level: number): boolean {
        return true;
    }

    wantsPointFeature(layer: string, geometryType: OmvGeometryType, level: number): boolean {
        return true;
    }

    wantsLineFeature(layer: string, geometryType: OmvGeometryType, level: number): boolean {
        return true;
    }

    wantsPolygonFeature(layer: string, geometryType: OmvGeometryType, level: number): boolean {
        return true;
    }

    wantsKind(kind: string | string[]): boolean {
        return true;
    }
}
