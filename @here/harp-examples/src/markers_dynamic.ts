/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeaturesDataSource, MapViewPointFeature } from "@here/harp-features-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    GeoJsonDataProvider,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";
import { GUI } from "dat.gui";

import { apikey, copyrightInfo } from "../config";

/**
 * This examples shows how to render dynamically generated GeoJSON points as markers with picking
 * support.
 */
export namespace DynamicMarkersExample {
    const icons = [
        {
            name: "redIcon",
            url:
                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzOCIgaGVpZ2h0PSI0NyIgdmlld0JveD0iMCAwIDM4IDQ3Ij48ZyBmaWxsPSJub25lIj48cGF0aCBmaWxsPSIjMEYxNjIxIiBmaWxsLW9wYWNpdHk9Ii40IiBkPSJNMTUgNDZjMCAuMzE3IDEuNzkuNTc0IDQgLjU3NHM0LS4yNTcgNC0uNTc0YzAtLjMxNy0xLjc5LS41NzQtNC0uNTc0cy00IC4yNTctNCAuNTc0eiI+PC9wYXRoPjxwYXRoIGZpbGw9IiNiNjAxMDEiIGQ9Ik0zMy4yNSAzMS42NTJBMTkuMDE1IDE5LjAxNSAwIDAgMCAzOCAxOS4wNkMzOCA4LjU0OSAyOS40NzggMCAxOSAwUzAgOC41NSAwIDE5LjA1OWMwIDQuODIzIDEuNzk1IDkuMjMzIDQuNzUgMTIuNTkzTDE4Ljk3NSA0NiAzMy4yNSAzMS42NTJ6Ij48L3BhdGg+PHBhdGggZmlsbD0iIzZBNkQ3NCIgZmlsbC1vcGFjaXR5PSIuNSIgZD0iTTI2Ljg2MiAzNy41bDQuNzE0LTQuNzdjMy44MjItMy41NzYgNS45MjQtOC40MTEgNS45MjQtMTMuNjJDMzcuNSA4Ljg0NyAyOS4yLjUgMTkgLjVTLjUgOC44NDguNSAxOS4xMWMwIDUuMjA5IDIuMTAyIDEwLjA0NCA1LjkxOSAxMy42MTRsNC43MTkgNC43NzZoMTUuNzI0ek0xOSAwYzEwLjQ5MyAwIDE5IDguNTI1IDE5IDE5LjA0MSAwIDUuNTA3LTIuMzQ4IDEwLjQ1NC02LjA3OSAxMy45MzJMMTkgNDYgNi4wNzkgMzIuOTczQzIuMzQ4IDI5LjQ5NSAwIDI0LjU0OCAwIDE5LjA0IDAgOC41MjUgOC41MDcgMCAxOSAweiI+PC9wYXRoPjwvZz48L3N2Zz4K"
        },
        {
            name: "greenIcon",
            url:
                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzOCIgaGVpZ2h0PSI0NyIgdmlld0JveD0iMCAwIDM4IDQ3Ij48ZyBmaWxsPSJub25lIj48cGF0aCBmaWxsPSIjMEYxNjIxIiBmaWxsLW9wYWNpdHk9Ii40IiBkPSJNMTUgNDZjMCAuMzE3IDEuNzkuNTc0IDQgLjU3NHM0LS4yNTcgNC0uNTc0YzAtLjMxNy0xLjc5LS41NzQtNC0uNTc0cy00IC4yNTctNCAuNTc0eiI+PC9wYXRoPjxwYXRoIGZpbGw9IiMwNGI2MDEiIGQ9Ik0zMy4yNSAzMS42NTJBMTkuMDE1IDE5LjAxNSAwIDAgMCAzOCAxOS4wNkMzOCA4LjU0OSAyOS40NzggMCAxOSAwUzAgOC41NSAwIDE5LjA1OWMwIDQuODIzIDEuNzk1IDkuMjMzIDQuNzUgMTIuNTkzTDE4Ljk3NSA0NiAzMy4yNSAzMS42NTJ6Ij48L3BhdGg+PHBhdGggZmlsbD0iIzZBNkQ3NCIgZmlsbC1vcGFjaXR5PSIuNSIgZD0iTTI2Ljg2MiAzNy41bDQuNzE0LTQuNzdjMy44MjItMy41NzYgNS45MjQtOC40MTEgNS45MjQtMTMuNjJDMzcuNSA4Ljg0NyAyOS4yLjUgMTkgLjVTLjUgOC44NDguNSAxOS4xMWMwIDUuMjA5IDIuMTAyIDEwLjA0NCA1LjkxOSAxMy42MTRsNC43MTkgNC43NzZoMTUuNzI0ek0xOSAwYzEwLjQ5MyAwIDE5IDguNTI1IDE5IDE5LjA0MSAwIDUuNTA3LTIuMzQ4IDEwLjQ1NC02LjA3OSAxMy45MzJMMTkgNDYgNi4wNzkgMzIuOTczQzIuMzQ4IDI5LjQ5NSAwIDI0LjU0OCAwIDE5LjA0IDAgOC41MjUgOC41MDcgMCAxOSAweiI+PC9wYXRoPjwvZz48L3N2Zz4K"
        },
        {
            name: "blueIcon",
            url:
                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzOCIgaGVpZ2h0PSI0NyIgdmlld0JveD0iMCAwIDM4IDQ3Ij48ZyBmaWxsPSJub25lIj48cGF0aCBmaWxsPSIjMEYxNjIxIiBmaWxsLW9wYWNpdHk9Ii40IiBkPSJNMTUgNDZjMCAuMzE3IDEuNzkuNTc0IDQgLjU3NHM0LS4yNTcgNC0uNTc0YzAtLjMxNy0xLjc5LS41NzQtNC0uNTc0cy00IC4yNTctNCAuNTc0eiI+PC9wYXRoPjxwYXRoIGZpbGw9IiMwMTgwYjYiIGQ9Ik0zMy4yNSAzMS42NTJBMTkuMDE1IDE5LjAxNSAwIDAgMCAzOCAxOS4wNkMzOCA4LjU0OSAyOS40NzggMCAxOSAwUzAgOC41NSAwIDE5LjA1OWMwIDQuODIzIDEuNzk1IDkuMjMzIDQuNzUgMTIuNTkzTDE4Ljk3NSA0NiAzMy4yNSAzMS42NTJ6Ij48L3BhdGg+PHBhdGggZmlsbD0iIzZBNkQ3NCIgZmlsbC1vcGFjaXR5PSIuNSIgZD0iTTI2Ljg2MiAzNy41bDQuNzE0LTQuNzdjMy44MjItMy41NzYgNS45MjQtOC40MTEgNS45MjQtMTMuNjJDMzcuNSA4Ljg0NyAyOS4yLjUgMTkgLjVTLjUgOC44NDguNSAxOS4xMWMwIDUuMjA5IDIuMTAyIDEwLjA0NCA1LjkxOSAxMy42MTRsNC43MTkgNC43NzZoMTUuNzI0ek0xOSAwYzEwLjQ5MyAwIDE5IDguNTI1IDE5IDE5LjA0MSAwIDUuNTA3LTIuMzQ4IDEwLjQ1NC02LjA3OSAxMy45MzJMMTkgNDYgNi4wNzkgMzIuOTczQzIuMzQ4IDI5LjQ5NSAwIDI0LjU0OCAwIDE5LjA0IDAgOC41MjUgOC41MDcgMCAxOSAweiI+PC9wYXRoPjwvZz48L3N2Zz4K"
        }
    ];

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const map = new MapView({
            canvas,
            theme: {
                extends: "resources/berlin_tilezen_base.json",
                styles: {
                    // Specify the styling for the markers.
                    geojson: [
                        {
                            when: ["==", ["geometry-type"], "Point"],
                            technique: "labeled-icon",
                            imageTexture: ["get", "icon"],
                            text: ["get", "text"],
                            size: 15,
                            priority: 1000,
                            color: "black",
                            iconMayOverlap: true,
                            textMayOverlap: true,
                            renderOrder: ["get", "renderOrder"],
                            iconFadeTime: 0,
                            textFadeTime: 0
                        }
                    ]
                }
            },
            target: new GeoCoordinates(52.52, 13.4),
            zoomLevel: 12,
            delayLabelsUntilMovementFinished: false
        });

        CopyrightElementHandler.install("copyrightNotice").attach(map);

        const controls = new MapControls(map);

        // Add an UI.
        const ui = new MapControlsUI(controls, { projectionSwitch: true, zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });
        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxDataLevel: 17,
            authenticationCode: apikey,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "apikey"
            },
            copyrightInfo
        });
        map.addDataSource(omvDataSource);

        // Register the icon image referenced in the style.
        for (const { name, url } of icons) {
            map.userImageCache.addImage(name, url);
        }
        map.update();

        return map;
    }

    function removeMarkerAt(x: number, y: number): void {
        // Intersection test filtering the results by layer name to get only markers.
        const layerName = (markersDataSource.dataProvider() as GeoJsonDataProvider).name;
        const results = mapView.intersectMapObjects(x, y).filter(result => {
            return result.userData?.$layer === layerName;
        });

        if (results.length === 0) {
            return;
        }

        const uuid = results[0].userData?.__mapViewUuid;
        if (uuid !== undefined) {
            const feature = new MapViewPointFeature([]);
            feature.uuid = uuid;
            markersDataSource.remove(feature);
        }
    }

    let markerId = 0;
    let longTapTimer: number | undefined;
    let isLongTap = false;
    const longTapTimeMs = 500;
    let lastCanvasPosition: { x: number; y: number } | undefined;

    function cancelLongTapTimer() {
        clearTimeout(longTapTimer);
        longTapTimer = undefined;
    }
    function handleLongTap() {
        cancelLongTapTimer();
        isLongTap = true;
    }
    function addMarker(x: number, y: number) {
        const geo = mapView.getGeoCoordinatesAt(x, y);
        if (geo) {
            // Add a new marker to the data source at the click coordinates.
            markersDataSource.add(
                new MapViewPointFeature(geo.toGeoPoint() as number[], {
                    text: markerId.toString(),
                    id: markerId,
                    icon: icons[markerId % icons.length].name,
                    renderOrder: markerId
                })
            );
            markerId++;
        }
    }

    function clearMarkers() {
        markersDataSource.clear();
        markerId = 0;
    }
    function getCanvasPosition(
        event: MouseEvent | TouchEvent,
        canvas: HTMLCanvasElement
    ): { x: number; y: number } {
        const ev = event instanceof MouseEvent ? event : event.changedTouches[0];
        const { left, top } = canvas.getBoundingClientRect();
        return { x: ev.clientX - Math.floor(left), y: ev.clientY - Math.floor(top) };
    }

    function handleTapStart(event: MouseEvent | TouchEvent) {
        lastCanvasPosition = getCanvasPosition(event, mapView.canvas);
        longTapTimer = setTimeout(handleLongTap, longTapTimeMs) as any;
    }

    function handleTapEnd(event: MouseEvent | TouchEvent) {
        cancelLongTapTimer();
        const canvasPos = getCanvasPosition(event, mapView.canvas);
        // It's a tap only if there's (almost) no dragging.
        const MAX_MOVE = 10;
        const wasDragged =
            lastCanvasPosition &&
            (Math.abs(lastCanvasPosition.x - canvasPos.x) > MAX_MOVE ||
                Math.abs(lastCanvasPosition.y - canvasPos.y) > MAX_MOVE);
        if (wasDragged) {
            return;
        }
        if (isLongTap) {
            removeMarkerAt(canvasPos.x, canvasPos.y);
            isLongTap = false;
        } else {
            addMarker(canvasPos.x, canvasPos.y);
        }
    }

    function attachInputEvents() {
        const canvas = mapView.canvas;
        canvas.addEventListener("mousedown", handleTapStart);
        canvas.addEventListener("touchstart", event => {
            if (event.changedTouches.length === 1) {
                handleTapStart(event);
            }
        });

        canvas.addEventListener("mouseup", handleTapEnd);
        canvas.addEventListener("touchend", handleTapEnd);

        window.addEventListener("keypress", event => {
            if (event.key === "c") {
                clearMarkers();
            }
        });
    }

    function addUI() {
        const gui = new GUI();
        gui.width = 300;
        const instructions = "Short/long tap to add/remove a marker";
        const options = {
            instructions,
            clear: clearMarkers
        };
        const instrField = gui
            .add(options, "instructions")
            .name("")
            .onChange(() => {
                options.instructions = instructions;
            });
        (instrField.domElement.style as any) = "width:90%";
        gui.add(options, "clear").name("(C)lear markers");
    }

    const mapView = initializeMapView("mapCanvas");

    // Create a [[FeaturesDataSource]] for the markers.
    const markersDataSource = new FeaturesDataSource({
        name: "geojson",
        styleSetName: "geojson",
        gatherFeatureAttributes: true
    });
    mapView.addDataSource(markersDataSource);

    attachInputEvents();
    addUI();
}
