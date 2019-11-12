/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { TileKey, TilingScheme, webMercatorTilingScheme } from "@here/harp-geoutils";
import { MapMeshBasicMaterial, MapMeshStandardMaterial } from "@here/harp-materials";
import { Color, Material } from "three";
import { DataSource } from "./DataSource";
import { TileGeometryCreator } from "./geometry/TileGeometryCreator";
import { Tile } from "./Tile";

/**
 * Provides background geometry for all tiles.
 */
export class BackgroundDataSource extends DataSource {
    private static readonly DEFAULT_TILING_SCHEME = webMercatorTilingScheme;
    private m_tilingScheme: TilingScheme = BackgroundDataSource.DEFAULT_TILING_SCHEME;

    private m_material: Material;
    constructor(readonly shadowsEnabled: boolean) {
        super({ name: "background" });
        this.cacheable = true;
        this.addGroundPlane = true;
        this.m_material = this.createMaterial(new Color());
    }

    set color(value: Color) {
        (this.m_material as MapMeshBasicMaterial).color = value;
    }

    get color(): Color {
        return (this.m_material as MapMeshBasicMaterial).color;
    }

    updateStorageLevelOffset() {
        let storageLevelOffset: number | undefined;

        this.mapView.dataSources.forEach(ds => {
            if (ds === this) {
                return;
            }
            const tilingScheme = ds.getTilingScheme();
            if (tilingScheme === this.m_tilingScheme) {
                storageLevelOffset =
                    storageLevelOffset === undefined
                        ? ds.storageLevelOffset
                        : Math.max(storageLevelOffset, ds.storageLevelOffset);
            }
        });

        if (storageLevelOffset === undefined) {
            storageLevelOffset = 0;
        }

        if (storageLevelOffset !== this.storageLevelOffset) {
            this.storageLevelOffset = storageLevelOffset;
            this.mapView.clearTileCache(this.name);
        }
    }

    /** @override */
    setTheme(theme: Theme, languages?: string[]) {
        this.mapView.clearTileCache(this.name);
    }

    setTilingScheme(tilingScheme?: TilingScheme) {
        const newScheme = tilingScheme || BackgroundDataSource.DEFAULT_TILING_SCHEME;
        if (newScheme === this.m_tilingScheme) {
            return;
        }

        this.m_tilingScheme = newScheme;
        this.updateStorageLevelOffset();
        this.mapView.clearTileCache(this.name);
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        const tile = new Tile(this, tileKey);
        tile.forceHasGeometry(true);
        tile.removeDecodedTile(); // Skip geometry loading.
        TileGeometryCreator.instance.addGroundPlane(
            tile,
            Number.MIN_SAFE_INTEGER,
            this.m_material!
        );

        return tile;
    }

    private createMaterial(color: Color): Material {
        if (this.shadowsEnabled) {
            return new MapMeshStandardMaterial({
                color,
                visible: true,
                depthWrite: true,
                roughness: 1.0
            });
        } else {
            return new MapMeshBasicMaterial({
                color,
                visible: true,
                depthWrite: true
            });
        }
    }
}
