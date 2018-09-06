/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
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
        const it = subTiles.iterator();
        const result = new Array<TileKey>();

        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < subTiles.length; ++i) {
            result.push(it.value);
            it.next();
        }

        return result;
    }
}
