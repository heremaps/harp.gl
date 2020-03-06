/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeMap,
    ExtendedTileInfo,
    ExtendedTileInfoWriter,
    Feature,
    FeatureDetails,
    FeatureGroupType,
    GeoJson,
    IndexedTechnique,
    isCirclesTechnique,
    isFillTechnique,
    isPoiTechnique,
    isSolidLineTechnique,
    isSquaresTechnique,
    isTextTechnique,
    LineFeatureGroup
} from "@here/harp-datasource-protocol";
import {
    MapEnv,
    StyleSetEvaluator,
    Value,
    ValueMap
} from "@here/harp-datasource-protocol/index-decoder";

import { GeoCoordinates, Projection } from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";
import { Flattener } from "./utils/Flattener";

const logger = LoggerManager.instance.create("GeoJsonFeatureParser");

/**
 * Interface used to store vertices, holes and properties of polygons.
 */
export interface PolygonsData {
    vertices: number[];
    holes: number[];
    geojsonProperties: AttributeMap;
}

/**
 * Interface used to store vertices and properties of points.
 */
interface PointsData {
    vertices: number[];
    geojsonProperties: AttributeMap[];
}

/**
 * It stores the vertices of each line. The lenght of the property `vertices` and that one of
 * `geojsonProperties` should be the same.
 */
interface LinesData {
    vertices: number[][];
    geojsonProperties: AttributeMap[];
}

/**
 * Interface use to read and write from/to an [[ExtendedTile]].
 */
export interface ExtendedTile {
    info: ExtendedTileInfo;
    writer: ExtendedTileInfoWriter;
}

/**
 * Store temporary variables needed for the creation of a geometry.
 */
export class GeometryData {
    /**
     * XYZ defines the property to label in the style, which we cannot do. Since all the features
     * of a same type will show the same property in a given datasource, this workaround is to
     * hand the name property to pick to the buffer.
     */
    labelProperty?: string;
    type: string | undefined;
    points: PointsData = { vertices: [], geojsonProperties: [] };
    lines: LinesData = { vertices: [], geojsonProperties: [] };
    polygons: PolygonsData[] = [];
}

/**
 * Object returned by the [[GeoJsonFeatureParser]] after parsing the data.
 */
export interface GeometryDataBuffers {
    geometryBuffer: Map<number, GeometryData>;
    textGeometryBuffer: Map<number, GeometryData>;
    textPathGeometryBuffer: Map<number, GeometryData>;
    poiGeometryBuffer: Map<number, GeometryData>;
}

/**
 * Class holding the GeoJson data parsing.
 */
export class GeoJsonParser {
    static m_cached_worldCoord: THREE.Vector3 = new THREE.Vector3();
    static m_cached_geoCoord: GeoCoordinates = new GeoCoordinates(0, 0);
    static readonly m_gatherRoadSegments = true;

    /**
     * Method exposed to parse the incoming GeoJson data.
     *
     * @param geojson The javascript object obtained from the parsing of the GeoJSON.
     * @param extendedTile The related [[ExtendedTile]].
     * @param center The [[THREE.Vector3]] holding the coordinates of the [[Tile]] center.
     * @param projection The current [[Projection]].
     * @param styleSetEvaluator The [[StyleSetEvaluator]] associated to the tile's decoder.
     * @param buffers The [[GeometryDataBuffers]].
     */
    static processGeoJson(
        geojson: GeoJson,
        extendedTile: ExtendedTile,
        center: THREE.Vector3,
        projection: Projection,
        styleSetEvaluator: StyleSetEvaluator,
        buffers: GeometryDataBuffers
    ) {
        switch (geojson.type) {
            case "Feature":
                this.processFeature(
                    geojson,
                    extendedTile,
                    center,
                    projection,
                    styleSetEvaluator,
                    buffers
                );
                break;
            case "FeatureCollection":
                geojson.features.forEach(feature =>
                    this.processFeature(
                        feature,
                        extendedTile,
                        center,
                        projection,
                        styleSetEvaluator,
                        buffers
                    )
                );
                break;
            default:
                const collectionFeature: Feature = {
                    type: "Feature",
                    geometry: geojson
                };
                this.processFeature(
                    collectionFeature,
                    extendedTile,
                    center,
                    projection,
                    styleSetEvaluator,
                    buffers
                );
                break;
        }
    }

    private static processFeature(
        feature: Feature,
        extendedTile: ExtendedTile,
        center: THREE.Vector3,
        projection: Projection,
        styleSetEvaluator: StyleSetEvaluator,
        buffers: GeometryDataBuffers
    ): void {
        // Skip features without geometries.
        if (feature.geometry === null) {
            return;
        }

        let techniqueIndices: number[] = [];
        switch (feature.geometry.type) {
            case "Point":
                techniqueIndices = this.findTechniqueIndices(feature, "point", styleSetEvaluator);
                for (const techniqueIndex of techniqueIndices) {
                    const technique = styleSetEvaluator.techniques[techniqueIndex];
                    if (isPoiTechnique(technique)) {
                        this.processPois(
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            buffers.poiGeometryBuffer,
                            feature.properties
                        );
                    } else if (isTextTechnique(technique)) {
                        this.processPointLabels(
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            // tslint:disable-next-line: deprecation
                            technique.label!,
                            buffers.textGeometryBuffer,
                            feature.properties
                        );
                    } else if (isCirclesTechnique(technique) || isSquaresTechnique(technique)) {
                        this.processPoints(
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            buffers.geometryBuffer,
                            feature.properties
                        );
                    }
                }
                break;

            case "MultiPoint":
                techniqueIndices = this.findTechniqueIndices(feature, "point", styleSetEvaluator);
                for (const techniqueIndex of techniqueIndices) {
                    const technique = styleSetEvaluator.techniques[techniqueIndex];
                    if (isPoiTechnique(technique)) {
                        this.processPois(
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            buffers.poiGeometryBuffer,
                            feature.properties
                        );
                    } else if (isTextTechnique(technique)) {
                        this.processPointLabels(
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            // tslint:disable-next-line: deprecation
                            technique.label!,
                            buffers.textGeometryBuffer,
                            feature.properties
                        );
                    } else if (isCirclesTechnique(technique) || isSquaresTechnique(technique)) {
                        this.processPoints(
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            buffers.geometryBuffer,
                            feature.properties
                        );
                    }
                }
                break;

            case "LineString":
                techniqueIndices = this.findTechniqueIndices(feature, "line", styleSetEvaluator);
                for (const techniqueIndex of techniqueIndices) {
                    const technique = styleSetEvaluator.techniques[techniqueIndex];
                    if (isSolidLineTechnique(technique)) {
                        this.processLines(
                            extendedTile,
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            styleSetEvaluator,
                            buffers.geometryBuffer,
                            feature.id,
                            feature.properties
                        );
                    } else if (isTextTechnique(technique)) {
                        this.processLineLabels(
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            // tslint:disable-next-line: deprecation
                            technique.label!,
                            buffers.textPathGeometryBuffer,
                            feature.properties
                        );
                    }
                }
                break;

            case "MultiLineString":
                techniqueIndices = this.findTechniqueIndices(feature, "line", styleSetEvaluator);
                for (const techniqueIndex of techniqueIndices) {
                    const technique = styleSetEvaluator.techniques[techniqueIndex];
                    if (isSolidLineTechnique(technique)) {
                        this.processLines(
                            extendedTile,
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            styleSetEvaluator,
                            buffers.geometryBuffer,
                            feature.id,
                            feature.properties
                        );
                    } else if (isTextTechnique(technique)) {
                        this.processLineLabels(
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            // tslint:disable-next-line: deprecation
                            technique.label!,
                            buffers.textPathGeometryBuffer,
                            feature.properties
                        );
                    }
                }
                break;

            case "Polygon":
                techniqueIndices = this.findTechniqueIndices(feature, "polygon", styleSetEvaluator);
                for (const techniqueIndex of techniqueIndices) {
                    const technique = styleSetEvaluator.techniques[techniqueIndex];
                    if (isFillTechnique(technique) || isSolidLineTechnique(technique)) {
                        this.processPolygons(
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            buffers.geometryBuffer,
                            isSolidLineTechnique(technique),
                            feature.properties
                        );
                    } else if (isTextTechnique(technique)) {
                        this.processMultiPolygonLabels(
                            [feature.geometry.coordinates],
                            center,
                            projection,
                            techniqueIndex,
                            // tslint:disable-next-line: deprecation
                            technique.label!,
                            buffers.textGeometryBuffer,
                            feature.properties
                        );
                    }
                }
                break;

            case "MultiPolygon":
                techniqueIndices = this.findTechniqueIndices(feature, "polygon", styleSetEvaluator);
                for (const techniqueIndex of techniqueIndices) {
                    const technique = styleSetEvaluator.techniques[techniqueIndex];
                    if (isFillTechnique(technique) || isSolidLineTechnique(technique)) {
                        this.processPolygons(
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            buffers.geometryBuffer,
                            isSolidLineTechnique(technique),
                            feature.properties
                        );
                    } else if (isTextTechnique(technique)) {
                        this.processMultiPolygonLabels(
                            feature.geometry.coordinates,
                            center,
                            projection,
                            techniqueIndex,
                            // tslint:disable-next-line: deprecation
                            technique.label!,
                            buffers.textGeometryBuffer,
                            feature.properties
                        );
                    }
                }
                break;

            case "GeometryCollection":
                feature.geometry.geometries.forEach(geometry => {
                    const collectionFeature: Feature = {
                        type: "Feature",
                        properties: feature.properties,
                        geometry
                    };
                    this.processFeature(
                        collectionFeature,
                        extendedTile,
                        center,
                        projection,
                        styleSetEvaluator,
                        buffers
                    );
                });
                break;

            default:
                logger.warn("Invalid GeoJSON data. Unknown geometry type.");
        }
    }

    private static processPoints(
        pointLocations: number[][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        geometryBuffer: Map<number, GeometryData>,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, geometryBuffer);
        buffer.type = "point";

        for (const location of pointLocations) {
            this.m_cached_geoCoord.latitude = location[1];
            this.m_cached_geoCoord.longitude = location[0];

            projection.projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord).sub(center);
            buffer.points.vertices.push(
                this.m_cached_worldCoord.x,
                this.m_cached_worldCoord.y,
                this.m_cached_worldCoord.z
            );
            const pointIndex = buffer.points.vertices.length / 3 - 1;
            buffer.points.geojsonProperties[pointIndex] = geojsonProperties;
        }
    }

    private static processLines(
        extendedTile: ExtendedTile,
        lines: number[][][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        styleSetEvaluator: StyleSetEvaluator,
        geometryBuffer: Map<number, GeometryData>,
        featureId?: string,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, geometryBuffer);
        buffer.type = "solid-line";

        for (const line of lines) {
            buffer.lines.geojsonProperties.push(geojsonProperties);
            const vertices: number[] = [];
            for (const point of line) {
                if (point === null || point[0] === null || point[0] === undefined) {
                    return;
                }
                this.m_cached_geoCoord.latitude = point[1];
                this.m_cached_geoCoord.longitude = point[0];
                projection
                    .projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord)
                    .sub(center);
                vertices.push(
                    this.m_cached_worldCoord.x,
                    this.m_cached_worldCoord.y,
                    this.m_cached_worldCoord.z
                );
            }

            buffer.lines.vertices.push(vertices);
        }

        const featureDetails: FeatureDetails = {};
        if (featureId !== undefined) {
            featureDetails.featureId = featureId;
        }
        const env = new MapEnv({ type: "line", ...(featureDetails as ValueMap) });

        const techniques = styleSetEvaluator.getMatchingTechniques(env);
        const featureIdNumber = 0; //geojsonTile do not have an integer for the featureId. Use 0.
        if (buffer.lines.vertices.length !== buffer.lines.geojsonProperties.length) {
            logger.log("The amount of lines and the amount of geo properties has to be the same");
            return;
        }
        this.addTileInfo(
            extendedTile,
            techniques,
            buffer.lines.vertices,
            featureIdNumber,
            env,
            buffer.lines.geojsonProperties
        );
    }

    private static processPolygons(
        multiPolygons: number[][][][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        geometryBuffer: Map<number, GeometryData>,
        isPolygonOutlines: boolean,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, geometryBuffer);
        buffer.type = isPolygonOutlines ? "outline" : "polygon";

        for (const polygons of multiPolygons) {
            const vertices: number[] = [];
            const holes: number[] = [];
            for (const polygon of polygons) {
                if (polygon[0] === null || typeof polygon[0][0] !== "number") {
                    return;
                }
                // the first polygon in the coordinates array is the main polygon the other ones
                // are holes.
                if (vertices.length) {
                    holes.push(vertices.length / 3);
                }

                for (const point of polygon) {
                    this.m_cached_geoCoord.latitude = point[1];
                    this.m_cached_geoCoord.longitude = point[0];

                    projection
                        .projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord)
                        .sub(center);

                    // polygon issue fix
                    if (point[0] >= 180) {
                        this.m_cached_worldCoord.x = this.m_cached_worldCoord.x * -1;
                    }

                    vertices.push(
                        this.m_cached_worldCoord.x,
                        this.m_cached_worldCoord.y,
                        this.m_cached_worldCoord.z
                    );
                }
            }
            buffer.polygons.push({ vertices, holes, geojsonProperties });
        }
    }

    private static processLineLabels(
        lines: number[][][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        labelProperty: string,
        textPathGeometryBuffer: Map<number, GeometryData>,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, textPathGeometryBuffer);
        buffer.type = "text-path";
        buffer.labelProperty = labelProperty;

        const vertices: number[] = [];
        for (const line of lines) {
            for (const point of line) {
                this.m_cached_geoCoord.latitude = point[1];
                this.m_cached_geoCoord.longitude = point[0];
                projection
                    .projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord)
                    .sub(center);

                vertices.push(
                    this.m_cached_worldCoord.x,
                    this.m_cached_worldCoord.y,
                    this.m_cached_worldCoord.z
                );
            }
        }
        buffer.lines.vertices.push(vertices);
        buffer.lines.geojsonProperties.push(geojsonProperties);
    }

    private static processMultiPolygonLabels(
        multiPolygon: number[][][][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        labelProperty: string,
        textGeometryBuffer: Map<number, GeometryData>,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, textGeometryBuffer);
        buffer.type = "point";
        buffer.labelProperty = labelProperty;

        const points = { x: [] as number[], y: [] as number[], z: [] as number[] };
        for (const polygons of multiPolygon) {
            for (const polygon of polygons) {
                for (const point of polygon) {
                    this.m_cached_geoCoord.latitude = point[1];
                    this.m_cached_geoCoord.longitude = point[0];

                    projection
                        .projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord)
                        .sub(center);

                    points.x.push(this.m_cached_worldCoord.x);
                    points.y.push(this.m_cached_worldCoord.y);
                    points.z.push(this.m_cached_worldCoord.z);
                }
            }
        }

        const length = points.x.length;

        this.m_cached_worldCoord.setX(points.x.reduce((a, b) => a + b) / length);
        this.m_cached_worldCoord.setY(points.y.reduce((a, b) => a + b) / length);
        this.m_cached_worldCoord.setZ(points.z.reduce((a, b) => a + b) / length);

        buffer.points.vertices.push(
            this.m_cached_worldCoord.x,
            this.m_cached_worldCoord.y,
            this.m_cached_worldCoord.z
        );
        buffer.points.geojsonProperties.push(geojsonProperties);
    }

    private static processPointLabels(
        textLocations: number[][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        labelProperty: string,
        textGeometryBuffer: Map<number, GeometryData>,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, textGeometryBuffer);
        buffer.type = "text";
        buffer.labelProperty = labelProperty;

        for (const location of textLocations) {
            this.m_cached_geoCoord.latitude = location[1];
            this.m_cached_geoCoord.longitude = location[0];

            projection.projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord).sub(center);
            buffer.points.vertices.push(
                this.m_cached_worldCoord.x,
                this.m_cached_worldCoord.y,
                this.m_cached_worldCoord.z
            );
            const pointIndex = buffer.points.vertices.length / 3 - 1;
            buffer.points.geojsonProperties[pointIndex] = geojsonProperties;
        }
    }

    private static processPois(
        poiLocations: number[][],
        center: THREE.Vector3,
        projection: Projection,
        techniqueIndex: number,
        poiGeometryBuffer: Map<number, GeometryData>,
        geojsonProperties: AttributeMap = {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex, poiGeometryBuffer);
        buffer.type = "poi";

        for (const location of poiLocations) {
            this.m_cached_geoCoord.latitude = location[1];
            this.m_cached_geoCoord.longitude = location[0];

            projection.projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord).sub(center);
            buffer.points.vertices.push(
                this.m_cached_worldCoord.x,
                this.m_cached_worldCoord.y,
                this.m_cached_worldCoord.z
            );
            const pointIndex = buffer.points.vertices.length / 3 - 1;
            buffer.points.geojsonProperties[pointIndex] = geojsonProperties;
        }
    }

    private static findTechniqueIndices(
        feature: Feature,
        envType: Value,
        styleSetEvaluator: StyleSetEvaluator
    ): number[] {
        const featureDetails: FeatureDetails = Flattener.flatten(feature.properties, "properties");
        featureDetails.featureId = feature.id;
        const env = new MapEnv({ type: envType, ...(featureDetails as ValueMap) });
        const techniques = styleSetEvaluator.getMatchingTechniques(env);
        return techniques.map(technique => {
            return technique._index;
        });
    }

    private static addTileInfo(
        extendedTile: ExtendedTile,
        techniques: IndexedTechnique[],
        lines: number[][],
        featureId: number,
        env: MapEnv,
        geojsonProperties: Array<{} | undefined>
    ) {
        if (geojsonProperties.length !== lines.length) {
            logger.error("geojsonProperties and lines should have the same lenght");
            return;
        }
        const tileInfoWriter = extendedTile.writer;

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }
            const infoTileTechniqueIndex = tileInfoWriter.addTechnique(technique);

            let currentGeoJsonIndex = 0;
            for (const aLine of lines) {
                // add the geoJsonProperties for this line. undefined values are accepted as some
                // line may not have any data.
                const lineFeatureGroup = extendedTile.info.lineGroup as LineFeatureGroup;
                if (lineFeatureGroup.userData === undefined) {
                    lineFeatureGroup.userData = [geojsonProperties[currentGeoJsonIndex]];
                } else {
                    lineFeatureGroup.userData.push(geojsonProperties[currentGeoJsonIndex]);
                }

                currentGeoJsonIndex++;

                const featureText = ExtendedTileInfo.getFeatureText(env, technique);
                tileInfoWriter.addFeature(
                    extendedTile.info.lineGroup,
                    env,
                    featureId,
                    featureText,
                    infoTileTechniqueIndex,
                    FeatureGroupType.Line
                );

                tileInfoWriter.addFeaturePoints(extendedTile.info.lineGroup, aLine);
            }

            if (this.m_gatherRoadSegments) {
                const segmentId = env.lookup("segmentId") as number;
                if (segmentId !== undefined) {
                    const startOffset = env.lookup("startOffset");
                    const endOffset = env.lookup("endOffset");
                    tileInfoWriter.addRoadSegments(
                        extendedTile.info.lineGroup,
                        segmentId,
                        startOffset !== undefined ? (startOffset as number) : 0,
                        endOffset !== undefined ? (endOffset as number) : 1
                    );
                }
            }
        }
    }

    private static findOrCreateGeometryBuffer(
        index: number,
        geometryBuffer: Map<number, GeometryData>
    ): GeometryData {
        let buffer = geometryBuffer.get(index);
        if (buffer !== undefined) {
            return buffer;
        }
        buffer = new GeometryData();
        geometryBuffer.set(index, buffer);
        return buffer;
    }
}
