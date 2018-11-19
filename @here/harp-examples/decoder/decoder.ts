/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="typescript/lib/lib.webworker" />

self.importScripts("three.min.js");

import { GeoJsonTileDecoderService } from "@here/harp-geojson-datasource/index-worker";
import { OmvTileDecoderService } from "@here/harp-omv-datasource/index-worker";

OmvTileDecoderService.start();
GeoJsonTileDecoderService.start();
