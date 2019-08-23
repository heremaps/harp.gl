/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Projection, TileKey, TilingScheme } from "@here/harp-geoutils";
import { LRUCache } from "@here/harp-lrucache";
import { ClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { DataSource } from "./DataSource";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { FrustumIntersection, TileKeyEntry } from "./FrustumIntersection";
import { TileGeometryManager } from "./geometry/TileGeometryManager";
import { Tile } from "./Tile";
import { TileOffsetUtils } from "./Utils";

/**
 * Way the memory consumption of a tile is computed. Either in number of tiles, or in MegaBytes. If
 * it is in MB, an estimation is used.
 */
export enum ResourceComputationType {
    EstimationInMb = 0,
    NumberOfTiles
}

/**
 * Limited set of [[MapViewOptions]] used for [[VisibleTileSet]].
 */
export interface VisibleTileSetOptions {
    /**
     * The projection of the view.
     */
    projection: Projection;

    /**
     * User-defined camera clipping planes evaluator.
     */
    clipPlanesEvaluator: ClipPlanesEvaluator;

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
    resourceComputationType: ResourceComputationType;

    /**
     * Number of levels to go up when searching for fallback tiles.
     */
    quadTreeSearchDistanceUp: number;

    /**
     * Number of levels to go down when searching for fallback tiles.
     */
    quadTreeSearchDistanceDown: number;
}

const MB_FACTOR = 1.0 / (1024.0 * 1024.0);

/**
 * Missing Typedoc
 */
class DataSourceCache {
    readonly tileCache: LRUCache<number, Tile>;
    readonly disposedTiles: Tile[] = [];

    resourceComputationType: ResourceComputationType = ResourceComputationType.EstimationInMb;

    constructor(options: VisibleTileSetOptions, readonly dataSource: DataSource) {
        this.resourceComputationType =
            options.resourceComputationType === undefined
                ? ResourceComputationType.EstimationInMb
                : options.resourceComputationType;
        this.tileCache = new LRUCache<number, Tile>(options.tileCacheSize, (tile: Tile) => {
            if (this.resourceComputationType === ResourceComputationType.EstimationInMb) {
                // Default is size in MB.
                return tile.memoryUsage * MB_FACTOR;
            } else {
                return 1;
            }
        });
        this.tileCache.evictionCallback = (_, tile) => {
            if (tile.tileLoader !== undefined) {
                // Cancel downloads as early as possible.
                tile.tileLoader.cancel();
            }
            this.disposedTiles.push(tile);
        };
        this.tileCache.canEvict = (_, tile) => {
            // Tiles can be evicted that weren't requested in the last frame.
            return !tile.isVisible;
        };
    }

    disposeTiles() {
        this.disposedTiles.forEach(tile => {
            tile.dispose();
        });

        this.disposedTiles.length = 0;
    }

    get(tileCode: number): Tile | undefined {
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
     * The current [[MapView]] zoom level.
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
     * List of tiles we want to render (i.e. the tiles computed from the zoom level and view
     * frustum). However some might not be renderable yet (e.g. loading). See [[renderedTiles]] for
     * the actual list of tiles that the user will see.
     */
    visibleTiles: Tile[];

    /**
     * List of tiles that will be rendered. This includes tiles that are not in the
     * [[visibleTiles]] list but that are used as fallbacks b/c they are still in the cache.
     */
    renderedTiles: Tile[];
}

/**
 * Manages visible [[Tile]]s for [[MapView]].
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

    private m_ResourceComputationType: ResourceComputationType =
        ResourceComputationType.EstimationInMb;

    constructor(
        private readonly m_frustumIntersection: FrustumIntersection,
        private readonly m_tileGeometryManager: TileGeometryManager,
        options: VisibleTileSetOptions
    ) {
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
     * @param computationType Optional value specifying the way a [[Tile]]s cache usage is computed,
     *      either based on size in MB (mega bytes) or in number of tiles. Defaults to
     *      `ResourceComputationType.EstimationInMb`.
     */
    setDataSourceCacheSize(
        size: number,
        computationType: ResourceComputationType = ResourceComputationType.EstimationInMb
    ): void {
        this.options.tileCacheSize = size;
        this.resourceComputationType = computationType;
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

    /**
     * The way the cache usage is computed, either based on size in MB (mega bytes) or in number of
     * tiles.
     */
    get resourceComputationType(): ResourceComputationType {
        return this.m_ResourceComputationType;
    }

    set resourceComputationType(computationType: ResourceComputationType) {
        this.m_ResourceComputationType = computationType;
        this.m_dataSourceCache.forEach(dataStore => {
            dataStore.tileCache.setCapacity(this.options.tileCacheSize);
            dataStore.resourceComputationType = computationType;
            dataStore.tileCache.shrinkToCapacity();
        });
    }

    /**
     * Calculates a new set of visible tiles.
     * @param storageLevel The camera storage level, see [[MapView.storageLevel]].
     * @param zoomLevel The camera zoom level.
     * @param dataSources The data sources for which the visible tiles will be calculated.
     * @param elevationRangeSource Source of elevation range data if any.
     */
    updateRenderList(
        storageLevel: number,
        zoomLevel: number,
        dataSources: DataSource[],
        elevationRangeSource?: ElevationRangeSource
    ) {
        let allVisibleTilesLoaded: boolean = true;

        const visibleTileKeysResult = this.getVisibleTileKeysForDataSources(
            zoomLevel,
            dataSources,
            elevationRangeSource
        );
        this.dataSourceTileList = [];
        for (const { dataSource, visibleTileKeys } of visibleTileKeysResult.tileKeys) {
            // Sort by projected (visible) area, now the tiles that are further away are at the end
            // of the list.
            //
            // Sort is unstable if distance is equal, which happens a lot when looking top-down.
            // Unstable sorting makes label placement unstable at tile borders, leading to
            // flickering.
            visibleTileKeys.sort((a: TileKeyEntry, b: TileKeyEntry) => {
                const areaDiff = b.area - a.area;

                // Take care or numerical precision issues
                const minDiff = (a.area + b.area) * 0.001;

                return Math.abs(areaDiff) < minDiff
                    ? b.tileKey.mortonCode() - a.tileKey.mortonCode()
                    : areaDiff;
            });

            const actuallyVisibleTiles: Tile[] = [];
            let allDataSourceTilesLoaded = true;
            let numTilesLoading = 0;
            // Create actual tiles only for the allowed number of visible tiles
            const displayZoomLevel = dataSource.getDisplayZoomLevel(zoomLevel);
            for (
                let i = 0;
                i < visibleTileKeys.length &&
                actuallyVisibleTiles.length < this.options.maxVisibleDataSourceTiles;
                i++
            ) {
                const tileEntry = visibleTileKeys[i];
                if (!dataSource.shouldRender(displayZoomLevel, tileEntry.tileKey)) {
                    continue;
                }
                const tile = this.getTile(dataSource, tileEntry.tileKey, tileEntry.offset);
                if (tile === undefined) {
                    continue;
                }

                tile.prepareTileInfo();

                allDataSourceTilesLoaded = allDataSourceTilesLoaded && tile.allGeometryLoaded;
                if (!tile.allGeometryLoaded) {
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

            this.m_tileGeometryManager.updateTiles(actuallyVisibleTiles);

            this.dataSourceTileList.push({
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

        this.allVisibleTilesLoaded =
            allVisibleTilesLoaded && visibleTileKeysResult.allBoundingBoxesFinal;

        this.fillMissingTilesFromCache();

        this.forEachCachedTile(tile => {
            // Remove all tiles that are still being loaded, but are no longer visible. They have to
            // be reloaded when they become visible again. Hopefully, they are still in the browser
            // cache by then.
            if (!tile.isVisible && tile.tileLoader !== undefined && !tile.tileLoader.isFinished) {
                // The internal TileLoader is cancelled automatically when the Tile is disposed.
                this.disposeTile(tile);
            }
        });

        this.dataSourceTileList.forEach(renderListEntry => {
            const dataSource = renderListEntry.dataSource;
            const cache = this.m_dataSourceCache.get(dataSource.name);
            if (cache !== undefined) {
                cache.tileCache.shrinkToCapacity();
            }
        });
    }

    getTile(dataSource: DataSource, tileKey: TileKey, offset: number = 0): Tile | undefined {
        function updateTile(tileToUpdate?: Tile) {
            if (tileToUpdate === undefined) {
                return;
            }
            // Keep the tile from being removed from the cache.
            tileToUpdate.frameNumLastRequested = dataSource.mapView.frameNumber;
        }

        if (!dataSource.cacheable) {
            const resultTile = dataSource.getTile(tileKey);
            updateTile(resultTile);
            return resultTile;
        }

        const { tileCache } = this.getOrCreateCache(dataSource);

        const tileKeyMortonCode = TileOffsetUtils.getKeyForTileKeyAndOffset(tileKey, offset);
        let tile = tileCache.get(tileKeyMortonCode);

        if (tile !== undefined && tile.offset === offset) {
            updateTile(tile);
            return tile;
        }

        tile = dataSource.getTile(tileKey);

        if (tile !== undefined) {
            tile.offset = offset;
            updateTile(tile);
            tileCache.set(tileKeyMortonCode, tile);
            this.m_tileGeometryManager.initTile(tile);
        }
        return tile;
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

    forEachVisibleTile(fun: (tile: Tile) => void): void {
        for (const listEntry of this.dataSourceTileList) {
            listEntry.renderedTiles.forEach(fun);
        }
    }

    forEachCachedTile(
        fun: (tile: Tile) => void,
        filterDataSource?: (ds: DataSource) => boolean
    ): void {
        this.m_dataSourceCache.forEach(dataSourceCache => {
            if (filterDataSource === undefined || filterDataSource(dataSourceCache.dataSource)) {
                dataSourceCache.tileCache.forEach(tile => {
                    fun(tile);
                });
            }
        });
    }

    /**
     * Dispose a `Tile` from cache, 'dispose()' is also called on the tile to free its resources.
     */
    disposeTile(tile: Tile): void {
        const cache = this.m_dataSourceCache.get(tile.dataSource.name);
        if (cache) {
            const tileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, tile.offset);
            cache.tileCache.delete(tileCode);
            tile.dispose();
        }
    }

    /**
     * Search cache to replace visible but yet empty tiles with already loaded siblings in nearby
     * zoom levels.
     *
     * Useful, when zooming in/out and when "newly elected" tiles are not yet loaded. Prevents
     * flickering by rendering already loaded tiles from upper/higher zoom levels.
     */
    private fillMissingTilesFromCache() {
        this.dataSourceTileList.forEach(renderListEntry => {
            const dataSource = renderListEntry.dataSource;
            const tilingScheme = dataSource.getTilingScheme();
            const displayZoomLevel = renderListEntry.zoomLevel;
            const renderedTiles: Map<number, Tile> = new Map<number, Tile>();
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
                if (tile.hasGeometry) {
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
                            if (parentTile !== undefined && parentTile.hasGeometry) {
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

                        for (const childTileKey of tilingScheme.getSubTileKeys(tileKey)) {
                            const childTileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(
                                childTileKey,
                                offset
                            );
                            checkedTiles.add(childTileCode);
                            const childTile = tileCache.get(childTileCode);

                            if (childTile !== undefined && childTile.hasGeometry) {
                                // childTile has geometry, so can be reused as fallback
                                renderedTiles.set(childTileCode, childTile);
                                continue;
                            }

                            const nextLevelDiff = Math.abs(childTileKey.level - displayZoomLevel);
                            if (nextLevelDiff < this.options.quadTreeSearchDistanceDown) {
                                nextLevelCandidates.set(childTileCode, SearchDirection.DOWN);
                            }
                        }
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
            dataSourceCache = new DataSourceCache(this.options, dataSource);

            this.m_dataSourceCache.set(dataSourceName, dataSourceCache);
        }

        return dataSourceCache;
    }

    private markDataSourceTilesDirty(renderListEntry: DataSourceTileList) {
        const dataSourceCache = this.m_dataSourceCache.get(renderListEntry.dataSource.name);
        const retainedTiles: Set<number> = new Set();

        function markTileDirty(tile: Tile, tileGeometryManager: TileGeometryManager) {
            const tileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, tile.offset);
            if (!retainedTiles.has(tileCode)) {
                retainedTiles.add(tileCode);
                if (tile.tileGeometryLoader !== undefined) {
                    tile.tileGeometryLoader.reset();
                }
                tile.load();
            }
        }

        renderListEntry.visibleTiles.forEach(tile => {
            markTileDirty(tile, this.m_tileGeometryManager);
        });
        renderListEntry.renderedTiles.forEach(tile => {
            markTileDirty(tile, this.m_tileGeometryManager);
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

    // Computes the visible tile keys for each supplied datasource.
    private getVisibleTileKeysForDataSources(
        zoomLevel: number,
        dataSources: DataSource[],
        elevationRangeSource: ElevationRangeSource | undefined
    ): {
        tileKeys: Array<{ dataSource: DataSource; visibleTileKeys: TileKeyEntry[] }>;
        allBoundingBoxesFinal: boolean;
    } {
        const tileKeys = Array<{ dataSource: DataSource; visibleTileKeys: TileKeyEntry[] }>();
        let allBoundingBoxesFinal: boolean = true;

        if (dataSources.length === 0) {
            return { tileKeys, allBoundingBoxesFinal };
        }

        const dataSourceBuckets = new Map<TilingScheme, DataSource[]>();
        dataSources.forEach(dataSource => {
            const tilingScheme = dataSource.getTilingScheme();
            const bucket = dataSourceBuckets.get(tilingScheme);
            if (bucket === undefined) {
                dataSourceBuckets.set(tilingScheme, [dataSource]);
            } else {
                bucket.push(dataSource);
            }
        });

        this.m_frustumIntersection.updateFrustum();

        // For each bucket of data sources with same tiling scheme, calculate frustum intersection
        // once using the maximum display level.
        for (const [tilingScheme, bucket] of dataSourceBuckets) {
            const maxDisplayLevel = Math.max(
                ...bucket.map(dataSource => dataSource.getDisplayZoomLevel(zoomLevel))
            );
            const result = this.m_frustumIntersection.compute(
                tilingScheme,
                maxDisplayLevel,
                elevationRangeSource
            );

            allBoundingBoxesFinal = allBoundingBoxesFinal && result.calculationFinal;

            for (const dataSource of bucket) {
                const visibleTileKeys: TileKeyEntry[] = [];

                // For each data source check what tiles from the intersection should be rendered
                // at this zoom level.
                const displayZoomLevel = dataSource.getDisplayZoomLevel(zoomLevel);
                for (const tileEntry of result.tileKeyEntries.values()) {
                    if (dataSource.shouldRender(displayZoomLevel, tileEntry.tileKey)) {
                        visibleTileKeys.push(tileEntry);
                    }
                }
                tileKeys.push({ dataSource, visibleTileKeys });
            }
        }

        return { tileKeys, allBoundingBoxesFinal };
    }
}
