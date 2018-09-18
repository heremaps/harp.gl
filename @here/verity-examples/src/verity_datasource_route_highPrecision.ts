/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */
import { fetch } from "@here/fetch";
import { GeoCoordinates, hereTilingScheme, TileKey, TilingScheme } from "@here/geoutils";
import { HighPrecisionLine, HighPrecisionWireFrameLine, Lines } from "@here/lines";
import { HighPrecisionUtils } from "@here/lines/lib/HighPrecisionUtils";
import { MapControls } from "@here/map-controls";
import { DataSource, MapView, Tile } from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";
import * as routing from "@here/routing";
import { LoggerManager } from "@here/utils";
import * as THREE from "three";

import { bearerTokenProvider } from "./common";

const logger = LoggerManager.instance.create("verity_datasource_route_highPrecision");

/**
 * This example illustrates how to show a route on a map. It uses solid lines to render the route
 * line. The solid line is the high-precision variant, which should not show any visible jitter
 * even for the longest routes. The sample/route/solid will show some jitter when the route is very
 * long (city-to-city or longer), but only if the camera is very close to the route.
 *
 * HighPrecision lines cannot be rendered as solid lines, but only as extruded lines. Therefore
 * the end caps of the lines are not as smooth as with the normal solid lines.
 *
 * The first step is to instantiate a new [[RoutingDataSource]] object. Then reading a pre-defined
 * JSON containg the route (it mimics the one returned from HERE routing API). Next the
 * [[RoutingDataSource.setRoute]] method is used to add that route to the data source. Last step is
 * adding the newly created datasource to the map view.
 *
 * ```typescript
 * [[include:vislib_datasource_route_solid_1.ts]]
 * ```
 *
 * As a result the route is being drawn on the map. Additionally there is a 'Switch route' button
 * added, which enables changing between two exemplary routes.
 *
 */
export namespace RouteDataSourceExampleHighPrecisionLines {
    /**
     * Asynchronously loads and validates route from URL objects.
     */
    async function loadRouteAsync(url: string): Promise<routing.CalculateRouteResponse> {
        const response = await fetch(url, { responseType: "json" });
        if (!response.ok) {
            throw new Error(`RouteLoader#loadAsync: cannot load a route: ${response.statusText}`);
        }
        const route = (await response.json()) as routing.CalculateRouteResponse | null;
        if (route === null) {
            throw new Error("RouteLoader#loadAsync: the loaded resource is not a valid JSON.");
        }
        return route;
    }

    /**
     * Adds a button to enable switching between two exemplary routes.
     */
    document.body.innerHTML += `
    <style>
        #switch-route-btn {
            display: inline-block;
            background-color: rgba(255,255,255,0.5);
            margin: 20px 0 0 20px;
            padding: 10px; cursor: pointer;
            user-select: none;
        }
    </style>
    <div id="switch-route-btn">Toggle Route</div>
`;

    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/day.json"
        });

        sampleMapView.geoCenter = new GeoCoordinates(52.5160501, 13.3769104, 0);
        sampleMapView.camera.rotateX(THREE.Math.degToRad(0));

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        return sampleMapView;
    }

    /**
     * Get a precomputed demo route
     * There are two precomputed exemplary routes
     */
    export function setupDemoRoute(
        routeNumber = 0,
        mapView: MapView,
        routingDataSource: RoutingDataSource,
        controls: MapControls
    ) {
        let url;
        switch (routeNumber) {
            case 0: {
                mapView.geoCenter = new GeoCoordinates(52.5160501, 13.3769104, 0);
                mapView.camera.position.set(0, 0, 135570);
                controls.zoomOnTargetPosition(0, 0, 14);
                url = "./resources/route1.json";
                break;
            }
            case 1: {
                mapView.geoCenter = new GeoCoordinates(52.5177491, 13.3768845, 0);
                mapView.camera.position.set(0, 0, 6500);
                controls.zoomOnTargetPosition(0, 0, 14);
                url = "./resources/route.json";
                break;
            }
            default: {
                mapView.camera.position.set(0, 0, 300);
                url = "./resources/route.json";
                break;
            }
        }

        loadRouteAsync(url)
            .then((route: routing.CalculateRouteResponse) => {
                routingDataSource.setRoute(route);
                logger.log("loadRouteData: successfully loaded route");
            })
            .catch(error => {
                logger.log("loadRouteData: failed to load route", error);
            });
    }

    export class RoutingDataSource extends DataSource {
        private tile: Tile | undefined;
        private line: HighPrecisionLine | HighPrecisionWireFrameLine | undefined;
        private route?: routing.Route;
        private shouldRecreateGeometry?: boolean;

        constructor(name = "route") {
            super(name);
        }

        // tslint:disable-next-line:no-unused-variable
        shouldRender(zoomLevel: number, tileKey: TileKey) {
            return tileKey.mortonCode() === 1;
        }

        getTilingScheme(): TilingScheme {
            return hereTilingScheme;
        }

        getTile(tileKey: TileKey): Tile | undefined {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return this.getRootTile();
        }

        disposeGeometry() {
            if (this.tile === undefined) {
                return;
            }
            if (this.line !== undefined) {
                const index = this.tile.objects.indexOf(this.line);
                if (index >= 0) {
                    this.tile.objects.splice(index, 1);
                }
                this.line = undefined;
            }
        }

        createGeometry(tile: Tile) {
            if (this.route && this.route.shape !== undefined && this.line === undefined) {
                const lines = new Lines();
                const line = new Array<number>();

                for (let i = 0; i < this.route.shape.length; i += 3) {
                    const point = new GeoCoordinates(
                        this.route.shape[i],
                        this.route.shape[i + 1],
                        this.route.shape[i + 2]
                    );
                    const vertex = this.projection.projectPoint(point, new THREE.Vector3());
                    vertex.sub(tile.center);
                    line.push(vertex.x, vertex.y);
                }

                lines.add(line);

                this.line = HighPrecisionUtils.createLine(line, {
                    lineWidth: 6,
                    color: "#4040C0",
                    addCircles: true
                });

                this.line.renderOrder = 1000;

                if (this.tile !== undefined) {
                    this.tile.objects.push(this.line);
                }
            }

            this.requestUpdate();
        }

        setRoute(response?: routing.CalculateRouteResponse) {
            this.shouldRecreateGeometry = true;

            if (
                response === undefined ||
                response.route === undefined ||
                response.route.length === 0
            ) {
                this.requestUpdate();
                return;
            }
            // predefined (hardcoded) route is used
            this.route = response.route[0];
        }

        private getRootTile(): Tile {
            if (this.tile === undefined) {
                this.tile = new Tile(this, TileKey.fromRowColumnLevel(0, 0, 0));
            }

            if (this.shouldRecreateGeometry) {
                this.disposeGeometry();
                this.createGeometry(this.tile);
            }

            return this.tile;
        }
    }

    function initSwitchRouteButton(mapView: MapView, routingDataSource: RoutingDataSource) {
        const el = document.getElementById("switch-route-btn");

        if (el === null) {
            return;
        }

        let routeNumber = 0;
        el.onclick = () => {
            routeNumber = (routeNumber + 1) % 2;
            setupDemoRoute(routeNumber, mapView, routingDataSource, mapControls);
        };
    }

    const newMapView = initializeMapView("mapCanvas");
    // instantiate the default map controls, allowing the user to pan around freely
    const mapControls = new MapControls(newMapView);

    // snippet:vislib_datasource_route_solid_1.ts
    const newRoutingDataSource = new RoutingDataSource();
    setupDemoRoute(0, newMapView, newRoutingDataSource, mapControls);
    newMapView.addDataSource(newRoutingDataSource);
    // end:vislib_datasource_route_solid_1.ts

    initSwitchRouteButton(newMapView, newRoutingDataSource);

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
        apiFormat: APIFormat.HereV1,
        authenticationCode: bearerTokenProvider
    });

    newMapView.addDataSource(omvDataSource);
}
