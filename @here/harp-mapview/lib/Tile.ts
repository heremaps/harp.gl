/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    GeometryKindSet,
    GeometryType,
    TextPathGeometry
} from "@here/harp-datasource-protocol";
import { GeoBox, OrientedBox3, Projection, TileKey } from "@here/harp-geoutils";
import { assert, CachedResource, chainCallbacks, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { CopyrightInfo } from "./copyrights/CopyrightInfo";
import { DataSource } from "./DataSource";
import { ElevationRange } from "./ElevationRangeSource";
import { LodMesh } from "./geometry/LodMesh";
import { TileGeometryLoader } from "./geometry/TileGeometryLoader";
import { ITileLoader, TileLoaderState } from "./ITileLoader";
import { MapView } from "./MapView";
import { PathBlockingElement } from "./PathBlockingElement";
import { PerformanceStatistics } from "./Statistics";
import { TextElement } from "./text/TextElement";
import { TextElementGroup } from "./text/TextElementGroup";
import { TextElementGroupPriorityList } from "./text/TextElementGroupPriorityList";
import { TileTextStyleCache } from "./text/TileTextStyleCache";
import { MapViewUtils, TileOffsetUtils } from "./Utils";

const logger = LoggerManager.instance.create("Tile");

export type TileObject = THREE.Object3D & {
    /**
     * Distance of this object from the {@link Tile}'s center.
     */
    displacement?: THREE.Vector3;
};

interface DisposableObject {
    geometry?: THREE.BufferGeometry;
    geometries?: THREE.BufferGeometry[];
    material?: THREE.Material[] | THREE.Material;
}

/**
 * An interface for optional feature data that is saved in a `THREE.Object3D`'s `userData`
 * property.
 */
export interface TileFeatureData {
    /**
     * The original type of geometry.
     */
    geometryType?: GeometryType;

    /**
     * An optional array of sorted indices into geometry where the feature starts. The lists of IDs
     * and starting indices (starts) must have the same size.
     * Feature i starts at starts[i] and ends at starts[i+1]-1, except for the last feature, which
     * ends at the last index in the object's geometry.
     */
    starts?: number[];

    /**
     * An optional object containing properties defined by the developer. It has the same size as
     * the list of IDs and the starting indices (starts).
     */
    objInfos?: Array<{} | undefined>;
}

/**
 * Minimum estimated size of a JS object.
 */
const MINIMUM_SMALL_OBJECT_SIZE_ESTIMATION = 16;
const MINIMUM_OBJECT_SIZE_ESTIMATION = 100;

/**
 * Compute the memory footprint of `TileFeatureData`.
 *
 * @internal
 */
export function getFeatureDataSize(featureData: TileFeatureData): number {
    let numBytes = MINIMUM_OBJECT_SIZE_ESTIMATION;

    if (featureData.starts !== undefined) {
        numBytes += featureData.starts.length * 8;
    }
    if (featureData.objInfos !== undefined) {
        // 16 (estimated) bytes per objInfos
        numBytes += featureData.objInfos.length * MINIMUM_SMALL_OBJECT_SIZE_ESTIMATION;
    }

    return numBytes;
}

/**
 * An object that contains information about resources used by a tile.
 */
export interface TileResourceUsage {
    /**
     * The estimated memory usage, in bytes.
     */
    estimatedMemoryUsage: number;
    /**
     * The amount of vertices used by a tile.
     */
    numVertices: number;
    /**
     * The amount of colors used by a tile.
     */
    numColors: number;
    /**
     * The amount of objects used by a tile.
     */
    numObjects: number;
    /**
     * The amount of geometries used by a tile.
     */
    numGeometries: number;
    /**
     * The amount of materials used by a tile.
     */
    numMaterials: number;
}

/**
 * Simple information about resource usage by the {@link Tile}.
 *
 * @remarks
 * Heap and GPU information are
 * estimations.
 */
export interface TileResourceInfo {
    /**
     * Estimated number of bytes used on the heap.
     */
    heapSize: number;
    /**
     * Estimated number of bytes used on the GPU.
     */
    gpuSize: number;
    /**
     * Number of [[THREE.Object3D]] in this tile.
     */
    num3dObjects: number;
    /**
     * Number of {@link TextElement}s in this tile.
     */
    numTextElements: number;
    /**
     * @deprecated This counter has been merged with numTextElements.
     * Number of user {@link TextElement}s in this tile.
     */
    numUserTextElements: number;
}

/**
 * @internal
 */
export interface TextElementIndex {
    groupIndex: number;
    elementIndex: number;
}

type TileCallback = (tile: Tile) => void;

/**
 * The class that holds the tiled data for a {@link DataSource}.
 */
export class Tile implements CachedResource {
    /**
     * A list of the THREE.js objects stored in this `Tile`.
     */
    readonly objects: TileObject[] = [];

    /**
     * The optional list of HERE TileKeys of tiles with geometries that cross the boundaries of this
     * `Tile`.
     */
    readonly dependencies: TileKey[] = [];

    /**
     * The bounding box of this `Tile` in geocoordinates.
     */
    readonly geoBox: GeoBox;

    /**
     * Copyright information of this `Tile`'s data.
     */
    copyrightInfo?: CopyrightInfo[];

    /**
     * Keeping some stats for the individual {@link Tile}s to analyze caching behavior.
     *
     * The frame the {@link Tile} was last requested. This is
     * required to know when the given {@link Tile}
     * can be removed from the cache.
     */
    frameNumLastRequested: number = -1;

    /**
     * The frame the `Tile` was first visible.
     */
    frameNumVisible: number = -1;

    /**
     * The last frame this `Tile` has been rendered (or was in the visible set). Used to determine
     * visibility of `Tile` at the end of a frame, if the number is the current frame number, it is
     * visible.
     */
    frameNumLastVisible: number = -1;

    /**
     * After removing from cache, this is the number of frames the `Tile` was visible.
     */
    numFramesVisible: number = 0;

    /**
     * Version stamp of the visibility set in the [[TileManager]]. If the counter is different, the
     * visibility of the Tile's objects has to be calculated. Optimization to reduce overhead of
     * computing visibility.
     */
    visibilityCounter: number = -1;

    /**
     * @hidden
     *
     * Used to tell if the Tile is used temporarily as a fallback tile.
     *
     * levelOffset is in in the range [-quadTreeSearchDistanceUp,
     * quadTreeSearchDistanceDown], where these values come from the
     * {@link VisibleTileSetOptions}
     */
    levelOffset: number = 0;

    /**
     * If the tile should not be rendered, this is used typically when the tile in question
     * is completely covered by another tile and therefore can be skipped without any visual
     * impact. Setting this value directly affects the [[willRender]] method, unless
     * overriden by deriving classes.
     */
    skipRendering: boolean = false;

    /**
     * If the tile should not yet be rendered, this is used typically when the tile in question
     * does not fit into the gpu upload limit of the current frame.
     * Setting this value directly affects the [[willRender]] method, unless
     * overriden by deriving classes.
     */
    delayRendering = false;

    /**
     * @hidden
     *
     * Prepared text geometries optimized for display.
     */
    protected preparedTextPaths: TextPathGeometry[] | undefined;
    protected readonly m_tileGeometryLoader?: TileGeometryLoader;

    /**
     * The bounding box of this `Tile` in world coordinates.
     */
    private readonly m_boundingBox = new OrientedBox3();

    private m_disposed: boolean = false;
    private m_disposeCallback?: TileCallback;
    private readonly m_localTangentSpace: boolean;

    private m_forceHasGeometry: boolean | undefined = undefined;

    private m_tileLoader?: ITileLoader;
    private m_decodedTile?: DecodedTile;

    // Used for {@link TextElement}s that are stored in the data, and that are placed explicitly,
    // fading in and out.
    private m_textElementGroups = new TextElementGroupPriorityList();

    // Blocks other labels from showing.
    private readonly m_pathBlockingElements: PathBlockingElement[] = [];

    // If `true`, the text content of the {@link Tile} changed after the last time it was rendered.
    // It's `Undefined` when no text content has been added yet.
    private m_textElementsChanged: boolean | undefined;

    // Center of the tile's un-elevated bounding box world coordinates.
    private readonly m_worldCenter = new THREE.Vector3();
    private m_visibleArea: number = 0;
    // Tile elevation range in meters
    private readonly m_elevationRange: ElevationRange = { minElevation: 0, maxElevation: 0 };
    // Maximum height of geometry on this tile above ground level.
    private m_maxGeometryHeight?: number;
    // Minimum height of geometry on this tile below ground level. Should be negative for values
    // below ground.
    private m_minGeometryHeight?: number;

    private m_resourceInfo: TileResourceInfo | undefined;

    // List of owned textures for disposal
    private readonly m_ownedTextures: WeakSet<THREE.Texture> = new WeakSet();

    private readonly m_textStyleCache: TileTextStyleCache;
    private m_uniqueKey: number;
    private m_offset: number;
    /**
     * Creates a new {@link Tile}.
     *
     * @param dataSource - The {@link DataSource} that created this {@link Tile}.
     * @param tileKey - The unique identifier for this {@link Tile}.
     *                  Currently only up to level 24 is
     *                  supported, because of the use of the upper bits for the offset.
     * @param offset - The optional offset, this is an integer which represents what multiple of 360
     *                 degrees to shift, only useful for flat projections, hence optional.
     * @param localTangentSpace - Whether the tile geometry is in local tangent space or not.
     */
    constructor(
        readonly dataSource: DataSource,
        readonly tileKey: TileKey,
        offset: number = 0,
        localTangentSpace?: boolean
    ) {
        this.geoBox = this.dataSource.getTilingScheme().getGeoBox(this.tileKey);
        this.updateBoundingBox();
        this.m_worldCenter.copy(this.boundingBox.position);
        this.m_localTangentSpace = localTangentSpace ?? false;
        this.m_textStyleCache = new TileTextStyleCache(this);
        this.m_offset = offset;
        this.m_uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(this.tileKey, this.offset);
        if (dataSource.useGeometryLoader) {
            this.m_tileGeometryLoader = new TileGeometryLoader(this, this.mapView.taskQueue);
            this.attachGeometryLoadedCallback();
        }
    }

    /**
     * The visibility status of the {@link Tile}. It is actually
     * visible or planned to become visible.
     */
    get isVisible(): boolean {
        // Tiles are not evaluated as invisible until the second frame they aren't requested.
        // This happens in order to prevent that, during VisibleTileSet visibility evaluation,
        // visible tiles that haven't yet been evaluated for the current frame are preemptively
        // removed from [[DataSourceCache]].
        // There is cases when a tile was already removed from the MapView, i.e. the PolaCaps
        // Datasource might get remove on a change of projection, in this case
        // this.dataSource.mapView will throw an error
        try {
            return this.frameNumLastRequested >= this.dataSource.mapView.frameNumber - 1;
        } catch (error) {
            logger.debug(error);
            return false;
        }
    }

    /**
     * Sets the tile visibility status.
     * @param visible - `True` to mark the tile as visible, `False` otherwise.
     */
    set isVisible(visible: boolean) {
        this.frameNumLastRequested = visible ? this.dataSource.mapView.frameNumber : -1;

        if (!visible && this.m_tileGeometryLoader && !this.m_tileGeometryLoader.isSettled) {
            this.m_tileGeometryLoader.cancel();
        }
    }

    /**
     * The {@link @here/harp-geoutils#Projection} currently used by the {@link MapView}.
     */
    get projection(): Projection {
        return this.dataSource.projection;
    }

    /**
     * The {@link MapView} this `Tile` belongs to.
     */
    get mapView(): MapView {
        return this.dataSource.mapView;
    }

    /**
     * Whether the data of this tile is in local tangent space or not.
     *
     * @remarks
     * If the data is in local tangent space (i.e. up vector is (0,0,1) for high zoomlevels) then
     * {@link MapView} will rotate the objects before rendering using the rotation matrix of the
     * oriented [[boundingBox]].
     */
    get localTangentSpace(): boolean {
        return this.m_localTangentSpace;
    }

    /*
     * The size of this Tile in system memory.
     */
    get memoryUsage(): number {
        if (this.m_resourceInfo === undefined) {
            this.computeResourceInfo();
        }
        return this.m_resourceInfo!.heapSize;
    }

    /**
     * The center of this `Tile` in world coordinates.
     */
    get center(): THREE.Vector3 {
        return this.m_worldCenter;
    }

    /**
     * Gets the key to uniquely represent this tile (based on
     * the {@link tileKey} and {@link offset}).
     *
     * @remarks
     * This key is only unique within the given {@link DataSource},
     * to get a key which is unique across
     * {@link DataSource}s see [[DataSourceCache.getKeyForTile]].
     */
    get uniqueKey(): number {
        return this.m_uniqueKey;
    }

    /**
     * The optional offset, this is an integer which represents what multiple of 360 degrees to
     * shift, only useful for flat projections, hence optional.
     */
    get offset(): number {
        return this.m_offset;
    }

    /**
     * The optional offset, this is an integer which represents what multiple of 360 degrees to
     * shift, only useful for flat projections, hence optional.
     * @param offset - Which multiple of 360 degrees to apply to the {@link Tile}.
     */
    set offset(offset: number) {
        if (this.m_offset !== offset) {
            this.m_uniqueKey = TileOffsetUtils.getKeyForTileKeyAndOffset(this.tileKey, offset);
        }
        this.m_offset = offset;
    }

    /**
     * Compute {@link TileResourceInfo} of this `Tile`.
     *
     * @remarks
     * May be using a cached value. The method
     * `invalidateResourceInfo` can be called beforehand to force a recalculation.
     *
     * @returns `TileResourceInfo` for this `Tile`.
     */
    getResourceInfo(): TileResourceInfo {
        if (this.m_resourceInfo === undefined) {
            this.computeResourceInfo();
        }
        return this.m_resourceInfo!;
    }

    /**
     * Force invalidation of the cached {@link TileResourceInfo}.
     *
     * @remarks
     * Useful after the `Tile` has been
     * modified.
     */
    invalidateResourceInfo(): void {
        this.m_resourceInfo = undefined;
    }

    /**
     * Add ownership of a texture to this tile.
     *
     * @remarks
     * The texture will be disposed if the `Tile` is disposed.
     * @param texture - Texture to be owned by the `Tile`
     */
    addOwnedTexture(texture: THREE.Texture): void {
        this.m_ownedTextures.add(texture);
    }

    /**
     * @internal
     * @deprecated User text elements are deprecated.
     *
     * Gets the list of developer-defined {@link TextElement} in this `Tile`.
     *
     * @remarks
     * This list is always rendered first.
     */
    get userTextElements(): TextElementGroup {
        let group = this.m_textElementGroups.groups.get(TextElement.HIGHEST_PRIORITY);
        if (group === undefined) {
            group = new TextElementGroup(TextElement.HIGHEST_PRIORITY);
            this.m_textElementGroups.groups.set(group.priority, group);
        }
        return group;
    }

    /**
     * Adds a developer-defined {@link TextElement} to this `Tile`.
     *
     * @remarks
     * The {@link TextElement} is always
     * visible, if it's in the map's currently visible area.
     *
     * @deprecated use [[addTextElement]].
     *
     * @param textElement - The Text element to add.
     */
    addUserTextElement(textElement: TextElement) {
        textElement.priority = TextElement.HIGHEST_PRIORITY;
        this.addTextElement(textElement);
    }

    /**
     * Removes a developer-defined {@link TextElement} from this `Tile`.
     *
     * @deprecated use `removeTextElement`.
     *
     * @param textElement - A developer-defined TextElement to remove.
     * @returns `true` if the element has been removed successfully; `false` otherwise.
     */
    removeUserTextElement(textElement: TextElement): boolean {
        textElement.priority = TextElement.HIGHEST_PRIORITY;
        return this.removeTextElement(textElement);
    }

    /**
     * Adds a {@link TextElement} to this `Tile`, which is added to the visible set of
     * {@link TextElement}s based on the capacity and visibility.
     *
     * @remarks
     * The {@link TextElement}'s priority controls if or when it becomes visible.
     *
     * To ensure that a TextElement is visible, use a high value for its priority, such as
     * `TextElement.HIGHEST_PRIORITY`. Since the number of visible TextElements is limited by the
     * screen space, not all TextElements are visible at all times.
     *
     * @param textElement - The TextElement to add.
     */
    addTextElement(textElement: TextElement) {
        this.textElementGroups.add(textElement);

        if (this.m_textElementsChanged === false) {
            // HARP-8733: Clone all groups so that they are handled as new element groups
            // by TextElementsRenderer and it doesn't try to reuse the same state stored
            // for the old groups.
            this.m_textElementGroups = this.textElementGroups.clone();
        }
        this.textElementsChanged = true;
    }

    /**
     * Adds a `PathBlockingElement` to this `Tile`.
     *
     * @remarks
     * This path has the highest priority and blocks
     * all other labels. There maybe in future a use case to give it a priority, but as that isn't
     * yet required, it is left to be implemented later if required.
     * @param blockingElement - Element which should block all other labels.
     */
    addBlockingElement(blockingElement: PathBlockingElement) {
        this.m_pathBlockingElements.push(blockingElement);
    }

    /**
     * Removes a {@link TextElement} from this `Tile`.
     *
     * @remarks
     * For the element to be removed successfully, the
     * priority of the {@link TextElement} has to be equal to its priority when it was added.
     *
     * @param textElement - The TextElement to remove.
     * @returns `true` if the TextElement has been removed successfully; `false` otherwise.
     */
    removeTextElement(textElement: TextElement): boolean {
        const groups = this.textElementGroups;
        if (!groups.remove(textElement)) {
            return false;
        }
        if (this.m_textElementsChanged === false) {
            // HARP-8733: Clone all groups so that they are handled as new element groups
            // by TextElementsRenderer and it doesn't try to reuse the same state stored
            // for the old groups.
            this.m_textElementGroups = groups.clone();
        }
        this.textElementsChanged = true;
        return true;
    }

    /**
     * @internal
     *
     * Gets the current `GroupedPriorityList` which
     * contains a list of all {@link TextElement}s to be
     * selected and placed for rendering.
     */
    get textElementGroups(): TextElementGroupPriorityList {
        return this.m_textElementGroups;
    }

    /**
     * Gets the current modification state for the list
     * of {@link TextElement}s in the `Tile`.
     *
     * @remarks
     * If the value is `true` the `TextElement` is placed for
     * rendering during the next frame.
     */
    get textElementsChanged(): boolean {
        return this.m_textElementsChanged ?? false;
    }

    set textElementsChanged(changed: boolean) {
        this.m_textElementsChanged = changed;
    }

    /**
     * Returns true if the `Tile` has any text elements to render.
     */
    hasTextElements(): boolean {
        return this.m_textElementGroups.count() > 0;
    }

    /**
     * Get the current blocking elements.
     */
    get blockingElements(): PathBlockingElement[] {
        return this.m_pathBlockingElements;
    }

    /**
     * Called before {@link MapView} starts rendering this `Tile`.
     *
     * @remarks
     * @param zoomLevel - The current zoom level.
     * @returns Returns `true` if this `Tile` should be rendered. Influenced directly by the
     *      `skipRendering` property unless specifically overriden in deriving classes.
     */
    willRender(_zoomLevel: number): boolean {
        return !this.skipRendering && !this.delayRendering;
    }

    /**
     * Called after {@link MapView} has rendered this `Tile`.
     */
    didRender(): void {
        // to be overridden by subclasses
    }

    /**
     * Estimated visible area of tile used for sorting the priorities during loading.
     */
    get visibleArea(): number {
        return this.m_visibleArea;
    }

    set visibleArea(area: number) {
        this.m_visibleArea = area;
        if (this.tileLoader !== undefined) {
            this.tileLoader.priority = area;
        }
    }

    /**
     * @internal
     * Gets the tile's ground elevation range in meters.
     */
    get elevationRange(): ElevationRange {
        return this.m_elevationRange;
    }

    /**
     * @internal
     * Sets the tile's ground elevation range in meters.
     *
     * @param elevationRange - The elevation range.
     */
    set elevationRange(elevationRange: ElevationRange) {
        if (
            elevationRange.minElevation === this.m_elevationRange.minElevation &&
            elevationRange.maxElevation === this.m_elevationRange.maxElevation &&
            elevationRange.calculationStatus === this.m_elevationRange.calculationStatus
        ) {
            return;
        }

        this.m_elevationRange.minElevation = elevationRange.minElevation;
        this.m_elevationRange.maxElevation = elevationRange.maxElevation;
        this.m_elevationRange.calculationStatus = elevationRange.calculationStatus;
        this.elevateGeoBox();

        // Only update bounding box if tile has already been decoded and a maximum/minimum geometry
        // height is provided by the data source.
        if (this.m_maxGeometryHeight !== undefined || this.m_minGeometryHeight !== undefined) {
            assert(this.decodedTile?.boundingBox === undefined);
            this.updateBoundingBox();
        }
    }

    /**
     * Gets the decoded tile; it is removed after geometry handling.
     */
    get decodedTile(): DecodedTile | undefined {
        return this.m_decodedTile;
    }

    /**
     * Applies the decoded tile to the tile.
     *
     * @remarks
     * If the geometry is empty, then the tile's forceHasGeometry flag is set.
     * Map is updated.
     * @param decodedTile - The decoded tile to set.
     */
    set decodedTile(decodedTile: DecodedTile | undefined) {
        this.m_decodedTile = decodedTile;
        this.invalidateResourceInfo();

        if (decodedTile === undefined) {
            return;
        }

        if (decodedTile.geometries.length === 0) {
            this.forceHasGeometry(true);
        }

        // If the decoder provides a more accurate bounding box than the one we computed from
        // the flat geo box we take it instead. Otherwise, if an elevation range was set, elevate
        // bounding box to match the elevated geometry.
        this.m_maxGeometryHeight = decodedTile.boundingBox
            ? undefined
            : decodedTile.maxGeometryHeight ?? 0;
        this.m_minGeometryHeight = decodedTile.boundingBox
            ? undefined
            : decodedTile.minGeometryHeight ?? 0;
        this.elevateGeoBox();
        this.updateBoundingBox(decodedTile.boundingBox);

        const stats = PerformanceStatistics.instance;
        if (stats.enabled && decodedTile.decodeTime !== undefined) {
            stats.currentFrame.addValue("decode.decodingTime", decodedTile.decodeTime);
            stats.currentFrame.addValue("decode.decodedTiles", 1);
        }

        if (decodedTile.copyrightHolderIds !== undefined) {
            this.copyrightInfo = decodedTile.copyrightHolderIds.map(id => ({ id }));
        }

        this.dataSource.requestUpdate();
    }

    /**
     * Called when the default implementation of `dispose()` needs
     * to free the geometry of a `Tile` object.
     *
     * @param object - The object that references the geometry.
     * @returns `true` if the geometry can be disposed.
     */
    shouldDisposeObjectGeometry(object: TileObject): boolean {
        return true;
    }

    /**
     * Called when the default implementation of `dispose()` needs
     * to free a `Tile` object's material.
     *
     * @param object - The object referencing the geometry.
     * @returns `true` if the material can be disposed.
     */
    shouldDisposeObjectMaterial(object: TileObject): boolean {
        return true;
    }

    /**
     * Called when the default implementation of `dispose()` needs
     * to free a Texture that is part of a `Tile` object's material.
     *
     * @param texture - The texture about to be disposed.
     * @returns `true` if the texture can be disposed.
     */
    shouldDisposeTexture(texture: THREE.Texture): boolean {
        return this.m_ownedTextures.has(texture);
    }

    /**
     * Returns `true` if this `Tile` has been disposed.
     */
    get disposed(): boolean {
        return this.m_disposed;
    }

    /**
     * `True` if all geometry of the `Tile` has been loaded.
     */
    get allGeometryLoaded(): boolean {
        return this.m_tileGeometryLoader?.isFinished ?? this.hasGeometry;
    }

    /**
     * MapView checks if this `Tile` is ready to be rendered while culling.
     *
     * By default, MapView checks if the [[objects]] list is not empty. However, you can override
     * this check by manually setting this property.
     */
    get hasGeometry(): boolean {
        if (this.m_forceHasGeometry === undefined) {
            return this.objects.length !== 0;
        } else {
            return this.m_forceHasGeometry;
        }
    }

    /**
     * Overrides the default value for [[hasGeometry]] if value is not `undefined`.
     *
     * @param value - A new value for the [[hasGeometry]] flag.
     */
    forceHasGeometry(value: boolean | undefined) {
        this.m_forceHasGeometry = value;
    }

    /**
     * Reset the visibility counter. This will force the visibility check to be rerun on all objects
     * in this `Tile`.
     */
    resetVisibilityCounter(): void {
        this.visibilityCounter = -1;
    }

    /**
     * Gets the {@link ITileLoader} that manages this tile.
     */
    get tileLoader(): ITileLoader | undefined {
        return this.m_tileLoader;
    }

    /**
     * Sets the {@link ITileLoader} to manage this tile.
     *
     * @param tileLoader - A {@link ITileLoader} instance to manage
     *                     the loading process for this tile.
     */
    set tileLoader(tileLoader: ITileLoader | undefined) {
        this.m_tileLoader = tileLoader;
    }

    /**
     * Loads this `Tile` geometry.
     *
     * @returns Promise which can be used to wait for the loading to be finished.
     */
    async load(): Promise<void> {
        const tileLoader = this.tileLoader;
        if (tileLoader === undefined) {
            return await Promise.resolve();
        }

        if (this.m_tileGeometryLoader) {
            const wasSettled = this.m_tileGeometryLoader.isSettled;
            this.m_tileGeometryLoader.reset();
            if (wasSettled) {
                this.attachGeometryLoadedCallback();
            }
        }

        return await tileLoader
            .loadAndDecode()
            .then(tileLoaderState => {
                assert(tileLoaderState === TileLoaderState.Ready);
                const decodedTile = tileLoader.decodedTile;
                this.decodedTile = decodedTile;
                decodedTile?.dependencies?.forEach(mortonCode => {
                    this.dependencies.push(TileKey.fromMortonCode(mortonCode));
                });
            })
            .catch(tileLoaderState => {
                if (tileLoaderState === TileLoaderState.Failed) {
                    this.dispose();
                } else if (tileLoaderState !== TileLoaderState.Canceled) {
                    logger.error("Unknown error" + tileLoaderState);
                }
            });
    }

    /**
     * Text style cache for this tile.
     * @hidden
     */
    get textStyleCache(): TileTextStyleCache {
        return this.m_textStyleCache;
    }

    /**
     * Frees the rendering resources allocated by this `Tile`.
     *
     * @remarks
     * The default implementation of this method frees the geometries and the materials for all the
     * reachable objects.
     * Textures are freed if they are owned by this `Tile` (i.e. if they where created by this
     * `Tile`or if the ownership was explicitely set to this `Tile` by [[addOwnedTexture]]).
     */
    clear() {
        const disposeMaterial = (material: THREE.Material) => {
            Object.getOwnPropertyNames(material).forEach((property: string) => {
                const materialProperty = (material as any)[property];
                if (materialProperty !== undefined && materialProperty instanceof THREE.Texture) {
                    const texture = materialProperty;
                    if (this.shouldDisposeTexture(texture)) {
                        texture.dispose();
                    }
                }
            });
            material.dispose();
        };

        const disposeObject = (object: TileObject & DisposableObject) => {
            if (this.shouldDisposeObjectGeometry(object)) {
                if (object.geometry !== undefined) {
                    object.geometry.dispose();
                }

                if (object.geometries !== undefined) {
                    for (const geometry of object.geometries) {
                        geometry.dispose();
                    }
                }
            }

            if (object.material !== undefined && this.shouldDisposeObjectMaterial(object)) {
                if (object.material instanceof Array) {
                    object.material.forEach((material: THREE.Material | undefined) => {
                        if (material !== undefined) {
                            disposeMaterial(material);
                        }
                    });
                } else {
                    disposeMaterial(object.material);
                }
            }
        };

        this.objects.forEach((rootObject: TileObject & DisposableObject) => {
            rootObject.traverse((object: TileObject & DisposableObject) => {
                disposeObject(object);
            });

            disposeObject(rootObject);
        });
        this.objects.length = 0;

        if (this.preparedTextPaths) {
            this.preparedTextPaths = [];
        }

        this.m_textStyleCache.clear();
        this.clearTextElements();
        this.invalidateResourceInfo();
    }

    /**
     * Removes all {@link TextElement} from the tile.
     */
    clearTextElements() {
        if (!this.hasTextElements()) {
            return;
        }
        this.textElementsChanged = true;
        this.m_pathBlockingElements.splice(0);
        this.textElementGroups.forEach((element: TextElement) => {
            element.dispose();
        });
        this.textElementGroups.clear();
    }

    /**
     * Adds a callback that will be called whenever the tile is disposed.
     *
     * @remarks
     * Multiple callbacks may be added.
     * @internal
     * @param callback - The callback to be called when the tile is disposed.
     */
    addDisposeCallback(callback: TileCallback) {
        this.m_disposeCallback = chainCallbacks(this.m_disposeCallback, callback);
    }

    /**
     * Disposes this `Tile`, freeing all geometries and materials for the reachable objects.
     */
    dispose() {
        if (this.m_disposed) {
            return;
        }
        if (this.m_tileLoader) {
            this.m_tileLoader.cancel();
            this.m_tileLoader = undefined;
        }
        this.clear();
        // Ensure that tile is removable from tile cache.
        this.frameNumLastRequested = 0;
        this.m_disposed = true;
        this.m_tileGeometryLoader?.dispose();

        if (this.m_disposeCallback) {
            this.m_disposeCallback(this);
        }
    }

    /**
     * Computes the offset in the x world coordinates corresponding to this tile, based on
     * its {@link offset}.
     *
     * @returns The x offset.
     */
    computeWorldOffsetX(): number {
        return this.projection.worldExtent(0, 0).max.x * this.offset;
    }

    /**
     * Update tile for current map view zoom level
     * @param zoomLevel - Zoom level of the map view
     * @internal
     */
    update(zoomLevel: number): void {
        for (const object of this.objects) {
            if (object instanceof LodMesh) {
                object.setLevelOfDetail(zoomLevel - this.tileKey.level);
            }
        }
    }

    /**
     * Gets the tile's bounding box.
     */
    get boundingBox(): OrientedBox3 {
        return this.m_boundingBox;
    }

    /**
     * Start with or continue with loading geometry for tiles requiring this step. Called
     * repeatedly until loading is finished.
     * @param priority - Priority assigned to asynchronous tasks doing the geometry update.
     * @param enabledKinds - {@link GeometryKind}s that will be created.
     * @param disabledKinds - {@link GeometryKind}s that will not be created.
     * @return `true` if tile uses a geometry loader, `false` otherwise.
     * @internal
     */
    updateGeometry(
        priority?: number,
        enabledKinds?: GeometryKindSet,
        disabledKinds?: GeometryKindSet
    ): boolean {
        if (!this.m_tileGeometryLoader) {
            return false;
        }

        if (this.m_tileGeometryLoader.isSettled) {
            return true;
        }

        if (this.dataSource.isDetached()) {
            this.m_tileGeometryLoader.cancel();
            return true;
        }

        if (this.tileLoader) {
            if (!this.tileLoader.isFinished) {
                return true;
            } else if (!this.decodedTile) {
                // Finish loading if tile has no data.
                this.m_tileGeometryLoader.finish();
                return true;
            }
        }

        if (priority !== undefined) {
            this.m_tileGeometryLoader.priority = priority;
        }
        this.m_tileGeometryLoader.update(enabledKinds, disabledKinds);
        return true;
    }

    /**
     * Gets a set of the {@link GeometryKind}s that were loaded (if any).
     * @internal
     */
    get loadedGeometryKinds(): GeometryKindSet | undefined {
        return this.m_tileGeometryLoader?.availableGeometryKinds;
    }

    /**
     * Called when {@link TileGeometryLoader} is finished.
     *
     * @remarks
     * It may be used to add content to the `Tile`.
     * The {@link @here/harp-datasource-protocol#DecodedTile} is still available.
     */
    protected loadingFinished() {
        // To be used in subclasses.
    }

    private attachGeometryLoadedCallback() {
        assert(this.m_tileGeometryLoader !== undefined);
        this.m_tileGeometryLoader!.waitFinished()
            .then(() => {
                this.loadingFinished();
                this.removeDecodedTile();
            })
            .catch(() => {
                if (this.disposed) {
                    return;
                }
                // Loader was canceled, dispose tile.
                if (!this.dataSource.isDetached()) {
                    this.mapView.visibleTileSet.disposeTile(this);
                }
            });
    }

    /**
     * Remove the decodedTile when no longer needed.
     */
    private removeDecodedTile() {
        this.m_decodedTile = undefined;
        this.invalidateResourceInfo();
    }

    /**
     * Updates the tile's world bounding box.
     * @param newBoundingBox - The new bounding box to set. If undefined, the bounding box will be
     *                         computed by projecting the tile's geoBox.
     */
    private updateBoundingBox(newBoundingBox?: OrientedBox3) {
        if (newBoundingBox) {
            this.m_boundingBox.copy(newBoundingBox);
            this.m_worldCenter.copy(this.boundingBox.position);
        } else {
            this.projection.projectBox(this.geoBox, this.boundingBox);
        }
    }

    /**
     * Elevates the tile's geo box using the elevation range and maximum geometry height.
     */
    private elevateGeoBox() {
        this.geoBox.southWest.altitude =
            this.m_elevationRange.minElevation + (this.m_minGeometryHeight ?? 0);
        this.geoBox.northEast.altitude =
            this.m_elevationRange.maxElevation + (this.m_maxGeometryHeight ?? 0);
    }

    private computeResourceInfo(): void {
        let heapSize = 0;
        let num3dObjects = 0;
        let numTextElements = 0;

        const aggregatedObjSize = {
            heapSize: 0,
            gpuSize: 0
        };

        // Keep a map of the uuids of the larger objects, like Geometries, Materials and Attributes.
        // They should be counted only once even if they are shared.
        const visitedObjects: Map<string, boolean> = new Map();

        for (const object of this.objects) {
            if (object.visible) {
                num3dObjects++;
            }
            MapViewUtils.estimateObject3dSize(object, aggregatedObjSize, visitedObjects);
        }

        for (const group of this.textElementGroups.groups) {
            numTextElements += group[1].elements.length;
        }
        // 216 was the shallow size of a single TextElement last time it has been checked, 312 bytes
        // was the minimum retained size of a TextElement that was not being rendered. If a
        // TextElement is actually rendered, the size may be _much_ bigger.
        heapSize += numTextElements * 312;

        if (this.m_decodedTile !== undefined && this.m_decodedTile.tileInfo !== undefined) {
            aggregatedObjSize.heapSize += this.m_decodedTile.tileInfo.numBytes;
        }

        this.m_resourceInfo = {
            heapSize: aggregatedObjSize.heapSize + heapSize,
            gpuSize: aggregatedObjSize.gpuSize,
            num3dObjects,
            numTextElements,
            numUserTextElements: 0
        };
    }
}
