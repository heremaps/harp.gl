/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import {
    GeoCoordinates,
    Projection,
    ProjectionType,
    TileKey,
    TileKeyUtils,
    TilingScheme
} from "@here/harp-geoutils";
import { LRUCache } from "@here/harp-lrucache";
import { assert, MathUtils, TaskQueue } from "@here/harp-utils";
import * as THREE from "three";

import { BackgroundDataSource } from "./BackgroundDataSource";
import { ClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { DataSource } from "./DataSource";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { FrustumIntersection, TileKeyEntry } from "./FrustumIntersection";
import { TileGeometryManager } from "./geometry/TileGeometryManager";
import { TileTaskGroups } from "./MapView";
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

// Direction in quad tree to search: up -> shallower levels, down -> deeper levels.
enum SearchDirection {
    NONE,
    UP,
    DOWN,
    BOTH
}

/**
 * Limited set of {@link MapViewOptions} used for {@link VisibleTileSet}.
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

    /**
     * Maximal number of new tiles, that can be added to the scene per frame.
     * if set to `0`the limit will be ignored and all available tiles be uploaded.
     * @beta
     * @internal
     * @defaultValue 0
     */
    maxTilesPerFrame: number;
}

const MB_FACTOR = 1.0 / (1024.0 * 1024.0);

type TileCacheId = string;

/**
 * Wrapper for LRU cache that encapsulates tiles caching for any {@link DataSource} used.
 *
 * Provides LRU based caching mechanism where each tile is identified by its tile key
 * (morton code) and data source name.
 * Tiles are kept in the cache based on last recently used policy, cached tile may be evicted
 * only when cache reaches full saturation and tile is no longer visible.
 * @note Currently cached entries (tiles) are identified by unique tile code (morton code) and
 * data source name, thus it is required that each {@link DataSource} used should have unique
 * name, but implementation could be improved to omit this limitation.
 */
class DataSourceCache {
    /**
     * Creates unique tile key for caching based on morton code, tile offset and its data source.
     *
     * @param mortonCode - The tile morton code.
     * @param offset - The tile offset.
     * @param dataSource - The {@link DataSource} from which tile was loaded.
     */
    static getKey(mortonCode: number, offset: number, dataSource: DataSource): TileCacheId {
        return `${dataSource.name}_${mortonCode}_${offset}`;
    }

    /**
     * Create unique tile identifier for caching, based on tile object passed in.
     *
     * @param tile - The tile for which key is generated.
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
     * @param size - The new capacity declared in megabytes or number of entires.
     * @param rct - The enum value that determines how size and capacity are evaluated.
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
     * @param mortonCode - An unique tile morton code.
     * @param offset - Tile offset.
     * @param dataSource - A {@link DataSource} the tile comes from.
     */
    get(mortonCode: number, offset: number, dataSource: DataSource): Tile | undefined {
        return this.m_tileCache.get(DataSourceCache.getKey(mortonCode, offset, dataSource));
    }

    /**
     * Add new tile to the cache.
     *
     * @param mortonCode - En unique tile code (morton code).
     * @param offset - The tile offset.
     * @param dataSource - A {@link DataSource} the tile comes from.
     * @param tile - The tile reference.
     */
    set(mortonCode: number, offset: number, dataSource: DataSource, tile: Tile) {
        this.m_tileCache.set(DataSourceCache.getKey(mortonCode, offset, dataSource), tile);
    }

    /**
     * Delete tile from cache.
     *
     * @note This method will not call eviction callback.
     * @param tile - The tile reference to be removed from cache.
     */
    delete(tile: Tile) {
        const tileKey = DataSourceCache.getKeyForTile(tile);
        this.deleteByKey(tileKey);
    }

    /**
     * Delete tile using its unique identifier.
     *
     * @note Tile identifier its constructed using information about tile code (morton code) and its
     * {@link DataSource}.
     * @note This is explicit removal thus eviction callback will not be processed.
     * @see DataSourceCache.getKey.
     * @param tileKey - The unique tile identifier.
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
     * @param selector - The callback used to determine if tile should be evicted.
     */
    evictSelected(selector: (tile: Tile, key: TileCacheId) => boolean) {
        this.m_tileCache.evictSelected(selector);
    }

    /**
     * Call functor (callback) on each tile store in cache.
     *
     * Optionally you may specify from which {@link DataSource} tiles should be processed.
     * This limits the tiles visited to a sub-set originating from single {@link DataSource}.
     * @param callback - The function to be called for each visited tile.
     * @param inDataSource - The optional {@link DataSource} to which tiles should belong.
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
 * List of visible tiles for a {@link DataSource}.
 */
export interface DataSourceTileList {
    /**
     * The datasource that was producing the tiles.
     */
    dataSource: DataSource;

    /**
     * The current {@link MapView} zoom level.
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

// Sort by distance to camera, now the tiles that are further away are at the end
// of the list.
//
// Sort is unstable if distance is equal, which happens a lot when looking top-down.
// Unstable sorting makes label placement unstable at tile borders, leading to
// flickering.
const compareDistances = (a: TileKeyEntry, b: TileKeyEntry) => {
    const distanceDiff = a.distance - b.distance;

    // Take care or numerical precision issues
    const minDiff = (a.distance + b.distance) * 0.000001;

    return Math.abs(distanceDiff) < minDiff
        ? a.tileKey.mortonCode() - b.tileKey.mortonCode()
        : distanceDiff;
};

/**
 * Manages visible {@link Tile}s for {@link MapView}.
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

    private readonly m_cameraOverride = new THREE.PerspectiveCamera();
    private readonly m_dataSourceCache: DataSourceCache;
    private m_viewRange: ViewRanges = {
        near: 0.1,
        far: Infinity,
        minimum: 0.1,
        maximum: Infinity
    };

    // Maps morton codes to a given Tile, used to find overlapping Tiles. We only need to have this
    // for a single TilingScheme, i.e. that of the BackgroundDataSource.
    private readonly m_coveringMap = new Map<number, Tile>();

    private m_resourceComputationType: ResourceComputationType =
        ResourceComputationType.EstimationInMb;

    constructor(
        private readonly m_frustumIntersection: FrustumIntersection,
        private readonly m_tileGeometryManager: TileGeometryManager,
        public options: VisibleTileSetOptions,
        private readonly m_taskQueue: TaskQueue
    ) {
        this.options = options;
        this.options.maxTilesPerFrame = Math.floor(this.options.maxTilesPerFrame ?? 0);
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
     * @param size - cache size
     * @param computationType - Optional value specifying the way a {@link Tile}s cache usage is
     *      computed, either based on size in MB (mega bytes) or in number of tiles. Defaults to
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
     * Retrieves maximum number of visible tiles.
     */
    getNumberOfVisibleTiles() {
        return this.options.maxVisibleDataSourceTiles;
    }

    /**
     * Sets maximum number of visible tiles.
     *
     * @param size - size of visible tiles array
     */
    setNumberOfVisibleTiles(size: number) {
        this.options.maxVisibleDataSourceTiles = size;
    }

    /**
     * Gets the maximum number of tiles that can be added to the scene per frame
     * @beta
     * @internal
     */
    get maxTilesPerFrame(): number {
        return this.options.maxTilesPerFrame;
    }

    /**
     * Gets the maximum number of tiles that can be added to the scene per frame
     * @beta
     * @internal
     * @param value
     */
    set maxTilesPerFrame(value: number) {
        if (value < 0) {
            throw new Error("Invalid value, this will result in no tiles ever showing");
        }
        this.options.maxTilesPerFrame = Math.floor(value);
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
     * @param computationType - Type of algorith used in cache for checking full saturation,
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
        const { camera, projection, elevationProvider } = this.m_frustumIntersection.mapView;
        this.m_viewRange = this.options.clipPlanesEvaluator.evaluateClipPlanes(
            camera,
            projection,
            elevationProvider
        );
        return this.m_viewRange;
    }

    /**
     * Calculates a new set of visible tiles.
     * @param storageLevel - The camera storage level, see {@link MapView.storageLevel}.
     * @param zoomLevel - The camera zoom level.
     * @param dataSources - The data sources for which the visible tiles will be calculated.
     * @param elevationRangeSource - Source of elevation range data if any.
     * @returns view ranges and their status since last update (changed or not).
     */
    updateRenderList(
        storageLevel: number,
        zoomLevel: number,
        dataSources: DataSource[],
        frameNumber: number,
        elevationRangeSource?: ElevationRangeSource
    ): { viewRanges: ViewRanges; viewRangesChanged: boolean } {
        let allVisibleTilesLoaded: boolean = true;
        // This isn't really const, because we pass by ref to the methods below.
        const newTilesPerFrame = 0;

        const visibleTileKeysResult = this.getVisibleTileKeysForDataSources(
            zoomLevel,
            dataSources,
            elevationRangeSource
        );
        this.dataSourceTileList = [];
        this.m_coveringMap.clear();
        for (const { dataSource, visibleTileKeys } of visibleTileKeysResult.tileKeys) {
            visibleTileKeys.sort(compareDistances);

            // Create actual tiles only for the allowed number of visible tiles
            const dataZoomLevel = dataSource.getDataZoomLevel(zoomLevel);

            const visibleResult = this.processVisibleTiles(
                visibleTileKeys,
                dataSource,
                frameNumber,
                {
                    newTilesPerFrame
                },
                true
            );
            const dependentResult = this.processVisibleTiles(
                visibleResult.dependentTiles,
                dataSource,
                frameNumber,
                {
                    newTilesPerFrame
                },
                false
            );
            // creates geometry if not yet available
            this.m_tileGeometryManager.updateTiles(visibleResult.visibleTiles);
            this.m_tileGeometryManager.updateTiles(dependentResult.visibleTiles);
            // used to actually render the tiles or find alternatives for incomplete tiles
            this.dataSourceTileList.push({
                dataSource,
                storageLevel,
                zoomLevel: dataZoomLevel,
                allVisibleTileLoaded:
                    visibleResult.allDataSourceTilesLoaded &&
                    dependentResult.allDataSourceTilesLoaded,
                numTilesLoading: visibleResult.numTilesLoading + dependentResult.numTilesLoading,
                visibleTiles: [...visibleResult.visibleTiles, ...dependentResult.visibleTiles],
                renderedTiles: new Map<number, Tile>()
            });
            allVisibleTilesLoaded = allVisibleTilesLoaded && visibleResult.allDataSourceTilesLoaded;
        }

        this.allVisibleTilesLoaded =
            allVisibleTilesLoaded && visibleTileKeysResult.allBoundingBoxesFinal;

        this.populateRenderedTiles();

        this.forEachCachedTile(tile => {
            // Remove all tiles that are still being loaded, but are no longer visible. They have to
            // be reloaded when they become visible again. Hopefully, they are still in the browser
            // cache by then.
            if (!tile.isVisible && !tile.allGeometryLoaded) {
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
            const tiles = renderListEntry.renderedTiles;
            tiles.forEach(tile => {
                tile.update(renderListEntry.zoomLevel);
                minElevation = MathUtils.min2(minElevation, tile.geoBox.minAltitude);
                maxElevation = MathUtils.max2(maxElevation, tile.geoBox.maxAltitude);
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
     * @param dataSource - The data source the tile belongs to.
     * @param tileKey - The key identifying the tile.
     * @param offset - Tile offset.
     * @param frameNumber - Frame in which the tile was requested
     * @return The tile if it was found or created, undefined otherwise.
     */
    getTile(
        dataSource: DataSource,
        tileKey: TileKey,
        offset: number,
        frameNumber: number
    ): Tile | undefined {
        const cacheOnly = false;
        return this.getTileImpl(dataSource, tileKey, offset, cacheOnly, frameNumber);
    }

    /**
     * Gets the tile corresponding to the given data source, key and offset from the cache.
     *
     * @param dataSource - The data source the tile belongs to.
     * @param tileKey - The key identifying the tile.
     * @param offset - Tile offset.
     * @param frameNumber - Frame in which the tile was requested
     * @return The tile if found in cache, undefined otherwise.
     */
    getCachedTile(
        dataSource: DataSource,
        tileKey: TileKey,
        offset: number,
        frameNumber: number
    ): Tile | undefined {
        assert(dataSource.cacheable);
        const cacheOnly = true;
        return this.getTileImpl(dataSource, tileKey, offset, cacheOnly, frameNumber);
    }

    /**
     * Gets the tile corresponding to the given data source, key and offset from the rendered tiles.
     *
     * @param dataSource - The data source the tile belongs to.
     * @param tileKey - The key identifying the tile.
     * @param offset - Tile offset.
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
     * @param dataSource - The data source the tile belongs to.
     * @param geoPoint - The geolocation included within the tile.
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

        const { searchLevelsUp, searchLevelsDown } = this.getSearchDirection(
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
     * Called by {@link MapView} when {@link DataSource} has been removed from {@link MapView}.
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
     * Remove the {@link Tile} objects created by cacheable {@link DataSource}.
     * If a {@link DataSource} name is
     * provided, this method restricts the eviction
     * the {@link DataSource} with the given name.
     *
     * @param dataSourceName - The name of the {@link DataSource}.
     * @param filter Optional tile filter
     */
    clearTileCache(dataSource?: DataSource, filter?: (tile: Tile) => boolean) {
        if (dataSource !== undefined) {
            this.m_dataSourceCache.evictSelected((tile: Tile, _) => {
                return (
                    tile.dataSource === dataSource && (filter !== undefined ? filter(tile) : true)
                );
            });
        } else if (filter !== undefined) {
            this.m_dataSourceCache.evictSelected(filter);
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
     * @param dataSource - If passed, only the tiles from this {@link DataSource} instance
     *      are processed. If `undefined`, tiles from all {@link DataSource}s are processed.
     * @param filter Optional tile filter
     */
    markTilesDirty(dataSource?: DataSource, filter?: (tile: Tile) => boolean) {
        if (dataSource === undefined) {
            this.dataSourceTileList.forEach(renderListEntry => {
                this.markDataSourceTilesDirty(renderListEntry, filter);
            });
        } else {
            const renderListEntry = this.dataSourceTileList.find(e => e.dataSource === dataSource);
            if (renderListEntry === undefined) {
                return;
            }
            this.markDataSourceTilesDirty(renderListEntry, filter);
        }
    }

    /**
     * Dispose tiles that are marked for removal by {@link @here/harp-lrucache#LRUCache} algorithm.
     */
    disposePendingTiles() {
        this.m_dataSourceCache.disposeTiles();
    }

    /**
     * Process callback function [[fun]] with each visible tile in set.
     *
     * @param fun - The callback function to be called.
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
     * @param fun - The callback function to be called.
     * @param dataSource - The optional DataSource reference for tiles selection.
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

    // Requests the tiles using the tilekeys from the DataSource and returns them, including whether
    // all tiles were loaded and how many are loading.
    private processVisibleTiles(
        visibleTileKeys: TileKeyEntry[],
        dataSource: DataSource,
        frameNumber: number,
        // Must be passed by reference
        refs: {
            newTilesPerFrame: number;
        },
        processDependentTiles: boolean
    ): {
        allDataSourceTilesLoaded: boolean;
        numTilesLoading: number;
        visibleTiles: Tile[];
        dependentTiles: TileKeyEntry[];
    } {
        let allDataSourceTilesLoaded = true;
        let numTilesLoading = 0;
        const visibleTiles: Tile[] = [];
        const dependentTiles: TileKeyEntry[] = [];
        for (
            let i = 0;
            i < visibleTileKeys.length &&
            visibleTiles.length < this.options.maxVisibleDataSourceTiles;
            i++
        ) {
            const tileEntry = visibleTileKeys[i];
            const tile = this.getTile(dataSource, tileEntry.tileKey, tileEntry.offset, frameNumber);
            if (tile === undefined) {
                continue;
            }
            visibleTiles.push(tile);

            allDataSourceTilesLoaded = allDataSourceTilesLoaded && tile.allGeometryLoaded;
            if (!tile.allGeometryLoaded) {
                numTilesLoading++;
            } else {
                // If this tile's data source is "covering" then other tiles beneath it have
                // their rendering skipped, see [[Tile.willRender]].
                this.skipOverlappedTiles(dataSource, tile);
                if (this.processDelayTileRendering(tile, refs.newTilesPerFrame, frameNumber)) {
                    refs.newTilesPerFrame++;
                }
            }
            // Update the visible area of the tile. This is used for those tiles that are
            // currently loaded and are waiting to be decoded to sort the jobs by area.
            tile.visibleArea = tileEntry.area;
            tile.elevationRange = tileEntry.elevationRange ?? { minElevation: 0, maxElevation: 0 };

            if (processDependentTiles) {
                // Add any dependent tileKeys if not already visible. Consider to optimize with a
                // Set if this proves to be a bottleneck (because of O(n^2) search). Given the fact
                // that dependencies are rare and used for non tiled data, this shouldn't be a
                // problem.
                for (const tileKey of tile.dependencies) {
                    if (
                        visibleTileKeys.find(
                            tileKeyEntry =>
                                tileKeyEntry.tileKey.mortonCode() === tileKey.mortonCode()
                        ) === undefined
                    ) {
                        dependentTiles.push(new TileKeyEntry(tileKey, 0));
                    }
                }
            }
        }

        return {
            allDataSourceTilesLoaded,
            numTilesLoading,
            visibleTiles,
            dependentTiles
        };
    }

    // Processes if the tile should delay its rendering, returns if the tile is new, which is needed
    // to count how many tiles are generated per frame.
    private processDelayTileRendering(
        tile: Tile,
        newTilesPerFrame: number,
        frameNumber: number
    ): boolean {
        let isNewTile: boolean = false;
        if (
            // if set to 0, it will ignore the limit and upload all available
            this.options.maxTilesPerFrame !== 0 &&
            newTilesPerFrame > this.options.maxTilesPerFrame &&
            //if the tile was already visible last frame dont delay it
            !(tile.frameNumLastVisible === frameNumber - 1)
        ) {
            tile.delayRendering = true;
            tile.mapView.update();
        } else {
            if (tile.frameNumVisible < 0) {
                // Store the fist frame the tile became visible.
                tile.frameNumVisible = frameNumber;
                isNewTile = true;
            }
            tile.numFramesVisible++;
            tile.delayRendering = false;
        }
        return isNewTile;
    }

    /**
     * Skips rendering of tiles that are overlapped. The overlapping {@link Tile} comes from a
     * {@link DataSource} which is fully covering, i.e. there it is fully opaque.
     **/
    private skipOverlappedTiles(dataSource: DataSource, tile: Tile) {
        if (this.options.projection.type === ProjectionType.Spherical) {
            // HARP-7899, currently the globe has no background planes in the tiles (it relies on
            // the BackgroundDataSource), because the LOD mismatches, hence disabling for globe.
            return;
        }
        if (dataSource.isFullyCovering()) {
            const key = tile.uniqueKey;
            const entry = this.m_coveringMap.get(key);
            if (entry === undefined) {
                // We need to reset the flag so that if the covering datasource is disabled, that
                // the tiles beneath then start to render.
                tile.skipRendering = false;
                this.m_coveringMap.set(key, tile);
            } else {
                // Skip the Tile if either the stored entry or the tile to consider is from the
                // [[BackgroundDataSource]]
                if (entry.dataSource instanceof BackgroundDataSource) {
                    entry.skipRendering = true;
                } else if (dataSource instanceof BackgroundDataSource) {
                    tile.skipRendering = true;
                }
            }
        }
    }

    // Returns the search direction and the number of levels up / down that can be searched.
    private getSearchDirection(
        dataSource: DataSource,
        visibleLevel: number
    ): {
        searchDirection: SearchDirection;
        searchLevelsUp: number;
        searchLevelsDown: number;
    } {
        const searchLevelsUp = Math.min(
            this.options.quadTreeSearchDistanceUp,
            Math.max(0, visibleLevel - dataSource.minDataLevel)
        );
        const searchLevelsDown = Math.min(
            this.options.quadTreeSearchDistanceDown,
            Math.max(0, dataSource.maxDataLevel - visibleLevel)
        );
        const searchDirection =
            searchLevelsDown > 0 && searchLevelsUp > 0
                ? SearchDirection.BOTH
                : searchLevelsDown > 0
                ? SearchDirection.DOWN
                : searchLevelsUp > 0
                ? SearchDirection.UP
                : SearchDirection.NONE;
        return { searchDirection, searchLevelsUp, searchLevelsDown };
    }

    /**
     * Populates the list of tiles to render, see "renderedTiles". Tiles that are loaded and which
     * are an exact match are added straight to the list, tiles that are still loading are replaced
     * with tiles in the cache that are either a parent or child of the requested tile. This helps
     * to prevent flickering when zooming in / out. The distance to search is based on the options
     * [[quadTreeSearchDistanceDown]] and [[quadTreeSearchDistanceUp]].
     *
     * Each {@link DataSource} can also switch this behaviour on / off using the
     * [[allowOverlappingTiles]] flag.
     *
     */
    private populateRenderedTiles() {
        this.dataSourceTileList.forEach(renderListEntry => {
            const renderedTiles = renderListEntry.renderedTiles;

            // Tiles for which we need to fall(back/forward) to.
            const incompleteTiles: number[] = [];

            // Populate the list of tiles which can be shown ("renderedTiles"), and the list of
            // tiles that are incomplete, and for which we search for an alternative
            // ("incompleteTiles").
            renderListEntry.visibleTiles.forEach(tile => {
                tile.levelOffset = 0;
                if (tile.hasGeometry && !tile.delayRendering) {
                    renderedTiles.set(tile.uniqueKey, tile);
                } else {
                    // if dataSource supports cache and it was existing before this render
                    // then enable searching for loaded tiles in cache
                    incompleteTiles.push(tile.uniqueKey);
                }
            });

            const dataSource = renderListEntry.dataSource;
            if (incompleteTiles.length === 0 || dataSource.allowOverlappingTiles === false) {
                // Either all tiles are loaded or the datasource doesn't support using cached tiles
                // from other levels.
                return;
            }

            const dataZoomLevel = renderListEntry.zoomLevel;
            const { searchDirection } = this.getSearchDirection(dataSource, dataZoomLevel);

            // Minor optimization for the fallback search, only check parent tiles once, otherwise
            // the recursive algorithm checks all parent tiles multiple times, the key is the code
            // of the tile that is checked and the value is whether a parent was found or not.
            const checkedTiles = new Map<number, boolean>();
            // Iterate over incomplete (not loaded tiles) and find their parents or children that
            // are in cache that can be rendered temporarily until tile is loaded. Note, we favour
            // falling back to parent tiles rather than children.
            for (const tileKeyCode of incompleteTiles) {
                if (
                    searchDirection === SearchDirection.BOTH ||
                    searchDirection === SearchDirection.UP
                ) {
                    if (
                        this.findUp(
                            tileKeyCode,
                            dataZoomLevel,
                            renderedTiles,
                            checkedTiles,
                            dataSource
                        )
                    ) {
                        // Continue to next entry so we don't search down.
                        continue;
                    }
                }

                if (
                    searchDirection === SearchDirection.BOTH ||
                    searchDirection === SearchDirection.DOWN
                ) {
                    this.findDown(tileKeyCode, dataZoomLevel, renderedTiles, dataSource);
                }
            }
        });
    }

    private findDown(
        tileKeyCode: number,
        dataZoomLevel: number,
        renderedTiles: Map<number, Tile>,
        dataSource: DataSource
    ) {
        const { offset, mortonCode } = TileOffsetUtils.extractOffsetAndMortonKeyFromKey(
            tileKeyCode
        );
        const tileKey = TileKey.fromMortonCode(mortonCode);

        const tilingScheme = dataSource.getTilingScheme();
        for (const childTileKey of tilingScheme.getSubTileKeys(tileKey)) {
            const childTileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(childTileKey, offset);
            const childTile = this.m_dataSourceCache.get(
                childTileKey.mortonCode(),
                offset,
                dataSource
            );

            const nextLevelDiff = Math.abs(childTileKey.level - dataZoomLevel);
            if (childTile !== undefined && childTile.hasGeometry && !childTile.delayRendering) {
                //childTile has geometry and was/can be uploaded to the GPU,
                //so we can use it as fallback
                renderedTiles.set(childTileCode, childTile);
                childTile.levelOffset = nextLevelDiff;
                continue;
            }

            // Recurse down until the max distance is reached.
            if (nextLevelDiff < this.options.quadTreeSearchDistanceDown) {
                this.findDown(childTileCode, dataZoomLevel, renderedTiles, dataSource);
            }
        }
    }

    /**
     * Returns true if a tile was found in the cache which is a parent
     * @param tileKeyCode - Morton code of the current tile that should be searched for.
     * @param dataZoomLevel - The current data zoom level of tiles that are to be displayed.
     * @param renderedTiles - The list of tiles that are shown to the user.
     * @param checkedTiles - Used to map a given code to a boolean which tells us if an ancestor is
     * displayed or not.
     * @param dataSource - The provider of tiles.
     * @returns Whether a parent tile exists.
     */
    private findUp(
        tileKeyCode: number,
        dataZoomLevel: number,
        renderedTiles: Map<number, Tile>,
        checkedTiles: Map<number, boolean>,
        dataSource: DataSource
    ): boolean {
        const parentCode = TileOffsetUtils.getParentKeyFromKey(tileKeyCode);
        // Check if another sibling has already added the parent.
        if (renderedTiles.get(parentCode) !== undefined) {
            return true;
        }
        const exists = checkedTiles.get(parentCode)!;
        if (exists !== undefined) {
            return exists;
        }

        const { offset, mortonCode } = TileOffsetUtils.extractOffsetAndMortonKeyFromKey(parentCode);
        const parentTile = this.m_dataSourceCache.get(mortonCode, offset, dataSource);
        const parentTileKey = parentTile ? parentTile.tileKey : TileKey.fromMortonCode(mortonCode);
        const nextLevelDiff = Math.abs(dataZoomLevel - parentTileKey.level);
        if (parentTile !== undefined && parentTile.hasGeometry && !parentTile.delayRendering) {
            checkedTiles.set(parentCode, true);
            // parentTile has geometry, so can be reused as fallback
            renderedTiles.set(parentCode, parentTile);

            // We want to have parent tiles as -ve, hence the minus.
            parentTile.levelOffset = -nextLevelDiff;

            return true;
        } else {
            checkedTiles.set(parentCode, false);
        }

        // Recurse up until the max distance is reached or we go to the parent of all parents.
        if (nextLevelDiff < this.options.quadTreeSearchDistanceUp && parentTileKey.level !== 0) {
            const foundUp = this.findUp(
                parentCode,
                dataZoomLevel,
                renderedTiles,
                checkedTiles,
                dataSource
            );
            // If there was a tile upstream found, then add it to the list, so we can
            // early skip checkedTiles.
            checkedTiles.set(parentCode, foundUp);
            if (foundUp) {
                return true;
            }
        }
        return false;
    }

    private getTileImpl(
        dataSource: DataSource,
        tileKey: TileKey,
        offset: number,
        cacheOnly: boolean,
        frameNumber: number
    ): Tile | undefined {
        function touchTile(tileToUpdate: Tile) {
            // Keep the tile from being removed from the cache.
            tileToUpdate.frameNumLastRequested = frameNumber;
        }

        if (!dataSource.cacheable && !cacheOnly) {
            const resultTile = dataSource.getTile(tileKey, true);
            if (resultTile !== undefined) {
                this.addToTaskQueue(resultTile);
                touchTile(resultTile);
            }
            return resultTile;
        }

        const tileCache = this.m_dataSourceCache;
        let tile = tileCache.get(tileKey.mortonCode(), offset, dataSource);

        if (tile !== undefined && tile.offset === offset) {
            touchTile(tile);
            return tile;
        }

        if (cacheOnly) {
            return undefined;
        }

        tile = dataSource.getTile(tileKey, true);
        // TODO: Update all tile information including area, min/max elevation from TileKeyEntry
        if (tile !== undefined) {
            this.addToTaskQueue(tile);
            tile.offset = offset;
            touchTile(tile);
            tileCache.set(tileKey.mortonCode(), offset, dataSource, tile);
        }
        return tile;
    }

    private addToTaskQueue(tile: Tile) {
        this.m_taskQueue.add({
            execute: tile.load.bind(tile),
            group: TileTaskGroups.FETCH_AND_DECODE,
            getPriority: () => {
                return tile?.tileLoader?.priority ?? 0;
            },
            isExpired: () => {
                return !tile?.isVisible;
            },
            estimatedProcessTime: () => {
                return 1;
            }
        });
    }

    private markDataSourceTilesDirty(
        renderListEntry: DataSourceTileList,
        filter?: (tile: Tile) => boolean
    ) {
        const dataSourceCache = this.m_dataSourceCache;
        const retainedTiles: Set<TileCacheId> = new Set();

        const markTileDirty = (tile: Tile) => {
            const tileKey = DataSourceCache.getKeyForTile(tile);
            if (!retainedTiles.has(tileKey)) {
                retainedTiles.add(tileKey);
                this.addToTaskQueue(tile);
            }
        };

        renderListEntry.visibleTiles.forEach(tile => {
            if (filter === undefined || filter(tile)) {
                markTileDirty(tile);
            }
        });
        renderListEntry.renderedTiles.forEach(tile => {
            if (filter === undefined || filter(tile)) {
                markTileDirty(tile);
            }
        });

        dataSourceCache.forEach((tile, key) => {
            if ((filter === undefined || filter(tile)) && !retainedTiles.has(key)) {
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
        const tileKeys = Array<{
            dataSource: DataSource;
            visibleTileKeys: TileKeyEntry[];
        }>();
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

        // If elevation is to be taken into account extend view frustum:
        // (near ~0, far: maxVisibilityRange) that allows to consider tiles that
        // are far below ground plane and high enough to intersect the frustum.
        if (elevationRangeSource !== undefined) {
            this.m_cameraOverride.copy(this.m_frustumIntersection.camera);
            this.m_cameraOverride.near = Math.min(
                this.m_cameraOverride.near,
                this.m_viewRange.minimum
            );
            this.m_cameraOverride.far = Math.max(
                this.m_cameraOverride.far,
                this.m_viewRange.maximum
            );
            this.m_cameraOverride.updateProjectionMatrix();
            this.m_frustumIntersection.updateFrustum(this.m_cameraOverride.projectionMatrix);
        } else {
            this.m_frustumIntersection.updateFrustum();
        }

        // For each bucket of data sources with same tiling scheme, calculate frustum intersection
        // once using the maximum display level.
        for (const [tilingScheme, bucket] of dataSourceBuckets) {
            const zoomLevels = bucket.map(dataSource => dataSource.getDataZoomLevel(zoomLevel));
            const result = this.m_frustumIntersection.compute(
                tilingScheme,
                elevationRangeSource,
                zoomLevels,
                bucket
            );

            allBoundingBoxesFinal = allBoundingBoxesFinal && result.calculationFinal;

            for (const dataSource of bucket) {
                // For each data source check what tiles from the intersection should be rendered
                // at this zoom level.
                const visibleTileKeys: TileKeyEntry[] = [];
                const dataZoomLevel = dataSource.getDataZoomLevel(zoomLevel);
                for (const tileKeyEntry of result.tileKeyEntries.get(dataZoomLevel)!.values()) {
                    if (dataSource.canGetTile(dataZoomLevel, tileKeyEntry.tileKey)) {
                        visibleTileKeys.push(tileKeyEntry);
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
