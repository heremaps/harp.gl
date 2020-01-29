/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox, TileKey } from "@here/harp-geoutils";

export interface DisplacementMap {
    xCountVertices: number;
    yCountVertices: number;
    buffer: Float32Array;
}

export interface TileDisplacementMap {
    tileKey: TileKey;
    texture: THREE.DataTexture;
    displacementMap: DisplacementMap;
    geoBox: GeoBox;
}
