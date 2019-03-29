/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind, GeometryKindSet } from "@here/harp-datasource-protocol";

import { MapView } from "../MapView";
import { Tile } from "../Tile";
import { SimpleTileGeometryLoader, TileGeometryLoader } from "./TileGeometryLoader";

export interface TileGeometryManager {
    enabledGeometryKinds: GeometryKindSet;
    disabledGeometryKinds: GeometryKindSet;
    hiddenGeometryKinds: GeometryKindSet;
    visibilityChanged: boolean;

    initTile(tiles: Tile): void;

    updateTiles(tiles: Tile[]): void;

    clear(): void;

    enableKind(kind: GeometryKind | GeometryKind[] | GeometryKindSet, enable: boolean): void;
    disableKind(kind: GeometryKind | GeometryKind[] | GeometryKindSet, enable: boolean): void;

    hideKind(kind: GeometryKind | GeometryKind[] | GeometryKindSet, show: boolean): void;

    getAvailableKinds(tiles: Tile[]): GeometryKindSet;
}

export abstract class TileGeometryManagerBase implements TileGeometryManager {
    protected enabledKinds: GeometryKindSet = new Set();
    protected disabledKinds: GeometryKindSet = new Set();
    protected hiddenKinds: GeometryKindSet = new Set();

    protected enableFilterByKind: boolean = true;

    private m_visibilityChanged: boolean = true;

    constructor(protected mapView: MapView) {}

    abstract initTile(tile: Tile): void;

    abstract updateTiles(tiles: Tile[]): void;

    clear(): void {
        this.enabledKinds = new Set();
        this.disabledKinds = new Set();
        this.hiddenKinds = new Set();
    }

    get enabledGeometryKinds(): GeometryKindSet {
        return this.enabledKinds;
    }

    set enabledGeometryKinds(kinds: GeometryKindSet) {
        this.enabledKinds = kinds;
    }

    get disabledGeometryKinds(): GeometryKindSet {
        return this.disabledKinds;
    }

    set disabledGeometryKinds(kinds: GeometryKindSet) {
        this.disabledKinds = kinds;
    }

    get hiddenGeometryKinds(): GeometryKindSet {
        return this.hiddenKinds;
    }

    set hiddenGeometryKinds(kinds: GeometryKindSet) {
        this.hiddenKinds = kinds;
        this.m_visibilityChanged = true;
    }

    get visibilityChanged(): boolean {
        return this.m_visibilityChanged;
    }

    set visibilityChanged(changed: boolean) {
        this.m_visibilityChanged = changed;
    }

    enableKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        enable: boolean = false
    ): void {
        this.enableDisableKinds(this.enabledKinds, kind, enable);
    }

    disableKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        enable: boolean = false
    ): void {
        this.enableDisableKinds(this.disabledKinds, kind, enable);
    }

    hideKind(kind: GeometryKind | GeometryKind[] | GeometryKindSet, show: boolean = false): void {
        let visibilityHasChanged = false;
        if (Array.isArray(kind)) {
            for (const oneKind of kind as GeometryKind[]) {
                visibilityHasChanged =
                    visibilityHasChanged || this.addRemove(this.hiddenKinds, oneKind, !show);
            }
        } else if (kind instanceof Set) {
            const kindSet = kind as GeometryKindSet;
            for (const oneKind of kindSet) {
                visibilityHasChanged =
                    visibilityHasChanged || this.addRemove(this.hiddenKinds, oneKind, !show);
            }
        } else if (kind !== undefined) {
            visibilityHasChanged =
                visibilityHasChanged || this.addRemove(this.hiddenKinds, kind, !show);
        }
        this.m_visibilityChanged = visibilityHasChanged;
    }

    getAvailableKinds(tiles: Tile[]): GeometryKindSet {
        const visibleKinds: GeometryKindSet = new Set();
        for (const tile of tiles) {
            const geometryLoader = tile.tileGeometryLoader as TileGeometryLoader;
            if (geometryLoader !== undefined) {
                const tileKinds = geometryLoader.availableGeometryKinds;
                if (tileKinds !== undefined) {
                    for (const kind of tileKinds) {
                        visibleKinds.add(kind);
                    }
                }
            }
        }
        return visibleKinds;
    }

    set filterByKind(enable: boolean) {
        this.enableFilterByKind = enable;
    }

    get filterByKind(): boolean {
        return this.enableFilterByKind;
    }

    updateTileObjectVisibility(tiles: Tile[]): void {
        for (const tile of tiles) {
            for (const object of tile.objects) {
                const geometryKind: GeometryKind[] | undefined =
                    object.userData !== undefined ? object.userData.kind : undefined;
                if (geometryKind !== undefined) {
                    let isVisible = true;
                    for (const kind of geometryKind) {
                        isVisible = isVisible && !this.hiddenKinds.has(kind);
                    }
                    object.visible = isVisible;
                }
            }
        }
    }

    private enableDisableKinds(
        set: GeometryKindSet,
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        enable: boolean = false
    ): void {
        if (Array.isArray(kind)) {
            for (const oneKind of kind as GeometryKind[]) {
                this.addRemove(set, oneKind, !enable);
            }
        } else if (kind instanceof Set) {
            const kindSet = kind as GeometryKindSet;
            for (const oneKind of kindSet) {
                this.addRemove(set, oneKind, !enable);
            }
        } else if (kind !== undefined) {
            this.addRemove(set, kind, !enable);
        }
    }

    private addRemove(kinds: GeometryKindSet, kind: GeometryKind, add: boolean): boolean {
        if (add) {
            if (!kinds.has(kind)) {
                kinds.add(kind);
                return true;
            }
        } else {
            if (kinds.has(kind)) {
                kinds.delete(kind);
                return true;
            }
        }
        return false;
    }
}

export class SimpleTileGeometryManager extends TileGeometryManagerBase {
    constructor(mapView: MapView) {
        super(mapView);
    }

    initTile(tile: Tile): void {
        tile.tileGeometryLoader = new SimpleTileGeometryLoader(tile);
    }

    updateTiles(tiles: Tile[]): void {
        for (const tile of tiles) {
            const geometryLoader = tile.tileGeometryLoader as TileGeometryLoader;
            if (geometryLoader !== undefined) {
                geometryLoader.update(
                    this.filterByKind ? this.enabledGeometryKinds : undefined,
                    this.filterByKind ? this.disabledGeometryKinds : undefined
                );
            }
        }

        if (this.visibilityChanged) {
            this.updateTileObjectVisibility(tiles);
            this.visibilityChanged = false;
        }
    }
}
