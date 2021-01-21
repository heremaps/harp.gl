/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection } from "../projection/MercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * The {@link TilingScheme} used by the HERE web tiles.
 *
 * The `mercatorTilingScheme` features a quadtree subdivision scheme and a Mercator projection.
 */
export const mercatorTilingScheme = new TilingScheme(quadTreeSubdivisionScheme, mercatorProjection);
