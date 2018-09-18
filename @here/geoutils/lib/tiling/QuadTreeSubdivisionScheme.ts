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

import { SubdivisionScheme } from "./SubdivisionScheme";

class QuadTreeSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(): number {
        return 2;
    }
    getSubdivisionY(): number {
        return 2;
    }
    getLevelDimensionX(level: number): number {
        // tslint:disable-next-line:no-bitwise
        return 1 << level;
    }
    getLevelDimensionY(level: number): number {
        // tslint:disable-next-line:no-bitwise
        return 1 << level;
    }
}

/**
 * [[SubdivisionScheme]] representing a quadtree.
 */
export const quadTreeSubdivisionScheme: SubdivisionScheme = new QuadTreeSubdivisionScheme();
