/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";

const logger = LoggerManager.instance.create("WorkerService", { enabled: false });

/**
 * @deprecated GeoJsonTileDecoderService Use
 *             {@link @here/harp-vectortile-datasource#VectorTileDecoderService} instead.
 */
export class GeoJsonTileDecoderService {
    /**
     * @deprecated GeoJsonTileDecoderService Use
     *             {@link @here/harp-vectortile-datasource#VectorTileDecoderService} instead.
     */
    start() {
        logger.warn(
            "GeoJsonTileDecoderService class is deprecated, please use VectorTileDecoderService"
        );
    }
}
