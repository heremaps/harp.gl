/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubdivisionScheme } from "./SubdivisionScheme";
import { SubTiles } from "./SubTiles";
import { TileKey } from "./TileKey";

export class TileTreeTraverse {
    private m_subdivisionScheme: SubdivisionScheme;

    constructor(subdivisionScheme: SubdivisionScheme) {
        this.m_subdivisionScheme = subdivisionScheme;
    }

    subTiles(tileKey: TileKey): TileKey[] {
        const subTileCount =
            this.m_subdivisionScheme.getSubdivisionX(tileKey.level) *
            this.m_subdivisionScheme.getSubdivisionY(tileKey.level);

        // tslint:disable-next-line:no-bitwise
        const subTileMask = ~(~0 << subTileCount);

        const subTiles = new SubTiles(tileKey, 1, subTileMask);
        const result = new Array<TileKey>();

        for (const subTile of subTiles) {
            result.push(subTile);
        }

        return result;
    }
}
