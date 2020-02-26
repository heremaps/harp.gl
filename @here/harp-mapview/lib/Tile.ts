/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    GeometryType,
    Technique,
    TextPathGeometry
} from "@here/harp-datasource-protocol";
import { GeoBox, OrientedBox3, Projection, TileKey } from "@here/harp-geoutils";
import { assert, CachedResource, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";
import { AnimatedExtrusionTileHandler } from "./AnimatedExtrusionHandler";
import { CopyrightInfo } from "./copyrights/CopyrightInfo";
import { DataSource } from "./DataSource";
import { TileGeometryLoader } from "./geometry/TileGeometryLoader";
import { MapView } from "./MapView";
import { PathBlockingElement } from "./PathBlockingElement";
import { PerformanceStatistics } from "./Statistics";
import { TextElement } from "./text/TextElement";
import { TextElementGroup } from "./text/TextElementGroup";
import { TextElementGroupPriorityList } from "./text/TextElementGroupPriorityList";
import { MapViewUtils } from "./Utils";

const logger = LoggerManager.instance.create("Tile");

export type TileObject = THREE.Object3D & {
    /**
     * Distance of this object from the [[Tile]]'s center.
     */
    displacement?: THREE.Vector3;

    /**
     * This stores the THREE.Object3D renderOrder property, we need to back it up because we need to
     * reduce it if the tile is used as fall back. When it is used normally, the renderOrder needs
     * to be reset.
     * @hidden
     */
    _backupRenderOrder?: number;
};

interface DisposableObject {
    geometry?: THREE.BufferGeometry | THREE.Geometry;
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
     * An optional array of indices into geometry where the feature starts. The lists of IDs
     * and starting indices (starts) must have the same size.
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
 * Contains data that describes the road on a `tile`. The `RoadIntersectionData` is generated by
 * the [[RoadPicker]] class.
 *
 * @see [[RoadPicker]]
 */
export interface RoadIntersectionData {
    /**
     * Optional array of feature IDs.
     */
    ids: Array<number | undefined>;

    /**
     * An array of indices into the technique catalog. The lists of `techniqueIndex` and `starts`
     * have the same size.
     */
    techniqueIndex: number[];

    /**
     * An array of the indices into geometry where the feature starts. The lists of IDs and
     * starting indices (starts) have the same size.
     */
    starts: number[];

    /**
     * An array of widths of the roads. The lists of IDs and widths have the same size.
     */
    widths: Array<number | (() => number)>;

    /**
     * An array of 2D numbers that make up the road geometry.
     */
    positions: number[];

    /**
     * A catalog of [[Technique]]s for road lines. Allows to reconstruct the visual appearance of
     * the identified line.
     */
    techniques: Technique[];
    /**
     * An optional object that contains properties defined by the developer. This object has the
     * same size as the list of IDs and the starts.
     */
    objInfos?: Array<{} | undefined>;
}

/**
 * Compute the memory footprint of `RoadIntersectionData`.
 */
function getRoadIntersectionDataSize(intersectionData: RoadIntersectionData): number {
    let numBytes = MINIMUM_OBJECT_SIZE_ESTIMATION;

    // 8 bytes per techniqueIndex
    // 8 bytes per start
    // 8 bytes per width
    // 8 bytes per position
    // 100 (estimated) bytes per technique
    const bytesPerEntry = 8 + 8 + 8 + 8 + MINIMUM_OBJECT_SIZE_ESTIMATION;
    const numEntries = intersectionData.techniqueIndex.length;
    numBytes += intersectionData.techniqueIndex.length * bytesPerEntry;

    if (intersectionData.ids !== undefined) {
        numBytes += numEntries * 8;
    }

    if (intersectionData.objInfos !== undefined) {
        // 16 (estimated) bytes per objInfos
        numBytes += numEntries * MINIMUM_SMALL_OBJECT_SIZE_ESTIMATION;
    }

    return numBytes;
}

/**
 * Missing Typedoc
 */
export enum TileLoaderState {
    Initialized,
    Loading,
    Loaded,
    Decoding,
    Ready,
    Canceled,
    Failed
}

export interface ITileLoader {
    state: TileLoaderState;
    payload?: ArrayBufferLike | {};
    decodedTile?: DecodedTile;

    isFinished: boolean;

    loadAndDecode(): Promise<TileLoaderState>;
    waitSettled(): Promise<TileLoaderState>;

    updatePriority(area: number): void;

    cancel(): void;
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
 * Simple information about resource usage by the [[Tile]]. Heap and GPU information are
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
     * Number of [[TextElement]]s in this tile.
     */
    numTextElements: number;
    /**
     * Number of user [[TextElement]]s in this tile.
     */
    numUserTextElements: number;
}

export interface TextElementIndex {
    groupIndex: number;
    elementIndex: number;
}

/**
 * The class that holds the tiled data for a [[DataSource]].
 */
export class Tile implements CachedResource {
    /**
     * A list of the THREE.js objects stored in this `Tile`.
     */
    readonly objects: TileObject[] = [];

    /**
     * The optional list of HERE TileKeys of tiles with geometries that cross
     * the boundaries of this `Tile`.
     */
    readonly dependencies: string[] = new Array<string>();

    /**
     * The bounding box of this `Tile` in geocoordinates.
     */
    readonly geoBox: GeoBox;

    /**
     * The bounding box of this `Tile` in world coordinates.
     */
    readonly boundingBox = new OrientedBox3();

    /**
     * Maximum height of geometry on this tile above ground level.
     */
    maxGeometryHeight: number = 0;

    /**
     * A record of road data that cannot be intersected with THREE.JS, because the geometry is
     * created in the vertex shader.
     */
    roadIntersectionData?: RoadIntersectionData;

    /**
     * Copyright information of this `Tile`'s data.
     */
    copyrightInfo?: CopyrightInfo[];

    /**
     * Keeping some stats for the individual [[Tile]]s to analyze caching behavior.
     *
     * The frame the [[Tile]] was last requested. This is required to know when the given [[Tile]]
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
     * Prepared text geometries optimized for display.
     */
    preparedTextPaths: TextPathGeometry[] | undefined;

    /**
     * @hidden
     *
     * Used to tell if the Tile is used temporarily as a fallback tile.
     *
     * levelOffset is in in the range [-quadTreeSearchDistanceUp,
     * quadTreeSearchDistanceDown], where these values come from the
     * [[VisibleTileSetOptions]]
     */
    levelOffset: number = 0;

    private m_disposed: boolean = false;
    private m_localTangentSpace = false;

    private m_forceHasGeometry: boolean | undefined = undefined;

    private m_tileLoader?: ITileLoader;
    private m_decodedTile?: DecodedTile;
    private m_tileGeometryLoader?: TileGeometryLoader;

    // TODO: Delay construction of text element groups until first text element is added.

    // Used for [[TextElement]]s which the developer defines. Group created with maximum priority
    // so that user text elements are placed before others.
    private m_userTextElements = new TextElementGroup(Number.MAX_SAFE_INTEGER);

    // Used for [[TextElement]]s that are stored in the data, and that are placed explicitly,
    // fading in and out.
    private readonly m_textElementGroups = new TextElementGroupPriorityList();

    // Blocks other labels from showing.
    private readonly m_pathBlockingElements: PathBlockingElement[] = [];

    // If `true`, the text content of the [[Tile]] changed after the last time it was rendered.
    // It's `Undefined` when no text content has been added yet.
    private m_textElementsChanged: boolean | undefined;

    private m_visibleArea: number = 0;
    private m_minElevation: number = 0;
    private m_maxElevation: number = 0;

    private m_resourceInfo: TileResourceInfo | undefined;

    // List of owned textures for disposal
    private m_ownedTextures: WeakSet<THREE.Texture> = new WeakSet();

    private m_animatedExtrusionTileHandler: AnimatedExtrusionTileHandler | undefined;

    // If the tile should not be rendered, this is used typically when the tile in question is
    // completely covered by another tile and therefore can be skipped without any visual impact.
    private m_skipRendering = false;

    /**
     * Creates a new [[Tile]].
     *
     * @param dataSource The [[DataSource]] that created this [[Tile]].
     * @param tileKey The unique identifier for this [[Tile]]. Currently only up to level 24 is
     * supported, because of the use of the upper bits for the offset.
     * @param offset The optional offset, this is an integer which represents what multiple of 360
     * degrees to shift, only useful for flat projections, hence optional.
     * @param localTangentSpace Whether the tile geometry is in local tangent space or not.
     */
    constructor(
        readonly dataSource: DataSource,
        readonly tileKey: TileKey,
        public offset: number = 0,
        localTangentSpace?: boolean
    ) {
        this.geoBox = this.dataSource.getTilingScheme().getGeoBox(this.tileKey);
        this.projection.projectBox(this.geoBox, this.boundingBox);
        this.m_localTangentSpace = localTangentSpace !== undefined ? localTangentSpace : false;
    }

    /**
     * The visibility status of the [[Tile]]. It is actually visible or planned to become visible.
     */
    get isVisible(): boolean {
        // Tiles are not evaluated as invisible until the second frame they aren't requested.
        // This happens in order to prevent that, during [[VisibleTileSet]] visibility evaluation,
        // visible tiles that haven't yet been evaluated for the current frame are preemptively
        // removed from [[DataSourceCache]].
        return this.frameNumLastRequested >= this.dataSource.mapView.frameNumber - 1;
    }

    set isVisible(visible: boolean) {
        this.frameNumLastRequested = visible ? this.dataSource.mapView.frameNumber : -1;
    }

    /**
     * The [[Projection]] currently used by the [[MapView]].
     */
    get projection(): Projection {
        return this.dataSource.projection;
    }

    /**
     * The [[MapView]] this `Tile` belongs to.
     */
    get mapView(): MapView {
        return this.dataSource.mapView;
    }

    /**
     * Whether the data of this tile is in local tangent space or not.
     * If the data is in local tangent space (i.e. up vector is (0,0,1) for high zoomlevels) then
     * [[MapView]] will rotate the objects before rendering using the rotation matrix of the
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
        return this.boundingBox.position;
    }

    /**
     * Compute [[TileResourceInfo]] of this `Tile`. May be using a cached value. The method
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
     * Force invalidation of the cached [[TileResourceInfo]]. Useful after the `Tile` has been
     * modified.
     */
    invalidateResourceInfo(): void {
        this.m_resourceInfo = undefined;
    }

    /**
     * Add ownership of a texture to this tile. The texture will be disposed if the `Tile` is
     * disposed.
     * @param texture Texture to be owned by the `Tile`
     */
    addOwnedTexture(texture: THREE.Texture): void {
        this.m_ownedTextures.add(texture);
    }

    /**
     * Gets the list of developer-defined [[TextElement]] in this `Tile`. This list is always
     * rendered first.
     */
    get userTextElements(): TextElementGroup {
        return this.m_userTextElements;
    }

    /**
     * Adds a developer-defined [[TextElement]] to this `Tile`. The [[TextElement]] is always
     * visible, if it's in the map's currently visible area.
     *
     * @param textElement The Text element to add.
     */
    addUserTextElement(textElement: TextElement) {
        if (this.m_textElementsChanged === false) {
            // HARP-8733: Text content in the tile is about to change, but it has already been
            // rendered at least once (otherwise m_textElementsChanged would be undefined). Clone
            // the text element group so that it's handled as a new group by TextElementsRenderer
            // and it doesn't reuse the same state stored for the old one.
            // TODO: HARP-8910 Deprecate user text elements.
            this.m_userTextElements = this.m_userTextElements.clone();
        }

        this.m_userTextElements.elements.push(textElement);
        this.textElementsChanged = true;
    }

    /**
     * Removes a developer-defined [[TextElement]] from this `Tile`.
     *
     * @param textElement A developer-defined TextElement to remove.
     * @returns `true` if the element has been removed successfully; `false` otherwise.
     */
    removeUserTextElement(textElement: TextElement): boolean {
        const foundIndex = this.m_userTextElements.elements.indexOf(textElement);
        if (foundIndex === -1) {
            return false;
        }

        if (this.m_textElementsChanged === false) {
            // HARP-8733: Text content in the tile is about to change, but it has already been
            // rendered at least once (otherwise m_textElementsChanged would be undefined). Clone
            // the text element group so that it's handled as a new group by TextElementsRenderer
            // and it doesn't reuse the same state stored for the old one.
            // TODO: HARP-8910 Deprecate user text elements.
            this.m_userTextElements = this.m_userTextElements.clone();
        }
        this.m_userTextElements.elements.splice(foundIndex, 1);
        this.textElementsChanged = true;
        return true;
    }

    /**
     * Adds a [[TextElement]] to this `Tile`, which is added to the visible set of
     * [[TextElement]]s based on the capacity and visibility. The [[TextElement]]'s priority
     * controls if or when it becomes visible.
     *
     * To ensure that a TextElement is visible, use a high value for its priority, such as
     * `Number.MAX_SAFE_INTEGER`. Since the number of visible TextElements is limited by the
     * screen space, not all TextElements are visible at all times.
     *
     * @param textElement The TextElement to add.
     */
    addTextElement(textElement: TextElement) {
        this.textElementGroups.add(textElement);
        this.textElementsChanged = true;
    }

    /**
     * Adds a [[PathBlockingElement]] to this `Tile`. This path has the highest priority and blocks
     * all other labels. There maybe in future a use case to give it a priority, but as that isn't
     * yet required, it is left to be implemented later if required.
     * @param blockingElement Element which should block all other labels.
     */
    addBlockingElement(blockingElement: PathBlockingElement) {
        this.m_pathBlockingElements.push(blockingElement);
    }

    /**
     * Removes a [[TextElement]] from this `Tile`. For the element to be removed successfully, the
     * priority of the [[TextElement]] has to be equal to its priority when it was added.
     *
     * @param textElement The TextElement to remove.
     * @returns `true` if the TextElement has been removed successfully; `false` otherwise.
     */
    removeTextElement(textElement: TextElement): boolean {
        if (this.textElementGroups.remove(textElement)) {
            this.textElementsChanged = true;
            return true;
        }
        return false;
    }

    /**
     * Gets the current [[GroupedPriorityList]] which contains a list of all [[TextElement]]s to be
     * selected and placed for rendering.
     */
    get textElementGroups(): TextElementGroupPriorityList {
        return this.m_textElementGroups;
    }

    /**
     * Gets the current modification state for the list of [[TextElement]]s in the `Tile`. If the
     * value is `true` the TextElement is placed for rendering during the next frame.
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
        return this.m_textElementGroups.count() > 0 || this.m_userTextElements.elements.length > 0;
    }

    /**
     * Get the current blocking elements.
     */
    get blockingElements(): PathBlockingElement[] {
        return this.m_pathBlockingElements;
    }

    /**
     * Called by [[VisibleTileSet]] to mark that [[Tile]] is visible and it should prepare its road
     * geometry for picking.
     */
    prepareTileInfo() {
        // If the tile is not ready for display, or if it has become invisible while being loaded,
        // for example by moving the camera, the tile is not finished and its geometry is not
        // created. This is an optimization for fast camera movements and zooms.
        if (this.m_decodedTile === undefined || this.m_disposed || !this.isVisible) {
            return;
        }

        if (this.m_decodedTile.tileInfo !== undefined) {
            this.roadIntersectionData = this.dataSource.mapView.pickHandler.registerTile(this);
        }
    }

    /**
     * Called before [[MapView]] starts rendering this `Tile`.
     *
     * @param zoomLevel The current zoom level.
     * @returns Returns `true` if this `Tile` should be rendered.
     */
    willRender(_zoomLevel: number): boolean {
        return !this.m_skipRendering;
    }

    /**
     * Called after [[MapView]] has rendered this `Tile`.
     */
    didRender(): void {
        // to be overridden by subclasses
    }

    set skipRender(skipRender: boolean) {
        this.m_skipRendering = skipRender;
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
            this.tileLoader.updatePriority(area);
        }
    }

    /**
     * Estimated tile's minimum elevation above the sea level.
     * @note Negative values indicates depressions.
     */
    get minElevation(): number {
        return this.m_minElevation;
    }

    set minElevation(elevation: number) {
        this.m_minElevation = elevation;
    }

    /**
     * Estimated maximum ground elevation above the sea level that may be found on tile.
     * @note Negative values indicates depressions.
     */
    get maxElevation(): number {
        return this.m_maxElevation;
    }

    set maxElevation(elevation: number) {
        this.m_maxElevation = elevation;
    }

    /**
     * Gets the decoded tile; it is removed after geometry handling.
     */
    get decodedTile(): DecodedTile | undefined {
        return this.m_decodedTile;
    }

    /**
     * Applies the decoded tile to the tile.
     * If the geometry is empty, then the tile's forceHasGeometry flag is set.
     * Map is updated.
     * @param decodedTile The decoded tile to set.
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

        if (decodedTile.boundingBox !== undefined) {
            // If the decoder provides a more accurate bounding box than the one we computed from
            // the flat geo box we take it instead.
            this.boundingBox.copy(decodedTile.boundingBox);
        }

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
     * Remove the decodedTile when no longer needed.
     */
    removeDecodedTile() {
        this.m_decodedTile = undefined;
        this.invalidateResourceInfo();
    }

    /**
     * Called by the [[TileLoader]] after the `Tile` has finished loading its map data. Can be used
     * to add content to the `Tile`. The [[DecodedTile]] should still be available.
     */
    loadingFinished() {
        // To be used in subclasses.
    }

    /**
     * Called when the default implementation of `dispose()` needs
     * to free the geometry of a `Tile` object.
     *
     * @param object The object that references the geometry.
     * @returns `true` if the geometry can be disposed.
     */
    // tslint:disable-next-line:no-unused-variable
    shouldDisposeObjectGeometry(object: TileObject): boolean {
        return true;
    }

    /**
     * Called when the default implementation of `dispose()` needs
     * to free a `Tile` object's material.
     *
     * @param object The object referencing the geometry.
     * @returns `true` if the material can be disposed.
     */
    // tslint:disable-next-line:no-unused-variable
    shouldDisposeObjectMaterial(object: TileObject): boolean {
        return true;
    }

    /**
     * Called when the default implementation of `dispose()` needs
     * to free a Texture that is part of a `Tile` object's material.
     *
     * @param texture The texture about to be disposed.
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
     * Gets the [[TileGeometryLoader]] that manages this tile.
     */
    get tileGeometryLoader(): TileGeometryLoader | undefined {
        return this.m_tileGeometryLoader;
    }

    /**
     * Sets the [[TileGeometryLoader]] to manage this tile.
     *
     * @param tileGeometryLoader A [[TileGeometryLoader]] instance to manage the geometry creation
     *      for this tile.
     */
    set tileGeometryLoader(tileGeometryLoader: TileGeometryLoader | undefined) {
        this.m_tileGeometryLoader = tileGeometryLoader;
    }

    /**
     * `True` if the basic geometry has been loaded, and the `Tile` is ready  for display.
     */
    get basicGeometryLoaded(): boolean {
        return this.m_tileGeometryLoader === undefined
            ? this.hasGeometry
            : this.m_tileGeometryLoader.basicGeometryLoaded || this.m_tileGeometryLoader.isFinished;
    }

    /**
     * `True` if all geometry of the `Tile` has been loaded.
     */
    get allGeometryLoaded(): boolean {
        return this.m_tileGeometryLoader === undefined
            ? this.hasGeometry
            : this.m_tileGeometryLoader.allGeometryLoaded || this.m_tileGeometryLoader.isFinished;
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
     * @param value A new value for the [[hasGeometry]] flag.
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
     * Gets the [[ITileLoader]] that manages this tile.
     */
    get tileLoader(): ITileLoader | undefined {
        return this.m_tileLoader;
    }

    /**
     * Sets the [[ITileLoader]] to manage this tile.
     *
     * @param tileLoader A [[ITileLoader]] instance to manage the loading process for this tile.
     */
    set tileLoader(tileLoader: ITileLoader | undefined) {
        this.m_tileLoader = tileLoader;
    }

    /**
     * Loads this `Tile` geometry.
     */
    load() {
        const tileLoader = this.tileLoader;
        if (tileLoader === undefined) {
            return;
        }

        tileLoader
            .loadAndDecode()
            .then(tileLoaderState => {
                assert(tileLoaderState === TileLoaderState.Ready);
                const decodedTile = tileLoader.decodedTile;
                this.decodedTile = decodedTile;
            })
            .catch(tileLoaderState => {
                if (
                    tileLoaderState !== TileLoaderState.Canceled &&
                    tileLoaderState !== TileLoaderState.Failed
                ) {
                    logger.error("Unknown error" + tileLoaderState);
                }
            });
    }

    /**
     * Handler for animation of `Tile` geometries.
     */
    get animatedExtrusionTileHandler(): AnimatedExtrusionTileHandler | undefined {
        return this.m_animatedExtrusionTileHandler;
    }

    set animatedExtrusionTileHandler(handler: AnimatedExtrusionTileHandler | undefined) {
        this.m_animatedExtrusionTileHandler = handler;
    }

    /**
     * Frees the rendering resources allocated by this `Tile`.
     *
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
            if (object.geometry !== undefined && this.shouldDisposeObjectGeometry(object)) {
                object.geometry.dispose();
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

        if (this.m_animatedExtrusionTileHandler !== undefined) {
            this.m_animatedExtrusionTileHandler.dispose();
        }

        this.clearTextElements();
        this.invalidateResourceInfo();
    }

    /**
     * Removes all [[TextElement]] from the tile.
     */
    clearTextElements() {
        this.textElementsChanged = this.hasTextElements();
        this.m_pathBlockingElements.splice(0);
        this.textElementGroups.clear();
        this.userTextElements.elements.length = 0;
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
        if (this.m_tileGeometryLoader !== undefined) {
            this.m_tileGeometryLoader.dispose();
            this.m_tileGeometryLoader = undefined;
        }
        this.clear();
        this.userTextElements.elements.length = 0;
        this.m_disposed = true;
        // Ensure that tile is removable from tile cache.
        this.frameNumLastRequested = 0;
    }

    /**
     * Computes the offset in the x world coordinates corresponding to this tile, based on
     * its [[offset]].
     * @returns The x offset.
     */
    computeWorldOffsetX(): number {
        return this.projection.worldExtent(0, 0).max.x * this.offset;
    }

    private computeResourceInfo(): void {
        let heapSize = 0;
        let num3dObjects = 0;
        let numTextElements = 0;
        let numUserTextElements = 0;

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
        numUserTextElements = this.userTextElements.elements.length;

        // 216 was the shallow size of a single TextElement last time it has been checked, 312 bytes
        // was the minimum retained size of a TextElement that was not being rendered. If a
        // TextElement is actually rendered, the size may be _much_ bigger.
        heapSize += (numTextElements + numUserTextElements) * 312;

        if (this.m_decodedTile !== undefined && this.m_decodedTile.tileInfo !== undefined) {
            aggregatedObjSize.heapSize += this.m_decodedTile.tileInfo.numBytes;
        }

        if (this.roadIntersectionData !== undefined) {
            heapSize += getRoadIntersectionDataSize(this.roadIntersectionData);
        }

        this.m_resourceInfo = {
            heapSize: aggregatedObjSize.heapSize + heapSize,
            gpuSize: aggregatedObjSize.gpuSize,
            num3dObjects,
            numTextElements,
            numUserTextElements
        };
    }
}
