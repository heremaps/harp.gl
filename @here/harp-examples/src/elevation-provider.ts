/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, hereTilingScheme, TileKey, TilingScheme } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    DataSource,
    ElevationProvider,
    ElevationRange,
    ElevationRangeSource,
    MapView,
    MapViewEventNames,
    Tile,
    TileDisplacementMap
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import * as THREE from "three";
import { accessToken, watermarkLogo } from "../config";

// Dummy implementation.
class DummyElevationRangeSource implements ElevationRangeSource {
    getElevationRange(tileKey: TileKey): ElevationRange {
        return { maxElevation: 0, minElevation: 0 };
    }
    getTilingScheme(): TilingScheme {
        return hereTilingScheme;
    }
    connect(): Promise<void> {
        return Promise.resolve();
    }
}

// Dummy elevation source
class DummyElevationSource extends DataSource {
    getTilingScheme(): TilingScheme {
        return hereTilingScheme;
    }
    getTile(tileKey: TileKey): Tile | undefined {
        return new Tile(this, tileKey);
    }
}

/**
 * Gets the elevation by firing a ray into the scene and returning the point. Used to show
 * the validity of the interface. This doesn't represent necessarily a good implementation
 * of this interface, but it does show its usage.
 */
class SceneElevationProvider implements ElevationProvider {
    constructor(readonly m_mapView: MapView) {}

    getHeight(geoPoint: GeoCoordinates, level?: number): number | undefined {
        const raycaster = new THREE.Raycaster();
        // Compute world space point of ray origin that is guaranteed to not intersect terrain (Mt
        // Everest)
        geoPoint.altitude = 8849;
        const worldPoint = new THREE.Vector3();
        this.m_mapView.projection.projectPoint(geoPoint, worldPoint);
        const towardsEarth = new THREE.Vector3();
        this.m_mapView.projection.surfaceNormal(worldPoint, towardsEarth).negate();
        worldPoint.sub(this.m_mapView.worldCenter);
        raycaster.set(worldPoint, towardsEarth);
        const intersections = raycaster.intersectObject(this.m_mapView.worldRootObject, true);
        if (intersections.length === 0) {
            return undefined;
        }
        const intersectionWorldPoint = intersections[0].point.add(this.m_mapView.worldCenter);
        return this.m_mapView.projection.unprojectPoint(intersectionWorldPoint).altitude;
    }

    rayCast(x: number, y: number): THREE.Vector3 | undefined {
        const pickResults = this.m_mapView.intersectMapObjects(x, y);
        const bestResult = pickResults.find(value => {
            return value.point instanceof THREE.Vector3;
        });
        if (bestResult === undefined) {
            return undefined;
        }
        return (bestResult.point as THREE.Vector3).add(this.m_mapView.worldCenter);
    }

    getDisplacementMap(tileKey: TileKey): TileDisplacementMap | undefined {
        return undefined;
    }

    getTilingScheme(): TilingScheme | undefined {
        throw new Error("Not yet implemented");
    }

    clearCache(): void {
        // Not required
    }
}

/**
 * This example shows how to use the [[ElevationProvider]] to do raycasting.
 * To show the output, click on the map with the shift key, this will insert a pink box.
 * Note, there seems to be a bug where the box shows as fully transparent.
 * Please see the hello.ts demo for a simpler example of how to setup a MapView etc.
 */
export namespace ElevationProviderExample {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00ff00ff
    });

    // Return a 10mx10mx10m cube.
    function createPinkCube(): THREE.Mesh {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        mesh.scale.setScalar(10);
        return mesh;
    }

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json",
            watermark: URL.createObjectURL(new Blob([watermarkLogo], { type: "image/svg+xml" }))
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        // Center the camera on Manhattan, New York City.
        map.setCameraGeolocationAndZoom(new GeoCoordinates(40.6935, -74.009), 16.9, 6.3, 50);

        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        // Add an UI.
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });
        const sceneElevationProvider = new SceneElevationProvider(map);
        map.setElevationSource(
            new DummyElevationSource(),
            new DummyElevationRangeSource(),
            sceneElevationProvider
        );

        canvas.addEventListener("mousedown", event => {
            if (sceneElevationProvider === undefined) {
                return;
            }

            if (event.shiftKey) {
                // Show usage of the [[ElevationProvider.rayCast]] method.
                const posVector = sceneElevationProvider.rayCast(event.pageX, event.pageY);
                if (posVector !== undefined) {
                    const cube = createPinkCube();
                    map.scene.add(cube);
                    // For the map to rerender
                    map.update();
                    // See the ThreejsAddSimpleObject for an explanation of the maths.
                    map.addEventListener(MapViewEventNames.Render, () => {
                        cube.position.copy(posVector).sub(map.worldCenter);
                    });
                }
            } else if (event.ctrlKey) {
                // Show usage of the [[ElevationProvider.getHeight]] method.
                const geoCoord = map.getGeoCoordinatesAt(event.pageX, event.pageY);
                if (geoCoord !== null) {
                    const height = sceneElevationProvider.getHeight(geoCoord);
                    if (height === undefined) {
                        return;
                    }
                    geoCoord.altitude = height;
                    const posVector = map.projection.projectPoint(geoCoord, new THREE.Vector3());
                    const cube = createPinkCube();
                    map.scene.add(cube);
                    map.update();
                    map.addEventListener(MapViewEventNames.Render, () => {
                        cube.position.copy(posVector).sub(map.worldCenter);
                    });
                }
            }
        });

        return map;
    }

    const message = document.createElement("div");
    message.innerHTML = `Press 'Shift' then click to put a pink box on a building</br>
    Press 'Ctrl' then click to put a pink box at the highest point at that geo location.`;

    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "10px";
    message.style.right = "10px";
    document.body.appendChild(message);

    const mapView = initializeMapView("mapCanvas");

    const hereCopyrightInfo: CopyrightInfo = {
        id: "here.com",
        year: new Date().getFullYear(),
        label: "HERE",
        link: "https://legal.here.com/terms"
    };
    const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        maxZoomLevel: 17,
        authenticationCode: accessToken,
        copyrightInfo: copyrights
    });

    mapView.addDataSource(omvDataSource);
}
