/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "./TileKey";

export class SubTiles implements Iterable<TileKey> {
    constructor(public tileKey: TileKey, public sizeX: number, public sizeY: number) {}

    [Symbol.iterator](): Iterator<TileKey> {
        return this.sizeX === 2 && this.sizeY === 2
            ? SubTiles.ZCurveIterator(this.tileKey)
            : SubTiles.RowColumnIterator(this.tileKey, this.sizeX, this.sizeY);
    }
}

export namespace SubTiles {
    export function* RowColumnIterator(
        parentKey: TileKey,
        sizeX: number,
        sizeY: number
    ): Iterator<TileKey> {
        for (let y = 0; y < sizeY; y++) {
            for (let x = 0; x < sizeX; x++) {
                yield TileKey.fromRowColumnLevel(
                    parentKey.row * sizeY + y,
                    parentKey.column * sizeX + x,
                    parentKey.level + 1
                );
            }
        }
    }

    export function* ZCurveIterator(parentKey: TileKey): Iterator<TileKey> {
        for (let i = 0; i < 4; i++) {
            yield TileKey.fromRowColumnLevel(
                (parentKey.row << 1) | (i >> 1),
                (parentKey.column << 1) | (i & 1),
                parentKey.level + 1
            );
        }
    }
}
