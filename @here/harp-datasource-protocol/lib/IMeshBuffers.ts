/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
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
     * Array used by the [[Outliner]] class to create outlines of areas.
     */
    readonly outlineIndices: number[][];

    /**
     * Array used by the [[Extruder]] class to create extruded geometry for the buildings.
     */
    readonly edgeIndices: number[];

    /**
     * Optional list of feature IDs. Currently only Number is supported, will fail if features have
     * IDs with type Long.
     */
    readonly featureIds: Array<number | undefined>;

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    readonly featureStarts: number[];
}
