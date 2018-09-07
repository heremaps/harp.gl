/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

/**
 * Interface representing a `SubdivisionScheme`.
 */
export interface SubdivisionScheme {
    /**
     * Returns the number of columns for the given level.
     *
     * @param level The level.
     */
    getSubdivisionX(level: number): number;

    /**
     * Returns the number of rows for the given level.
     *
     * @param level The level.
     */
    getSubdivisionY(level: number): number;

    /**
     * Returns the width of the partitions at the given level.
     *
     * @param level The level.
     */
    getLevelDimensionX(level: number): number;

    /**
     * Returns the height of the partitions at the given level.
     *
     * @param level The level.
     */
    getLevelDimensionY(level: number): number;
}
