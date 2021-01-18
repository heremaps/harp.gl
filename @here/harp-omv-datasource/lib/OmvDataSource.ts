/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

/**
 * `OmvDataSource` is used for the visualization of vector tiles
 * provided in the OMV format.
 *
 * @example
 * ```typescript
 *    const dataSource = new OmvDataSource({
 *        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
 *        authenticationCode: apikey
 *    });
 *    mapView.addDataSource(dataSource);
 *   ```
 */
export class OmvDataSource extends VectorTileDataSource {}
