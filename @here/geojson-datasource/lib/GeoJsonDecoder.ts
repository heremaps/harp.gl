/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/** @module @here/geojson-datasource **/ /***/

import {
    DecodedTile,
    Geometry,
    GeometryType,
    Group,
    InterleavedBufferAttribute,
    isFillTechnique,
    isPointTechnique,
    isSegmentsTechnique,
    SolidLineTechnique,
    StyleSetEvaluator,
    Technique
} from "@here/datasource-protocol";
import { MapEnv, Value } from "@here/datasource-protocol/lib/Theme";
import { GeoCoordinates, Projection, TileKey, webMercatorTilingScheme } from "@here/geoutils";
import { LINE_VERTEX_ATTRIBUTE_DESCRIPTORS, Lines } from "@here/lines";
import { ThemedTileDecoder } from "@here/mapview-decoder";
import { TileDecoderService } from "@here/mapview-decoder/lib/TileDecoderService";
import { LoggerManager } from "@here/utils";
import earcut from "earcut";
import * as THREE from "three";
import { Feature, FeatureDetails, GeoJsonDataType } from "./GeoJsonDataType";
import { Flattener } from "./utils/Flattener";

const geojsonDecoderLogger = LoggerManager.instance.create("GeoJson-Decoder");

/**
 *
 */
class MeshBuffer {
    readonly positions: number[] = [];
    readonly indices: number[] = [];
    readonly groups: Group[] = [];
    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    readonly featureStarts: number[] = [];
    /**
     * Optional list of feature IDs. Currently only Number is supported, will fail if features have
     * IDs with type Long.
     */
    readonly featureIds: Array<number | undefined> = [];
    /**
     * Optional object containing the geojson properties defined by the end-user.
     */
    readonly geojsonProperties: Array<{} | undefined> = [];
}

/**
 *
 */
class GeometryData {
    type: string | undefined;
    points: number[] = [];
    lines: number[][] = [];
    polygons: Polygons[] = [];
}

/**
 *
 */
interface Polygons {
    vertices: number[];
    holes: number[];
    geojsonProperties?: {};
}

/**
 *
 */
export interface GeoJsonDecodedTile extends DecodedTile {
    tileMortonCode: number;
}

/**
 *
 */
export interface GeoJsonGeometry extends Geometry {
    type: GeometryType;
    objInfos?: Array<{} | undefined>;
}

/**
 * `GeoJsonTileDecoder` is used to decode GeoJSON data and create geometries with additional
 * properties ready for use by [[GeoJsonTile]]. In case a custom styling is present
 * in the GeoJSON data, additional techniques will be created. Each decoded GeoJSON feature is
 * represented as a `Point`, a `Line` or a `Polygon`.
 *
 * The following techniques used for that:
 * <br/>
 * Point: `point` (THREE.PointsMaterial)
 * <br/>
 * Line: `solid-line` (SolidLineMaterial),
 * `segments` (THREE.LineBasicMaterial) - invisible lines for raycasting)
 * <br/>
 * Polygon: `polygon` (THREE.MeshBasicMaterial),
 * `segments` (THREE.LineBasicMaterial) - lines for styling polygon edges
 *
 * To improve performance, objects of the same type and technique are merged into the same geometry.
 */
export class GeoJsonTileDecoder extends ThemedTileDecoder {
    /**
     * Default constructor.
     *
     * @param m_projection Desired map projection.
     * @param m_evaluator Theme evaluator.
     */
    constructor() {
        super();
    }

    /**
     *
     */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     *
     * @param data
     * @param tileKey
     * @param styleSetEvaluator
     * @param projection
     */
    decodeThemedTile(
        data: GeoJsonDataType,
        tileKey: TileKey,
        styleSetEvaluator: StyleSetEvaluator,
        projection: Projection
    ): Promise<DecodedTile> {
        const decoder = new GeoJsonDecoder(projection, styleSetEvaluator);
        const decodedTile = decoder.getDecodedTile(tileKey, data);

        return Promise.resolve(decodedTile);
    }
}

/**
 *
 */
class GeoJsonDecoder {
    private m_center: THREE.Vector3 = new THREE.Vector3();
    private readonly m_geometries: GeoJsonGeometry[] = [];
    private readonly m_geometryBuffer = new Map<number, GeometryData>();

    /**
     * Default constructor.
     *
     * @param m_projection MapView projection
     * @param m_styleSetEvaluator theme evaluator
     */
    constructor(
        private readonly m_projection: Projection,
        private m_styleSetEvaluator: StyleSetEvaluator
    ) {}

    /**
     * Returns a `DecodedTile` with geometries ([[GeoJsonGeometry]]) and techniques.
     *
     * @returns decoded tile
     */
    getDecodedTile(tileKey: TileKey, data: GeoJsonDataType): DecodedTile {
        this.m_center = this.getTileCenter(tileKey);
        this.processGeoJson(data);
        return {
            geometries: this.m_geometries,
            techniques: this.m_styleSetEvaluator.techniques
        };
    }

    /**
     * Processes the GeoJSON.
     *
     * @param data source GeoJSON data
     */
    private processGeoJson(data: GeoJsonDataType): void {
        switch (data.type) {
            case "Feature":
                this.processFeature(data);
                break;
            case "FeatureCollection":
                data.features.forEach(feature => this.processFeature(feature));
                break;
            default:
                const collectionFeature: Feature = {
                    type: "Feature",
                    geometry: data
                };
                this.processFeature(collectionFeature);
                break;
        }

        this.createGeometry();
    }

    /**
     * Processes GeoJSON "Feature" and "GeometryCollection" objects.
     *
     * @param feature source Feature data
     */
    private processFeature(feature: Feature): void {
        // Skip features without geometries.
        if (feature.geometry === null) {
            return;
        }

        let techniqueIndex: number;

        switch (feature.geometry.type) {
            case "Point":
                techniqueIndex = this.findOrCreateTechniqueIndex(feature, "point");
                this.processPoint([feature.geometry.coordinates], techniqueIndex);
                break;

            case "MultiPoint":
                techniqueIndex = this.findOrCreateTechniqueIndex(feature, "point");
                this.processPoint(feature.geometry.coordinates, techniqueIndex);
                break;

            case "LineString":
                techniqueIndex = this.findOrCreateTechniqueIndex(feature, "line");
                this.processLineString([feature.geometry.coordinates], techniqueIndex);
                break;

            case "MultiLineString":
                techniqueIndex = this.findOrCreateTechniqueIndex(feature, "line");
                this.processLineString(feature.geometry.coordinates, techniqueIndex);
                break;

            case "Polygon":
                techniqueIndex = this.findOrCreateTechniqueIndex(feature, "polygon");
                this.processPolygon(
                    [feature.geometry.coordinates],
                    techniqueIndex,
                    feature.properties
                );
                break;

            case "MultiPolygon":
                techniqueIndex = this.findOrCreateTechniqueIndex(feature, "polygon");
                this.processPolygon(
                    feature.geometry.coordinates,
                    techniqueIndex,
                    feature.properties
                );
                break;

            case "GeometryCollection":
                feature.geometry.geometries.forEach(geometry => {
                    const collectionFeature: Feature = {
                        type: "Feature",
                        properties: feature.properties,
                        geometry
                    };
                    this.processFeature(collectionFeature);
                });
                break;

            default:
                geojsonDecoderLogger.warn("Invalid GeoJSON data. Unknown geometry type.");
        }
    }

    /**
     * Processes the GeoJSON's "Point" and "MultiPoint" objects.
     *
     * @param coordinates Array containing coordinates.
     * @param techniqueIndex Technique index to render geometry.
     */
    private processPoint(coordinates: number[][], techniqueIndex: number): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex);
        buffer.type = "point";

        coordinates.forEach(point => {
            const geoCoord = new GeoCoordinates(point[1], point[0]);
            const worldCoord = new THREE.Vector3();
            this.m_projection.projectPoint(geoCoord, worldCoord).sub(this.m_center);

            buffer.points.push(worldCoord.x, worldCoord.y, worldCoord.z);
        });
    }

    /**
     * Processes the GeoJSON's "LineString" and "MultiLineString" objects.
     *
     * @param coordinates Array containing line coordinates.
     * @param techniqueIndex Technique index to use for the geometry rendering.
     */
    private processLineString(coordinates: number[][][], techniqueIndex: number): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex);
        buffer.type = "solid-line";

        coordinates.forEach(line => {
            const vertices: number[] = [];
            line.forEach(point => {
                if (point === null || point[0] === null || point[0] === undefined) {
                    return;
                }

                const geoCoord = new GeoCoordinates(point[1], point[0]);
                const worldCoord = new THREE.Vector3();

                this.m_projection.projectPoint(geoCoord, worldCoord).sub(this.m_center);

                vertices.push(worldCoord.x, worldCoord.y);
            });
            buffer.lines.push(vertices);
        });
    }

    /**
     * Processes GeoJSON "Polygon" and "MultiPolygon" objects.
     *
     * @param coordinates array containing line coordinates
     * @param techniqueIndex technique index to render geometry fill
     * @param geojsonProperties object containing the custom properties defined by the user
     */
    private processPolygon(
        coordinates: number[][][][],
        techniqueIndex: number,
        geojsonProperties?: {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex);
        buffer.type = "polygon";

        coordinates.forEach(polygons => {
            const vertices: number[] = [];
            const holes: number[] = [];
            polygons.forEach(polygon => {
                if (polygon[0] === null || typeof polygon[0][0] !== "number") {
                    return;
                }
                if (vertices.length) {
                    holes.push(vertices.length / 2);
                }

                polygon.forEach(point => {
                    const geoCoord = new GeoCoordinates(point[1], point[0]);
                    const vertex = new THREE.Vector3();

                    this.m_projection.projectPoint(geoCoord, vertex).sub(this.m_center);

                    // polygon issue fix
                    if (point[0] >= 180) {
                        vertex.x = vertex.x * -1;
                    }

                    vertices.push(vertex.x, vertex.y);
                });
            });
            buffer.polygons.push({ vertices, holes, geojsonProperties });
        });
    }

    /**
     * Creates a geometry from the previously filled in buffers.
     */
    private createGeometry(): void {
        this.m_geometryBuffer.forEach((geometryData, technique) => {
            switch (geometryData.type) {
                case "point":
                    this.createPointGeometry(technique, geometryData);
                    break;
                case "solid-line":
                    this.createSolidLineGeometry(technique, geometryData);
                    break;
                case "polygon":
                    this.createPolygonGeometry(technique, geometryData);
                    break;
                case "segments":
                    this.createSegmentsGeometry(technique, geometryData);
                    break;
            }
        });
    }

    /**
     * Creates points geometry. All points with the same technique are batched as one geometry.
     *
     * @param technique Technique number.
     * @param geometryData Geometry data.
     */
    private createPointGeometry(technique: number, geometryData: GeometryData): void {
        const geometry: GeoJsonGeometry = {
            type: GeometryType.Point,
            vertexAttributes: [
                {
                    name: "position",
                    buffer: new Float32Array(geometryData.points).buffer as ArrayBuffer,
                    itemCount: 3,
                    type: "float"
                }
            ],
            groups: [
                {
                    start: 0,
                    count: 0,
                    technique
                }
            ]
        };
        this.m_geometries.push(geometry);
    }

    /**
     * Creates solid line geometry. All lines with the same technique are batched as one geometry.
     *
     * @param technique Technique number.
     * @param geometryData Geometry data.
     */
    private createSolidLineGeometry(technique: number, geometryData: GeometryData): void {
        const lines = new Lines();
        const positions = new Array<number>();

        geometryData.lines.forEach(linePositions => {
            lines.add(linePositions);
            positions.push.apply(positions, linePositions);
        });

        const { vertices, indices } = lines;
        const buffer = new Float32Array(vertices).buffer as ArrayBuffer;
        const index = new Uint32Array(indices).buffer as ArrayBuffer;
        const attr: InterleavedBufferAttribute = {
            type: "float",
            stride: 12,
            buffer,
            attributes: LINE_VERTEX_ATTRIBUTE_DESCRIPTORS
        };

        const geometries: GeoJsonGeometry = {
            type: GeometryType.SolidLine,
            index: {
                buffer: index,
                itemCount: 1,
                type: "uint32",
                name: "index"
            },
            interleavedVertexAttributes: [attr],
            vertexAttributes: [
                {
                    name: "points",
                    buffer: new Float32Array(positions).buffer as ArrayBuffer,
                    itemCount: 2,
                    type: "float"
                }
            ],
            groups: [
                {
                    start: 0,
                    count: 0,
                    technique
                }
            ]
        };
        this.m_geometries.push(geometries);
    }

    /**
     * Creates polygon geometry. All polygons with the same technique are batched as one geometry.
     *
     * @param technique Technique number.
     * @param geometryData Geometry data.
     */
    private createPolygonGeometry(technique: number, geometryData: GeometryData): void {
        const meshBuffer = new MeshBuffer();
        const {
            positions,
            indices,
            groups,
            featureStarts,
            featureIds,
            geojsonProperties
        } = meshBuffer;
        geometryData.polygons.forEach(polygon => {
            const prevPolygonPositionsNum = positions.length / 3;
            featureStarts.push(indices.length / 3);

            // featureIds should be the id of the feature, but for geoJSON datasource we do not have
            // it in integers, and we do not use them. Therefore, I put zeroes.
            featureIds.push(0);
            //geoJson properties for each polygon
            geojsonProperties.push(polygon.geojsonProperties);

            for (let i = 0; i < polygon.vertices.length; i += 2) {
                positions.push(polygon.vertices[i], polygon.vertices[i + 1], 0);
            }

            const triangles = earcut(polygon.vertices, polygon.holes);

            for (let i = 0; i < triangles.length; i += 3) {
                const v1 = triangles[i];
                const v2 = triangles[i + 1];
                const v3 = triangles[i + 2];
                indices.push(
                    v1 + prevPolygonPositionsNum,
                    v2 + prevPolygonPositionsNum,
                    v3 + prevPolygonPositionsNum
                );
            }
        });

        if (indices.length > 0) {
            groups.push({
                start: 0,
                count: indices.length,
                technique
            });
        }

        const geometry: GeoJsonGeometry = {
            type: GeometryType.Polygon,
            vertexAttributes: [
                {
                    name: "position",
                    buffer: new Float32Array(meshBuffer.positions).buffer as ArrayBuffer,
                    itemCount: 3,
                    type: "float"
                }
            ],
            groups: meshBuffer.groups
        };

        if (meshBuffer.indices.length > 0) {
            geometry.index = {
                name: "index",
                buffer: new Uint32Array(meshBuffer.indices).buffer as ArrayBuffer,
                itemCount: 1,
                type: "uint32"
            };
            geometry.featureStarts = meshBuffer.featureStarts;
            geometry.featureIds = meshBuffer.featureIds;
            geometry.objInfos = meshBuffer.geojsonProperties;
        }

        this.m_geometries.push(geometry);
    }

    /**
     * Creates segments geometry used for polygon borders and invisible lines for raycasting. All
     * segment lines with the same technique created as one geometry.
     *
     * @param technique Technique number.
     * @param geometryData Geometry data.
     */
    private createSegmentsGeometry(technique: number, geometryData: GeometryData): void {
        const geometries: GeoJsonGeometry = {
            type: GeometryType.Line,
            vertexAttributes: [
                {
                    name: "position",
                    buffer: new Float32Array(geometryData.points).buffer as ArrayBuffer,
                    itemCount: 3,
                    type: "float"
                }
            ],
            groups: [
                {
                    start: 0,
                    count: 0,
                    technique
                }
            ]
        };
        this.m_geometries.push(geometries);
    }

    /**
     * Returns a tecnhique index based on a technique name, or creates a new technique if another
     * styling is provided in the feature's properties.
     *
     * Supported properties are `radius`, `width`, `style.fill`, `style.color`.
     *
     * @param feature GeoJSON feature.
     * @param envType Technique type name.
     */
    private findOrCreateTechniqueIndex(feature: Feature, envType: Value): number {
        const featureDetails: FeatureDetails = Flattener.flatten(feature.properties, "properties");

        if (feature.id !== undefined) {
            featureDetails.featureId = feature.id;
        }

        const env = new MapEnv({ type: envType, ...featureDetails });
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);
        let techniqueIndex;

        let featureColor: THREE.Color | undefined;
        if (feature.properties !== undefined && feature.properties.style !== undefined) {
            if (envType === "polygon" && feature.properties.style.fill !== undefined) {
                featureColor = new THREE.Color(feature.properties.style.fill);
            } else if (feature.properties.style.color !== undefined) {
                featureColor = new THREE.Color(feature.properties.style.color);
            }
        }

        const featureRadius =
            envType === "point" && feature.properties && feature.properties.radius
                ? feature.properties.radius
                : undefined;
        const radiusFactor = 5;

        const featureWidth =
            feature.properties && feature.properties.width ? feature.properties.width : undefined;

        if (
            featureColor !== undefined ||
            featureRadius !== undefined ||
            featureWidth !== undefined
        ) {
            // check if we have technique with required styling in already exist
            techniques.forEach(technique => {
                let match = true;
                // color, fill
                if (
                    featureColor !== undefined &&
                    (isSegmentsTechnique(technique) ||
                        isPointTechnique(technique) ||
                        isFillTechnique(technique) ||
                        technique.name === "solid-line")
                ) {
                    const themeColor = new THREE.Color(technique.color);
                    if (
                        featureColor !== undefined &&
                        themeColor.r === featureColor.r &&
                        themeColor.g === featureColor.g &&
                        themeColor.b === featureColor.b
                    ) {
                        techniqueIndex = technique._index;
                    } else {
                        match = false;
                        techniqueIndex = undefined;
                    }
                }

                // radius
                if (featureRadius !== undefined && isPointTechnique(technique) && match === true) {
                    if (featureRadius * radiusFactor === technique.size) {
                        techniqueIndex = technique._index;
                    } else {
                        match = false;
                        techniqueIndex = undefined;
                    }
                }

                // width
                if (
                    featureWidth !== undefined &&
                    technique.name === "solid-line" &&
                    match === true
                ) {
                    if (
                        typeof (technique as SolidLineTechnique).lineWidth === "number" &&
                        (technique as SolidLineTechnique).lineWidth === featureWidth
                    ) {
                        techniqueIndex = technique._index;
                    } else {
                        match = false;
                        techniqueIndex = undefined;
                    }
                }
            });

            // if needed technique not found, create new one and upthemedate theme
            if (techniqueIndex === undefined) {
                let newStyle = this.m_styleSetEvaluator.styleSet.find(
                    style => style._index === techniques[0]._index
                );
                newStyle = JSON.parse(JSON.stringify(newStyle));
                if (newStyle !== undefined) {
                    delete newStyle._index;
                    delete newStyle._whenExpr;
                    if (newStyle.attr !== undefined) {
                        delete newStyle.attr._renderOrderAuto;
                        // tslint:disable-next-line:prefer-object-spread
                        const technique = Object.assign(
                            {},
                            // tslint:disable-next-line:no-object-literal-type-assertion
                            { name: newStyle.technique } as Technique,
                            newStyle.attr
                        );

                        if (
                            featureColor !== undefined &&
                            (isSegmentsTechnique(technique) ||
                                isPointTechnique(technique) ||
                                isFillTechnique(technique) ||
                                technique.name === "solid-line")
                        ) {
                            newStyle.attr.color = featureColor.getStyle();
                        }

                        if (featureRadius !== undefined && isPointTechnique(technique)) {
                            newStyle.attr.size = featureRadius * radiusFactor;
                        }

                        if (featureWidth !== undefined && technique.name === "solid-line") {
                            newStyle.attr.lineWidth = featureWidth;
                        }
                    }

                    this.m_styleSetEvaluator.styleSet.push(newStyle);

                    // set _index for new style
                    this.m_styleSetEvaluator.getMatchingTechniques(env);
                    techniqueIndex = newStyle._index;
                }
            }
        } else {
            // Use already exist technique in case feature properties doesn't contain specific
            // styling.
            techniqueIndex = techniques[0]._index;
        }

        if (techniqueIndex === undefined) {
            throw new Error(
                "GeoJsonDecoder#findOrCreateTechniqueIndex: Internal error - No technique index"
            );
        }

        return techniqueIndex;
    }

    /**
     * Creates a geometry buffer for the specified technique, or returns the existing one.
     *
     * @param index technique index
     */
    private findOrCreateGeometryBuffer(index: number): GeometryData {
        let buffer = this.m_geometryBuffer.get(index);
        if (buffer !== undefined) {
            return buffer;
        }
        buffer = new GeometryData();
        this.m_geometryBuffer.set(index, buffer);
        return buffer;
    }

    private getTileCenter(tileKey: TileKey) {
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        const tileBounds = this.m_projection.projectBox(geoBox, new THREE.Box3());
        const center = new THREE.Vector3();
        tileBounds.getCenter(center);
        return center;
    }
}

/**
 * Client used to decode the GeoJSON data.
 */
export default class GeoJsonWorkerClient {
    constructor(name?: string) {
        TileDecoderService.start(name ? name : "geojson", new GeoJsonTileDecoder());
    }
}
