/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextCanvas } from "@here/harp-text-canvas";
import { PoiRenderer } from "../poi/PoiRenderer";

export interface TextCanvasRenderer {
    fontCatalog: string;
    textCanvas: TextCanvas;
    poiRenderer: PoiRenderer;
}
