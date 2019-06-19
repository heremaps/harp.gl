/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { webMercatorProjection } from "../projection/MercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * A [[TilingScheme]] featuring quadtree subdivision scheme and web Mercator projection.
 */
export const webMercatorTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    webMercatorProjection
);
