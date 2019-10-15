/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import {
    GeoCoordinates,
    Projection,
    TileKey,
    TileKeyUtils,
    TilingScheme
} from "@here/harp-geoutils";
import { LRUCache } from "@here/harp-lrucache";
import { assert, MathUtils } from "@here/harp-utils";
import * as THREE from "three";
import { ClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { DataSource } from "./DataSource";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { FrustumIntersection, TileKeyEntry } from "./FrustumIntersection";
import { TileGeometryManager } from "./geometry/TileGeometryManager";
import { Tile } from "./Tile";
import { MapViewUtils, TileOffsetUtils } from "./Utils";

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

type TileCacheId = string;

/**
 * Wrapper for LRU cache that encapsulates tiles caching for any [[DataSource]] used.
 *
 * Provides LRU based caching mechanism where each tile is identified by its tile key
 * (morton code) and data source name.
 * Tiles are kept in the cache based on last recently used policy, cached tile may be evicted
 * only when cache reaches full saturation and tile is no longer visible.
 * @note Currently cached entries (tiles) are identified by unique tile code (morton code) and
 * data source name, thus it is required that each [[DataSource]] used should have unique
 * name, but implementation could be improved to omit this limitation.
 */
class DataSourceCache {
    /**
     * Creates unique tile key for caching based on morton code, tile offset and its data source.
     *
     * @param mortonCode The tile morton code.
     * @param offset The tile offset.
     * @param dataSource The [[DataSource]] from which tile was loaded.
     */
    static getKey(mortonCode: number, offset: number, dataSource: DataSource): TileCacheId {
        return `${dataSource.name}_${mortonCode}_${offset}`;
    }

    /**
     * Create unique tile identifier for caching, based on tile object passed in.
     *
     * @param tile The tile for which key is generated.
     */
    static getKeyForTile(tile: Tile): TileCacheId {
        return DataSourceCache.getKey(tile.tileKey.mortonCode(), tile.offset, tile.dataSource);
    }

    private readonly m_tileCache: LRUCache<TileCacheId, Tile>;
    private readonly m_disposedTiles: Tile[] = [];
    private m_resourceComputationType: ResourceComputationType;

    constructor(
        cacheSize: number,
        rct: ResourceComputationType = ResourceComputationType.EstimationInMb
    ) {
        this.m_resourceComputationType = rct;
        this.m_tileCache = new LRUCache<string, Tile>(cacheSize, (tile: Tile) => {
            if (this.m_resourceComputationType === ResourceComputationType.EstimationInMb) {
                // Default is size in MB.
                return tile.memoryUsage * MB_FACTOR;
            } else {
                return 1;
            }
        });
        this.m_tileCache.evictionCallback = (_, tile) => {
            if (tile.tileLoader !== undefined) {
                // Cancel downloads as early as possible.
                tile.tileLoader.cancel();
            }
            this.m_disposedTiles.push(tile);
        };
        this.m_tileCache.canEvict = (_, tile) => {
            // Tiles can be evicted that weren't requested in the last frame.
            return !tile.isVisible;
        };
    }

    /**
     * Get information how cached tiles affects cache space available.
     *
     * The way how cache evaluates the __resources size__ have a big influence on entire
     * caching mechanism, if [[resourceComputationType]] is set to:
     * [[ResourceComputationType.EstimationInMb]] then each tiles contributes to cache size
     * differently depending on the memory consumed, on other side
     * [[ResourceComputationType.NumberOfTiles]] says each tile occupies single slot in cache,
     * so its real memory consumed does not matter affect caching behavior. Of course in
     * the second scenario cache may grow significantly in terms of memory usage and thus it
     * is out of control.
     *
     * @return [[ResourceComputationType]] enum that describes if resources are counted by
     * space occupied in memory or just by number of them.
     */
    get resourceComputationType(): ResourceComputationType {
        return this.m_resourceComputationType;
    }

    /**
     * Get the cache capacity measured as number if megabytes or number of entries.
     *
     * The total cached tiles size determines cache saturation, if it reaches the capacity value
     * then the resources becomes evicted (released) starting from the oldest (the latest used).
     *
     * @see size.
     * @see resourceComputationType.
     */
    get capacity(): number {
        return this.m_tileCache.capacity;
    }

    /**
     * Get total cache size described as number of megabytes consumed or number of tiles stored.
     *
     * @see capacity.
     * @see resourceComputationType.
     */
    get size(): number {
        return this.m_tileCache.size;
    }

    /**
     * Set cache capacity and the algorithm used for cache size calculation.
     *
     * @see capacity.
     * @see resourceComputationType.
     * @param size The new capacity declared in megabytes or number of entires.
     * @param rct The enum value that determines how size and capacity are evaluated.
     */
    setCapacity(size: number, rct: ResourceComputationType) {
        this.m_resourceComputationType = rct;
        this.m_tileCache.setCapacityAndMeasure(size, (tile: Tile) => {
            if (this.m_resourceComputationType === ResourceComputationType.EstimationInMb) {
                // Default is size in MB.
                return tile.memoryUsage * MB_FACTOR;
            } else {
                return 1;
            }
        });
    }

    /**
     * Get tile cached or __undefined__ if tile is not yet in cache.
     *
     * @param mortonCode En unique tile morton code.
     * @param offset Tile offset.
     * @param dataSource A [[DataSource]] the tile comes from.
     */
    get(mortonCode: number, offset: number, dataSource: DataSource): Tile | undefined {
        return this.m_tileCache.get(DataSourceCache.getKey(mortonCode, offset, dataSource));
    }

    /**
     * Add new tile to the cache.
     *
     * @param mortonCode En unique tile code (morton code).
     * @param offset The tile offset.
     * @param dataSource A [[DataSource]] the tile comes from.
     * @param tile The tile reference.
     */
    set(mortonCode: number, offset: number, dataSource: DataSource, tile: Tile) {
        this.m_tileCache.set(DataSourceCache.getKey(mortonCode, offset, dataSource), tile);
    }

    /**
     * Delete tile from cache.
     *
     * @note This method will not call eviction callback.
     * @param tile The tile reference to be removed from cache.
     */
    delete(tile: Tile) {
        const tileKey = DataSourceCache.getKeyForTile(tile);
        this.deleteByKey(tileKey);
    }

    /**
     * Delete tile using its unique identifier.
     *
     * @note Tile identifier its constructed using information about tile code (morton code) and its
     * [[DataSource]].
     * @note This is explicit removal thus eviction callback will not be processed.
     * @see DataSourceCache.getKey.
     * @param tileKey The unique tile identifier.
     */
    deleteByKey(tileKey: TileCacheId) {
        this.m_tileCache.delete(tileKey);
    }

    /**
     * Dispose all tiles releasing their internal data.
     */
    disposeTiles() {
        this.m_disposedTiles.forEach(tile => {
            tile.dispose();
        });

        this.m_disposedTiles.length = 0;
    }

    /**
     * Shrink cache to its allowed capacity.
     *
     * This method should be called each time after operations are performed on the cache entries,
     * in order to keep cache size consistent. It informs caching mechanism to invalidate memory
     * consumed by its entries and check if cache is overgrown, is such case some tiles will be
     * evicted.
     */
    shrinkToCapacity() {
        this.m_tileCache.shrinkToCapacity();
    }

    /**
     * Evict all cached tiles implicitly even without checking if still in use.
     */
    evictAll() {
        this.m_tileCache.evictAll();
    }

    /**
     * Evict selected tiles implicitly.
     *
     * @param selector The callback used to determine if tile should be evicted.
     */
    evictSelected(selector: (tile: Tile, key: TileCacheId) => boolean) {
        this.m_tileCache.evictSelected(selector);
    }

    /**
     * Call functor (callback) on each tile store in cache.
     *
     * Optionally you may specify from which [[DataSource]] tiles should be processed.
     * This limits the tiles visited to a sub-set originating from single [[DataSource]].
     * @param callback The function to be called for each visited tile.
     * @param inDataSource The optional [[DataSource]] to which tiles should belong.
     */
    forEach(callback: (tile: Tile, key: TileCacheId) => void, inDataSource?: DataSource): void {
        this.m_tileCache.forEach((entry: Tile, key: TileCacheId) => {
            if (inDataSource === undefined || entry.dataSource === inDataSource) {
                callback(entry, key);
            }
        });
    }
}

/**
 * List of visible tiles for a [[DataSource]].
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
     * Map of tiles that will be rendered, key is the the combination of tile key and offset, see
     * [[getKeyForTileKeyAndOffset]]. This includes tiles that are not in the [[visibleTiles]]
     * list but that are used as fallbacks b/c they are still in the cache.
     */
    renderedTiles: Map<number, Tile>;
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

    private readonly m_projectionMatrixOverride = new THREE.Matrix4();
    private m_dataSourceCache: DataSourceCache;
    private m_viewRange: ViewRanges = { near: 0.1, far: Infinity, minimum: 0.1, maximum: Infinity };

    private m_resourceComputationType: ResourceComputationType =
        ResourceComputationType.EstimationInMb;

    constructor(
        private readonly m_frustumIntersection: FrustumIntersection,
        private readonly m_tileGeometryManager: TileGeometryManager,
        options: VisibleTileSetOptions
    ) {
        this.options = options;
        this.m_resourceComputationType =
            options.resourceComputationType === undefined
                ? ResourceComputationType.EstimationInMb
                : options.resourceComputationType;
        this.m_dataSourceCache = new DataSourceCache(
            this.options.tileCacheSize,
            this.m_resourceComputationType
        );
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
        // This effectively invalidates DataSourceCache
        this.resourceComputationType = computationType;
    }

    /**
     * Retrieves maximum number of visible tiles per data source.
     */
    get maxVisibleDataSourceTiles() {
        return this.options.maxVisibleDataSourceTiles;
    }

    /**
     * Sets maximum number of visible tiles per data source.
     *
     * @param size maximum number of tiles rendered.
     */
    set maxVisibleDataSourceTiles(size: number) {
        this.options.maxVisibleDataSourceTiles = size;
    }

    /**
     * The way the cache usage is computed, either based on size in MB (mega bytes) or in number of
     * tiles.
     */
    get resourceComputationType(): ResourceComputationType {
        return this.m_resourceComputationType;
    }

    /**
     * Sets the way tile cache is managing its elements.
     *
     * Cache may be either keeping number of elements stored or the memory consumed by them.
     *
     * @param computationType Type of algorith used in cache for checking full saturation,
     * may be counting number of elements or memory consumed by them.
     */
    set resourceComputationType(computationType: ResourceComputationType) {
        this.m_resourceComputationType = computationType;
        this.m_dataSourceCache.setCapacity(this.options.tileCacheSize, computationType);
    }

    /**
     * Evaluate frustum near/far clip planes and visibility ranges.
     */
    updateClipPlanes(maxElevation?: number, minElevation?: number): ViewRanges {
        if (maxElevation !== undefined) {
            this.options.clipPlanesEvaluator.maxElevation = maxElevation;
        }
        if (minElevation !== undefined) {
            this.options.clipPlanesEvaluator.minElevation = minElevation;
        }
        this.m_viewRange = this.options.clipPlanesEvaluator.evaluateClipPlanes(
            this.m_frustumIntersection.mapView
        );
        return this.m_viewRange;
    }

    /**
     * Calculates a new set of visible tiles.
     * @param storageLevel The camera storage level, see [[MapView.storageLevel]].
     * @param zoomLevel The camera zoom level.
     * @param dataSources The data sources for which the visible tiles will be calculated.
     * @param elevationRangeSource Source of elevation range data if any.
     * @returns view ranges and their status since last update (changed or not).
     */
    updateRenderList(
        storageLevel: number,
        zoomLevel: number,
        dataSources: DataSource[],
        elevationRangeSource?: ElevationRangeSource
    ): { viewRanges: ViewRanges; viewRangesChanged: boolean } {
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
                actuallyVisibleTiles.length < this.maxVisibleDataSourceTiles;
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
                // Update the visible area of the tile. This is used for those tiles that are
                // currently loaded and are waiting to be decoded to sort the jobs by area.
                tile.visibleArea = tileEntry.area;
                tile.minElevation = tileEntry.minElevation;
                tile.maxElevation = tileEntry.maxElevation;

                actuallyVisibleTiles.push(tile);
            }

            this.m_tileGeometryManager.updateTiles(actuallyVisibleTiles);

            this.dataSourceTileList.push({
                dataSource,
                storageLevel,
                zoomLevel: displayZoomLevel,
                allVisibleTileLoaded: allDataSourceTilesLoaded,
                numTilesLoading,
                visibleTiles: actuallyVisibleTiles,
                renderedTiles: new Map<number, Tile>()
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

        this.m_dataSourceCache.shrinkToCapacity();

        let minElevation: number | undefined;
        let maxElevation: number | undefined;
        this.dataSourceTileList.forEach(renderListEntry => {
            // Calculate min/max elevation from every data source tiles,
            // data sources without elevationRangeSource will contribute to
            // values with zero levels for both elevations.
            const tiles = renderListEntry.visibleTiles;
            tiles.forEach(tile => {
                minElevation = MathUtils.min2(minElevation, tile.minElevation);
                maxElevation = MathUtils.max2(
                    maxElevation,
                    tile.maxElevation + tile.maxGeometryHeight
                );
            });
        });

        if (minElevation === undefined) {
            minElevation = 0;
        }
        if (maxElevation === undefined) {
            maxElevation = 0;
        }
        // If clip planes evaluator depends on the tiles elevation re-calculate
        // frustum planes and update the camera near/far plane distances.
        let viewRangesChanged: boolean = false;
        const oldViewRanges = this.m_viewRange;
        const newViewRanges = this.updateClipPlanes(maxElevation, minElevation);
        viewRangesChanged = viewRangesEqual(newViewRanges, oldViewRanges) === false;

        return {
            viewRanges: newViewRanges,
            viewRangesChanged
        };
    }

    /**
     * Gets the tile corresponding to the given data source, key and offset, creating it if
     * necessary.
     *
     * @param dataSource The data source the tile belongs to.
     * @param tileKey The key identifying the tile.
     * @param offset Tile offset.
     * @return The tile if it was found or created, undefined otherwise.
     */
    getTile(dataSource: DataSource, tileKey: TileKey, offset: number = 0): Tile | undefined {
        const cacheOnly = false;
        return this.getTileImpl(dataSource, tileKey, offset, cacheOnly);
    }

    /**
     * Gets the tile corresponding to the given data source, key and offset from the cache.
     *
     * @param dataSource The data source the tile belongs to.
     * @param tileKey The key identifying the tile.
     * @param offset Tile offset.
     * @return The tile if found in cache, undefined otherwise.
     */
    getCachedTile(dataSource: DataSource, tileKey: TileKey, offset: number = 0): Tile | undefined {
        assert(dataSource.cacheable);
        const cacheOnly = true;
        return this.getTileImpl(dataSource, tileKey, offset, cacheOnly);
    }

    /**
     * Gets the tile corresponding to the given data source, key and offset from the rendered tiles.
     *
     * @param dataSource The data source the tile belongs to.
     * @param tileKey The key identifying the tile.
     * @param offset Tile offset.
     * @return The tile if found among the rendered tiles, undefined otherwise.
     */
    getRenderedTile(
        dataSource: DataSource,
        tileKey: TileKey,
        offset: number = 0
    ): Tile | undefined {
        const dataSourceVisibleTileList = this.dataSourceTileList.find(list => {
            return list.dataSource === dataSource;
        });

        if (dataSourceVisibleTileList === undefined) {
            return undefined;
        }

        return dataSourceVisibleTileList.renderedTiles.get(
            TileOffsetUtils.getKeyForTileKeyAndOffset(tileKey, offset)
        );
    }

    /**
     * Gets the tile corresponding to the given data source and location from the rendered tiles.
     *
     * @param dataSource The data source the tile belongs to.
     * @param geoPoint The geolocation included within the tile.
     * @return The tile if found among the rendered tiles, undefined otherwise.
     */
    getRenderedTileAtLocation(
        dataSource: DataSource,
        geoPoint: GeoCoordinates,
        offset: number = 0
    ): Tile | undefined {
        const dataSourceVisibleTileList = this.dataSourceTileList.find(list => {
            return list.dataSource === dataSource;
        });

        if (dataSourceVisibleTileList === undefined) {
            return undefined;
        }

        const tilingScheme = dataSource.getTilingScheme();
        const visibleLevel = dataSourceVisibleTileList.zoomLevel;
        const visibleTileKey = tilingScheme.getTileKey(geoPoint, visibleLevel);

        if (!visibleTileKey) {
            return undefined;
        }

        let tile = dataSourceVisibleTileList.renderedTiles.get(
            TileOffsetUtils.getKeyForTileKeyAndOffset(visibleTileKey, offset)
        );

        if (tile !== undefined) {
            return tile;
        }

        const { searchLevelsUp, searchLevelsDown } = this.getCacheSearchLevels(
            dataSource,
            visibleLevel
        );

        let parentTileKey = visibleTileKey;
        for (let levelOffset = 1; levelOffset <= searchLevelsUp; ++levelOffset) {
            parentTileKey = parentTileKey.parent();

            tile = dataSourceVisibleTileList.renderedTiles.get(
                TileOffsetUtils.getKeyForTileKeyAndOffset(parentTileKey, offset)
            );
            if (tile !== undefined) {
                return tile;
            }
        }

        const worldPoint = tilingScheme.projection.projectPoint(geoPoint);

        for (let levelOffset = 1; levelOffset <= searchLevelsDown; ++levelOffset) {
            const childLevel = visibleLevel + levelOffset;
            const childTileKey = TileKeyUtils.worldCoordinatesToTileKey(
                tilingScheme,
                worldPoint,
                childLevel
            );
            if (childTileKey) {
                tile = dataSourceVisibleTileList.renderedTiles.get(
                    TileOffsetUtils.getKeyForTileKeyAndOffset(childTileKey, offset)
                );

                if (tile !== undefined) {
                    return tile;
                }
            }
        }
        return undefined;
    }

    /**
     * Removes all internal bookkeeping entries and cache related to specified datasource.
     *
     * Called by [[MapView]] when [[DataSource]] has been removed from [[MapView]].
     */
    removeDataSource(dataSource: DataSource) {
        this.clearTileCache(dataSource);
        this.dataSourceTileList = this.dataSourceTileList.filter(
            tileList => tileList.dataSource !== dataSource
        );
    }

    /**
     * Clear the tile cache.
     *
     * Remove the [[Tile]] objects created by cacheable [[DataSource]]. If a [[DataSource]] name is
     * provided, this method restricts the eviction the [[DataSource]] with the given name.
     *
     * @param dataSourceName The name of the [[DataSource]].
     */
    clearTileCache(dataSource?: DataSource) {
        if (dataSource !== undefined) {
            this.m_dataSourceCache.evictSelected((tile: Tile, _) => {
                return tile.dataSource === dataSource;
            });
        } else {
            this.m_dataSourceCache.evictAll();
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
        this.m_dataSourceCache.disposeTiles();
    }

    /**
     * Process callback function [[fun]] with each visible tile in set.
     *
     * @param fun The callback function to be called.
     */
    forEachVisibleTile(fun: (tile: Tile) => void): void {
        for (const listEntry of this.dataSourceTileList) {
            listEntry.renderedTiles.forEach(fun);
        }
    }

    /**
     * Process callback function [[fun]] with each tile in the cache.
     *
     * Optional [[dataSource]] parameter limits processing to the tiles that belongs to
     * DataSource passed in.
     *
     * @param fun The callback function to be called.
     * @param dataSource The optional DataSource reference for tiles selection.
     */
    forEachCachedTile(fun: (tile: Tile) => void, dataSource?: DataSource): void {
        this.m_dataSourceCache.forEach((tile, _) => fun(tile), dataSource);
    }

    /**
     * Dispose a `Tile` from cache, 'dispose()' is also called on the tile to free its resources.
     */
    disposeTile(tile: Tile): void {
        // TODO: Consider using evict here!
        this.m_dataSourceCache.delete(tile);
        tile.dispose();
    }

    private getCacheSearchLevels(
        dataSource: DataSource,
        visibleLevel: number
    ): { searchLevelsUp: number; searchLevelsDown: number } {
        const searchLevelsUp = Math.min(
            this.options.quadTreeSearchDistanceUp,
            Math.max(0, visibleLevel - dataSource.minZoomLevel)
        );
        const searchLevelsDown = Math.min(
            this.options.quadTreeSearchDistanceDown,
            Math.max(0, dataSource.maxZoomLevel - visibleLevel)
        );

        return { searchLevelsUp, searchLevelsDown };
    }

    /**
     * Search cache to replace visible but yet empty tiles with already loaded siblings in nearby
     * zoom levels.
     *
     * Useful, when zooming in/out and when "newly elected" tiles are not yet loaded. Prevents
     * flickering by rendering already loaded tiles from upper/higher zoom levels.
     */
    private fillMissingTilesFromCache() {
        const tileCache = this.m_dataSourceCache;
        this.dataSourceTileList.forEach(renderListEntry => {
            const dataSource = renderListEntry.dataSource;
            const tilingScheme = dataSource.getTilingScheme();
            const displayZoomLevel = renderListEntry.zoomLevel;
            const renderedTiles = renderListEntry.renderedTiles;
            const checkedTiles: Set<number> = new Set<number>();

            // Direction in quad tree to search: up -> shallower levels, down -> deeper levels.
            enum SearchDirection {
                NONE,
                UP,
                DOWN,
                BOTH
            }
            let defaultSearchDirection = SearchDirection.NONE;

            const { searchLevelsUp, searchLevelsDown } = this.getCacheSearchLevels(
                dataSource,
                displayZoomLevel
            );

            defaultSearchDirection =
                searchLevelsDown > 0 && searchLevelsUp > 0
                    ? SearchDirection.BOTH
                    : searchLevelsDown > 0
                    ? SearchDirection.DOWN
                    : searchLevelsUp > 0
                    ? SearchDirection.UP
                    : SearchDirection.NONE;

            let incompleteTiles: Map<number, SearchDirection> = new Map();

            renderListEntry.visibleTiles.forEach(tile => {
                const tileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(
                    tile.tileKey,
                    tile.offset
                );
                if (tile.hasGeometry || defaultSearchDirection === SearchDirection.NONE) {
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

                            const {
                                offset,
                                mortonCode
                            } = TileOffsetUtils.extractOffsetAndMortonKeyFromKey(parentCode);

                            const parentTile = tileCache.get(mortonCode, offset, dataSource);
                            if (parentTile !== undefined && parentTile.hasGeometry) {
                                // parentTile has geometry, so can be reused as fallback
                                renderedTiles.set(parentCode, parentTile);
                                return;
                            }

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
                            const childTile = tileCache.get(
                                childTileKey.mortonCode(),
                                offset,
                                dataSource
                            );

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
        });
    }

    private getTileImpl(
        dataSource: DataSource,
        tileKey: TileKey,
        offset: number,
        cacheOnly: boolean
    ): Tile | undefined {
        function updateTile(tileToUpdate?: Tile) {
            if (tileToUpdate === undefined) {
                return;
            }
            // Keep the tile from being removed from the cache.
            tileToUpdate.frameNumLastRequested = dataSource.mapView.frameNumber;
        }

        if (!dataSource.cacheable && !cacheOnly) {
            const resultTile = dataSource.getTile(tileKey);
            updateTile(resultTile);
            return resultTile;
        }

        const tileCache = this.m_dataSourceCache;
        let tile = tileCache.get(tileKey.mortonCode(), offset, dataSource);

        if (tile !== undefined && tile.offset === offset) {
            updateTile(tile);
            return tile;
        }

        if (cacheOnly) {
            return undefined;
        }

        tile = dataSource.getTile(tileKey);
        // TODO: Update all tile information including area, min/max elevation from TileKeyEntry
        if (tile !== undefined) {
            tile.offset = offset;
            updateTile(tile);
            tileCache.set(tileKey.mortonCode(), offset, dataSource, tile);
            this.m_tileGeometryManager.initTile(tile);
        }
        return tile;
    }

    private markDataSourceTilesDirty(renderListEntry: DataSourceTileList) {
        const dataSourceCache = this.m_dataSourceCache;
        const retainedTiles: Set<TileCacheId> = new Set();

        function markTileDirty(tile: Tile, tileGeometryManager: TileGeometryManager) {
            const tileKey = DataSourceCache.getKeyForTile(tile);
            if (!retainedTiles.has(tileKey)) {
                retainedTiles.add(tileKey);
                if (tile.tileGeometryLoader !== undefined) {
                    tile.tileGeometryLoader.reset();
                }

                // Prevent label rendering issues when the style set is changing. Prevent Text
                // element rendering that depends on cleaned font catalog data.
                tile.clearTextElements();

                tile.load();
            }
        }

        renderListEntry.visibleTiles.forEach(tile => {
            markTileDirty(tile, this.m_tileGeometryManager);
        });
        renderListEntry.renderedTiles.forEach(tile => {
            markTileDirty(tile, this.m_tileGeometryManager);
        });

        dataSourceCache.forEach((tile, key) => {
            if (!retainedTiles.has(key)) {
                dataSourceCache.deleteByKey(key);
                tile.dispose();
            }
        }, renderListEntry.dataSource);
    }

    // Computes the visible tile keys for each supplied data source.
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

        // If elevation is to be taken into account create extended frustum:
        // (near ~0, far: maxVisibilityRange) that allows to consider tiles that
        // are far below ground plane and high enough to intersect the frustum.
        if (elevationRangeSource !== undefined) {
            const fp = MapViewUtils.getCameraFrustumPlanes(this.m_frustumIntersection.camera);
            fp.near = this.m_viewRange.minimum;
            fp.far = this.m_viewRange.maximum;
            this.m_projectionMatrixOverride.makePerspective(
                fp.left,
                fp.right,
                fp.bottom,
                fp.top,
                fp.near,
                fp.far
            );
            this.m_frustumIntersection.updateFrustum(this.m_projectionMatrixOverride);
        } else {
            this.m_frustumIntersection.updateFrustum();
        }

        // For each bucket of data sources with same tiling scheme, calculate frustum intersection
        // once using the maximum display level.
        for (const [tilingScheme, bucket] of dataSourceBuckets) {
            const zoomLevels = bucket.map(dataSource => dataSource.getDisplayZoomLevel(zoomLevel));
            const maxDisplayLevel = Math.max(...zoomLevels);
            const result = this.m_frustumIntersection.compute(
                tilingScheme,
                maxDisplayLevel,
                elevationRangeSource,
                zoomLevels,
                bucket
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

function viewRangesEqual(a: ViewRanges, b: ViewRanges) {
    return (
        a.far === b.far && a.maximum === b.maximum && a.minimum === b.minimum && a.near === b.near
    );
}
