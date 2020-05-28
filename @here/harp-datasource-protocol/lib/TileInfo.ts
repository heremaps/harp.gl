/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey } from "@here/harp-geoutils";

/**
 * Defines a map tile metadata.
 */
export interface TileInfo {
    readonly tileKey: TileKey;
    readonly setupTime: number;
    readonly transferList?: ArrayBuffer[];
    readonly numBytes: number;
}
