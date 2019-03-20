/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Projection, TileKey } from "@here/harp-geoutils";
import { LRUCache } from "@here/harp-lrucache";
import * as THREE from "three";

import { assert } from "@here/harp-utils";
import { DataSource } from "./DataSource";
import { ITile } from "./ITile";
import { MapTileCuller } from "./MapTileCuller";
import { Tile } from "./Tile";
import { TileProxy } from "./TileProxy";
import { TileOffsetUtils } from "./Utils";

/**
 * Limited set of [[MapViewOptions]] used for [[VisibleTileSet]].
 */
export interface VisibleTileSetOptions {
    /**
     * The projection of the view.
     */
    projection: Projection;

    /**
     * Limit of tiles that can be visible per datasource.
     */
    maxVisibleDataSourceTiles: number;

    /**
     * In addition to the simple frustum culling also do additional checks with [[MapTileCuller]].
     */
    extendedFrustumCulling: boolean;

    /**
     * Missing Typedoc
     */
    tileCacheSize: number;

    /**
     * Missing Typedoc
     */
    tileCacheMemorySize: number;

    /**
     * Number of levels to go up when searching for fallback tiles.
     */
    quadTreeSearchDistanceUp: number;

    /**
     * Number of levels to go down when searching for fallback tiles.
     */
    quadTreeSearchDistanceDown: number;
}

/**
 * Represents a unique TileKey and the area it takes up on screen.
 */
class TileKeyEntry {
    constructor(public tileKey: TileKey, public offset: number, public area: number) {}
}

/**
 * Stores [[Tile]]s or [[TileProxy]]'s in an [[LRUCache]]
 */
class DataSourceCache {
    readonly tileCache: LRUCache<number, ITile>;
    readonly disposedTiles: ITile[] = [];

    constructor(options: VisibleTileSetOptions) {
        this.tileCache = new LRUCache<number, ITile>(options.tileCacheSize);
        this.tileCache.evictionCallback = (_, tile) => {
            if (tile.tileLoader !== undefined) {
                // Cancel downloads as early as possible.
                tile.tileLoader.cancel();
            }
            this.disposedTiles.push(tile);
        };
        this.tileCache.canEvict = (_, tile) => {
            // It is possible that there are cache entries of type [[TileProxy]] which are pointed
            // to a disposed tile, so we can evict these also. Note, there is currently no way to
            // remove all [[TileProxy]]s, so it is possible that there are cached elements which
            // point to disposed [[Tile]]s, hence the check to see if it is disposed.
            return !tile.isVisible || tile.disposed;
        };
    }

    disposeTiles() {
        this.disposedTiles.forEach(tile => {
            tile.dispose();
        });

        this.disposedTiles.length = 0;
    }

    get(tileCode: number): ITile | undefined {
        return this.tileCache.get(tileCode);
    }
}

/**
 * List of visible tiles for a datasource.
 */
export interface DataSourceTileList {
    /**
     * The datasource that was producing the tiles.
     */
    dataSource: DataSource;

    /**
     * FIXME: zoomlevel is the actual storagelevel?!
     */
    zoomLevel: number;

    /**
     * The storage level of the visibleTiles.
     * Note: renderedTiles might contain tiles from different levels.
     */
    storageLevel: number;

    /**
     * True if all [[visibleTiles]] are loaded.
     */
    allVisibleTileLoaded: boolean;

    /**
     * The number of tiles which are still loading.
     */
    numTilesLoading: number;

    /**
     * List of tiles we want to render but they might not be renderable yet (e.g. loading).
     */
    visibleTiles: ITile[];

    /**
     * List of tiles that will be rendered. This includes tiles that are not in the visibleTiles
     * list but that are used as fallbacks b/c they are still in the cache.
     */
    renderedTiles: ITile[];
}

/**
 * Manages visible [[ITile]]s for [[MapView]].
 *
 * Responsible for election of rendered tiles:
 *  - quad-tree traversal
 *  - frustum culling
 *  - sorting tiles by relevance (visible area) to prioritize load
 *  - limiting number of visible tiles
 *  - caching tiles
 *  - searching cache to replace visible but yet empty tiles with already loaded siblings in nearby
 *    zoom levels
 */
export class VisibleTileSet {
    dataSourceTileList: DataSourceTileList[] = [];
    allVisibleTilesLoaded: boolean = false;
    options: VisibleTileSetOptions;

    private readonly m_dataSourceCache = new Map<string, DataSourceCache>();

    // used to project global coordinates into camera local coordinates
    private readonly m_viewProjectionMatrix = new THREE.Matrix4();
    private readonly m_mapTileCuller: MapTileCuller;
    private readonly m_frustum: THREE.Frustum = new THREE.Frustum();

    constructor(private readonly camera: THREE.PerspectiveCamera, options: VisibleTileSetOptions) {
        this.m_mapTileCuller = new MapTileCuller(camera);
        this.options = options;
    }

    /**
     * Returns cache size.
     */
    getDataSourceCacheSize(): number {
        return this.options.tileCacheSize;
    }

    /**
     * Sets cache size.
     *
     * @param size cache size
     */
    setDataSourceCacheSize(size: number): void {
        this.options.tileCacheSize = size;
        this.m_dataSourceCache.forEach(dataStore => {
            dataStore.tileCache.setCapacity(size);
        });
    }

    /**
     * Retrieves maximum number of visible tiles.
     */
    getNumberOfVisibleTiles() {
        return this.options.maxVisibleDataSourceTiles;
    }

    /**
     * Sets maximum number of visible tiles.
     *
     * @param size size of visible tiles array
     */
    setNumberOfVisibleTiles(size: number) {
        this.options.maxVisibleDataSourceTiles = size;
    }

    updateRenderList(
        worldCenter: THREE.Vector3,
        storageLevel: number,
        zoomLevel: number,
        dataSources: DataSource[]
    ): DataSourceTileList[] {
        const worldGeoPoint = this.options.projection.unprojectPoint(worldCenter);
        this.m_viewProjectionMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.m_frustum.setFromMatrix(this.m_viewProjectionMatrix);

        const rootTileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tileBounds = new THREE.Box3();

        const newRenderList: DataSourceTileList[] = [];
        let allVisibleTilesLoaded: boolean = true;

        if (this.options.extendedFrustumCulling) {
            this.m_mapTileCuller.setup();
        }

        for (const dataSource of dataSources) {
            const displayZoomLevel = dataSource.getDisplayZoomLevel(zoomLevel);

            const tilingScheme = dataSource.getTilingScheme();

            const workList: TileKeyEntry[] = [new TileKeyEntry(rootTileKey, 0, 0)];

            const visibleTiles: TileKeyEntry[] = [];

            const tileFrustumIntersectionCache = new Map<number, number>();
            tileFrustumIntersectionCache.set(
                TileOffsetUtils.getKeyForTileKeyAndOffset(rootTileKey, 0),
                Infinity
            );

            while (workList.length > 0) {
                const tileEntry = workList.pop();

                if (tileEntry === undefined) {
                    continue;
                }

                const tileKey = tileEntry.tileKey;
                const uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(
                    tileKey,
                    tileEntry.offset
                );
                const area = tileFrustumIntersectionCache.get(uniqueKey);

                if (area === undefined) {
                    throw new Error("Unexpected tile key");
                }

                if (area <= 0 || tileKey.level > displayZoomLevel) {
                    continue;
                }

                if (dataSource.shouldRender(displayZoomLevel, tileKey)) {
                    visibleTiles.push(tileEntry);
                }

                tilingScheme.getSubTileKeys(tileKey).forEach(childTileKey => {
                    // Here we attempt to find unique Tiles with +/- 5 offsets (which means
                    // there is a total of 11 possible tiles rendered)
                    const longitudeOffset = Math.round(worldGeoPoint.longitudeInDegrees / 360);
                    const ShiftAttempts = 5;
                    for (
                        let offset = longitudeOffset - ShiftAttempts;
                        offset <= longitudeOffset + ShiftAttempts;
                        offset++
                    ) {
                        const intersectsFrustum = tileFrustumIntersectionCache.get(
                            TileOffsetUtils.getKeyForTileKeyAndOffset(childTileKey, offset)
                        );

                        let subTileArea = 0;

                        if (intersectsFrustum === undefined) {
                            const tileGeoBox = tilingScheme.getGeoBox(childTileKey);
                            this.options.projection.projectBox(tileGeoBox, tileBounds);
                            const worldOffsetX =
                                this.options.projection.worldExtent(0, 0).max.x * offset;
                            tileBounds.translate(new THREE.Vector3(worldOffsetX, 0, 0));
                            tileBounds.min.sub(worldCenter);
                            tileBounds.max.sub(worldCenter);

                            if (
                                (!this.options.extendedFrustumCulling ||
                                    this.m_mapTileCuller.frustumIntersectsTileBox(tileBounds)) &&
                                this.m_frustum.intersectsBox(tileBounds)
                            ) {
                                const contour = [
                                    new THREE.Vector3(
                                        tileBounds.min.x,
                                        tileBounds.min.y,
                                        0
                                    ).applyMatrix4(this.m_viewProjectionMatrix),
                                    new THREE.Vector3(
                                        tileBounds.max.x,
                                        tileBounds.min.y,
                                        0
                                    ).applyMatrix4(this.m_viewProjectionMatrix),
                                    new THREE.Vector3(
                                        tileBounds.max.x,
                                        tileBounds.max.y,
                                        0
                                    ).applyMatrix4(this.m_viewProjectionMatrix),
                                    new THREE.Vector3(
                                        tileBounds.min.x,
                                        tileBounds.max.y,
                                        0
                                    ).applyMatrix4(this.m_viewProjectionMatrix)
                                ];

                                contour.push(contour[0]);

                                const n = contour.length;

                                for (let p = n - 1, q = 0; q < n; p = q++) {
                                    subTileArea +=
                                        contour[p].x * contour[q].y - contour[q].x * contour[p].y;
                                }

                                subTileArea = Math.abs(subTileArea * 0.5);
                            }

                            tileFrustumIntersectionCache.set(
                                TileOffsetUtils.getKeyForTileKeyAndOffset(childTileKey, offset),
                                subTileArea
                            );
                        }

                        if (subTileArea > 0) {
                            workList.push(new TileKeyEntry(childTileKey, offset, subTileArea));
                        }
                    }
                });
            }

            // Sort by projected (visible) area, now the tiles that are further away are at the end
            // of the list.
            //
            // Sort is unstable if distance is equal, which happens a lot when looking top-down.
            // Unstable sorting makes label placement unstable at tile borders, leading to
            // flickering.
            visibleTiles.sort((a: TileKeyEntry, b: TileKeyEntry) => {
                const areaDiff = b.area - a.area;

                // Take care or numerical precision issues
                const minDiff = (a.area + b.area) * 0.001;

                return Math.abs(areaDiff) < minDiff
                    ? b.tileKey.mortonCode() - a.tileKey.mortonCode()
                    : areaDiff;
            });

            const actuallyVisibleTiles: ITile[] = [];
            let allDataSourceTilesLoaded = true;
            let numTilesLoading = 0;
            // Create actual tiles only for the allowed number of visible tiles
            for (
                let i = 0;
                i < visibleTiles.length &&
                actuallyVisibleTiles.length < this.options.maxVisibleDataSourceTiles;
                i++
            ) {
                const tileEntry = visibleTiles[i];
                if (!dataSource.shouldRender(displayZoomLevel, tileEntry.tileKey)) {
                    continue;
                }
                const tile = this.getTile(dataSource, tileEntry.tileKey, tileEntry.offset);
                if (tile === undefined) {
                    continue;
                }

                // Keep the new tile from being removed from the cache.
                tile.isVisible = true;

                tile.prepareForRender();
                allDataSourceTilesLoaded = allDataSourceTilesLoaded && tile.hasGeometry;
                if (!tile.hasGeometry) {
                    numTilesLoading++;
                } else {
                    tile.numFramesVisible++;

                    if (tile.frameNumVisible < 0) {
                        // Store the fist frame the tile became visible.
                        tile.frameNumVisible = dataSource.mapView.frameNumber;
                    }
                }
                actuallyVisibleTiles.push(tile);

                // Update the visible area of the tile. This is used for those tiles that are
                // currently loaded and are waiting to be decoded to sort the jobs by area.
                tile.visibleArea = tileEntry.area;
            }

            newRenderList.push({
                dataSource,
                storageLevel,
                zoomLevel: displayZoomLevel,
                allVisibleTileLoaded: allDataSourceTilesLoaded,
                numTilesLoading,
                visibleTiles: actuallyVisibleTiles,
                renderedTiles: actuallyVisibleTiles
            });
            allVisibleTilesLoaded = allVisibleTilesLoaded && allDataSourceTilesLoaded;
        }

        this.dataSourceTileList = newRenderList;
        this.allVisibleTilesLoaded = allVisibleTilesLoaded;

        this.computeTilesToRender();

        this.forEachCachedTile(tile => {
            // Remove all tiles that are still being loaded, but are no longer visible. They have to
            // be reloaded when they become visible again. Hopefully, they are still in the browser
            // cache by then.
            if (!tile.isVisible && tile.tileLoader !== undefined && !tile.tileLoader.isFinished) {
                tile.tileLoader.cancel();
                this.disposeTile(tile);
            }
        });

        return newRenderList;
    }

    getTile(dataSource: DataSource, tileKey: TileKey, offset: number = 0): ITile | undefined {
        if (!dataSource.cacheable) {
            return dataSource.getTile(tileKey);
        }

        const { tileCache } = this.getOrCreateCache(dataSource);

        if (offset === 0) {
            let tile = tileCache.get(tileKey.mortonCode());

            if (tile !== undefined) {
                return tile;
            }

            tile = dataSource.getTile(tileKey);

            if (tile !== undefined) {
                tileCache.set(tileKey.mortonCode(), tile);
                assert(!tile.isProxy);
                // Store the frame number this tile has been requested.
                (tile as Tile).frameNumRequested = dataSource.mapView.frameNumber;
            }

            return tile;
        } else {
            const uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(tileKey, offset);
            const tileProxy = tileCache.get(uniqueKey);
            if (tileProxy !== undefined && tileProxy.isProxy) {
                // We check if the
                if (tileProxy instanceof TileProxy && tileProxy.canClone()) {
                    tileProxy.clone();
                }
                // It is possible that there is a TileProxy in the cache which proxies a disposed
                // Tile, in this case we need to make a new request for the Tile.
                if (!tileProxy.disposed) {
                    return tileProxy;
                }
            }
            // Search for the Tile which the TileProxy must proxy (offset is 0)
            const tile = this.getTile(dataSource, tileKey, 0);
            if (tile instanceof Tile) {
                const newTileProxy = new TileProxy(tile, offset);
                tileCache.set(uniqueKey, newTileProxy);
                return newTileProxy;
            }
            // We should never reach this, because getTile with a 0 offset should never return a
            // TileProxy
            assert(false);
            return tile;
        }
    }

    /**
     * Removes all internal bookkeeping entries and cache related to specified datasource.
     *
     * Called by [[MapView]] when [[DataSource]] has been removed from [[MapView]].
     */
    removeDataSource(dataSourceName: string) {
        this.clearTileCache(dataSourceName);
        this.dataSourceTileList = this.dataSourceTileList.filter(
            tileList => tileList.dataSource.name !== dataSourceName
        );
        this.m_dataSourceCache.delete(dataSourceName);
    }

    /**
     * Clear the tile cache.
     *
     * Remove the [[Tile]] objects created by cacheable [[DataSource]]. If a [[DataSource]] name is
     * provided, this method restricts the eviction the [[DataSource]] with the given name.
     *
     * @param dataSourceName The name of the [[DataSource]].
     */
    clearTileCache(dataSourceName?: string) {
        if (dataSourceName !== undefined) {
            const cache = this.m_dataSourceCache.get(dataSourceName);
            if (cache) {
                cache.tileCache.evictAll();
            }
        } else {
            this.m_dataSourceCache.forEach(dataSourceCache => {
                dataSourceCache.tileCache.evictAll();
            });
        }
    }

    /**
     * Visit each tile in visible, rendered, and cached sets.
     *
     *  * Visible and temporarily rendered tiles will be marked for update and retained.
     *  * Cached but not rendered/visible will be evicted.
     *
     * @param dataSource If passed, only the tiles from this [[DataSource]] instance are processed.
     *     If `undefined`, tiles from all [[DataSource]]s are processed.
     */
    markTilesDirty(dataSource?: DataSource) {
        if (dataSource === undefined) {
            this.dataSourceTileList.forEach(renderListEntry => {
                this.markDataSourceTilesDirty(renderListEntry);
            });
        } else {
            const renderListEntry = this.dataSourceTileList.find(e => e.dataSource === dataSource);
            if (renderListEntry === undefined) {
                return;
            }
            this.markDataSourceTilesDirty(renderListEntry);
        }
    }

    /**
     * Dispose tiles that are marked for removal by [[LRUCache]] algorithm.
     */
    disposePendingTiles() {
        this.m_dataSourceCache.forEach(cache => {
            cache.disposeTiles();
        });
    }

    forEachVisibleTile(fun: (tile: ITile) => void): void {
        for (const listEntry of this.dataSourceTileList) {
            listEntry.visibleTiles.forEach(fun);
        }
    }

    forEachCachedTile(fun: (tile: ITile) => void): void {
        this.m_dataSourceCache.forEach(dataSourceCache => {
            dataSourceCache.tileCache.forEach(tile => {
                fun(tile);
            });
        });
    }

    /**
     * Dispose a `Tile` from cache, 'dispose()' is also called on the tile to free its resources.
     */
    disposeTile(tile: ITile): void {
        const cache = this.m_dataSourceCache.get(tile.dataSource.name);
        if (cache) {
            cache.tileCache.delete(tile.tileKey.mortonCode());
            tile.dispose();
        }
    }

    /**
     * Computes the list of tiles that are to be rendered on screen.
     *
     * Search cache to replace visible but yet empty tiles with already loaded siblings in nearby
     * zoom levels.
     *
     * Useful, when zooming in/out and when "newly elected" tiles are not yet loaded. Prevents
     * flickering by rendering already loaded tiles from upper/higher zoom levels.
     */
    private computeTilesToRender() {
        this.dataSourceTileList.forEach(renderListEntry => {
            const dataSource = renderListEntry.dataSource;
            const tilingScheme = dataSource.getTilingScheme();
            const displayZoomLevel = renderListEntry.zoomLevel;
            const renderedTiles: Map<number, ITile> = new Map<number, ITile>();
            const checkedTiles: Set<number> = new Set<number>();

            // Direction in quad tree to search: up -> shallower levels, down -> deeper levels.
            enum SearchDirection {
                UP,
                DOWN,
                BOTH
            }
            const tileCache = this.m_dataSourceCache.get(dataSource.name);
            if (tileCache === undefined) {
                return;
            }

            const cacheSearchUp =
                this.options.quadTreeSearchDistanceUp > 0 &&
                displayZoomLevel > dataSource.minZoomLevel;
            const cacheSearchDown =
                this.options.quadTreeSearchDistanceDown > 0 &&
                displayZoomLevel < dataSource.maxZoomLevel;

            if (!cacheSearchDown && !cacheSearchUp) {
                return;
            }

            const defaultSearchDirection =
                cacheSearchDown && cacheSearchUp
                    ? SearchDirection.BOTH
                    : cacheSearchDown
                    ? SearchDirection.DOWN
                    : SearchDirection.UP;

            let incompleteTiles: Map<number, SearchDirection> = new Map();

            renderListEntry.visibleTiles.forEach(tile => {
                const tileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(
                    tile.tileKey,
                    tile.offset
                );
                if (tile.hasGeometry && !tile.disposed) {
                    renderedTiles.set(tileCode, tile);
                } else {
                    // if dataSource supports cache and it was existing before this render
                    // then enable searching for loaded tiles in cache
                    incompleteTiles.set(tileCode, defaultSearchDirection);
                }
            });

            if (incompleteTiles.size === 0) {
                // short circuit, nothing to be done
                return;
            }

            // iterate over incomplete (not loaded tiles)
            // and find their parents or children that are in cache that can be rendered temporarily
            // until tile is loaded
            while (incompleteTiles.size !== 0) {
                const nextLevelCandidates: Map<number, SearchDirection> = new Map();

                incompleteTiles.forEach((searchDirection, tileKeyCode) => {
                    if (
                        searchDirection === SearchDirection.BOTH ||
                        searchDirection === SearchDirection.UP
                    ) {
                        const parentCode = TileOffsetUtils.getParentKeyFromKey(tileKeyCode);

                        if (!checkedTiles.has(parentCode) && !renderedTiles.get(parentCode)) {
                            checkedTiles.add(parentCode);
                            const parentTile = tileCache.get(parentCode);
                            if (
                                parentTile !== undefined &&
                                parentTile.hasGeometry &&
                                // TODO: Check that this works as expected.
                                !parentTile.disposed
                            ) {
                                // parentTile has geometry, so can be reused as fallback
                                renderedTiles.set(parentCode, parentTile);
                                return;
                            }

                            const { mortonCode } = TileOffsetUtils.extractOffsetAndMortonKeyFromKey(
                                parentCode
                            );
                            const parentTileKey = parentTile
                                ? parentTile.tileKey
                                : TileKey.fromMortonCode(mortonCode);

                            // if parentTile is missing or incomplete, try at max 3 levels up from
                            // current display level
                            const nextLevelDiff = Math.abs(displayZoomLevel - parentTileKey.level);
                            if (nextLevelDiff < this.options.quadTreeSearchDistanceUp) {
                                nextLevelCandidates.set(parentCode, SearchDirection.UP);
                            }
                        }
                    }

                    if (
                        searchDirection === SearchDirection.BOTH ||
                        searchDirection === SearchDirection.DOWN
                    ) {
                        const {
                            offset,
                            mortonCode
                        } = TileOffsetUtils.extractOffsetAndMortonKeyFromKey(tileKeyCode);
                        const tileKey = TileKey.fromMortonCode(mortonCode);
                        tilingScheme.getSubTileKeys(tileKey).forEach(childTileKey => {
                            const childTileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(
                                childTileKey,
                                offset
                            );
                            checkedTiles.add(childTileCode);

                            const childTile = tileCache.get(childTileCode);
                            if (
                                childTile !== undefined &&
                                childTile.hasGeometry &&
                                !childTile.disposed
                            ) {
                                // childTile has geometry, so can be reused as fallback
                                renderedTiles.set(childTileCode, childTile);
                                return;
                            }

                            const nextLevelDiff = Math.abs(childTileKey.level - displayZoomLevel);
                            if (nextLevelDiff < this.options.quadTreeSearchDistanceDown) {
                                nextLevelCandidates.set(childTileCode, SearchDirection.DOWN);
                            }
                        });
                    }
                });
                incompleteTiles = nextLevelCandidates;
            }

            renderListEntry.renderedTiles = Array.from(renderedTiles.values());
        });
    }

    private getOrCreateCache(dataSource: DataSource): DataSourceCache {
        const dataSourceName = dataSource.name;

        let dataSourceCache = this.m_dataSourceCache.get(dataSourceName);

        if (dataSourceCache === undefined) {
            dataSourceCache = new DataSourceCache(this.options);

            this.m_dataSourceCache.set(dataSourceName, dataSourceCache);
        }

        return dataSourceCache;
    }

    private markDataSourceTilesDirty(renderListEntry: DataSourceTileList) {
        const dataSourceCache = this.m_dataSourceCache.get(renderListEntry.dataSource.name);
        const retainedTiles: Set<number> = new Set();
        renderListEntry.visibleTiles.forEach(tile => {
            const uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, tile.offset);
            retainedTiles.add(uniqueKey);
            tile.reload();
        });
        renderListEntry.renderedTiles.forEach(tile => {
            const uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, tile.offset);
            if (!retainedTiles.has(uniqueKey)) {
                retainedTiles.add(uniqueKey);
                tile.reload();
            }
        });

        if (dataSourceCache !== undefined) {
            dataSourceCache.tileCache.forEach((tile, tileCode) => {
                if (!retainedTiles.has(tileCode)) {
                    tile.dispose();
                    dataSourceCache.tileCache.delete(tileCode);
                }
            });
        }
    }
}
