/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TilerService, WorkerServiceManager } from "@here/harp-mapview-decoder/index-worker";
import { LoggerManager } from "@here/harp-utils";
import { OMV_TILER_SERVICE_TYPE } from "./OmvDecoderDefs";

const logger = LoggerManager.instance.create("OmvTilerService");

let warningShown = false;
/**
 * OMV tile decoder service.
 */
export class OmvTilerService {
    /**
     * Register[[OmvTiler]] service class in [[WorkerServiceManager]].
     *
     * Has to be called during initialization of decoder bundle.
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: OMV_TILER_SERVICE_TYPE,
            factory: (serviceId: string) => TilerService.start(serviceId)
        });
        if (!warningShown) {
            logger.warn(
                "OmvTilerService is deprecated and will be removed soon. Use " +
                    "VectorTilerService instead (package @here/harp-vectortile-datasource)."
            );
            warningShown = true;
        }
    }
}
