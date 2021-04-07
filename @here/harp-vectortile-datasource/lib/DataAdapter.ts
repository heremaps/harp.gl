/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodeInfo } from "./DecodeInfo";

/**
 * The class `DataAdapter` prepares vector data so it
 * can be processed by the vector tile decoder.
 */
export interface DataAdapter {
    /**
     * `DataAdapter`'s id.
     */
    id: string;

    /**
     * Checks if the given data can be processed by this `DataAdapter`.
     *
     * @param data - The raw data to adapt.
     */
    canProcess(data: ArrayBufferLike | {}): boolean;

    /**
     * Process the given raw data.
     *
     * @param data - The raw data to process.
     * @param decodeInfo - The `DecodeInfo` of the tile to process.
     */
    process(data: ArrayBufferLike | {}, decodeInfo: DecodeInfo): void;
}
