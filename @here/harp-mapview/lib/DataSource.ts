/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { StyleSet } from "@here/harp-datasource-protocol";
import { Projection, TileKey, TilingScheme } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import { MapView } from "./MapView";
import { Tile } from "./Tile";

const UPDATE_EVENT = { type: "update" };

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
     * @param uniqueName A unique name that represents this `DataSource`.
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
     * attached to a [[MapView]], this setter then looks for a [[StyleSet]] with this name and
     * applies it.
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
     * Destroys this `DataSource`.
     */
    dispose() {
        // to be overloaded by subclasses
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
     * If `DataSource` depends on a theme, it must update its tiles' geometry.
     *
     * @param styleSet The new theme that [[MapView]] uses.
     * @param languages An optional list of languages for the `DataSource`.
     */
    // tslint:disable-next-line:no-unused-variable
    setStyleSet(styleSet?: StyleSet, languages?: string[]): void {
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
     * Gets the minimum zoom level.
     *
     * @returns The minimum zoom level to use for display.
     */
    get minZoomLevel(): number {
        return 1;
    }

    /**
     * Gets the maximum zoom level.
     *
     * @returns The maximum zoom level to use for display.
     */
    get maxZoomLevel(): number {
        return 20;
    }

    /**
     * Computes the zoom level to use for display.
     *
     * @param zoomLevel The zoom level of the [[MapView]].
     * @returns The zoom level to use for display.
     */
    getDisplayZoomLevel(zoomLevel: number): number {
        return THREE.Math.clamp(zoomLevel, this.minZoomLevel, this.maxZoomLevel);
    }

    /**
     * Returns `true` if [[MapView]] should render the tile with given [[TileKey]] and zoom level.
     *
     * @param zoomLevel The zoom level of the [[MapView]].
     * @param tileKey The unique identifier for a map tile.
     * @returns `true` if the geometries created for the given [[TileKey]] should be rendered.
     */
    shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
        return tileKey.level === zoomLevel;
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
