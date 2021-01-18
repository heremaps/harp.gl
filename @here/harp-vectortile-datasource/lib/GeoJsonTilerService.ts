/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TilerService, WorkerServiceManager } from "@here/harp-mapview-decoder/index-worker";

import { GEOJSON_TILER_SERVICE_TYPE } from "./OmvDecoderDefs";

/**
 * GeoJson tiler service.
 *
 * @remarks
 * This services instantiates the geojson-vt based tiler
 * service that is responsible to create small tiles from
 * large GeoJson datasets.
 *
 * @example
 * ```typescript
 * // decoder.ts
 * GeoJsonTilerService.start();
 * ```
 */
export class GeoJsonTilerService {
    /**
     * Register a vector data tiler service with
     * {@link @here/harp-mapview-decoder#WorkerServiceManager}.
     *
     * @remarks
     * Has to be called during initialization of decoder bundle.
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: GEOJSON_TILER_SERVICE_TYPE,
            factory: (serviceId: string) => TilerService.start(serviceId)
        });
    }
}
