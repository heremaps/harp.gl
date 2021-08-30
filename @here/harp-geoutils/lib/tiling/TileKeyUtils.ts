/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Vector3Like } from "../math/Vector3Like";
import { TileKey } from "./TileKey";
import { TilingScheme } from "./TilingScheme";

/** @hidden */
export const powerOfTwo = [
    0x1,
    0x2,
    0x4,
    0x8,
    0x10,
    0x20,
    0x40,
    0x80,
    0x100,
    0x200,
    0x400,
    0x800,
    0x1000,
    0x2000,
    0x4000,
    0x8000,
    0x10000,
    0x20000,
    0x40000,
    0x80000,
    0x100000,
    0x200000,
    0x400000,
    0x800000,
    0x1000000,
    0x2000000,
    0x4000000,
    0x8000000,
    0x10000000,
    0x20000000,
    0x40000000,
    0x80000000,
    0x100000000,
    0x200000000,
    0x400000000,
    0x800000000,
    0x1000000000,
    0x2000000000,
    0x4000000000,
    0x8000000000,
    0x10000000000,
    0x20000000000,
    0x40000000000,
    0x80000000000,
    0x100000000000,
    0x200000000000,
    0x400000000000,
    0x800000000000,
    0x1000000000000,
    0x2000000000000,
    0x4000000000000,
    0x8000000000000,
    0x10000000000000
];

export namespace TileKeyUtils {
    export function geoCoordinatesToTileKey(
        tilingScheme: TilingScheme,
        geoPoint: GeoCoordinatesLike,
        level: number
    ): TileKey | null {
        const projection = tilingScheme.projection;
        const worldPoint = projection.projectPoint(geoPoint);

        return worldCoordinatesToTileKey(tilingScheme, worldPoint, level);
    }

    export function worldCoordinatesToTileKey(
        tilingScheme: TilingScheme,
        worldPoint: Vector3Like,
        level: number
    ): TileKey | null {
        const projection = tilingScheme.projection;
        const subdivisionScheme = tilingScheme.subdivisionScheme;

        const cx = subdivisionScheme.getLevelDimensionX(level);
        const cy = subdivisionScheme.getLevelDimensionY(level);

        const { min, max } = projection.worldExtent(0, 0);
        const worldSizeX = max.x - min.x;
        const worldSizeY = max.y - min.y;

        if (worldPoint.x < min.x || worldPoint.x > max.x) {
            return null;
        }

        if (worldPoint.y < min.y || worldPoint.y > max.y) {
            return null;
        }

        const column = Math.min(cx - 1, Math.floor((cx * (worldPoint.x - min.x)) / worldSizeX));
        const row = Math.min(cy - 1, Math.floor((cy * (worldPoint.y - min.y)) / worldSizeY));

        return TileKey.fromRowColumnLevel(row, column, level);
    }

    export function geoRectangleToTileKeys(
        tilingScheme: TilingScheme,
        geoBox: GeoBox,
        level: number
    ): TileKey[] {
        const wrap = (value: number, lower: number, upper: number) => {
            if (value < lower) {
                return upper - ((lower - value) % (upper - lower));
            }

            return lower + ((value - lower) % (upper - lower));
        };

        const clamp = (x: number, minVal: number, maxVal: number) => {
            return Math.min(Math.max(x, minVal), maxVal);
        };

        // Clamp at the poles and wrap around the international date line.
        const southWestLongitude = wrap(geoBox.southWest.longitudeInRadians, -Math.PI, Math.PI);
        const southWestLatitude = clamp(
            geoBox.southWest.latitudeInRadians,
            -(Math.PI * 0.5),
            Math.PI * 0.5
        );
        const northEastLongitude = wrap(geoBox.northEast.longitudeInRadians, -Math.PI, Math.PI);
        const northEastLatitude = clamp(
            geoBox.northEast.latitudeInRadians,
            -(Math.PI * 0.5),
            Math.PI * 0.5
        );
        const minTileKey = TileKeyUtils.geoCoordinatesToTileKey(
            tilingScheme,
            GeoCoordinates.fromRadians(southWestLatitude, southWestLongitude),
            level
        );
        const maxTileKey = TileKeyUtils.geoCoordinatesToTileKey(
            tilingScheme,
            GeoCoordinates.fromRadians(northEastLatitude, northEastLongitude),
            level
        );
        const columnCount = tilingScheme.subdivisionScheme.getLevelDimensionX(level);

        if (!minTileKey || !maxTileKey) {
            throw new Error("Invalid coordinates");
        }

        const minColumn = minTileKey.column;
        let maxColumn = maxTileKey.column;

        // wrap around case
        if (southWestLongitude > northEastLongitude) {
            if (maxColumn !== minColumn) {
                maxColumn += columnCount;
            } else {
                // do not duplicate
                maxColumn += columnCount - 1;
            }
        }

        const minRow = Math.min(minTileKey.row, maxTileKey.row);
        const maxRow = Math.max(minTileKey.row, maxTileKey.row);

        const keys = new Array<TileKey>();

        for (let row = minRow; row <= maxRow; ++row) {
            for (let column = minColumn; column <= maxColumn; ++column) {
                keys.push(TileKey.fromRowColumnLevel(row, column % columnCount, level));
            }
        }

        return keys;
    }

    /**
     * Creates a unique key based on the supplied parameters. Note, the uniqueness is bounded by the
     * bitshift. The [[TileKey.mortonCode()]] supports currently up to 26 levels (this is because
     * 26*2 equals 52, and 2^52 is the highest bit that can be set in an integer in Javascript), the
     * bitshift reduces this accordingly, so given the default bitshift of four, we support up to 24
     * levels. Given the current support up to level 19 this should be fine.
     *
     * @param tileKey - The unique {@link @here/harp-geoutils#TileKey}
     *                  from which to compute the unique key.
     * @param offset - How much the given {@link @here/harp-geoutils#TileKey} is offset
     * @param bitshift - How much space we have to store the offset. The default of 4 means we have
     *      enough space to store 16 unique tiles in a single view.
     */
    export function getKeyForTileKeyAndOffset(
        tileKey: TileKey,
        offset: number,
        bitshift: number = 4
    ) {
        const shiftedOffset = getShiftedOffset(offset, bitshift);
        return tileKey.mortonCode() + shiftedOffset;
    }

    /**
     * Extracts the offset and morton key from the given key (must be created by:
     * [[getKeyForTileKeyAndOffset]])
     *
     * Note, we can't use bitshift operators in Javascript because they work on 32-bit integers, and
     * would truncate the numbers, hence using powers of two.
     *
     * @param key - Key to extract offset and morton key.
     * @param bitshift - How many bits to shift by, must be the same as was used when creating the
     * key.
     */
    export function extractOffsetAndMortonKeyFromKey(key: number, bitshift: number = 4) {
        let offset = 0;
        let mortonCode = key;
        let i = 0;
        // Compute the offset
        for (; i < bitshift; i++) {
            // Note, we use 52, because 2^53-1 is the biggest value, the highest value
            // that can be set is the bit in the 52th position.
            const num = powerOfTwo[52 - i];
            if (mortonCode >= num) {
                mortonCode -= num;
                offset += powerOfTwo[bitshift - 1 - i];
            }
        }
        // We subtract half of the total amount, this undoes what is computed in getShiftedOffset
        offset -= powerOfTwo[bitshift - 1];
        return { offset, mortonCode };
    }

    /**
     * Returns the key of the parent. Key must have been computed using the function
     * [[getKeyForTileKeyAndOffset]].
     *
     * @param calculatedKey - Key to decompose
     * @param bitshift - Bit shift used to create the key
     */
    export function getParentKeyFromKey(calculatedKey: number, bitshift: number = 4) {
        const { offset, mortonCode } = extractOffsetAndMortonKeyFromKey(calculatedKey, bitshift);
        const parentTileKey = TileKey.fromMortonCode(TileKey.parentMortonCode(mortonCode));
        return getKeyForTileKeyAndOffset(parentTileKey, offset, bitshift);
    }

    /**
     * Packs the supplied offset into the high bits, where the highbits are between 2^52 and
     * 2^(52-bitshift).
     *
     * Offsets are wrapped around, to fit in the offsetBits. In practice, this doesn't really
     * matter, this is primarily used to find a unique id, if there is an offset 10, which is
     * wrapped to 2, it doesn't matter, because the offset of 10 is still stored in the tile.
     * What can be a problem though is that the cache gets filled up and isn't emptied.
     *
     * Note, because bit shifting in JavaScript works on 32 bit integers, we use powers of 2 to set
     * the high bits instead.
     *
     * @param offset - Offset to pack into the high bits.
     * @param offsetBits - How many bits to use to pack the offset.
     */
    function getShiftedOffset(offset: number, offsetBits: number = 4) {
        let result = 0;
        const totalOffsetsToStore = powerOfTwo[offsetBits];
        //Offsets are stored by adding half 2 ^ (bitshift - 1), i.e.half of the max amount stored,
        //and then wrapped based on this value.For example, given a bitshift of 3, and an offset -
        //3, it would have 4 added(half of 2 ^ 3), and be stored as 1, 3 would have 4 added and be
        //stored as 7, 4 would be added with 4 and be stored as 0 (it wraps around).
        offset += totalOffsetsToStore / 2;
        while (offset < 0) {
            offset += totalOffsetsToStore;
        }
        while (offset >= totalOffsetsToStore) {
            offset -= totalOffsetsToStore;
        }
        // Offset is now a number between >= 0 and < totalOffsetsToStore
        for (let i = 0; i < offsetBits && offset > 0; i++) {
            // 53 is used because 2^53-1 is the biggest number that Javascript can represent as an
            // integer safely.
            if (offset & 0x1) {
                result += powerOfTwo[53 - offsetBits + i];
            }
            offset >>>= 1;
        }
        return result;
    }
}
