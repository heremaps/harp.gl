/** @module @here/geojson-datasource **/ /***/

import {
    DecodedTile,
    ExtendedTileInfo,
    ExtendedTileInfoWriter,
    Geometry,
    GeometryType,
    Group,
    InterleavedBufferAttribute,
    isCirclesTechnique,
    isFillTechnique,
    isSegmentsTechnique,
    isSquaresTechnique,
    LineFeatureGroup,
    SolidLineTechnique,
    StyleSetEvaluator,
    Technique
} from "@here/datasource-protocol";
import { MapEnv, Value } from "@here/datasource-protocol/lib/Theme";
import { GeoCoordinates, Projection, TileKey, webMercatorTilingScheme } from "@here/geoutils";
import { LINE_VERTEX_ATTRIBUTE_DESCRIPTORS, Lines } from "@here/lines";
import { ThemedTileDecoder } from "@here/mapview-decoder";
import { WorkerServiceManager } from "@here/mapview-decoder/index-worker";
import { TileDecoderService } from "@here/mapview-decoder/lib/TileDecoderService";
import { LoggerManager } from "@here/utils";
import earcut from "earcut";
import * as THREE from "three";
import { Feature, FeatureDetails, GeoJsonDataType } from "./GeoJsonDataType";
import { Flattener } from "./utils/Flattener";

const logger = LoggerManager.instance.create("GeoJsonDecoder");

/**
 * Store temporary variables needed for the creation of a mesh.
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
 * Store temporary variables needed for the creation of a geometry.
 */
class GeometryData {
    type: string | undefined;
    points: PointsData = { vertices: [], geojsonProperties: [undefined] };
    lines: LinesData = { vertices: [], geojsonProperties: [] };
    polygons: PolygonsData[] = [];
}

/**
 * Interface used to store vertices, holes and properties of polygons.
 */
interface PolygonsData {
    vertices: number[];
    holes: number[];
    geojsonProperties?: {};
}

/**
 * Interface used to store vertices and properties of points.
 */
interface PointsData {
    vertices: number[];
    geojsonProperties: [{} | undefined];
}

/**
 * It stores the vertices of each line. The lenght of the property `vertices` and that one of
 * `geojsonProperties` should be the same.
 */
interface LinesData {
    vertices: number[][];
    geojsonProperties: Array<{} | undefined>;
}

/**
 * Interface use to read and write from/to an [[ExtendedTile]].
 */
interface ExtendedTile {
    info: ExtendedTileInfo;
    writer: ExtendedTileInfoWriter;
}

/**
 * Interface for the GeoJsonDecodedTile.
 */
export interface GeoJsonDecodedTile extends DecodedTile {
    tileMortonCode: number;
}

/**
 * Geometry interface that stores the geometry type and the user data.
 */
export interface GeoJsonGeometry extends Geometry {
    type: GeometryType;
    objInfos?: Array<{} | undefined>;
}

/**
 * `GeoJsonTileDecoder` is used to decode GeoJSON data and create geometries with additional
 * properties ready for use by [[GeoJsonTile]]. In case a custom styling is present in the GeoJSON
 * data, additional techniques will be created. Each decoded GeoJSON feature is represented as a
 * `Point`, a `Line` or a `Polygon`.
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
     * Read the data contained in the `data` parameter and returns a [[DecodedTile]].
     *
     * @param data The [[GeoJsonDataType]] containing all the features to be processed.
     * @param tileKey The [[TileKey]] that identifies the tile.
     * @param styleSetEvaluator The [[StyleSetEvaluator]] that reads the style and apply it to the
     *      meshes.
     * @param projection The current camera projection.
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
 * Decoder for the GeoJson datasource.
 */
class GeoJsonDecoder {
    private m_center: THREE.Vector3 = new THREE.Vector3();
    private readonly m_geometries: GeoJsonGeometry[] = [];
    private readonly m_geometryBuffer = new Map<number, GeometryData>();
    private readonly m_storeExtendedTags = true;
    private readonly m_gatherRoadSegments = true;
    private m_cached_worldCoord: THREE.Vector3 = new THREE.Vector3();
    private m_cached_geoCoord: GeoCoordinates = new GeoCoordinates(0, 0);

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
        const tileInfo = new ExtendedTileInfo(tileKey, this.m_storeExtendedTags);
        const tileInfoWriter = new ExtendedTileInfoWriter(tileInfo, this.m_storeExtendedTags);

        const extendedTile = {
            info: tileInfo,
            writer: tileInfoWriter
        };
        this.processGeoJson(data, extendedTile);

        return {
            geometries: this.m_geometries,
            techniques: this.m_styleSetEvaluator.techniques,
            tileInfo: this.getTileInfo(extendedTile)
        };
    }

    /**
     * Processes the GeoJSON.
     *
     * @param data source GeoJSON data
     */
    private processGeoJson(data: GeoJsonDataType, extendedTile: ExtendedTile): void {
        switch (data.type) {
            case "Feature":
                this.processFeature(data, extendedTile);
                break;
            case "FeatureCollection":
                data.features.forEach(feature => this.processFeature(feature, extendedTile));
                break;
            default:
                const collectionFeature: Feature = {
                    type: "Feature",
                    geometry: data
                };
                this.processFeature(collectionFeature, extendedTile);
                break;
        }

        this.createGeometry();
    }

    /**
     * Processes GeoJSON "Feature" and "GeometryCollection" objects.
     *
     * @param feature source Feature data
     */
    private processFeature(feature: Feature, extendedTile: ExtendedTile): void {
        // Skip features without geometries.
        if (feature.geometry === null) {
            return;
        }

        let techniqueIndices: number[] = [];
        switch (feature.geometry.type) {
            case "Point":
                techniqueIndices = this.findOrCreateTechniqueIndices(feature, "point");
                for (const techniqueIndex of techniqueIndices) {
                    this.processPoint(
                        [feature.geometry.coordinates],
                        techniqueIndex,
                        feature.properties
                    );
                }
                break;

            case "MultiPoint":
                techniqueIndices = this.findOrCreateTechniqueIndices(feature, "point");
                for (const techniqueIndex of techniqueIndices) {
                    this.processPoint(
                        feature.geometry.coordinates,
                        techniqueIndex,
                        feature.properties
                    );
                }
                break;

            case "LineString":
                techniqueIndices = this.findOrCreateTechniqueIndices(feature, "line");
                for (const techniqueIndex of techniqueIndices) {
                    this.processLineString(
                        extendedTile,
                        [feature.geometry.coordinates],
                        techniqueIndex,
                        feature.id,
                        feature.properties
                    );
                }
                break;

            case "MultiLineString":
                techniqueIndices = this.findOrCreateTechniqueIndices(feature, "line");
                for (const techniqueIndex of techniqueIndices) {
                    this.processLineString(
                        extendedTile,
                        feature.geometry.coordinates,
                        techniqueIndex,
                        feature.id,
                        feature.properties
                    );
                }
                break;

            case "Polygon":
                techniqueIndices = this.findOrCreateTechniqueIndices(feature, "polygon");
                for (const techniqueIndex of techniqueIndices) {
                    this.processPolygon(
                        [feature.geometry.coordinates],
                        techniqueIndex,
                        feature.properties
                    );
                }
                break;

            case "MultiPolygon":
                techniqueIndices = this.findOrCreateTechniqueIndices(feature, "polygon");
                for (const techniqueIndex of techniqueIndices) {
                    this.processPolygon(
                        feature.geometry.coordinates,
                        techniqueIndex,
                        feature.properties
                    );
                }
                break;

            case "GeometryCollection":
                feature.geometry.geometries.forEach(geometry => {
                    const collectionFeature: Feature = {
                        type: "Feature",
                        properties: feature.properties,
                        geometry
                    };
                    this.processFeature(collectionFeature, extendedTile);
                });
                break;

            default:
                logger.warn("Invalid GeoJSON data. Unknown geometry type.");
        }
    }

    /**
     * Processes the GeoJSON's "Point" and "MultiPoint" objects.
     *
     * @param coordinates Array containing coordinates.
     * @param techniqueIndex Technique index to render geometry.
     * @param geojsonProperties Object containing the properties defined by the user.
     */
    private processPoint(
        coordinates: number[][],
        techniqueIndex: number,
        geojsonProperties?: {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex);
        buffer.type = "point";

        coordinates.forEach(point => {
            this.m_cached_geoCoord.latitude = point[1];
            this.m_cached_geoCoord.longitude = point[0];

            this.m_projection
                .projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord)
                .sub(this.m_center);
            buffer.points.vertices.push(
                this.m_cached_worldCoord.x,
                this.m_cached_worldCoord.y,
                this.m_cached_worldCoord.z
            );
            const pointIndex = buffer.points.vertices.length / 3 - 1;
            buffer.points.geojsonProperties[pointIndex] = geojsonProperties;
        });
    }

    /**
     * Processes the GeoJSON's "LineString" and "MultiLineString" objects.
     *
     * @param coordinates Array containing line coordinates.
     * @param techniqueIndex Technique index to use for the geometry rendering.
     * @param geojsonProperties Object containing the custom properties defined by the user
     */
    private processLineString(
        extendedTile: ExtendedTile,
        coordinates: number[][][],
        techniqueIndex: number,
        featureId?: string,
        geojsonProperties?: {}
    ): void {
        const buffer = this.findOrCreateGeometryBuffer(techniqueIndex);
        buffer.type = "solid-line";

        coordinates.forEach(line => {
            buffer.lines.geojsonProperties.push(geojsonProperties);
            const vertices: number[] = [];
            line.forEach(point => {
                if (point === null || point[0] === null || point[0] === undefined) {
                    return;
                }
                this.m_cached_geoCoord.latitude = point[1];
                this.m_cached_geoCoord.longitude = point[0];
                this.m_projection
                    .projectPoint(this.m_cached_geoCoord, this.m_cached_worldCoord)
                    .sub(this.m_center);
                vertices.push(this.m_cached_worldCoord.x, this.m_cached_worldCoord.y);
            });

            buffer.lines.vertices.push(vertices);
        });

        const featureDetails: FeatureDetails = {};
        if (featureId !== undefined) {
            featureDetails.featureId = featureId;
        }

        const env = new MapEnv({ type: "line", ...featureDetails });
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);
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

    private addTileInfo(
        extendedTile: ExtendedTile,
        techniques: Technique[],
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

                tileInfoWriter.addFeature(
                    extendedTile.info.lineGroup,
                    technique,
                    env,
                    featureId,
                    infoTileTechniqueIndex,
                    false
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

    private getTileInfo(extendedTile: ExtendedTile): ExtendedTileInfo {
        extendedTile.writer.finish();
        return extendedTile.info;
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
                    this.m_cached_geoCoord.latitude = point[1];
                    this.m_cached_geoCoord.longitude = point[0];
                    const vertex = new THREE.Vector3();

                    this.m_projection
                        .projectPoint(this.m_cached_geoCoord, vertex)
                        .sub(this.m_center);

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
                    buffer: new Float32Array(geometryData.points.vertices).buffer as ArrayBuffer,
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
        geometry.objInfos = geometryData.points.geojsonProperties;
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
        geometryData.lines.vertices.forEach(linePositions => {
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
                    buffer: new Float32Array(geometryData.points.vertices).buffer as ArrayBuffer,
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
    private findOrCreateTechniqueIndices(feature: Feature, envType: Value): number[] {
        const techniqueIndices: Array<number | undefined> = [];

        const featureDetails: FeatureDetails = Flattener.flatten(feature.properties, "properties");

        if (feature.id !== undefined) {
            featureDetails.featureId = feature.id;
        }

        const env = new MapEnv({ type: envType, ...featureDetails });
        const techniques = this.m_styleSetEvaluator.getMatchingTechniques(env);

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
            for (const technique of techniques) {
                let match = true;
                // color, fill
                if (
                    featureColor !== undefined &&
                    (isSegmentsTechnique(technique) ||
                        isCirclesTechnique(technique) ||
                        isSquaresTechnique(technique) ||
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
                        techniqueIndices.push(technique._index);
                    } else {
                        match = false;
                    }
                }

                // radius
                if (
                    featureRadius !== undefined &&
                    (isCirclesTechnique(technique) || isSquaresTechnique(technique)) &&
                    match === true
                ) {
                    if (featureRadius * radiusFactor === technique.size) {
                        techniqueIndices.push(technique._index);
                    } else {
                        match = false;
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
                        techniqueIndices.push(technique._index);
                    } else {
                        match = false;
                    }
                }
            }
        } else {
            // Use already existing techniques in case the feature's properties don't contain
            // styling information.
            for (const technique of techniques) {
                techniqueIndices.push(technique._index);
            }
        }

        for (const techniqueIndex of techniqueIndices) {
            if (techniqueIndex === undefined) {
                throw new Error(
                    "GeoJsonDecoder#findOrCreateTechniqueIndex: Internal error - No technique index"
                );
            }
        }

        return techniqueIndices as number[];
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
 * GeoJson tile decoder service.
 */
export class GeoJsonTileDecoderService {
    /**
     * Register GeoJson tile decoder service based on [[GeoJsonTileDecoder]] service class in
     * [[WorkerServiceManager]].
     */
    static start() {
        WorkerServiceManager.getInstance().register({
            serviceType: "geojson-tile-decoder",
            factory: (serviceId: string) =>
                TileDecoderService.start(serviceId, new GeoJsonTileDecoder())
        });
    }
}

/**
 * Starts an OMV decoder service.
 *
 * @deprecated Please use [[GeoJsonTileDecoderService.start]].
 */
export class GeoJsonWorkerClient {
    // TODO(HARP-3651): remove this class when clients are ready
    constructor() {
        logger.warn(
            "GeoJsonWorkerClient class is deprecated, please use GeoJsonTileDecoderService.start"
        );
        GeoJsonTileDecoderService.start();
    }
}
