/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates, GeoCoordinatesLike, isGeoCoordinatesLike } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    DataSource,
    MapView,
    MapViewEventNames,
    MapViewUtils,
    RenderEvent,
    ThemeLoader
} from "@here/harp-mapview";
import { getOptionValue, LoggerManager } from "@here/harp-utils";

import { SimpleEventDispatcher } from "./SimpleEventDispatcher";

const logger = LoggerManager.instance.create("Map");

/**
 * End-user `location` type, accepting location in following forms:
 *
 *  * object with `latitude` and `longitude` properties -
 *      `{ latitude: number, longitude: number }`;
 *  * two element array with latitude and longitude -`[ number, number ]`, e.g:
 *      `[ 46.5424279,10.5306749 ]`;
 *  * `"latitude,longitude"` - string with latitude and longitude separated by comma, e.g:
 *     `"49.3595217,2.5268811"`.
 *  * `geo:` URI as defined in RFC5870 e.g `"geo:13.4125,103.8667"`
 *
 * Parse with [[LocationOption.toGeoCoordinates]].
 */
export type LocationOption = string | [number, number] | GeoCoordinatesLike;

export interface MapCameraOptions {
    /**
     * Displayed geo location.
     *
     * See [[LocationOption]] for accepted value examples.
     */
    location?: LocationOption;

    /**
     * Zoom level.
     *
     * Note: `cameraHeight` takes precedence over `zoomLevel` on initial [[Map]] render.
     *
     * @default undefined, by default distance from earth is defined by [[cameraHeight]]
     */
    zoomLevel?: number;

    /**
     * Camera yaw/azimuth.
     *
     * TODO: azimuth is usually clockwise, should we update our apis to do so tooo ?
     *
     * Value `0` means looking north, then counting anti-clockwise, `90` looking east, `180` - south
     * and so on.
     *
     * @default `0` - looking north
     */
    cameraYaw?: number;

    /**
     * Camera pitch/tilt in degrees.
     *
     * Value of `0` means looking down, orthogonally to earth surface, value of `90` means looking
     * perpendicularly to earth surface.
     *
     * @default `0` - looking straighly from top to down
     */
    cameraPitch?: number;

    /**
     *
     * Takes precedence over `zoomLevel` on initial [[Map]] render.
     *
     * @default `800`
     */
    cameraHeight?: number;
}

export interface MapEventMap {
    /**
     * `camera-updated` event is emitted when user changed camera settings using mouse or touch
     * gestures.
     *
     * TODO: now it supports only worldCenter changes i.e panning, no camera rotations are
     * detected as for now
     */
    "camera-updated": MapEvent;
}

export type MapEventName = keyof MapEventMap;

// export interface DataSourceConfig {
//     type: "omv" | "webtile";
//     [name: string]: any;
// }
// export type DataSourceDefinition = DataSource | DataSourceConfig;

export interface MapEvent {
    type: keyof MapEventMap;
    target: Map;
}

export interface MapOptions extends MapCameraOptions {
    /**
     * Map theme URL.
     *
     * URLs beginning with `harp4web:` are resolved relatively to location of map bundle.
     * @default none - user shall provide either `themeUrl` or `theme`
     */
    themeUrl?: string;

    /**
     * Map theme.
     *
     * By default, [themeUrl] is used to load theme. This property can be used to set theme directly
     * if user loads/creates theme by itself.
     *
     * @default none - user shall provide either `themeUrl` or `theme`
     */
    theme?: Theme;

    /**
     * TBD ...
     */
    decoderUrl?: string;

    /**
     * Install [[MapControls]] into `Map` so use can controls map using mouse or gestures.
     *
     * @default `true`
     */
    enableMapControls?: boolean;

    /**
     * If `true`, the `Map` will automatically resize when page layout change size of map. See
     * [[Map.updateMapSize]] for hints how to embed [[Map]] in existing layout.
     *
     * If `false` use should either set fixed size of canvas using proper styling or use
     * [[Map.updateMapSize]] after resize events.
     *
     * @default true
     */
    trackResize?: boolean;

    /**
     * If `true`, location and camera updates will animate towards desired state.
     *
     * @default true
     */
    animateLocationChanges?: boolean;

    /**
     * List of datasources to be displayed in [[Map]].
     */
    dataSources?: DataSource[];
}

/**
 * Default values for [[Map]] options.
 */
export const MapDefaults = {
    enableMapControls: true,
    animateLocationChanges: true,
    cameraPitch: 0,
    cameraYaw: 0,
    zoomLevel: 16.9,
    location: [40.6935, -74.009] as LocationOption,
    trackResize: true
};

export type MapParams = (typeof MapDefaults) & MapOptions;

/**
 * `Map` display component.
 *
 * This is convenience copmonent that gather main functionality of Harp4Web under one class for
 * easy usage in HTML pages.
 *
 * This class wraps:
 *
 * * [[MapView]] from `@here/mapview` - the actual map renderer
 * * [[MapControls]] from `@here/map-controls` - mouse ad touch controls for [[MapView]]
 */
export class Map {
    static getDefaultTheme() {
        return "resources/olp_tilezen_day.json";
    }
    readonly params: MapParams;
    readonly mapView: MapView;

    mapControls?: MapControls;
    mapControlsUi?: MapControlsUI;

    private m_eventDispatcher = new SimpleEventDispatcher<MapEventMap>();
    private m_lastWorldCenter?: THREE.Vector3;

    private m_shouldRemoveCanvas: boolean = false;

    /**
     * Construct the `Map` object.
     *
     * Creates `Map` object inside `element`.
     *
     * @param element `id` or instance of HTML `<canvas>` or parent that will contain map
     * @param options [[MapOptions]]
     */
    constructor(element: string | HTMLElement, options?: MapOptions) {
        this.params = { ...MapDefaults, ...options };

        const canvas = this.getCanvas(element);
        const theme =
            this.params.theme !== undefined
                ? this.params.theme
                : this.params.themeUrl !== undefined &&
                  this.params.themeUrl !== null &&
                  this.params.themeUrl !== ""
                ? this.params.themeUrl
                : Map.getDefaultTheme();
        this.mapView = new MapView({
            canvas,
            theme,
            decoderUrl: this.params.decoderUrl
        });

        // CSS layout may take a while, ensure that whole container, parents are laid out so
        // `updateMapSize` will catch actual size of parent
        setTimeout(() => {
            this.updateMapSize();
        }, 1);

        if (this.params.trackResize) {
            window.addEventListener("resize", this.updateMapSize);
        }
        this.mapView.addEventListener(MapViewEventNames.AfterRender, this.onAfterRender);

        this.setupInitialView();
        this.initializeControls();
        this.setupDataSources(this.params.dataSources);
    }

    /**
     * Destroy the `Map` component.
     */
    destroy() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.onAfterRender);
        if (this.params.trackResize) {
            window.removeEventListener("resize", this.updateMapSize);
        }

        if (this.mapControls !== undefined) {
            this.mapControls.dispose();
        }
        const canvas = this.mapView.canvas;
        this.mapView.dispose();

        if (this.m_shouldRemoveCanvas) {
            canvas.remove();
            this.m_shouldRemoveCanvas = false;
        }
    }

    addEventListener(eventName: MapEventName, listener: (event: MapEvent) => void) {
        this.m_eventDispatcher.addEventListener(eventName, listener as any);
    }
    removeEventListener(eventName: MapEventName, listener: (event: MapEvent) => void) {
        this.m_eventDispatcher.removeEventListener(eventName, listener as any);
    }

    /**
     * [[DataSource]]s used by this `Map` instance.
     *
     * @see [[MapOptions.datasources]] for accepted values
     */
    get dataSources() {
        return this.params.dataSources || [];
    }

    set dataSources(dataSources: DataSource[]) {
        this.setupDataSources(dataSources);
        this.params.dataSources = dataSources;
    }

    /**
     * `Map` theme URL.
     *
     * Setting it loads theme from given `themeUrl` using [[ThemeLoader]].
     *
     * @param theme - theme url
     * @see [[MapView.theme]]
     */
    set themeUrl(themeUrl: string) {
        if (themeUrl !== this.params.themeUrl) {
            ThemeLoader.loadAsync(themeUrl).then(themeObject => {
                this.mapView.theme = themeObject;
            });
            // TODO: catch & stuff
            this.params.themeUrl = themeUrl;
        }
    }
    get themeUrl(): string {
        return this.params.themeUrl !== undefined ? this.params.themeUrl : Map.getDefaultTheme();
    }

    /**
     * Displayed location.
     *
     * @see [[MapView.geoCenter]]
     * @see [[MapOptions.location]]
     */
    set geoCenter(coordinates: GeoCoordinatesLike) {
        this.setCameraOptions({ location: coordinates });
    }
    get geoCenter(): GeoCoordinatesLike {
        return this.mapView.geoCenter;
    }

    /**
     * Displayed location.
     *
     * @see [[MapView.geoCenter]]
     * @see [[MapOptions.location]]
     */
    set location(location: LocationOption) {
        this.setCameraOptions({ location });
    }
    get location(): LocationOption {
        return this.mapView.geoCenter;
    }

    /**
     * Install/uninstall [[MapControls]] for this `Map` object.
     *
     * @see [[MapControls]]
     * @see [[MapOptions.enableMapControls]]
     */
    set enableMapControls(enable: boolean) {
        if (enable !== this.params.enableMapControls) {
            if (enable) {
                this.mapControls = new MapControls(this.mapView);
            } else if (this.mapControls !== undefined) {
                this.mapControls.dispose();
                this.mapControls = undefined;
            }
            this.params.enableMapControls = enable;
        }
    }
    get enableMapControls(): boolean {
        return this.params.enableMapControls;
    }

    set trackResize(trackResize: boolean) {
        if (trackResize !== this.params.trackResize) {
            if (trackResize) {
                window.addEventListener("resize", this.updateMapSize);
            } else if (this.mapControls !== undefined) {
                window.removeEventListener("resize", this.updateMapSize);
            }
            this.params.trackResize = trackResize;
        }
    }

    get trackResize(): boolean {
        return this.params.trackResize;
    }

    setCameraOptions(cameraOptions: MapCameraOptions, _animate?: boolean) {
        // animate = animate !== undefined ? animate : this.params.animateLocationChanges;
        //if (!animate) {, TODO: future
        this.doSetCameraOptions(cameraOptions);
    }

    /**
     * Update `Map` size, so it fills whole area of container DOM element.
     *
     * If `trackResize` option is enabled, then this method is invoked automatically after each
     * window resize.
     *
     * If parent is `document.body`, `Map` ocuppies whole viewport.
     *
     * Notes about styling of parent canvas element:
     *  * If parent is `body` then `body` shouldn't have margin nor padding
     *  * Other parents can have margin and borders, but padding is not supported.
     */
    updateMapSize = () => {
        const canvas = this.mapView.canvas;
        const canvasParent = canvas.parentElement! as HTMLElement;

        if (canvasParent === document.body) {
            this.mapView.resize(window.innerWidth, window.innerHeight);
        } else {
            // TODO: never know, which to use offsetWidth or clientWidth
            // When parent is div, clientWidth is actual size of it's interior
            // When parent is body, innerWidth is actual size with margins etc ???
            // Current solution works with div & body.
            // With body, there is
            // Parent margin & border works.
            // Parent shouldn't have padding
            this.mapView.resize(
                Math.min(canvasParent.offsetWidth, canvasParent.clientWidth),
                Math.min(canvasParent.offsetHeight, canvasParent.clientHeight)
            );
        }
    };

    private onAfterRender = (event: RenderEvent) => {
        if (this.m_eventDispatcher.listenerCount("camera-updated")) {
            const worldCenter = this.mapView.worldCenter;
            let cameraUpdated = false;
            if (!this.m_lastWorldCenter || !worldCenter.equals(this.m_lastWorldCenter)) {
                if (this.m_lastWorldCenter === undefined) {
                    this.m_lastWorldCenter = worldCenter.clone();
                } else {
                    this.m_lastWorldCenter.copy(worldCenter);
                }
                cameraUpdated = true;
            } else {
                // TODO: check rotations and zoom level, etc
            }

            if (cameraUpdated) {
                this.m_eventDispatcher.dispatchEvent("camera-updated", {
                    type: "camera-updated",
                    target: this
                });
            }
        }
    };

    private setupDataSources(dataSources?: DataSource[]) {
        const actualRequestedDataSources = dataSources || [];
        if (actualRequestedDataSources.length === 0) {
            logger.warn("#setupDataSources: Empty dataSources, no Map will be displayed.");
        }

        const dataSourcesInMapView = this.mapView.dataSources.slice();

        // remove datasources that are missing in requested set
        for (const ds of dataSourcesInMapView) {
            if (actualRequestedDataSources.indexOf(ds) === -1) {
                this.mapView.removeDataSource(ds);
            }
        }

        // add resources that are requested, but not yet in mapview
        for (const ds of actualRequestedDataSources) {
            if (dataSourcesInMapView.indexOf(ds) === -1) {
                this.mapView.addDataSource(ds);
            }
        }
    }

    private getCanvas(element: string | HTMLElement): HTMLCanvasElement {
        if (element === null || element === undefined) {
            throw new Error(`harp.Map: parent or canvase not specified`);
        } else if (element instanceof HTMLCanvasElement) {
            return element;
        } else if (element instanceof HTMLElement) {
            this.m_shouldRemoveCanvas = true;
            // Extra parent is needed with 'relative' position, so user is free to set any style and
            // positioning for container element, while internally we can use 'relative + absolute'
            // positioning of actual canvas to reliably fill whole parent element.

            const extraParent = document.createElement("div");
            extraParent.style.position = element === document.body ? "absolute" : "relative";
            extraParent.style.width = "100%";
            extraParent.style.height = "100%";
            extraParent.style.margin = "0";
            extraParent.style.padding = "0";
            extraParent.style.border = "none";
            element.appendChild(extraParent);

            const canvas = document.createElement("canvas");
            canvas.style.width = "100%";
            canvas.style.height = "100%";

            extraParent.appendChild(canvas);
            return canvas;
        } else {
            if (!document) {
                throw new Error(
                    "harp.Map: document not yet loaded, Use window.onload to delay script " +
                        "execution til document is fully loaded."
                );
            }
            const refElement = document.getElementById(element);
            if (refElement === undefined || refElement === null) {
                throw new Error(`harp.Map: parent or canvas element '${element}' not found`);
            }
            return this.getCanvas(refElement);
        }
    }

    private initializeControls() {
        if (this.params.enableMapControls === false) {
            return;
        }
        this.mapControls = new MapControls(this.mapView);
        this.mapControls.maxPitchAngle = 50;

        // Add an UI.
        this.mapControlsUi = new MapControlsUI(this.mapControls);
        this.mapView.canvas.parentElement!.appendChild(this.mapControlsUi.domElement);

        const copyrightElement = document.createElement("div");
        copyrightElement.style.position = "absolute";
        copyrightElement.style.right = "0";
        copyrightElement.style.bottom = "0";
        copyrightElement.style.backgroundColor = "#f0fef1";
        copyrightElement.style.zIndex = "100";
        copyrightElement.style.fontSize = "0.8em";
        copyrightElement.style.fontFamily = "sans-serif";
        this.mapView.canvas.parentElement!.appendChild(copyrightElement);

        CopyrightElementHandler.install(copyrightElement, this.mapView);
    }

    private setupInitialView() {
        const cameraHeight =
            this.params.cameraHeight !== undefined
                ? this.params.cameraHeight
                : MapViewUtils.calculateDistanceToGroundFromZoomLevel(
                      this.mapView,
                      this.params.zoomLevel
                  );
        this.mapView.camera.position.set(0, 0, cameraHeight);

        this.mapView.geoCenter = LocationOption.toGeoCoordinates(this.params.location);

        MapViewUtils.setRotation(this.mapView, this.params.cameraYaw, this.params.cameraPitch);
    }

    private doSetCameraOptions(cameraOptions: MapCameraOptions) {
        if (cameraOptions.cameraHeight !== undefined) {
            if (cameraOptions.cameraHeight !== this.params.cameraHeight) {
                this.mapView.camera.position.set(0, 0, cameraOptions.cameraHeight);
                this.params.cameraHeight = cameraOptions.cameraHeight;
            }
        } else if (cameraOptions.zoomLevel !== undefined) {
            const cameraHeight = MapViewUtils.calculateDistanceToGroundFromZoomLevel(
                this.mapView,
                cameraOptions.zoomLevel
            );
            if (cameraHeight !== this.params.cameraHeight) {
                this.mapView.camera.position.set(0, 0, cameraHeight);
                this.params.cameraHeight = cameraHeight;
            }
        }

        if (cameraOptions.location !== undefined) {
            this.mapView.geoCenter = LocationOption.toGeoCoordinates(cameraOptions.location);
        }

        if (cameraOptions.cameraYaw !== undefined || cameraOptions.cameraPitch !== undefined) {
            const newYaw = getOptionValue(cameraOptions.cameraYaw, this.params.cameraYaw);
            const newPitch = getOptionValue(cameraOptions.cameraPitch, this.params.cameraPitch);
            if (newYaw !== this.params.cameraYaw || newPitch !== this.params.cameraPitch) {
                MapViewUtils.setRotation(this.mapView, newYaw, newPitch);

                this.params.cameraYaw = newYaw;
                this.params.cameraPitch = newPitch;
            }
        }
    }
}

export namespace LocationOption {
    export function toGeoCoordinates(location: LocationOption): GeoCoordinates {
        if (location instanceof GeoCoordinates) {
            return location;
        } else if (isGeoCoordinatesLike(location)) {
            return new GeoCoordinates(location.latitude, location.longitude, location.altitude);
        } else if (typeof location === "string") {
            // Basic support for `geo:` URI as defined in RFC5870
            // example: geo:13.4125,103.8667
            if (location.startsWith("geo:")) {
                location = location.substr(4);
                const colonIndex = location.indexOf(";");
                if (colonIndex !== -1) {
                    location = location.substr(0, colonIndex);
                }
            }
            const coords = location.split(",").map(parseFloat);
            const [latitude, longitude] = coords;
            if (isNaN(latitude) || isNaN(longitude)) {
                throw new Error(`harp.Map: Invalid location specified: '${location}'`);
            }
            if (coords.length > 2) {
                const altitude = coords[2];
                if (isNaN(altitude)) {
                    throw new Error(`harp.Map: Invalid specified: '${location}'`);
                }
                return new GeoCoordinates(latitude, longitude, altitude);
            } else {
                return new GeoCoordinates(latitude, longitude);
            }
        } else if (location instanceof Array) {
            return new GeoCoordinates(location[0], location[1]);
        } else {
            throw new Error(`harp.Map: Invalid location ${location}`);
        }
    }
}
