/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface representing a `SubdivisionScheme`.
 */
export interface SubdivisionScheme {
    /**
     * Returns the number of columns for the given level.
     *
     * @param level - The level.
     */
    getSubdivisionX(level: number): number;

    /**
     * Returns the number of rows for the given level.
     *
     * @param level - The level.
     */
    getSubdivisionY(level: number): number;

    /**
     * Returns the width of the partitions at the given level.
     *
     * @param level - The level.
     */
    getLevelDimensionX(level: number): number;

    /**
     * Returns the height of the partitions at the given level.
     *
     * @param level - The level.
     */
    getLevelDimensionY(level: number): number;
}
