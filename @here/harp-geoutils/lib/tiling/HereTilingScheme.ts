/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizedEquirectangularProjection } from "../projection/EquirectangularProjection";
import { halfQuadTreeSubdivisionScheme } from "./HalfQuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * {@link TilingScheme} used by most of the data published by HERE.
 *
 * The `hereTilingScheme` features a half quadtree subdivision scheme and an equirectangular
 * projection.
 */
export const hereTilingScheme = new TilingScheme(
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection
);
