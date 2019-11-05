/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TilerService, WorkerServiceManager } from "@here/harp-mapview-decoder/index-worker";
import { VECTOR_TILER_SERVICE_TYPE } from "./VectorTileDecoderDefs";

/**
 * Vector tile decoder service.
 */
export class VectorTilerService {
    /**
     * Register[[VectorTiler]] service class in [[WorkerServiceManager]].
     *
     * Has to be called during initialization of decoder bundle.
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: VECTOR_TILER_SERVICE_TYPE,
            factory: (serviceId: string) => TilerService.start(serviceId)
        });
    }
}
