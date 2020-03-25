/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileDecoderService, WorkerServiceManager } from "@here/harp-mapview-decoder/index-worker";
import { VECTOR_TILE_DECODER_SERVICE_TYPE } from "./VectorDecoderDefs";
import { VectorTileDecoder } from "./VectorTileDecoder";

/**
 * OMV tile decoder service.
 */
export class VectorTileDecoderService {
    /**
     * Register[[VectorTileDecoder]] service class in [[WorkerServiceManager]].
     *
     * Has to be called during initialization of decoder bundle.
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: VECTOR_TILE_DECODER_SERVICE_TYPE,
            factory: (serviceId: string) =>
                TileDecoderService.start(serviceId, new VectorTileDecoder())
        });
    }
}
