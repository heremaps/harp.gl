/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// Note, This worker script, requites WebpackWorkerChunkPlyfill, see docs there.

import("@here/harp-omv-datasource/index-worker").then(({ OmvTileDecoderService }) => {
    OmvTileDecoderService.start();
});
