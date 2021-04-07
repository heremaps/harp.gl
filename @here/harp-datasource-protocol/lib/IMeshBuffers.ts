/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Group } from "./DecodedTile";

export interface IMeshBuffers {
    /**
     * Array that stores the vertices of the mesh.
     */
    readonly positions: number[];

    /**
     * Array of [[Group]], used to defines multiple geometries sharing the same position attribute.
     */
    readonly groups: Group[];

    /**
     * Array that stores the indices of the mesh.
     */
    readonly indices: number[];

    /**
     * Array that stores the indices of the mesh edges.
     */
    readonly edgeIndices: number[];

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    readonly featureStarts: number[];
}
