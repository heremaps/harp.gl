/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { DataTexture } from "three";

export interface DisplacementMap {
    tileKey: TileKey;

    /**
     * We need DataTexture here to be able to access the raw data for CPU overlay.
     */
    texture: DataTexture;
}
