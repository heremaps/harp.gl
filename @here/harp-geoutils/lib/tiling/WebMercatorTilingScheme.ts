/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { webMercatorProjection } from "../projection/WebMercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * A [[TilingScheme]] featuring quadtree subdivision scheme and web Mercator projection.
 */
export const webMercatorTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    webMercatorProjection
);
