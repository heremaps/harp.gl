/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Definitions, StyleSet, Theme, ValueMap } from "@here/harp-datasource-protocol";
import { Projection, TileKey, TilingScheme } from "@here/harp-geoutils";
import { assert, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";
import { MapView } from "./MapView";
import { Tile } from "./Tile";

const logger = LoggerManager.instance.create("DataSource");
const UPDATE_EVENT = { type: "update" };

/**
 * Options for a [[DataSource]].
 */
export interface DataSourceOptions {
    /**
     * The unique name of a [[DataSource]] instance.
     */
    name?: string;
    /**
     * The name of the [[StyleSet]] to evaluate for the decoding.
     */
    styleSetName?: string;
    /**
     * The minimum zoom level at which data is available or displayed at
     * (depending on [[DataSource]] subclass).
     * @deprecated Use [[minDataLevel]] and [[minDisplayLevel]] instead.
     */
    minZoomLevel?: number;
    /**
     * The maximum zoom level at which data is available or displayed at
     * (depending on [[DataSource]] subclass).
     * @deprecated Use [[maxDataLevel]] and [[maxDisplayLevel]] instead.
     */
    maxZoomLevel?: number;
    /**
     * The minimum zoom level at which data is available.
     */
    minDataLevel?: number;
    /**
     * The maximum zoom level at which data is available.
     */
    maxDataLevel?: number;
    /**
     * The minimum zoom level at which [[DataSource]] is displayed.
     */
    minDisplayLevel?: number;
    /**
     * The maximum zoom level at which [[DataSource]] is displayed.
     */
    maxDisplayLevel?: number;
    /**
     * Storage level offset applied to this `DataSource`.
     */
    storageLevelOffset?: number;
    /**
     * Whether the datasource can overlap tiles. Such overlapping is necessary when zooming out and
     * waiting for the tiles to load, in this case, we use cached tiles to fill the missing gaps if
     * available (and in some cases, the tiles can overlap, i.e. for example when a child is next
     * to a parent, the parent is rendered beneath the child), however for some datasources (those
     * that produce transparent tiles for example), this gives bad results, and as such, it should
     * be disabled to reduce flickening. Another way to put it is that loading tiles are replaced
     * with cached tiles and we then fall (back/forward) to the next appropriate zoom level.
     * @default true
     */
    allowOverlappingTiles?: boolean;
}

/**
 * Derive a class from `DataSource` to contribute data and geometries to the [[MapView]].
 */
export abstract class DataSource extends THREE.EventDispatcher {
    /**
     * A counter to generate unique names for each `DataSource`, if no name is provided in the
     * constructor.
     */
    private static uniqueNameCounter: number = 0;

    /**
     * Set to `true` if this `DataSource` is enabled; `false` otherwise.
     */
    enabled: boolean = true;

    /**
     * Set to `true` if the [[MapView]] can cache tiles produced by this `DataSource`.
     */
    cacheable: boolean = false;

    /**
     * Set to `true` if the loader should be used to get the tile contents.
     */
    useGeometryLoader: boolean = false;

    /**
     * The unique name of a `DataSource` instance.
     */
    name: string;

    /**
     * Whether the datasource should have a ground plane (this plane covers the tile entirely and
     * has the minimum possible renderOrder), this can be required in some cases when fallback
     * parent tiles need to be covered by the children, otherwise the content will overlap.
     * Default is false
     */
    addGroundPlane: boolean = false;

    /**
     * The minimum zoom level at which data is available.
     */
    minDataLevel: number = 1;

    /**
     * The maximum zoom level at which data is available.
     */
    maxDataLevel: number = 20;

    /**
     * The minimum zoom level at which [[DataSource]] is displayed.
     */
    minDisplayLevel: number = 1;

    /**
     * The maximum zoom level at which [[DataSource]] is displayed.
     */
    maxDisplayLevel: number = 20;

    allowOverlappingTiles: boolean = true;
    /**
     * The [[MapView]] instance holding a reference to this `DataSource`.
     */
    private m_mapView?: MapView;

    /**
     * The name of the [[StyleSet]] to evaluate for the decoding.
     */
    private m_styleSetName?: string;

    /**
     * Current value of [[maxGeometryHeight]] property.
     */
    private m_maxGeometryHeight = 0;

    /**
     * Storage level offset applied to this `DataSource`.
     */
    private m_storageLevelOffset: number = 0;

    private readonly m_featureStateMap = new Map<number, ValueMap>();

    /**
     * Constructs a new `DataSource`.
     *
     * @param options The options to create the data source.
     */
    constructor(options: DataSourceOptions = {}) {
        super();
        let { name } = options;
        const {
            styleSetName,
            // tslint:disable-next-line: deprecation
            minZoomLevel,
            // tslint:disable-next-line: deprecation
            maxZoomLevel,
            minDataLevel,
            maxDataLevel,
            minDisplayLevel,
            maxDisplayLevel,
            storageLevelOffset,
            allowOverlappingTiles
        } = options;
        if (name === undefined || name.length === 0) {
            name = `anonymous-datasource#${++DataSource.uniqueNameCounter}`;
        }
        this.name = name;

        this.styleSetName = styleSetName;

        if (minDataLevel !== undefined) {
            this.minDataLevel = minDataLevel;
        }
        if (maxDataLevel !== undefined) {
            this.maxDataLevel = maxDataLevel;
        }
        if (minZoomLevel !== undefined) {
            // tslint:disable-next-line: deprecation
            this.minZoomLevel = minZoomLevel;
        }
        if (maxZoomLevel !== undefined) {
            // tslint:disable-next-line: deprecation
            this.maxZoomLevel = maxZoomLevel;
        }
        if (minDisplayLevel !== undefined) {
            this.minDisplayLevel = minDisplayLevel;
        }
        if (maxDisplayLevel !== undefined) {
            this.maxDisplayLevel = maxDisplayLevel;
        }
        if (storageLevelOffset !== undefined) {
            this.m_storageLevelOffset = storageLevelOffset;
        }
        if (allowOverlappingTiles !== undefined) {
            this.allowOverlappingTiles = allowOverlappingTiles;
        }
    }

    /**
     * Gets the state of the given feature id.
     *
     * @param featureId The id of the feature.
     */
    getFeatureState(featureId: number): ValueMap | undefined {
        return this.m_featureStateMap.get(featureId);
    }

    /**
     * Clears the state of all the features of this [[DataSource]].
     */
    clearFeatureState() {
        this.m_featureStateMap.clear();
    }

    /**
     * Sets the state of the given feature id.
     *
     * ```typescript
     * dataSource.setFeatureState(featureId, { enabled: true });
     * ```
     *
     * @param featureId The id of the feature.
     * @param state The new state of the feature.
     */
    setFeatureState(featureId: number, state: ValueMap) {
        this.m_featureStateMap.set(featureId, state);
    }

    /**
     * Removes the state associated to the given feature.
     *
     * @param featureId The id of the feature.
     */
    removeFeatureState(featureId: number) {
        this.m_featureStateMap.delete(featureId);
    }

    /**
     * Returns the name of the [[StyleSet]] to use for the decoding.
     */
    get styleSetName(): string | undefined {
        return this.m_styleSetName;
    }

    /**
     * Sets the name of the [[StyleSet]] to use for the decoding. If this [[DataSource]] is already
     * attached to a [[MapView]], this setter then reapplies [[StyleSet]] with this name found in
     * [[MapView]]s theme.
     */
    set styleSetName(styleSetName: string | undefined) {
        this.m_styleSetName = styleSetName;
        if (this.m_mapView !== undefined && styleSetName !== undefined) {
            this.setTheme(this.m_mapView.theme);
        }
    }

    /**
     * Destroys this `DataSource`.
     */
    dispose() {
        // to be overloaded by subclasses
    }

    /**
     * Purges all the caching done by this `DataSource`
     */
    clearCache() {
        // to be overloaded by subclasses
    }

    /**
     * Boolean which says whether a [[DataSource]] produces tiles that fully cover the tile, i.e.
     * tiles underneath are completely hidden. Must be overriden for [[DataSource]]'s that don't
     * have a ground plane, but which still fully cover the tile, e.g. web tiles.
     */
    isFullyCovering(): boolean {
        return this.addGroundPlane;
    }

    /**
     * Returns `true` if this `DataSource` is ready and the [[MapView]] can invoke `getTile()` to
     * start requesting data.
     */
    ready(): boolean {
        return true;
    }

    /**
     * The [[MapView]] that is holding this `DataSource`.
     */
    get mapView(): MapView {
        if (this.m_mapView === undefined) {
            throw new Error("This DataSource was not added to MapView");
        }

        return this.m_mapView;
    }

    /**
     * The [[Projection]] used by the [[MapView]] that is holding this `DataSource`.
     *
     * An `Error` is thrown if you call this method before this `DataSource` has been added
     * to a [[MapView]].
     */
    get projection(): Projection {
        return this.mapView.projection;
    }

    /**
     * This method is called when the `DataSource` is added to a [[MapView]]. Reimplement this
     * method to provide any custom initialization, such as, to establish a network connection,
     * or to initialize complex data structures.
     */
    async connect(): Promise<void> {
        // to be overloaded by subclasses
    }

    /**
     * Returns the [[TilingScheme]] used by this `DataSource`.
     */
    abstract getTilingScheme(): TilingScheme;

    /**
     * This method is called when this `DataSource` is added to a [[MapView]].
     *
     * Reimplementations of this method must invoke the definition of the super class.
     *
     * @param mapView The instance of the [[MapView]].
     */
    attach(mapView: MapView): void {
        this.m_mapView = mapView;
    }

    /**
     * This method is called when this `DataSource` is removed from a [[MapView]].
     *
     * Reimplementations of this method must invoke the definition of the super class.
     *
     * @param mapView The instance of the [[MapView]].
     */
    detach(mapView: MapView) {
        assert(this.m_mapView === mapView);
        this.m_mapView = undefined;
    }

    /**
     * Invoked by [[MapView]] to notify when the [[Theme]] has been changed.
     *
     * If `DataSource` depends on a `styleSet` or `languages`, it must update its tiles' geometry.
     *
     * @deprecated, Use [[setTheme]].
     *
     * @param styleSet The new theme that [[MapView]] uses.
     * @param languages An optional list of languages for the `DataSource`.
     */
    // tslint:disable-next-line:no-unused-variable
    setStyleSet(styleSet?: StyleSet, definitions?: Definitions, languages?: string[]): void {
        // to be overwritten by subclasses
    }

    /**
     * Apply the [[Theme]] to this data source.
     *
     * If `DataSource` depends on a `styleSet` defined by this theme or `languages`, it must update
     * its tiles' geometry.
     *
     * @param languages
     */
    setTheme(theme: Theme, languages?: string[]): void {
        // to be overwritten by subclasses
    }

    /**
     * Used to configure the languages used by the `DataSource` according to priority;
     * the first language in the array has the highest priority.
     *
     * @param languages An array of ISO 639-1 language codes.
     */
    setLanguages(languages?: string[]): void {
        // to be overloaded by subclasses
    }

    /**
     * This method is called when [[MapView]] needs to visualize or preload the content of a
     * [[TileKey]].
     *
     * @param tileKey The unique identifier for a map tile.
     */
    abstract getTile(tileKey: TileKey): Tile | undefined;

    /**
     * This method is called by [[MapView]] before the tile needs to be updated, for example after
     * a theme change.
     *
     * @param tile The [[Tile]] to update.
     */
    // tslint:disable-next-line:no-unused-variable
    updateTile(tile: Tile) {
        // to be overloaded by subclasses
    }

    /**
     * This method is called by the [[MapView]] to determine if the content of the surrounding
     * tiles must be preloaded.
     *
     * @returns `true` if the [[MapView]] should try to preload tiles surrounding the visible
     * tiles; `false` otherwise. The default is `false`.
     */
    shouldPreloadTiles(): boolean {
        return false;
    }

    /**
     * The minimum zoom level at which data is available or displayed at
     * (depending on [[DataSource]] subclass).
     * @deprecated Use [[minDataLevel]] and [[minDisplayLevel]] instead.
     */
    get minZoomLevel(): number {
        logger.warn(
            "DataSource.minZoomLevel is deprecated. Use minDataLevel and maxDataLevel instead."
        );
        return this.minDataLevel;
    }

    set minZoomLevel(level: number) {
        logger.warn(
            "DataSource.minZoomLevel is deprecated. Use minDataLevel and minDisplayLevel instead."
        );
        this.minDataLevel = level;
    }

    /**
     * The maximum zoom level at which data is available or displayed at
     * (depending on [[DataSource]] subclass).
     * @deprecated Use [[maxDataLevel]] and [[maxDisplayLevel]] instead.
     */
    get maxZoomLevel(): number {
        logger.warn(
            "DataSource.maxZoomLevel is deprecated. Use maxDataLevel and maxDisplayLevel instead."
        );
        return this.maxDataLevel;
    }

    set maxZoomLevel(level: number) {
        logger.warn(
            "DataSource.maxZoomLevel is deprecated. Use maxDataLevel and maxDisplayLevel instead."
        );
        this.maxDataLevel = level;
    }

    /**
     * Maximum geometry height above ground level this `DataSource` can produce.
     *
     * Used in first stage of frustum culling before [[Tile.maxGeometryHeight]] data is available.
     *
     * @default 0.
     */
    get maxGeometryHeight() {
        return this.m_maxGeometryHeight;
    }
    set maxGeometryHeight(value: number) {
        this.m_maxGeometryHeight = value;
    }

    /**
     * The difference between storage level and display level of tile.
     *
     * Storage level offset is a value applied (added) to current zoom level giving
     * a final tile level being displayed. This way we may differentate current
     * zoom level from the storage level that is displayed, giving fine grained
     * control over the tiles being decoded an displayed.
     */
    get storageLevelOffset() {
        return this.m_storageLevelOffset;
    }

    /**
     * Setup the relative offset between storage level and display level of tile.
     *
     * @param levelOffset Difference between zoom level and display level.
     */
    set storageLevelOffset(levelOffset: number) {
        this.m_storageLevelOffset = levelOffset;
    }

    /**
     * Enables or disables overlay of geometry on elevation. It must be overloaded by data sources
     * supporting this feature.
     *
     * @param value True to enable, false to disable.
     */
    setEnableElevationOverlay(enable: boolean) {
        // to be overloaded by subclasses
    }

    /**
     * Computes the data zoom level to use.
     *
     * @param zoomLevel The zoom level of the [[MapView]].
     * @returns The data zoom level to use.
     */
    getDataZoomLevel(zoomLevel: number): number {
        return THREE.MathUtils.clamp(
            zoomLevel + this.m_storageLevelOffset,
            this.minDataLevel,
            this.maxDataLevel
        );
    }

    /**
     * Returns `true` if [[DataSource]] should be displayed for the zoom level.
     * @param zoomLevel The zoom level of the [[MapView]].
     */
    isVisible(zoomLevel: number): boolean {
        return zoomLevel >= this.minDisplayLevel && zoomLevel <= this.maxDisplayLevel;
    }

    /**
     * Returns `true` if [[DataSource]] can load tile with given [[TileKey]] and zoom level.
     *
     * @param zoomLevel The zoom level of the [[MapView]].
     * @param tileKey The unique identifier for a map tile.
     * @returns `true` if the tile for the given [[TileKey]] can be loaded.
     */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        return tileKey.level <= zoomLevel;
    }

    /**
     * Returns `true` if [[MapView]] should traverse tiles further with given [[TileKey]] and
     * zoom level.
     *
     * @param zoomLevel The zoom level of the [[MapView]].
     * @param tileKey The unique identifier for a map tile.
     * @returns `true` if the subtiles of the given [[TileKey]] should be
     * checked for collisions.
     */
    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean {
        return tileKey.level <= zoomLevel;
    }

    /**
     * Returns `true` if [[MapView]] should render the text elements with the given [[TileKey]] and
     * zoom level.
     *
     * This is an additional check for the tiles that are already selected for rendering so the
     * default implementation returns `true`.
     *
     * @param zoomLevel The zoom level.
     * @param tileKey The unique identifier for a map tile.
     * @returns `true` if the text elements created for the given [[TileKey]] should be rendered.
     */
    // tslint:disable-next-line:no-unused-variable
    shouldRenderText(zoomLevel: number, tileKey: TileKey): boolean {
        return true;
    }

    /**
     * Sends a request to the [[MapView]] to redraw the scene.
     */
    requestUpdate() {
        this.dispatchEvent(UPDATE_EVENT);
    }
}
