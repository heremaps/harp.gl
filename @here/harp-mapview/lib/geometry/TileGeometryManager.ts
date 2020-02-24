/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryKind, GeometryKindSet } from "@here/harp-datasource-protocol";
import { MapView } from "../MapView";
import { Tile } from "../Tile";
import { SimpleTileGeometryLoader, TileGeometryLoader } from "./TileGeometryLoader";

type TileUpdateCallback = (tile: Tile) => void;

/**
 * Manages the content (the geometries) of a tile. Derived classes allow different strategies that
 * control the sequence in which the geometries of the tile are being loaded.
 */
export interface TileGeometryManager {
    /**
     * The set of geometry kinds that is enabled. Their geometry will be created after decoding.
     */
    enabledGeometryKinds: GeometryKindSet;

    /**
     * The set of geometry kinds that is disabled. Their geometry will not be created after
     * decoding.
     */
    disabledGeometryKinds: GeometryKindSet;

    /**
     * The set of geometry kinds that is hidden. Their geometry may be created, but it is hidden
     * until the method `hideKind` with an argument of `addOrRemoveToHiddenSet:false` is called.
     */
    hiddenGeometryKinds: GeometryKindSet;

    /**
     * If set to `true`, the filters of enabled/disabledGeometryKinds are applied, otherwise they
     * are ignored.
     */
    enableFilterByKind: boolean;

    /**
     * Initialize the [[Tile]] with the TileGeometryManager.
     */
    initTile(tile: Tile): void;

    /**
     * Process the [[Tile]]s for rendering. May alter the content of the tile per frame.
     */
    updateTiles(tiles: Tile[]): void;

    /**
     * Clear the enabled, disabled and hidden sets.
     */
    clear(): void;

    /**
     * Enable a [[GeometryKind]] by adding it to the enabled set, or remove it from that set.
     *
     * @param {(GeometryKind | GeometryKind[] | GeometryKindSet)} kind The kind to add or remove
     *      from the enabled set.
     * @param {boolean} addOrRemoveToEnabledSet Pass in `true` to add the kind to the set, pass in
     *      `false` to remove from that set.
     */
    enableKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addOrRemoveToEnabledSet: boolean
    ): void;

    /**
     * Disable a [[GeometryKind]] by adding it to the disabled set, or remove it from that set.
     *
     * @param {(GeometryKind | GeometryKind[] | GeometryKindSet)} kind The kind to add or remove
     *      from the disabled set.
     * @param {boolean} addOrRemoveToHiddenSet Pass in `true` to add the kind to the set, pass in
     *      `false` to remove from that set.
     */
    disableKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addOrRemoveToDisabledSet: boolean
    ): void;

    /**
     * Hide a [[GeometryKind]] by adding it to the hidden set, or remove it from that set.
     *
     * @param {(GeometryKind | GeometryKind[] | GeometryKindSet)} kind The kind to add or remove
     *      from the hidden set.
     * @param {boolean} addOrRemoveToHiddenSet Pass in `true` to hide the kind(s), `false` to show
     *      it again.
     */
    hideKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addOrRemoveToHiddenSet: boolean
    ): void;

    /**
     * Return all [[GeometryKind]]s that are contained in the tiles.
     *
     * @param {IterableIterator<Tile>} tiles The
     * @returns {GeometryKindSet}
     */
    getAvailableKinds(tiles: IterableIterator<Tile>): GeometryKindSet;

    /**
     * Sets a callback that will be called for every updated tile on [[updateTiles]].
     *
     * @param {TileUpdateCallback} callback The callback that will be called after a tile has been
     * updated, passing the updated tile as argument. If `undefined`, a previously set callback will
     * be cleared.
     */
    setTileUpdateCallback(callback?: TileUpdateCallback): void;
}

/**
 * Base class for all [[TileGeometryManager]]s. Handles visibility as well as enabling/disabling of
 * kinds of geometry [[GeometryKind]].
 */
export abstract class TileGeometryManagerBase implements TileGeometryManager {
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
        this.incrementVisibilityCounter();
    }

    protected get visibilityCounter(): number {
        return this.m_visibilityCounter;
    }

    enableFilterByKind: boolean = true;

    protected enabledKinds: GeometryKindSet = new GeometryKindSet();
    protected disabledKinds: GeometryKindSet = new GeometryKindSet();
    protected hiddenKinds: GeometryKindSet = new GeometryKindSet();

    protected m_tileUpdateCallback: TileUpdateCallback | undefined;

    /**
     * Optimization for evaluation in `update()` method. Only if a kind is hidden/unhidden, the
     * visibility of the kinds is applied to their geometries.
     */
    private m_visibilityCounter: number = 1;

    /**
     * Creates an instance of `TileGeometryManagerBase` with a reference to the [[MapView]].
     */
    constructor(protected mapView: MapView) {}

    abstract initTile(tile: Tile): void;

    abstract updateTiles(tiles: Tile[]): void;

    clear(): void {
        this.enabledKinds.clear();
        this.disabledKinds.clear();
        this.hiddenKinds.clear();
    }

    enableKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addOrRemoveToEnabledSet: boolean = true
    ): void {
        this.enableDisableKinds(this.enabledKinds, kind, addOrRemoveToEnabledSet);
    }

    disableKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addOrRemoveToDisabledSet: boolean = true
    ): void {
        this.enableDisableKinds(this.disabledKinds, kind, addOrRemoveToDisabledSet);
    }

    hideKind(
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addOrRemoveToHiddenSet: boolean = true
    ): void {
        let visibilityHasChanged = false;

        if (Array.isArray(kind) || kind instanceof Set) {
            for (const oneKind of kind) {
                const visibilityChange = this.addRemove(
                    this.hiddenKinds,
                    oneKind,
                    addOrRemoveToHiddenSet
                );
                visibilityHasChanged = visibilityHasChanged || visibilityChange;
            }
        } else {
            visibilityHasChanged = this.addRemove(this.hiddenKinds, kind, addOrRemoveToHiddenSet);
        }

        // Will be evaluated in the next update()
        if (visibilityHasChanged) {
            this.incrementVisibilityCounter();
        }
    }

    getAvailableKinds(tiles: IterableIterator<Tile>): GeometryKindSet {
        const visibleKinds: GeometryKindSet = new GeometryKindSet();
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

    /**
     * Apply the visibility status taken from the `hiddenKinds` to all geometries in the specified
     * tiles.
     *
     * @param {Tile[]} tiles List of [[Tiles]] to process the visibility status of.
     */
    updateTileObjectVisibility(tiles: Tile[]): boolean {
        let needUpdate = false;

        for (const tile of tiles) {
            if (tile.objects.length === 0 || tile.visibilityCounter === this.visibilityCounter) {
                continue;
            }
            tile.visibilityCounter = this.visibilityCounter;

            for (const object of tile.objects) {
                const geometryKind: GeometryKind[] | undefined =
                    object.userData !== undefined ? object.userData.kind : undefined;
                if (geometryKind !== undefined) {
                    const nowVisible = !geometryKind.some(kind => this.hiddenKinds.has(kind));
                    needUpdate = needUpdate || object.visible !== nowVisible;
                    object.visible = nowVisible;
                }
            }
        }
        return needUpdate;
    }

    setTileUpdateCallback(callback?: TileUpdateCallback): void {
        this.m_tileUpdateCallback = callback;
    }

    protected incrementVisibilityCounter(): number {
        return ++this.m_visibilityCounter;
    }

    /**
     * Add or remove a kind|array of kinds|set of kinds from the specified kind set.
     *
     * @hidden
     * @param {GeometryKindSet} set
     * @param {(GeometryKind | GeometryKind[] | GeometryKindSet)} kind
     * @param {boolean} addToSet
     */
    private enableDisableKinds(
        set: GeometryKindSet,
        kind: GeometryKind | GeometryKind[] | GeometryKindSet,
        addToSet: boolean
    ): void {
        if (Array.isArray(kind)) {
            for (const oneKind of kind as GeometryKind[]) {
                this.addRemove(set, oneKind, addToSet);
            }
        } else if (kind instanceof Set) {
            const kindSet = kind as GeometryKindSet;
            for (const oneKind of kindSet) {
                this.addRemove(set, oneKind, addToSet);
            }
        } else if (kind !== undefined) {
            this.addRemove(set, kind, addToSet);
        }
    }

    /**
     * Add or remove a single kind from the specified kind set.
     *
     * @hidden
     * @param {GeometryKindSet} set
     * @param {(GeometryKind | GeometryKind[] | GeometryKindSet)} kind
     * @param {boolean} addToSet
     */
    private addRemove(kindsSet: GeometryKindSet, kind: GeometryKind, addToSet: boolean): boolean {
        if (addToSet) {
            if (!kindsSet.has(kind)) {
                kindsSet.add(kind);
                return true;
            }
        } else {
            if (kindsSet.has(kind)) {
                kindsSet.delete(kind);
                return true;
            }
        }
        return false;
    }
}
/**
 * Implements the simplest for of [[TileGeometryManager]]. Uses a [[SimpleTileGeometryLoader]] to
 * load the geometries of the [[Tile]].
 */
export class SimpleTileGeometryManager extends TileGeometryManagerBase {
    /**
     * Creates an instance of `SimpleTileGeometryManager` with a reference to the [[MapView]].
     */
    constructor(mapView: MapView) {
        super(mapView);
    }

    /** @override */
    initTile(tile: Tile): void {
        if (tile.dataSource.useGeometryLoader) {
            tile.tileGeometryLoader = new SimpleTileGeometryLoader(tile);
        }
    }

    /** @override */
    updateTiles(tiles: Tile[]): void {
        for (const tile of tiles) {
            const geometryLoader = tile.tileGeometryLoader as TileGeometryLoader;
            if (geometryLoader !== undefined) {
                geometryLoader.update(
                    this.enableFilterByKind ? this.enabledGeometryKinds : undefined,
                    this.enableFilterByKind ? this.disabledGeometryKinds : undefined
                );
                if (this.m_tileUpdateCallback) {
                    this.m_tileUpdateCallback(tile);
                }
            }
        }

        // If the visibility status of the kinds changed since the last update, the new visibility
        // status is applied (again).
        if (this.updateTileObjectVisibility(tiles)) {
            this.mapView.update();
        }
    }
}
