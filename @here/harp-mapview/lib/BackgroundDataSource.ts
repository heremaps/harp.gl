/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey, TilingScheme, webMercatorTilingScheme } from "@here/harp-geoutils";
import { DataSource } from "./DataSource";
import { TileGeometryCreator } from "./geometry/TileGeometryCreator";
import { Tile } from "./Tile";

/**
 * Provides background geometry for all tiles.
 */
export class BackgroundDataSource extends DataSource {
    private static readonly DEFAULT_TILING_SCHEME = webMercatorTilingScheme;
    private m_referenceDataSource: DataSource | undefined;
    private m_tilingScheme: TilingScheme;

    constructor() {
        super("background", undefined, 1, 20);
        this.cacheable = true;
        this.m_referenceDataSource = undefined;
        this.m_tilingScheme = BackgroundDataSource.DEFAULT_TILING_SCHEME;
    }

    updateTilingScheme() {
        if (
            this.m_referenceDataSource &&
            this.mapView.isDataSourceEnabled(this.m_referenceDataSource)
        ) {
            return;
        }

        const newReferenceDataSource = this.mapView.dataSources.find(
            ds => ds !== this && this.mapView.isDataSourceEnabled(ds)
        );

        const tilingSchemeChanged = this.setReferenceDataSource(newReferenceDataSource);

        if (tilingSchemeChanged) {
            this.mapView.clearTileCache(this.name);
        }
    }
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    getTile(tileKey: TileKey): Tile | undefined {
        const tile = new Tile(this, tileKey);
        tile.forceHasGeometry(true);
        tile.removeDecodedTile(); // Skip geometry loading.
        TileGeometryCreator.instance.addGroundPlane(tile);

        return tile;
    }

    // Returns true if the tiling scheme changed, false otherwise.
    private setReferenceDataSource(referenceDataSource: DataSource | undefined): boolean {
        this.m_referenceDataSource = referenceDataSource;
        let newTilingScheme = BackgroundDataSource.DEFAULT_TILING_SCHEME;

        if (this.m_referenceDataSource !== undefined) {
            newTilingScheme = this.m_referenceDataSource.getTilingScheme();
            this.storageLevelOffset = this.m_referenceDataSource.storageLevelOffset;
        }
        const tilingSchemeChanged = this.m_tilingScheme !== newTilingScheme;

        this.m_tilingScheme = newTilingScheme;

        return tilingSchemeChanged;
    }
}
