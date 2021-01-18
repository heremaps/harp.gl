/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubdivisionScheme } from "./SubdivisionScheme";

class QuadTreeSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(): number {
        return 2;
    }

    getSubdivisionY(): number {
        return 2;
    }

    getLevelDimensionX(level: number): number {
        return 1 << level;
    }

    getLevelDimensionY(level: number): number {
        return 1 << level;
    }
}

/**
 * {@link SubdivisionScheme} representing a quadtree.
 */
export const quadTreeSubdivisionScheme: SubdivisionScheme = new QuadTreeSubdivisionScheme();
