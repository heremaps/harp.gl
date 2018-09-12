/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

//
// Disclaimer:
//
//   This is technology preview of `Map` component from HARP-726 needed for `@here/mapview-react`
//   WARNING: This API is not stable or properly documented.
//

import { Theme, Vector3Like } from "@here/datasource-protocol";
import { GeoCoordinates, GeoCoordinatesLike, isGeoCoordinatesLike } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView, MapViewEventNames, MapViewUtils, RenderEvent } from "@here/mapview";
import { ThemeLoader } from "@here/mapview/lib/ThemeLoader";
import {
    APIFormat,
    AuthenticationCodeProvider,
    AuthenticationMethodInfo,
    OmvDataSource
} from "@here/omv-datasource";
import { getOptionValue } from "@here/utils";

import { Vector3 } from "three";

/**
 * End-user `location` type, accepting location in following forms:
 *
 *  * object with `latitude` and `longitude` properties -
 *      `{ latitude: number, longitude: number }`;
 *  * two element array with latitude and longitude -`[ number, number ]`, e.g:
 *      `[ 46.5424279,10.5306749 ]`;
 *  * `"latitude,longitude"` - string with latitude and longitude separated by comma, e.g:
 *     `"49.3595217,2.5268811"`.
 *
 * Parse with [[LocationOption.toGeoCoordinates]].
 */
export type LocationOption = string | [number, number] | GeoCoordinatesLike;

export interface MapCameraOptions {
    /**
     * Displayed geo location.
     *
     * See [[LocationOption]] for accepted value examples.
     *
     * @default Berlin center `[52.518611, 13.376111]` center
     *    TODO: Is Berlin good default for public API?
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

    /**
     *
     */
    worldCenter?: Vector3Like;
}

export interface MapOptions extends MapCameraOptions {
    /**
     * Display default OMV datasource.
     *
     * @default `true`
     * @see [[OmvDataSource]]
     */
    omv?: boolean;

    /**
     * Map theme URL.
     *
     * URLs beginning with `harp4web:` are resolved relatively to location of map bundle.
     *
     * @default `harp4web:map-theme/day.json` - when using Map Component bundle from CDN
     * @default `resources/day.json` - otherwise
     */
    themeUrl?: string;

    /**
     * Map theme.
     *
     * By default, [themeUrl] is used to load theme. This property can be used to set theme directly
     * if user loads/creates theme by itself.
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
     * Authentication code used by datasources.
     *
     * When [[AuthenticationCodeProvider]] is is used as value, the provider is called before each
     * to get currently valid authentication code/token.
     *
     * @default unspecified
     */
    authenticationCode?: string | AuthenticationCodeProvider;

    /**
     * Specifies [[AuthMethod]] to be used when requesting tiles.
     *
     * Defaults for each [[APIFormat]] are documented with each format type.
     *
     * @default specific to datasource using [[authenticationCode]]
     */
    authenticationMethod?: AuthenticationMethodInfo;

    /**
     * Application id - authentication token used by `HERE` datasources.
     *
     * @default unspecified
     */
    appId?: string;

    /**
     * Application code - authentication token used by `HERE`  datasources.
     *
     * @default unspecified
     */
    appCode?: string;
}

/**
 * Default values for [[Map]] options.
 */
export const MapDefaults = {
    omv: true,
    landmark: true,
    enableMapControls: true,
    animateLocationChanges: true,
    zoomLevel: 14,
    cameraHeight: 800,
    cameraPitch: 0,
    cameraYaw: 0,
    location: new GeoCoordinates(52.518611, 13.376111) as LocationOption,
    trackResize: true
};

export type MapParams = (typeof MapDefaults) & MapOptions;

/**
 * `Map` display component.
 *
 * This is convenience copmonent that gather main functionality of Harp4Web under one class for
 * easy usage. It features default touch and mouse controls (see [[MapControls]]) and default
 * datasources (OMV & Landmarks) provided that user has correct credentials.
 *
 * @example
 *
 *     <script src="https://harp4web.in.here.com/latest/map.bundle.js"></script>
 *     <div id="map" style="width: 400px; height: 400px"></div>
 *     <script>
 *         var map = new harp4web.Map("map", {
 *             appId: "<insert appId>",
 *             appCode: "<insert appCode>"
 *         });
 *     </script>
 */
export class Map {
    static getDefaultTheme() {
        return "resources/theme.json";
    }
    readonly params: MapParams;
    readonly mapView: MapView;

    tween?: TWEEN.Tween;
    mapControls?: MapControls;
    omvDataSource?: OmvDataSource;

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
        this.updateMapSize();

        if (this.params.trackResize) {
            window.addEventListener("resize", this.updateMapSize);
        }
        this.mapView.addEventListener(MapViewEventNames.Render, this.onRender);

        this.initializeDataSources();
        this.setupInitialView();
        this.initializeControls();
    }

    /**
     * Destroy the `Map` component.
     */
    destroy() {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.onRender);
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
     * Update `Map` size, so it fills whole area of parent DOM element.
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
        const canvasParent = this.mapView.canvas.parentElement! as HTMLElement;

        if (canvasParent === document.body) {
            this.mapView.resize(window.innerWidth, window.innerHeight);
        } else {
            // TODO: never know, whicch to use offsetWidth or clientWidth
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

    private onRender = (event: RenderEvent) => {
        if (this.tween) {
            this.tween.update(event.time || performance.now());
        }
    };

    private getCanvas(element: string | HTMLElement): HTMLCanvasElement {
        if (element === null || element === undefined) {
            throw new Error(`harp4web.Map: parent or canvase not specified`);
        } else if (element instanceof HTMLCanvasElement) {
            return element;
        } else if (element instanceof HTMLElement) {
            this.m_shouldRemoveCanvas = true;
            const canvas = document.createElement("canvas");
            element.appendChild(canvas);
            return canvas;
        } else {
            if (!document) {
                throw new Error(
                    "harp4web.Map: document not yet loaded, Use window.onload to delay script " +
                        "execution til document is fully loaded."
                );
            }
            const refElement = document.getElementById(element);
            if (refElement === undefined || refElement === null) {
                throw new Error(`harp4web.Map: parent or canvas element '${element}' not found`);
            }
            return this.getCanvas(refElement);
        }
    }

    private initializeDataSources() {
        if (this.params.omv) {
            this.omvDataSource = new OmvDataSource({
                baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
                apiFormat: APIFormat.HereV1,
                maxZoomLevel: 17,
                authenticationCode: this.params.authenticationCode,
                authenticationMethod: this.params.authenticationMethod
            });
            this.mapView.addDataSource(this.omvDataSource);
        }
    }

    private initializeControls() {
        if (this.params.enableMapControls === false) {
            return;
        }
        this.mapControls = new MapControls(this.mapView);
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

        if (cameraOptions.worldCenter !== undefined) {
            const wc = new Vector3(
                cameraOptions.worldCenter.x,
                cameraOptions.worldCenter.y,
                cameraOptions.worldCenter.z
            );
            this.mapView.worldCenter = wc;
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
            const [latitude, longitude] = location.split(",").map(parseFloat);
            if (isNaN(latitude) || isNaN(longitude)) {
                throw new Error(`harpweb.Map: Invalid location specified: '${location}'`);
            }
            return new GeoCoordinates(latitude, longitude);
        } else if (location instanceof Array) {
            return new GeoCoordinates(location[0], location[1]);
        } else {
            throw new Error(`harpweb.Map: Invalid location ${location}`);
        }
    }
}
