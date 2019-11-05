/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import {
    VectorTileDataSource,
    VectorTileWithCustomDataProvider,
    VectorTileWithRestClientParams
} from "@here/harp-vectortile-datasource";

const logger = LoggerManager.instance.create("OmvDataSource");

let warningShown = false;
export class OmvDataSource extends VectorTileDataSource {
    constructor(options: VectorTileWithCustomDataProvider | VectorTileWithRestClientParams) {
        super(options);
        if (!warningShown) {
            logger.warn(
                "OMVDataSource is deprecated and will be removed soon. Use " +
                    "VectorTileDataSource instead (package @here/harp-vectortile-datasource)."
            );
            warningShown = true;
        }
    }
}
