/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
};

self.importScripts("three.min.js");

import {
    VectorTileDecoderService,
    VectorTilerService
} from "@here/harp-vectortile-datasource/index-worker";

VectorTileDecoderService.start();
VectorTilerService.start();
