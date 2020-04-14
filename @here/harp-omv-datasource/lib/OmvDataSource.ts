/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

export {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSourceParameters as OmvDataSourceParameters,
    RestClient as OmvRestClient,
    RestClientParameters as OmvRestClientParameters
} from "@here/harp-vectortile-datasource";

export class OmvDataSource extends VectorTileDataSource {}
