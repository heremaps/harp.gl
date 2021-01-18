/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TilingScheme } from "@here/harp-geoutils";
import { TileKey } from "@here/harp-geoutils/lib/tiling/TileKey";

/**
 * Status of the elevation range calculation.
 */
export enum CalculationStatus {
    // Calculated approximately. A more precise result may be available later.
    PendingApproximate,
    // Calculation completed. The result is final, won't improve upon retrying.
    FinalPrecise
}

/**
 * Elevation range with an optional calculation status.
 */
export interface ElevationRange {
    minElevation: number;
    maxElevation: number;
    calculationStatus?: CalculationStatus;
}

/**
 * Source for elevation ranges per tile. The returned elevation ranges will be used in the visible
 * tile computation to calculate proper bounding boxes.
 */
export interface ElevationRangeSource {
    /**
     * Compute the elevation range for a given {@link @here/harp-geoutils#TileKey}.
     * @param tileKey - The tile for which the elevation range should be computed.
     */
    getElevationRange(tileKey: TileKey): ElevationRange;

    /**
     * The tiling scheme of this {@link ElevationRangeSource}.
     *
     * @remarks
     * {@link MapView} will only apply the elevation
     * ranges returned by [[getElevationRange]] that have
     * the same {@link @here/harp-geoutils#TilingScheme}.
     */
    getTilingScheme(): TilingScheme;

    /**
     * Connects to the underlying data.
     */
    connect(): Promise<void>;

    /**
     * Returns `true` if this `ElevationRangeSource` is ready and the {@link MapView} can invoke
     * `getElevationRange()` to start requesting data.
     */
    ready(): boolean;
}
