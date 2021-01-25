/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { webMercatorProjection } from "../projection/MercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * A {@link TilingScheme} featuring quadtree subdivision scheme and web Mercator projection.
 */
export const webMercatorTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    webMercatorProjection
);
