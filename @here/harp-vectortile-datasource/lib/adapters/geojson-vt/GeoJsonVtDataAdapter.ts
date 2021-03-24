/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv, ValueMap } from "@here/harp-datasource-protocol/index-decoder";
import { webMercatorProjection } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import { ShapeUtils, Vector2, Vector3 } from "three";

import { DataAdapter } from "../../DataAdapter";
import { DecodeInfo } from "../../DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../IGeometryProcessor";
import { OmvFeatureFilter } from "../../OmvDataFilter";
import { isArrayBufferLike, tile2world } from "../../OmvUtils";

const VT_JSON_EXTENTS = 4096;

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

const worldPos = new Vector3();

/**
 * Unique ID of {@link VTJsonDataAdapter}.
 */
export const VTJsonDataAdapterId: string = "vt-json";

/**
 * The class `GeoJsonVtDataAdapter` converts VT-json data to geometries for the given
 * {@link IGeometryProcessor}.
 */
export class GeoJsonVtDataAdapter implements DataAdapter {
    id = VTJsonDataAdapterId;

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

    process(tile: VTJsonTileInterface, decodeInfo: DecodeInfo) {
        const { tileKey } = decodeInfo;
        for (const feature of tile.features) {
            const env = new MapEnv({
                $layer: tile.layer,
                $geometryType: this.convertGeometryType(feature.type),
                $level: tileKey.level,
                $zoom: Math.max(0, tileKey.level - (this.m_processor.storageLevelOffset ?? 0)),
                $id: feature.id,
                ...feature.tags
            });

            switch (feature.type) {
                case VTJsonGeometryType.Point: {
                    for (const pointGeometry of feature.geometry) {
                        const x = (pointGeometry as VTJsonPosition)[0];
                        const y = (pointGeometry as VTJsonPosition)[1];

                        const position = new Vector3(x, y, 0);

                        this.m_processor.processPointFeature(
                            tile.layer,
                            VT_JSON_EXTENTS,
                            [position],
                            env,
                            tileKey.level
                        );
                    }
                    break;
                }
                case VTJsonGeometryType.LineString: {
                    const lineGeometries = feature.geometry as VTJsonPosition[][];

                    let lastLine: ILineGeometry | undefined;
                    const lines: ILineGeometry[] = [];

                    lineGeometries.forEach(lineGeometry => {
                        const lastPos = lastLine?.positions[lastLine.positions.length - 1];
                        const [startx, starty] = lineGeometry[0];
                        if (lastPos?.x === startx && lastPos?.y === starty) {
                            // continue the last line
                            for (let i = 1; i < lineGeometry.length; ++i) {
                                const [x, y] = lineGeometry[i];
                                lastLine?.positions.push(new Vector2(x, y));
                            }
                        } else {
                            // start a new line
                            const positions = lineGeometry.map(([x, y]) => new Vector2(x, y));
                            lines.push({ positions });

                            lastLine = lines[lines.length - 1];
                        }
                    });

                    lines.forEach(line => {
                        (line as any).untiledPositions = line.positions.map(tilePos => {
                            tile2world(VT_JSON_EXTENTS, decodeInfo, tilePos, false, worldPos);
                            return webMercatorProjection.unprojectPoint(worldPos);
                        });
                    });

                    this.m_processor.processLineFeature(
                        tile.layer,
                        VT_JSON_EXTENTS,
                        lines,
                        env,
                        tileKey.level
                    );

                    break;
                }
                case VTJsonGeometryType.Polygon: {
                    const polygons: IPolygonGeometry[] = [];
                    let polygon: IPolygonGeometry | undefined;
                    for (const outline of feature.geometry as VTJsonPosition[][]) {
                        const ring: Vector2[] = [];
                        for (const [currX, currY] of outline) {
                            const position = new Vector2(currX, currY);
                            ring.push(position);
                        }
                        // MVT spec defines that each exterior ring signals the beginning of a new polygon.
                        // See https://github.com/mapbox/vector-tile-spec/tree/master/2.1
                        if (ShapeUtils.area(ring) > 0) {
                            // Create a new polygon and push it into the collection of polygons
                            polygon = { rings: [] };
                            polygons.push(polygon);
                        }
                        // Push the ring into the current polygon
                        polygon?.rings.push(ring);
                    }

                    this.m_processor.processPolygonFeature(
                        tile.layer,
                        VT_JSON_EXTENTS,
                        polygons,
                        env,
                        tileKey.level
                    );

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
