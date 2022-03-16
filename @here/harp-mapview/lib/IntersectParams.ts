/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parameters to customize behaviour of {@link (MapView.intersectMapObjects)}.
 */
export interface IntersectParams {
    /**
     * The maximum number of results to be retrieved from the intersection test. If set, only the
     * first maxResultCount results will be returned, following an order by distance first, then
     * by reversed render order (topmost/highest render order first).
     */
    maxResultCount?: number;

    /**
     * Indicates if multiple results for the same feature are allowed.
     * A feature may represented multiple times, like a tunnel which is represented by an outline and a centerline.
     * For certain use cases it's necessary to obtain all representations, like for a the style editor.
     */
    allowDuplicates?: boolean;
}
