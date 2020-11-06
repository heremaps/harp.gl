/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "./deps";
import {
    GeoJsonTilerService,
    VectorTileDecoderService
} from "@here/harp-vectortile-datasource/index-worker";

VectorTileDecoderService.start();
GeoJsonTilerService.start();
