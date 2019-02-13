/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv, ValueMap } from "@here/harp-datasource-protocol/lib/Theme";
import { GeoBox, GeoCoordinates, TileKey } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import { IGeometryProcessor } from "./IGeometryProcessor";
import { OmvFeatureFilter } from "./OmvDataFilter";
import { OmvDataAdapter } from "./OmvDecoder";
import { isArrayBufferLike, lat2tile, tile2lat } from "./OmvUtils";

type VTJsonPosition = [number, number];

enum VTJsonGeometryType {
    Unknown,
    Point,
    LineString,
    Polygon
}

interface VTJsonFeatureInterface {
    geometry: VTJsonPosition[] | VTJsonPosition[][];
    id: string;
    tags: ValueMap;
    type: VTJsonGeometryType;
}

interface VTJsonSourceInterface {
    geometry: number[];
    length: number;
    id: string;
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    tags: ValueMap;
    type: string;
}

interface VTJsonTileInterface {
    features: VTJsonFeatureInterface[];
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    numFeatures: number;
    numPoints: number;
    numSimplified: number;
    source: VTJsonSourceInterface[];
    transformed: boolean;
    x: number;
    y: number;
    z: number;
    layer: string;
}

/**
 * The class [[VTJsonDataAdapter]] converts VT-json data to geometries for the given
 * [[IGeometryProcessor]].
 */
export class VTJsonDataAdapter implements OmvDataAdapter {
    constructor(
        readonly m_processor: IGeometryProcessor,
        private m_dataFilter?: OmvFeatureFilter,
        readonly m_logger?: ILogger
    ) {}

    get dataFilter(): OmvFeatureFilter | undefined {
        return this.m_dataFilter;
    }

    set dataFilter(dataFilter: OmvFeatureFilter | undefined) {
        this.m_dataFilter = dataFilter;
    }

    canProcess(data: ArrayBufferLike | {}): boolean {
        if (isArrayBufferLike(data)) {
            return false;
        }

        const tile = data as VTJsonTileInterface;
        if (
            tile.features === undefined ||
            tile.source === undefined ||
            tile.x === undefined ||
            tile.y === undefined ||
            tile.z === undefined
        ) {
            return false;
        }

        return true;
    }

    process(tile: VTJsonTileInterface, tileKey: TileKey, geoBox: GeoBox, displayZoomLevel: number) {
        const extent = 4096;
        const longitudeScale = geoBox.longitudeSpan / extent;
        const { north, west } = geoBox;
        const N = Math.log2(extent);
        const top = lat2tile(north, tileKey.level + N);

        for (const feature of tile.features) {
            const env = new MapEnv({
                ...feature.tags,
                $layer: tile.layer,
                $geometryType: this.convertGeometryType(feature.type),
                $level: tileKey.level,
                $displayLevel: displayZoomLevel
            });

            switch (feature.type) {
                case VTJsonGeometryType.Point: {
                    for (const pointGeometry of feature.geometry) {
                        const x = (pointGeometry as VTJsonPosition)[0];
                        const y = (pointGeometry as VTJsonPosition)[1];
                        const longitude = west + x * longitudeScale;
                        const latitude = tile2lat(top + y, tileKey.level + N);

                        this.m_processor.processPointFeature(
                            tile.layer,
                            [new GeoCoordinates(latitude, longitude)],
                            env,
                            tileKey.level,
                            displayZoomLevel
                        );
                    }
                    break;
                }
                case VTJsonGeometryType.LineString: {
                    for (const lineGeometry of feature.geometry as VTJsonPosition[][]) {
                        const line: GeoCoordinates[] = [];
                        for (const [x, y] of lineGeometry) {
                            const longitude = west + x * longitudeScale;
                            const latitude = tile2lat(top + y, tileKey.level + N);
                            line.push(new GeoCoordinates(latitude, longitude));
                        }

                        this.m_processor.processLineFeature(
                            tile.layer,
                            [line],
                            env,
                            tileKey.level,
                            displayZoomLevel
                        );
                    }
                    break;
                }
                case VTJsonGeometryType.Polygon: {
                    let polygonValid = true;
                    const polygon: GeoCoordinates[][] = [];
                    for (const outline of feature.geometry as VTJsonPosition[][]) {
                        let minX = Infinity;
                        let minY = Infinity;
                        let maxX = 0;
                        let maxY = 0;

                        const ring: GeoCoordinates[] = [];
                        for (const [x, y] of outline) {
                            if (polygon.length > 0) {
                                minX = Math.min(minX, x);
                                minY = Math.min(minY, y);
                                maxX = Math.max(maxX, x);
                                maxY = Math.max(maxY, y);
                            }

                            const longitude = west + x * longitudeScale;
                            const latitude = tile2lat(top + y, tileKey.level + N);
                            ring.push(new GeoCoordinates(latitude, longitude));
                        }

                        if (minX === 0 && minY === 0 && maxX === extent && maxY === extent) {
                            polygonValid = false;
                            break;
                        } else {
                            minX = minY = Infinity;
                            maxX = maxY = 0;
                        }
                        polygon.push(ring);
                    }

                    if (polygonValid) {
                        this.m_processor.processPolygonFeature(
                            tile.layer,
                            [polygon],
                            env,
                            tileKey.level,
                            displayZoomLevel
                        );
                    }
                    break;
                }
                case VTJsonGeometryType.Unknown: {
                    break;
                }
            }
        }
    }

    private convertGeometryType(type: VTJsonGeometryType): string {
        switch (type) {
            case VTJsonGeometryType.Point:
                return "point";
            case VTJsonGeometryType.LineString:
                return "line";
            case VTJsonGeometryType.Polygon:
                return "polygon";
            default:
                return "unknown";
        }
    }
}
