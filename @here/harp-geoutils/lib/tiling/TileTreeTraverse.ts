/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubdivisionScheme } from "./SubdivisionScheme";
import { SubTiles } from "./SubTiles";
import { TileKey } from "./TileKey";

export class TileTreeTraverse {
    private readonly m_subdivisionScheme: SubdivisionScheme;

    constructor(subdivisionScheme: SubdivisionScheme) {
        this.m_subdivisionScheme = subdivisionScheme;
    }

    subTiles(tileKey: TileKey): Iterable<TileKey> {
        const divX = this.m_subdivisionScheme.getSubdivisionX(tileKey.level);
        const divY = this.m_subdivisionScheme.getSubdivisionY(tileKey.level);

        return new SubTiles(tileKey, divX, divY);
    }
}
