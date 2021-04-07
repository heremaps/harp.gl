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
}
