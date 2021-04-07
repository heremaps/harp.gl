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

export class TileKeyUtils {
    static geoCoordinatesToTileKey(
        tilingScheme: TilingScheme,
        geoPoint: GeoCoordinatesLike,
        level: number
    ): TileKey | null {
        const projection = tilingScheme.projection;
        const worldPoint = projection.projectPoint(geoPoint);

        return this.worldCoordinatesToTileKey(tilingScheme, worldPoint, level);
    }

    static worldCoordinatesToTileKey(
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

    static geoRectangleToTileKeys(
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
}
