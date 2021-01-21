/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { VectorTileDataSourceParameters } from "@here/harp-vectortile-datasource";

export {
    APIFormat,
    AuthenticationMethod,
    GeoJsonDataProvider
} from "@here/harp-vectortile-datasource";

/**
 * HERE OMV Data source.
 *
 * @remarks
 *
 * @packageDocumentation
 */

/**
 * @deprecated Use {@link @here/harp-vectortile-datasource#VectorTileDataSourceParameters}
 *             instad.
 */
export type OmvDataSourceParameters = VectorTileDataSourceParameters;

export * from "./lib/OmvDataSource";
