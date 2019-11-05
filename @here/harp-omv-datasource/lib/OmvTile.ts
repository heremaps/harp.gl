/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { DataSource } from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";
import { VectorTile } from "@here/harp-vectortile-datasource";

const logger = LoggerManager.instance.create("OmvTile");
let warningShown = false;
export class OmvTile extends VectorTile {
    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);
        if (!warningShown) {
            logger.warn(
                "OmvTile is deprecated and will be removed soon. Use " +
                    "VectorTile instead (package @here/harp-vectortile-datasource)."
            );
            warningShown = true;
        }
    }
}
