/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubdivisionScheme } from "./SubdivisionScheme";

class HalfQuadTreeSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(): number {
        return 2;
    }
    getSubdivisionY(level: number): number {
        return level === 0 ? 1 : 2;
    }
    getLevelDimensionX(level: number): number {
        // tslint:disable-next-line:no-bitwise
        return 1 << level;
    }
    getLevelDimensionY(level: number): number {
        // tslint:disable-next-line:no-bitwise
        return level !== 0 ? 1 << (level - 1) : 1;
    }
}

/**
 * A [[SubdivisionScheme]] used to represent half quadtrees. This particular subdivision scheme is
 * used by the HERE tiling scheme.
 */
export const halfQuadTreeSubdivisionScheme: SubdivisionScheme = new HalfQuadTreeSubdivisionScheme();
