/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubdivisionScheme } from "./SubdivisionScheme";
import { TileKey } from "./TileKey";

export class TileTreeTraverse {
    private m_subdivisionScheme: SubdivisionScheme;

    constructor(subdivisionScheme: SubdivisionScheme) {
        this.m_subdivisionScheme = subdivisionScheme;
    }

    subTiles(tileKey: TileKey): TileKey[] {
        const level = tileKey.level;
        const divX = this.m_subdivisionScheme.getSubdivisionX(level);
        const divY = this.m_subdivisionScheme.getSubdivisionY(level);

        const result = new Array<TileKey>();

        for (let y = 0; y < divY; y++) {
            for (let x = 0; x < divX; x++) {
                result.push(
                    TileKey.fromRowColumnLevel(
                        tileKey.row * divY + y,
                        tileKey.column * divX + x,
                        level + 1
                    )
                );
            }
        }

        return result;
    }
}
