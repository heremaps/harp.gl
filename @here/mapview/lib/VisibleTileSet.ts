import { DataSource } from "./DataSource";
import { MapTileCuller } from "./MapTileCuller";
import { Tile } from "./Tile";

import { Projection, TileKey } from "@here/geoutils";
import { LRUCache } from "@here/lrucache";

import * as THREE from "three";

/**
 * Limited set of [[MapViewOptions]] used for [[VisibleTileSet]].
 */
export interface VisibleTileSetOptions {
    /**
     * Missing Typedoc
     */
    projection: Projection;

    /**
     * Missing Typedoc
     */
    maxVisibleDataSourceTiles: number;

    /**
     * Missing Typedoc
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
     * Missing Typedoc
     */
    quadTreeSearchDistanceUp: number;

    /**
     * Missing Typedoc
     */
    quadTreeSearchDistanceDown: number;
}

/**
 * Missing Typedoc
 */
export class TileEntry {
    constructor(public tile: Tile, public area: number) {}
}

/**
 * Missing Typedoc
 */
class TileKeyEntry {
    constructor(public tileKey: TileKey, public area: number) {}
}

/**
 * Missing Typedoc
 */
class DataSourceCache {
    readonly tileCache: LRUCache<number, Tile>;
    readonly disposedTiles: Tile[] = [];

    constructor(options: VisibleTileSetOptions) {
        this.tileCache = new LRUCache<number, Tile>(options.tileCacheSize);
        this.tileCache.evictionCallback = (_, tile) => {
            this.disposedTiles.push(tile);
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
 * Missing Typedoc
 */
export interface DataSourceTileList {
    /**
     * Missing Typedoc
     */
    dataSource: DataSource;

    /**
     * Missing Typedoc
     */
    zoomLevel: number;

    /**
     * Missing Typedoc
     */
    storageLevel: number;

    /**
     * Missing Typedoc
     */
    allVisibleTileLoaded: boolean;

    /**
     * Missing Typedoc
     */
    visibleTiles: Tile[];

    /**
     * Missing Typedoc
     */
    renderedTiles: Tile[];
}

/**
 * Manages visible [[Tile]]s for [[MapView]].
 *
 * Responsible for election of rendered tiles:
 *  - quad-tree traveral
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
     * Gets ammount of visible tiles.
     */
    getNumberOfVisibleTiles() {
        return this.options.maxVisibleDataSourceTiles;
    }

    /**
     * Sets ammount of visible tiles.
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

            const workList: TileKeyEntry[] = [new TileKeyEntry(rootTileKey, 0)];

            const visibleTiles: TileKeyEntry[] = [];

            const tileFrustumIntersectionCache = new Map<number, number>();
            tileFrustumIntersectionCache.set(rootTileKey.mortonCode(), Infinity);

            while (workList.length > 0) {
                const tileEntry = workList.pop();

                if (tileEntry === undefined) {
                    continue;
                }

                const area = tileFrustumIntersectionCache.get(tileEntry.tileKey.mortonCode());

                if (area === undefined) {
                    throw new Error("Unexpected tile key");
                }

                if (area <= 0 || tileEntry.tileKey.level > displayZoomLevel) {
                    continue;
                }

                if (dataSource.shouldRender(displayZoomLevel, tileEntry.tileKey)) {
                    visibleTiles.push(tileEntry);
                }

                tilingScheme.getSubTileKeys(tileEntry.tileKey).forEach(childTileKey => {
                    const intersectsFrustum = tileFrustumIntersectionCache.get(
                        childTileKey.mortonCode()
                    );

                    let subTileArea = 0;

                    if (intersectsFrustum === undefined) {
                        const geoBox = tilingScheme.getGeoBox(childTileKey);
                        this.options.projection.projectBox(geoBox, tileBounds);
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

                        tileFrustumIntersectionCache.set(childTileKey.mortonCode(), subTileArea);
                    }

                    if (subTileArea > 0) {
                        workList.push(new TileKeyEntry(childTileKey, subTileArea));
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

            const actuallyVisibleTiles: Tile[] = [];
            let allDataSourceTilesLoaded = true;
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
                const tile = this.getTile(dataSource, tileEntry.tileKey);
                if (tile === undefined) {
                    continue;
                }

                tile.prepareForRender();
                allDataSourceTilesLoaded = allDataSourceTilesLoaded && tile.hasGeometry;
                actuallyVisibleTiles.push(tile);
            }

            newRenderList.push({
                dataSource,
                storageLevel,
                zoomLevel: displayZoomLevel,
                allVisibleTileLoaded: allDataSourceTilesLoaded,
                visibleTiles: actuallyVisibleTiles,
                renderedTiles: actuallyVisibleTiles
            });
            allVisibleTilesLoaded = allVisibleTilesLoaded && allDataSourceTilesLoaded;
        }

        this.dataSourceTileList = newRenderList;
        this.allVisibleTilesLoaded = allVisibleTilesLoaded;

        this.fillMissingTilesFromCache();

        return newRenderList;
    }

    getTile(dataSource: DataSource, tileKey: TileKey): Tile | undefined {
        if (!dataSource.cacheable) {
            return dataSource.getTile(tileKey);
        }

        const { tileCache } = this.getOrCreateCache(dataSource);

        let tile = tileCache.get(tileKey.mortonCode());

        if (tile !== undefined) {
            return tile;
        }

        tile = dataSource.getTile(tileKey);

        if (tile !== undefined) {
            tileCache.set(tileKey.mortonCode(), tile);
        }

        return tile;
    }

    /**
     * Removes all internal bookeeping entries and cache related to specified datasource.
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
            listEntry.visibleTiles.forEach(fun);
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
     * Search cache to replace visible but yet empty tiles with already loaded siblings in nearby
     * zoom levels.
     *
     * Useful, when zooming in/out and when "newly elected" tiles are not yet loaded. Prevents
     * flickering by rendering already loaded tiles from uppper/higher zoom levels.
     */
    private fillMissingTilesFromCache() {
        this.dataSourceTileList.forEach(renderListEntry => {
            const dataSource = renderListEntry.dataSource;
            const tilingScheme = dataSource.getTilingScheme();
            const displayZoomLevel = renderListEntry.zoomLevel;
            const renderedTiles: Map<number, Tile> = new Map<number, Tile>();
            const checkedTiles: Set<number> = new Set<number>();

            // direction in quad tree to seach: up -> shallower levels, down -> deeper lewels
            enum SearchDirection {
                UP,
                DOWN,
                BOTH
            }
            const tileCache = this.m_dataSourceCache.get(dataSource.name);

            const cacheSearchUp =
                this.options.quadTreeSearchDistanceUp > 0 &&
                tileCache !== undefined &&
                displayZoomLevel > dataSource.minZoomLevel;
            const cacheSearchDown =
                this.options.quadTreeSearchDistanceDown > 0 &&
                tileCache !== undefined &&
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

            let incompleteTiles: Map<number, SearchDirection> = new Map<number, SearchDirection>();

            renderListEntry.visibleTiles.forEach(tile => {
                const tileCode = tile.tileKey.mortonCode();
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
            while (tileCache !== undefined && incompleteTiles.size !== 0) {
                const nextLevelCandidates: Map<number, SearchDirection> = new Map();

                incompleteTiles.forEach((searchDirection, tileKeyCode) => {
                    if (
                        searchDirection === SearchDirection.BOTH ||
                        searchDirection === SearchDirection.UP
                    ) {
                        const parentCode = TileKey.parentMortonCode(tileKeyCode);

                        if (!checkedTiles.has(parentCode) && !renderedTiles.get(parentCode)) {
                            checkedTiles.add(parentCode);
                            const parentTile = tileCache.get(parentCode);
                            if (parentTile !== undefined && parentTile.hasGeometry) {
                                // parentTile has geometry, so can be reused as fallback
                                renderedTiles.set(parentCode, parentTile);
                                return;
                            }

                            const parentTileKey = parentTile
                                ? parentTile.tileKey
                                : TileKey.fromMortonCode(parentCode);

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
                        const tileKey = TileKey.fromMortonCode(tileKeyCode);
                        tilingScheme.getSubTileKeys(tileKey).forEach(childTileKey => {
                            const childTileCode = childTileKey.mortonCode();
                            const childTile = tileCache.get(childTileCode);

                            checkedTiles.add(childTileCode);
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
            retainedTiles.add(tile.tileKey.mortonCode());
            tile.reload();
        });
        renderListEntry.renderedTiles.forEach(tile => {
            const tileCode = tile.tileKey.mortonCode();
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
}
