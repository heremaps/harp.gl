/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";

export interface DisplacementMapTexture {
    texture: Float32Array;
    width: number;
    height: number;
}

export interface DisplacementMap {
    tileKey: TileKey;

    texture: DisplacementMapTexture;
}
