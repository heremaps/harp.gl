/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
};

self.importScripts("three.min.js");

import { GeoJsonTileDecoderService } from "@here/geojson-datasource/index-worker";
import { OmvTileDecoderService } from "@here/omv-datasource/index-worker";

OmvTileDecoderService.start();
GeoJsonTileDecoderService.start();
