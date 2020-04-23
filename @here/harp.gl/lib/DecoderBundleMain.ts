/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

if (!(self as any).THREE) {
    // tslint:disable-next-line:no-console
    console.warn(
        "harp-decoders.js: It looks like 'Three.js' is not loaded. This script requires 'THREE' " +
            "object to be defined. See https://github.com/heremaps/harp.gl/@here/harp.gl."
    );
}

import { OmvTileDecoderService, OmvTilerService } from "@here/harp-omv-datasource/index-worker";

OmvTilerService.start();
OmvTileDecoderService.start();
