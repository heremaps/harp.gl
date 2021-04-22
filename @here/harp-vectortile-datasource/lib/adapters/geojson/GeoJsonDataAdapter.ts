/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv, ValueMap } from "@here/harp-datasource-protocol/lib/Env";
import { clipLineString } from "@here/harp-geometry/lib/ClipLineString";
import { GeoCoordinates, GeoPointLike, webMercatorProjection } from "@here/harp-geoutils";
import { Vector2Like } from "@here/harp-geoutils/lib/math/Vector2Like";
import { ILogger } from "@here/harp-utils";
import { ShapeUtils, Vector2, Vector3 } from "three";

import { DataAdapter } from "../../DataAdapter";
import { DecodeInfo } from "../../DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../../IGeometryProcessor";
import { OmvFeatureFilter } from "../../OmvDataFilter";
import { world2tile } from "../../OmvUtils";

const DEFAULT_EXTENTS = 4 * 1024;

type GeoJsonGeometry =
    | GeoJsonLineStringGeometry
    | GeoJsonMultiLineStringGeometry
    | GeoJsonPolygonGeometry
    | GeoJsonMultiPolygonGeometry
    | GeoJsonPointGeometry
    | GeoJsonMultiPointGeometry;

interface GeoJsonLineStringGeometry {
    type: "LineString";
    coordinates: GeoPointLike[];
}

interface GeoJsonMultiLineStringGeometry {
    type: "MultiLineString";
    coordinates: GeoPointLike[][];
}

interface GeoJsonPointGeometry {
    type: "Point";
    coordinates: GeoPointLike;
}

interface GeoJsonMultiPointGeometry {
    type: "MultiPoint";
    coordinates: GeoPointLike[];
}

interface GeoJsonPolygonGeometry {
    type: "Polygon";
    coordinates: GeoPointLike[][];
}

interface GeoJsonMultiPolygonGeometry {
    type: "MultiPolygon";
    coordinates: GeoPointLike[][][];
}

interface GeoJsonFeature {
    id?: string;
    properties: ValueMap;
    geometry: GeoJsonGeometry;
}

interface GeoJsonFeatureCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
}

function convertGeometryType(type: string): string {
    switch (type) {
        case "LineString":
            return "line";
        case "MultiLineString":
            return "line";
        case "Polygon":
            return "polygon";
        case "MultiPolygon":
            return "polygon";
        case "Point":
            return "point";
        case "MultiPoint":
            return "point";
        default:
            return "unknown";
    } // switch
}

const worldP = new Vector3();

/**
 * Converts a `geoPoint` to local tile space.
 *
 * @param geoPoint - The input [[GeoPointLike]].
 * @param decodeInfo - The [[DecodeInfo]].
 * @param target - A [[VectorLike]] used as target of the converted coordinates.
 * @return A [[VectorLike]] with the converted point.
 * @hidden
 */
function convertPoint<VectorType extends Vector2Like>(
    geoPoint: GeoPointLike,
    decodeInfo: DecodeInfo,
    target: VectorType
): VectorType {
    webMercatorProjection.projectPoint(GeoCoordinates.fromGeoPoint(geoPoint), worldP);
    return world2tile(DEFAULT_EXTENTS, decodeInfo, worldP, false, target);
}

function convertLineStringGeometry(
    coordinates: GeoPointLike[],
    decodeInfo: DecodeInfo
): ILineGeometry {
    const untiledPositions = coordinates.map(geoPoint => {
        return GeoCoordinates.fromGeoPoint(geoPoint);
    });

    const positions = coordinates.map(geoPoint =>
        convertPoint(geoPoint, decodeInfo, new Vector2())
    );

    return { untiledPositions, positions };
}

function convertLineGeometry(
    geometry: GeoJsonLineStringGeometry | GeoJsonMultiLineStringGeometry,
    decodeInfo: DecodeInfo
): ILineGeometry[] {
    if (geometry.type === "LineString") {
        return [convertLineStringGeometry(geometry.coordinates, decodeInfo)];
    }

    return geometry.coordinates.map(lineString =>
        convertLineStringGeometry(lineString, decodeInfo)
    );
}
function convertRings(coordinates: GeoPointLike[][], decodeInfo: DecodeInfo): IPolygonGeometry {
    const rings = coordinates.map((ring, i) => {
        const isOuterRing = i === 0;
        const { positions } = convertLineStringGeometry(ring, decodeInfo);
        const isClockWise = ShapeUtils.area(positions) > 0;
        if ((isOuterRing && !isClockWise) || (!isOuterRing && isClockWise)) {
            positions.reverse();
        }
        return positions;
    });
    return { rings };
}

function convertPolygonGeometry(
    geometry: GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry,
    decodeInfo: DecodeInfo
): IPolygonGeometry[] {
    if (geometry.type === "Polygon") {
        return [convertRings(geometry.coordinates, decodeInfo)];
    }

    return geometry.coordinates.map(polygon => convertRings(polygon, decodeInfo));
}

function convertPointGeometry(
    geometry: GeoJsonPointGeometry | GeoJsonMultiPointGeometry,
    decodeInfo: DecodeInfo
): Vector3[] {
    if (geometry.type === "Point") {
        return [convertPoint(geometry.coordinates, decodeInfo, new Vector3())];
    }

    return geometry.coordinates.map(geoPoint => convertPoint(geoPoint, decodeInfo, new Vector3()));
}

export class GeoJsonDataAdapter implements DataAdapter {
    id = "GeoJsonDataAdapter";

    constructor(
        readonly m_processor: IGeometryProcessor,
        readonly dataFilter: OmvFeatureFilter,
        readonly m_logger?: ILogger
    ) {}

    canProcess(featureCollection: Partial<GeoJsonFeatureCollection>): boolean {
        return (
            featureCollection &&
            featureCollection.type === "FeatureCollection" &&
            Array.isArray(featureCollection.features)
        );
    }

    process(featureCollection: GeoJsonFeatureCollection, decodeInfo: DecodeInfo): void {
        if (!Array.isArray(featureCollection.features) || featureCollection.features.length === 0) {
            return;
        }

        const { tileKey } = decodeInfo;

        const $level = tileKey.level;
        const $zoom = Math.max(0, tileKey.level - (this.m_processor.storageLevelOffset ?? 0));
        const $layer = "geojson";

        for (const feature of featureCollection.features) {
            const $geometryType = convertGeometryType(feature.geometry.type);
            const env = new MapEnv({
                ...feature.properties,
                $id: feature.id ?? null,
                $layer,
                $level,
                $zoom,
                $geometryType
            });

            switch (feature.geometry.type) {
                case "LineString":
                case "MultiLineString": {
                    let geometry = convertLineGeometry(feature.geometry, decodeInfo);

                    const clippedGeometries: ILineGeometry[] = [];

                    const DEFAULT_BORDER = 100;

                    geometry.forEach(g => {
                        const clipped = clipLineString(
                            g.positions,
                            -DEFAULT_BORDER,
                            -DEFAULT_BORDER,
                            DEFAULT_EXTENTS + DEFAULT_BORDER,
                            DEFAULT_EXTENTS + DEFAULT_BORDER
                        );
                        clipped.forEach(positions => {
                            clippedGeometries.push({ positions });
                        });
                    });

                    geometry = clippedGeometries;

                    if (geometry.length > 0) {
                        this.m_processor.processLineFeature(
                            $layer,
                            DEFAULT_EXTENTS,
                            clippedGeometries,
                            env,
                            $level
                        );
                    }
                    break;
                }
                case "Polygon":
                case "MultiPolygon": {
                    const geometry = convertPolygonGeometry(feature.geometry, decodeInfo);
                    this.m_processor.processPolygonFeature(
                        $layer,
                        DEFAULT_EXTENTS,
                        geometry,
                        env,
                        $level
                    );
                    break;
                }
                case "Point":
                case "MultiPoint": {
                    const geometry = convertPointGeometry(feature.geometry, decodeInfo);
                    this.m_processor.processPointFeature(
                        $layer,
                        DEFAULT_EXTENTS,
                        geometry,
                        env,
                        $level
                    );
                    break;
                }
            }
        }
    }
}
