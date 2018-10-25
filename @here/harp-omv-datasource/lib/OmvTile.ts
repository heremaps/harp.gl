/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { DataSource, Tile } from "@here/harp-mapview";

export class OmvTile extends Tile {
    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);
    }
}
