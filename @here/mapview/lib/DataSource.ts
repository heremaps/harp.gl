/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

import { StyleSet } from "@here/datasource-protocol";
import { Projection, TileKey, TilingScheme } from "@here/geoutils";
import { assert } from "@here/utils";
import { MapView } from "./MapView";
import { Tile } from "./Tile";

const UPDATE_EVENT = { type: "update" };

/**
 * Classes derived from `DataSource` are used to contribute data and geometries to the [[MapView]].
 */
export abstract class DataSource extends THREE.EventDispatcher {
    /**
     * A counter to generate unique names for each `DataSource` if no name is provided in the
     * constructor.
     */
    private static uniqueNameCounter: number = 0;

    /**
     * `true` if this `DataSource` is enabled; `false` otherwise.
     */
    enabled: boolean = true;

    /**
     * `true` if tiles produced by this `DataSource` can be cached by the [[MapView]].
     */
    cacheable: boolean = false;

    /**
     * The unique name of a `DataSource` instance.
     */
    name: string;

    /**
     * The [[MapView]] instance holding a reference to this `DataSource`.
     */
    private m_mapView?: MapView;

    /**
     * The name of the [[StyleSet]] to evaluate for the decoding.
     */
    private m_styleSetName?: string;

    /**
     * Constructs a new `DataSource`.
     *
     * @param uniqueName A unique name representing this `DataSource`.
     * @param styleSetName The name of the [[StyleSet]] to refer to in a [[Theme]], to decode vector
     * tiles.
     */
    constructor(uniqueName?: string, styleSetName?: string) {
        super();
        if (uniqueName === undefined || uniqueName.length === 0) {
            uniqueName = `anonymous-datasource#${++DataSource.uniqueNameCounter}`;
        }
        this.name = uniqueName;

        this.styleSetName = styleSetName;
    }

    /**
     * Returns the name of the [[StyleSet]] to use for the decoding.
     */
    get styleSetName(): string | undefined {
        return this.m_styleSetName;
    }

    /**
     * Sets the name of the [[StyleSet]] to use for the decoding. If this [[DataSource]] is already
     * attached to a [[MapView]], this setter also looks for a [[StyleSet]] of this name, and if
     * found, applies it.
     */
    set styleSetName(styleSetName: string | undefined) {
        this.m_styleSetName = styleSetName;
        if (
            this.m_mapView !== undefined &&
            styleSetName !== undefined &&
            this.m_mapView.theme.styles !== undefined
        ) {
            this.setStyleSet(this.m_mapView.theme.styles[styleSetName]);
        }
    }

    /**
     * Destroy this `DataSource`.
     */
    dispose() {
        // to be overloaded by subclasses
    }

    /**
     * Returns `true` if this `DataSource` is ready and the [[MapView]] can start requesting data by
     * invoking `getTile()`.
     */
    ready(): boolean {
        return true;
    }

    /**
     * The [[MapView]] holding this `DataSource`.
     */
    get mapView(): MapView {
        if (this.m_mapView === undefined) {
            throw new Error("This DataSource was not added to MapView");
        }

        return this.m_mapView;
    }

    /**
     * The [[Projection]] used by the [[MapView]] holding this `DataSource`.
     *
     * An `Error` will be thrown if this property is called before this `DataSource` has been added
     * to a [[MapView]].
     */
    get projection(): Projection {
        return this.mapView.projection;
    }

    /**
     * Called when the `DataSource` is added to a [[MapView]]. Users can reimplement this method to
     * provide the custom initialization, for example, establish a network connection, or initialize
     * complex data structures.
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
     * Reimplementations of this method are expected to invoke the definition of their super class.
     *
     * @param mapView The instance of the [[MapView]].
     */
    attach(mapView: MapView): void {
        this.m_mapView = mapView;
    }

    /**
     * This method is called when this `DataSource` is removed from a [[MapView]].
     *
     * Reimplementations of this method are expected to invoke the definition of their super class.
     *
     * @param mapView The instance of the [[MapView]].
     */
    detach(mapView: MapView) {
        assert(this.m_mapView === mapView);
        this.m_mapView = undefined;
    }

    /**
     * Invoked by [[MapView]] to tell that the [[Theme]] has been changed.
     *
     * If `DataSource` depends on a theme, it shall update geometry of its tiles.
     *
     * @param styleSet The new theme used by [[MapView]].
     * @param languages optional, list of languages for data source
     */
    // tslint:disable-next-line:no-unused-variable
    setStyleSet(styleSet?: StyleSet, languages?: string[]): void {
        // to be overwritten by subclasses
    }

    /**
     * Used to configure the languages used by the dataSource, with given priorty.
     *
     * @param languages Array of language codes (ISO-639-1).
     */
    setLanguages(languages?: string[]): void {
        // to be overloaded by subclasses
    }

    /**
     * This method is called when [[MapView]] needs to visualize or preload the content of a
     * [[TileKey]].
     *
     * @param tileKey The [[TileKey]].
     */
    abstract getTile(tileKey: TileKey): Tile | undefined;

    /**
     * This method is called by [[MapView]] when it thinks that a [[Tile]] should be updated and/or
     * rerendered for any reason (for example after changing theme).
     *
     * @param tile The [[Tile]] to be updated.
     */
    // tslint:disable-next-line:no-unused-variable
    updateTile(tile: Tile) {
        // to be overloaded by subclasses
    }

    /**
     * This method is called by the [[MapView]] to determine if the content of the surrounding tiles
     * must be preloaded.
     *
     * @returns `true` if the [[MapView]] should try to preload tiles surrounding the visible tiles;
     * `false` otherwise. The default is `false`.
     */
    shouldPreloadTiles(): boolean {
        return false;
    }

    /**
     * Get the minimum storage level.
     *
     * @returns The minimum zoom level to use for display.
     */
    get minZoomLevel(): number {
        return 1;
    }

    /**
     * Get the maximum storage level.
     *
     * @returns The maximum zoom level to use for display.
     */
    get maxZoomLevel(): number {
        return 20;
    }

    /**
     * Computes the zoom level to use for display.
     *
     * @param zoomLevel The storage level of the [[MapView]].
     * @returns The zoom level to use for display.
     */
    getDisplayZoomLevel(zoomLevel: number): number {
        return THREE.Math.clamp(zoomLevel, this.minZoomLevel, this.maxZoomLevel);
    }

    /**
     * Returns `true` if [[MapView]] should render the tile with given [[TileKey]] and zoom level.
     *
     * @param zoomLevel The storage level of the [[MapView]].
     * @param tileKey The [[TileKey]].
     * @returns `true` if the geometries created for the given [[TileKey]] should be rendered.
     */
    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        return tileKey.level === zoomLevel;
    }

    /**
     * Returns `true` if [[MapView]] should render the text elements with given [[TileKey]] and zoom
     * level.
     *
     * This is an additional check for the tiles that are already selected for rendering so the
     * default implementation returns `true`.
     *
     * @param zoomLevel The zoom level.
     * @param tileKey The [[TileKey]].
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
