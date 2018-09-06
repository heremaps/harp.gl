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
import { MapControls } from "@here/map-controls";
import { DataSource, MapView, Tile } from "@here/mapview";
import { OmvDataSource } from "@here/omv-datasource";
import * as routing from "@here/routing";
import { LoggerManager } from "@here/utils";
import * as THREE from "three";
import { appCode, appId, hrn } from "../config";

const logger = LoggerManager.instance.create("verity_datasource_route");
/**
 * This example illustrates how to show a route on a map.
 *
 * The first step is to instantiate a new [[RoutingDataSource]] object. Then reading a pre-defined
 * JSON containg the route (it mimics the one returned from HERE routing API). Next the
 * [[RoutingDataSource.setRoute]] method is used to add that route to the data source. Last step is
 * adding the newly created datasource to the map view.
 *
 * ```typescript
 * [[include:vislib_datasource_route_1.ts]]
 * ```
 *
 * As a result the route is being drawn on the map. Additionally there is a 'Switch route' button
 * added, which enables changing between two exemplary routes.
 *
 */
export namespace RouteDataSourceExample {
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

        sampleMapView.geoCenter = new GeoCoordinates(52.10210035780563, 13.802346504839543, 0);
        sampleMapView.camera.rotateX(THREE.Math.degToRad(45));

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
        demoMapView: MapView,
        demoRoutingDataSource: RoutingDataSource,
        controls: MapControls
    ) {
        let url;
        switch (routeNumber) {
            case 0: {
                demoMapView.geoCenter = new GeoCoordinates(
                    52.10210035780563,
                    13.802346504839543,
                    0
                );
                demoMapView.camera.position.set(0, 0, 135570);
                controls.zoomOnTargetPosition(0, 0, 8);
                url = "./resources/route1.json";
                break;
            }
            case 1: {
                demoMapView.geoCenter = new GeoCoordinates(
                    52.45549975922553,
                    13.350355195618935,
                    0
                );
                demoMapView.camera.position.set(0, 0, 6500);
                controls.zoomOnTargetPosition(0, 0, 12);
                url = "./resources/route.json";
                break;
            }
            default: {
                demoMapView.camera.position.set(0, 0, 300);
                url = "./resources/route.json";
                break;
            }
        }

        loadRouteAsync(url)
            .then((route: routing.CalculateRouteResponse) => {
                demoRoutingDataSource.setRoute(route);
                logger.log("loadRouteData: successfully loaded route");
            })
            .catch(error => {
                logger.log("loadRouteData: failed to load route", error);
            });
    }

    export class RoutingDataSource extends DataSource {
        private m_tile: Tile | undefined;
        private readonly m_line: THREE.Line;
        private route?: routing.Route;
        private shouldRecreateGeometry = false;

        constructor(name = "route") {
            super(name);

            const material = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
            this.m_line = new THREE.Line(new THREE.Geometry(), material);
            this.m_line.renderOrder = 1000;
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
            if (this.m_tile === undefined) {
                return;
            }
            this.m_line.geometry.dispose();
            this.m_line.geometry = new THREE.Geometry();
        }

        createGeometry(tile: Tile) {
            if (this.route !== undefined && this.route.shape !== undefined) {
                for (let i = 0; i < this.route.shape.length; i += 3) {
                    const point = new GeoCoordinates(
                        this.route.shape[i],
                        this.route.shape[i + 1],
                        this.route.shape[i + 2]
                    );
                    const vertex = this.projection.projectPoint(point, new THREE.Vector3());
                    vertex.sub(tile.center);
                    (this.m_line.geometry as THREE.Geometry).vertices.push(vertex);
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
            if (this.m_tile === undefined) {
                this.m_tile = new Tile(this, TileKey.fromRowColumnLevel(0, 0, 0));
                this.m_tile.objects.push(this.m_line);
            }

            if (this.shouldRecreateGeometry) {
                this.disposeGeometry();
                this.createGeometry(this.m_tile);
            }

            return this.m_tile;
        }
    }

    function initSwitchRouteButton(
        currentMapView: MapView,
        currentRoutingDataSource: RoutingDataSource
    ) {
        const el = document.getElementById("switch-route-btn");

        if (el === null) {
            return;
        }

        let routeNumber = 0;
        el.onclick = () => {
            routeNumber = (routeNumber + 1) % 2;
            setupDemoRoute(routeNumber, currentMapView, currentRoutingDataSource, mapControls);
        };
    }

    const mapView = initializeMapView("mapCanvas");
    // instantiate the default map controls, allowing the user to pan around freely
    const mapControls = new MapControls(mapView);

    // snippet:vislib_datasource_route_1.ts
    const routingDataSource = new RoutingDataSource();
    setupDemoRoute(0, mapView, routingDataSource, mapControls);
    mapView.addDataSource(routingDataSource);
    // end:vislib_datasource_route_1.ts

    initSwitchRouteButton(mapView, routingDataSource);

    const omvDataSource = new OmvDataSource({
        hrn,
        appId,
        appCode
    });

    mapView.addDataSource(omvDataSource);
}
