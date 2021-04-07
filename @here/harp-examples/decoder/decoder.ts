/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
};

self.importScripts("three.min.js");

import {
    GeoJsonTilerService,
    VectorTileDecoderService
} from "@here/harp-vectortile-datasource/index-worker";

import { CustomDecoderService } from "./custom_decoder";

VectorTileDecoderService.start();
GeoJsonTilerService.start();

//Following code is only needed for datasource_custom example.
// snippet:custom_datasource_example_custom_decoder_service_start.ts
CustomDecoderService.start();
// end:custom_datasource_example_custom_decoder_service_start.ts
