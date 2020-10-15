/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { wrapPolygon } from "@here/harp-geometry/lib/WrapPolygon";
import { GeoBox, GeoCoordinates, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { GeoCoordLike } from "@here/harp-geoutils/lib/coordinates/GeoCoordLike";
import { DataProvider } from "@here/harp-mapview-decoder";
import { Box3 } from "three";

import { VectorTileDataSource, VectorTileDataSourceParameters } from "./VectorTileDataSource";
import { VectorTileDecoder } from "./VectorTileDecoder";

interface Marker {
    coordinates: GeoCoordLike;
    color?: string;
    minZoomLevel?: number;
    maxZoomLevel?: number;
    size?: number;
}

interface Polygon {
    coordinates: GeoCoordLike[][];
    color?: string;
    minZoomLevel?: number;
    maxZoomLevel?: number;
}

function geoBoxFromCoordinates(coords: GeoCoordLike[]): GeoBox | undefined {
    if (!Array.isArray(coords) || coords.length === 0) {
        return undefined;
    }
    const geoBox = new GeoBox(
        GeoCoordinates.fromObject(coords[0]),
        GeoCoordinates.fromObject(coords[0])
    );
    const reduce = (geoBox: GeoBox, coord: GeoCoordLike) => {
        geoBox.growToContain(GeoCoordinates.fromObject(coord));
        return geoBox;
    };
    return coords.reduce(reduce, geoBox);
}

class MapObjectsDataProvider extends DataProvider {
    readonly markers: Marker[] = [];
    readonly polygons: Polygon[] = [];

    ready(): boolean {
        return true;
    }

    async getTile(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<{} | ArrayBuffer | SharedArrayBuffer> {
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);

        const tiledMarkers = this.markers.filter(marker =>
            geoBox.contains(GeoCoordinates.fromObject(marker.coordinates).normalized())
        );

        const pointFeatures = tiledMarkers.map(marker => {
            const { latitude, longitude } = GeoCoordinates.fromObject(
                marker.coordinates
            ).normalized();
            return {
                type: "Feature",
                properties: {
                    lat: latitude.toFixed(2),
                    lng: longitude.toFixed(2),
                    color: marker.color ?? "rgb(255,0,0)",
                    minzoom: marker.minZoomLevel ?? 1,
                    maxzoom: marker.maxZoomLevel ?? 20
                },
                geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                }
            };
        });

        const tileBounds = new Box3();
        webMercatorTilingScheme.getWorldBox(tileKey, tileBounds);

        const featureBounds = new Box3();
        const interestingPolygons = this.polygons.filter(polygon => {
            const geoBox = geoBoxFromCoordinates(polygon.coordinates[0]);
            if (geoBox === undefined) {
                return false;
            }
            webMercatorTilingScheme.projection.projectBox(geoBox, featureBounds);
            return tileBounds.intersect(featureBounds);
        });

        const polygonFeatures = interestingPolygons.map(polygon => {
            const coordinates = polygon.coordinates.map(coords =>
                coords.map(coord => GeoCoordinates.fromObject(coord).toGeoPoint())
            );
            return {
                type: "Feature",
                properties: {
                    color: polygon.color ?? "rgb(255,0,0)",
                    minzoom: polygon.minZoomLevel ?? 1,
                    maxzoom: polygon.maxZoomLevel ?? 20
                },
                geometry: {
                    type: "Polygon",
                    coordinates
                }
            };
        });

        const tile = {
            type: "FeatureCollection",
            features: [...polygonFeatures, ...pointFeatures]
        };

        return tile;
    }

    protected async connect() {
        // nothing to do
    }

    protected dispose(): void {
        // nothign to do
    }
}

export class MapObjectsDataSource extends VectorTileDataSource {
    private readonly m_dataProvider: MapObjectsDataProvider;

    constructor(params: VectorTileDataSourceParameters = {}) {
        super({
            styleSetName: "map-objects",
            ...params,
            decoder: new VectorTileDecoder(),
            dataProvider: new MapObjectsDataProvider()
        });
        this.m_dataProvider = this.dataProvider() as MapObjectsDataProvider;
    }

    get markers(): readonly Marker[] {
        return this.m_dataProvider.markers;
    }

    get polygons(): readonly Polygon[] {
        return this.m_dataProvider.polygons;
    }

    clearMarkers() {
        this.m_dataProvider.markers.length = 0;
        this.mapView.clearTileCache(this.name);
        this.requestUpdate();
    }

    clearPolygons() {
        this.m_dataProvider.polygons.length = 0;
        this.mapView.clearTileCache(this.name);
        this.requestUpdate();
    }

    addMarker(marker: Marker) {
        this.m_dataProvider.markers.push(marker);

        this.mapView.clearTileCache(this.name, tile =>
            tile.geoBox.contains(GeoCoordinates.fromObject(marker.coordinates).normalized())
        );

        this.requestUpdate();
    }

    addPolygon(polygon: Polygon) {
        const worldBox = new Box3();
        const tileBounds = new Box3();

        polygon.coordinates.forEach(ring => {
            const coordinates = ring.map(p => GeoCoordinates.fromObject(p));
            const { left, middle, right } = wrapPolygon(coordinates);

            for (const coords of [left, middle, right]) {
                if (!coords) {
                    continue;
                }

                const geoBox = geoBoxFromCoordinates(coords);

                if (!geoBox) {
                    continue;
                }

                this.m_dataProvider.polygons.push({
                    ...polygon,
                    coordinates: [coords]
                });

                webMercatorTilingScheme.projection.projectBox(geoBox, worldBox);

                this.mapView.clearTileCache(this.name, tile => {
                    webMercatorTilingScheme.projection.projectBox(tile.geoBox, tileBounds);
                    return tileBounds.intersectsBox(worldBox);
                });
            }
        });

        this.requestUpdate();
    }
}
