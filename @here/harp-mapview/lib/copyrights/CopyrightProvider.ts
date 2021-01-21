/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "@here/harp-geoutils";

import { CopyrightInfo } from "./CopyrightInfo";

/**
 * `CopyrightProvider` is an interface to retrieve copyrights information for geographic region
 * specified by bounding box.
 */
export interface CopyrightProvider {
    /**
     * Retrieves copyrights.
     *
     * @param geoBox - Bounding geo box to get copyrights for.
     * @param level - Zoom level to get copyrights for.
     * @returns Promise with an array of copyrights for this geo box.
     */
    getCopyrights(geoBox: GeoBox, level: number): Promise<CopyrightInfo[]>;
}
