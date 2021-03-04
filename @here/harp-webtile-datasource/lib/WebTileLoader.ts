/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseTileLoader, Tile, TileLoaderState } from "@here/harp-mapview";
import { addGroundPlane } from "@here/harp-mapview/lib/geometry/AddGroundPlane";
import { enableBlending } from "@here/harp-materials";
import * as THREE from "three";

import { WebTileDataProvider, WebTileDataSource } from "./WebTileDataSource";

/**
 * TileLoader used by `WebTileDataSource`.
 */
export class WebTileLoader extends BaseTileLoader {
    /**
     * Set up loading of a single [[Tile]].
     *
     * @param dataSource - The [[DataSource]] the tile belongs to.
     * @param tileKey - The quadtree address of a [[Tile]].
     * @param dataProvider - The [[DataProvider]] that retrieves the binary tile data.
     */
    constructor(
        protected dataSource: WebTileDataSource,
        private readonly tile: Tile,
        private readonly dataProvider: WebTileDataProvider
    ) {
        super(dataSource, tile.tileKey);
    }

    /**
     * @override
     */
    protected loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataProvider
            .getTexture(this.tile, abortSignal)
            .then(value => {
                if (value === undefined || value[0] === undefined) {
                    this.tile.forceHasGeometry(true);
                    onDone(TileLoaderState.Ready);
                    return;
                }

                const [texture, copyrightInfo] = value;
                if (copyrightInfo !== undefined) {
                    this.tile.copyrightInfo = copyrightInfo;
                }

                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                this.tile.addOwnedTexture(texture);
                const planeMesh = addGroundPlane(
                    this.tile,
                    this.dataSource.renderOrder,
                    0xffffff,
                    this.dataSource.opacity,
                    true
                );
                const planeMaterial = planeMesh.material as THREE.MeshBasicMaterial;
                planeMaterial.map = texture;
                if (this.dataSource.transparent) {
                    enableBlending(planeMaterial);
                }
                planeMaterial.depthTest = false;

                this.tile.invalidateResourceInfo();
                this.dataSource.requestUpdate();
                onDone(TileLoaderState.Ready);
            }, onError)
            .catch(onError);
    }
}
