/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MathUtils, Projection, ProjectionType, TileKey, TilingScheme } from "@here/harp-geoutils";
import { LRUCache } from "@here/harp-lrucache";
import * as THREE from "three";

import { DataSource } from "./DataSource";
import { CalculationStatus, ElevationRangeSource } from "./ElevationRangeSource";
import { MapTileCuller } from "./MapTileCuller";
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

/**
 * Represents a unique TileKey and the area it takes up on screen.
 *
 * Note, in certain tiling projections, it is possible to have an offset, which represents a tile
 * which has fully wrapped around, hence this defaults to 0 to simplify usage for projections which
 * don't require it.
 */
class TileKeyEntry {
    constructor(public tileKey: TileKey, public area: number, public offset: number = 0) {}
}

const MB_FACTOR = 1.0 / (1024.0 * 1024.0);

/**
 * Missing Typedoc
 */
class DataSourceCache {
    readonly tileCache: LRUCache<number, Tile>;
    readonly disposedTiles: Tile[] = [];

    resourceComputationType: ResourceComputationType = ResourceComputationType.EstimationInMb;

    constructor(options: VisibleTileSetOptions) {
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
            return tile.frameNumLastRequested !== tile.dataSource.mapView.frameNumber;
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

    // used to project global coordinates into camera local coordinates
    private readonly m_viewProjectionMatrix = new THREE.Matrix4();
    private readonly m_mapTileCuller: MapTileCuller;
    private readonly m_frustum: THREE.Frustum = new THREE.Frustum();
    private m_ResourceComputationType: ResourceComputationType =
        ResourceComputationType.EstimationInMb;

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

    updateRenderList(
        worldCenter: THREE.Vector3,
        storageLevel: number,
        zoomLevel: number,
        dataSources: DataSource[]
    ) {
        this.m_viewProjectionMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.m_frustum.setFromMatrix(this.m_viewProjectionMatrix);

        let allVisibleTilesLoaded: boolean = true;

        if (this.options.extendedFrustumCulling) {
            this.m_mapTileCuller.setup();
        }

        let elevationRangeSource: ElevationRangeSource | undefined;
        for (const dataSource of dataSources) {
            elevationRangeSource = dataSource.getElevationRangeSource();
            if (elevationRangeSource !== undefined) {
                // We don't support multiple elevation range sources, but just take the first one
                // that we find in the enabled data sources.
                break;
            }
        }

        const visibleTileResult = this.getVisibleTilesForDataSources(
            worldCenter,
            zoomLevel,
            dataSources,
            elevationRangeSource
        );
        this.dataSourceTileList = [];
        for (const { dataSource, visibleTiles } of visibleTileResult.tiles) {
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

            const actuallyVisibleTiles: Tile[] = [];
            let allDataSourceTilesLoaded = true;
            let numTilesLoading = 0;
            // Create actual tiles only for the allowed number of visible tiles
            const displayZoomLevel = dataSource.getDisplayZoomLevel(zoomLevel);
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
            allVisibleTilesLoaded && visibleTileResult.allBoundingBoxesFinal;

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

    forEachCachedTile(fun: (tile: Tile) => void): void {
        this.m_dataSourceCache.forEach(dataSourceCache => {
            dataSourceCache.tileCache.forEach(tile => {
                fun(tile);
            });
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
     * Returns the target [[Projection]].
     */
    private get projection() {
        return this.options.projection;
    }

    /**
     * Returns the type of the target [[Projection]].
     */
    private get projectionType() {
        return this.projection.type;
    }

    /**
     * Returns true if the tile wrapping is enabled.
     *
     * The default implementation returns true for planar projections.
     */
    private get tileWrappingEnabled() {
        return this.projectionType === ProjectionType.Planar;
    }

    private getGeoBox(tilingScheme: TilingScheme, childTileKey: TileKey, offset: number) {
        const geoBox = tilingScheme.getGeoBox(childTileKey);
        const longitudeOffset = 360.0 * offset;
        geoBox.northEast.longitude += longitudeOffset;
        geoBox.southWest.longitude += longitudeOffset;
        return geoBox;
    }

    /**
     * Creates the intersection cache and initializes values for the root nodes.
     *
     * @param workList The list of work items with which to initialize the cache.
     */
    private createIntersectionCache(workList: TileKeyEntry[]) {
        const map = new Map<number, number>();
        for (const item of workList) {
            map.set(TileOffsetUtils.getKeyForTileKeyAndOffset(item.tileKey, item.offset), Infinity);
        }
        return map;
    }

    /**
     * Create a list of root nodes to test against the frustum.
     *
     * @param rootTileKey The root [[TileKey]] from which to start.
     * @param worldCenter The center of the camera in world space.
     */
    private getRequiredInitialRootTileKeys(
        rootTileKey: TileKey,
        worldCenter: THREE.Vector3
    ): TileKeyEntry[] {
        if (!this.tileWrappingEnabled) {
            return [new TileKeyEntry(rootTileKey, 0)];
        }
        const worldGeoPoint = this.options.projection.unprojectPoint(worldCenter);
        const result: TileKeyEntry[] = [];
        const startOffset = Math.round(worldGeoPoint.longitude / 360.0);
        const worldLengthHorizontal =
            Math.tan(MathUtils.degToRad(this.camera.fov) * this.camera.aspect) *
            -this.camera.position.z;
        const worldLeftPoint = new THREE.Vector3(
            worldCenter.x - worldLengthHorizontal,
            worldCenter.y,
            worldCenter.z
        );
        const worldLeftGeoPoint = this.options.projection.unprojectPoint(worldLeftPoint);
        const offsetRange = Math.ceil(
            Math.abs((worldGeoPoint.longitude - worldLeftGeoPoint.longitude) / 360)
        );
        for (
            let offset = -offsetRange + startOffset;
            offset <= offsetRange + startOffset;
            offset++
        ) {
            result.push(new TileKeyEntry(rootTileKey, 0, offset));
        }
        return result;
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
                        tilingScheme.getSubTileKeys(tileKey).forEach(childTileKey => {
                            const childTileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(
                                childTileKey,
                                offset
                            );
                            checkedTiles.add(childTileCode);
                            const childTile = tileCache.get(childTileCode);

                            if (childTile !== undefined && childTile.hasGeometry) {
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
            const tileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, tile.offset);
            retainedTiles.add(tileCode);
            tile.reload();
        });
        renderListEntry.renderedTiles.forEach(tile => {
            const tileCode = TileOffsetUtils.getKeyForTileKeyAndOffset(tile.tileKey, tile.offset);
            if (!retainedTiles.has(tileCode)) {
                retainedTiles.add(tileCode);
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

    // Computes the visible tiles for each supplied datasource.
    private getVisibleTilesForDataSources(
        worldCenter: THREE.Vector3,
        zoomLevel: number,
        dataSources: DataSource[],
        elevationRangeSource: ElevationRangeSource | undefined
    ): {
        tiles: Array<{ dataSource: DataSource; visibleTiles: TileKeyEntry[] }>;
        allBoundingBoxesFinal: boolean;
    } {
        const tiles = [];
        let allBoundingBoxesFinal: boolean = true;

        for (const dataSource of dataSources) {
            const displayZoomLevel = dataSource.getDisplayZoomLevel(zoomLevel);

            const tilingScheme = dataSource.getTilingScheme();
            const useElevationRangeSource: boolean =
                elevationRangeSource !== undefined &&
                elevationRangeSource.getTilingScheme() === tilingScheme;

            const rootTileKey = TileKey.fromRowColumnLevel(0, 0, 0);
            const tileBounds = new THREE.Box3();
            const workList: TileKeyEntry[] = this.getRequiredInitialRootTileKeys(
                rootTileKey,
                worldCenter
            );

            const visibleTiles: TileKeyEntry[] = [];

            const tileFrustumIntersectionCache = this.createIntersectionCache(workList);

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
                    const offset = tileEntry.offset;
                    const tileKeyAndOffset = TileOffsetUtils.getKeyForTileKeyAndOffset(
                        childTileKey,
                        offset
                    );
                    const intersectsFrustum = tileFrustumIntersectionCache.get(tileKeyAndOffset);

                    if (intersectsFrustum === undefined) {
                        const geoBox = this.getGeoBox(tilingScheme, childTileKey, offset);

                        if (useElevationRangeSource) {
                            const range = elevationRangeSource!.getElevationRange(childTileKey);
                            geoBox.southWest.altitude = range.minElevation;
                            geoBox.northEast.altitude = range.maxElevation;

                            allBoundingBoxesFinal =
                                allBoundingBoxesFinal &&
                                range.calculationStatus === CalculationStatus.FinalPrecise;
                        }
                        this.options.projection.projectBox(geoBox, tileBounds);
                        tileBounds.min.sub(worldCenter);
                        tileBounds.max.sub(worldCenter);

                        const subTileArea = this.computeSubTileArea(tileBounds);

                        tileFrustumIntersectionCache.set(tileKeyAndOffset, subTileArea);

                        if (subTileArea > 0) {
                            workList.push(new TileKeyEntry(childTileKey, subTileArea, offset));
                        }
                    }
                });
            }
            tiles.push({ dataSource, visibleTiles });
        }
        return { tiles, allBoundingBoxesFinal };
    }

    // Computes the rough screen area of the supplied box.
    // TileBounds must be in world space.
    private computeSubTileArea(tileBounds: THREE.Box3) {
        if (
            (!this.options.extendedFrustumCulling ||
                this.m_mapTileCuller.frustumIntersectsTileBox(tileBounds)) &&
            this.m_frustum.intersectsBox(tileBounds)
        ) {
            const contour = [
                new THREE.Vector3(tileBounds.min.x, tileBounds.min.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                ),
                new THREE.Vector3(tileBounds.max.x, tileBounds.min.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                ),
                new THREE.Vector3(tileBounds.max.x, tileBounds.max.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                ),
                new THREE.Vector3(tileBounds.min.x, tileBounds.max.y, 0).applyMatrix4(
                    this.m_viewProjectionMatrix
                )
            ];

            contour.push(contour[0]);

            const n = contour.length;

            let subTileArea = 0;
            for (let p = n - 1, q = 0; q < n; p = q++) {
                subTileArea += contour[p].x * contour[q].y - contour[q].x * contour[p].y;
            }

            return Math.abs(subTileArea * 0.5);
        }
        return 0;
    }
}
