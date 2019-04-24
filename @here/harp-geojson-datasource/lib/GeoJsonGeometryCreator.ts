/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    GeoJson,
    Geometry,
    GeometryType,
    Group,
    PoiGeometry,
    TextGeometry,
    TextPathGeometry
} from "@here/harp-datasource-protocol";
import { IMeshBuffers, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { Projection, webMercatorTilingScheme } from "@here/harp-geoutils";
import { LineGroup } from "@here/harp-lines/lib/Lines";
import { Math2D } from "@here/harp-utils";
import earcut from "earcut";
import * as THREE from "three";
import { ExtendedTile, GeoJsonParser, GeometryData, GeometryDataBuffers } from "./GeoJsonParser";

/**
 * Geometry interface that stores the geometry type and the user data.
 */
interface GeoJsonGeometry extends Geometry {
    type: GeometryType;
    objInfos?: Array<{} | undefined>;
}

/**
 * Geometry interface that stores the geometry type and the user data for a POI.
 */
export interface GeoJsonPoiGeometry extends PoiGeometry {
    objInfos?: Array<{} | undefined>;
}

/**
 * Geometry interface that stores the geometry type and the user data for a Text.
 */
export interface GeoJsonTextGeometry extends TextGeometry {
    objInfos?: Array<{} | undefined>;
}

/**
 * Geometry interface that stores the geometry type and the user data for a TextPath.
 */
export interface GeoJsonTextPathGeometry extends TextPathGeometry {
    objInfos?: Array<{} | undefined>;
}

/**
 * Geometries bore by a [[Tile]].
 */
export interface GeoJsonTileGeometries {
    geometries: GeoJsonGeometry[];
    poiGeometries: GeoJsonPoiGeometry[];
    textGeometries: GeoJsonTextGeometry[];
    textPathGeometries: GeoJsonTextPathGeometry[];
}

/**
 * Store temporary variables needed for the creation of a mesh.
 */
class MeshBuffer implements IMeshBuffers {
    readonly positions: number[] = [];
    readonly indices: number[] = [];
    readonly groups: Group[] = [];
    readonly outlineIndices: number[][] = [];
    readonly edgeIndices: number[] = [];
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
 * Bears the code creating the [[Tile]] geometries from a GeoJson.
 */
export class GeoJsonGeometryCreator {
    /**
     * The method to call to create geometries from a GeoJson.
     *
     * @param geojson The GeoJson data.
     * @param center The center of the tile.
     * @param projection The projection in use.
     * @param styleSetEvaluator The evaluator of the current [[GeoJsonDataSource]].
     * @param extendedTile Tile information.
     */
    static createGeometries(
        geojson: GeoJson,
        center: THREE.Vector3,
        projection: Projection,
        styleSetEvaluator: StyleSetEvaluator,
        extendedTile: ExtendedTile
    ): GeoJsonTileGeometries {
        const buffers: GeometryDataBuffers = {
            geometryBuffer: new Map<number, GeometryData>(),
            textGeometryBuffer: new Map<number, GeometryData>(),
            textPathGeometryBuffer: new Map<number, GeometryData>(),
            poiGeometryBuffer: new Map<number, GeometryData>()
        };

        GeoJsonParser.processGeoJson(
            geojson,
            extendedTile,
            center,
            projection,
            styleSetEvaluator,
            buffers
        );

        const geometries: GeoJsonTileGeometries = {
            geometries: [],
            poiGeometries: [],
            textGeometries: [],
            textPathGeometries: []
        };

        const tileWorldBounds = new THREE.Box3();
        const geoBox = webMercatorTilingScheme.getGeoBox(extendedTile.info.tileKey);
        const tileBounds = projection.projectBox(geoBox, tileWorldBounds);
        const tileCenter = new THREE.Vector3();
        tileBounds.getCenter(tileCenter);
        const tileWorldExtents = tileWorldBounds.max.sub(tileCenter).x;

        buffers.geometryBuffer.forEach((geometryData, techniqueIndex) => {
            switch (geometryData.type) {
                case "point":
                    geometries.geometries.push(
                        this.createPointGeometry(geometryData, techniqueIndex)
                    );
                    break;
                case "solid-line":
                    geometries.geometries.push(
                        this.createSolidLineGeometry(geometryData, techniqueIndex)
                    );
                    break;
                case "dashed-line":
                    geometries.geometries.push(
                        this.createSolidLineGeometry(geometryData, techniqueIndex)
                    );
                    break;
                case "polygon":
                    geometries.geometries.push(
                        this.createPolygonGeometry(geometryData, techniqueIndex)
                    );
                    break;
                case "outline":
                    geometries.geometries.push(
                        this.createPolygonOutlineGeometry(
                            geometryData,
                            techniqueIndex,
                            tileWorldExtents
                        )
                    );
                    break;
                case "segments":
                    geometries.geometries.push(
                        this.createSegmentsGeometry(geometryData, techniqueIndex)
                    );
                    break;
            }
        });
        buffers.poiGeometryBuffer.forEach((geometryData, techniqueIndex) => {
            geometries.poiGeometries.push(this.createPoiGeometry(geometryData, techniqueIndex));
        });
        buffers.textGeometryBuffer.forEach((geometryData, techniqueIndex) => {
            geometries.textGeometries.push(this.createTextGeometry(geometryData, techniqueIndex));
        });
        buffers.textPathGeometryBuffer.forEach((geometryData, techniqueIndex) => {
            this.createTextPathGeometries(geometryData, techniqueIndex, geometries);
        });

        return geometries;
    }

    private static createPoiGeometry(
        geometryData: GeometryData,
        techniqueIndex: number
    ): GeoJsonPoiGeometry {
        return {
            positions: {
                name: "position",
                type: "float",
                itemCount: 3,
                buffer: new Float32Array(geometryData.points.vertices).buffer
            },
            technique: techniqueIndex,
            texts: [0],
            objInfos: geometryData.points.geojsonProperties
        };
    }

    private static createTextGeometry(
        geometryData: GeometryData,
        techniqueIndex: number
    ): GeoJsonTextGeometry {
        const labelProperty = geometryData.labelProperty! as string;
        const stringCatalog = geometryData.points.geojsonProperties.map((properties: any) => {
            return properties[labelProperty].toString();
        });
        return {
            positions: {
                name: "position",
                type: "float",
                itemCount: 3,
                buffer: new Float32Array(geometryData.points.vertices).buffer
            },
            technique: techniqueIndex,
            texts: [0],
            stringCatalog,
            objInfos: geometryData.points.geojsonProperties
        };
    }

    private static createTextPathGeometries(
        geometryData: GeometryData,
        techniqueIndex: number,
        geometries: GeoJsonTileGeometries
    ): void {
        for (let i = 0; i < geometryData.lines.vertices.length; i++) {
            const pathVertex = geometryData.lines.vertices[i];
            const path: number[] = [];
            path.push(...pathVertex);
            const pathLengthSqr = Math2D.computeSquaredLineLength(path);
            const properties = geometryData.lines.geojsonProperties[i];
            const text = (properties as any)[geometryData.labelProperty!].toString();
            const geometry: GeoJsonTextPathGeometry = {
                technique: techniqueIndex,
                path,
                pathLengthSqr,
                text,
                objInfos: geometryData.lines.geojsonProperties
            };
            geometries.textPathGeometries.push(geometry);
        }
    }

    private static createPointGeometry(
        geometryData: GeometryData,
        techniqueIndex: number
    ): GeoJsonGeometry {
        return {
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
                    technique: techniqueIndex
                }
            ],
            objInfos: geometryData.points.geojsonProperties
        };
    }

    private static createSolidLineGeometry(
        geometryData: GeometryData,
        techniqueIndex: number
    ): GeoJsonGeometry {
        const lines = new LineGroup();
        const positions = new Array<number>();

        for (const line of geometryData.lines.vertices) {
            lines.add(line);
            positions.push(...line);
        }

        return {
            type: GeometryType.SolidLine,
            index: {
                buffer: new Uint32Array(lines.indices).buffer,
                itemCount: 1,
                type: "uint32",
                name: "index"
            },
            interleavedVertexAttributes: [
                {
                    type: "float",
                    stride: lines.stride,
                    buffer: new Float32Array(lines.vertices).buffer,
                    attributes: lines.vertexAttributes
                }
            ],
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
                    technique: techniqueIndex
                }
            ]
        };
    }

    private static createPolygonGeometry(
        geometryData: GeometryData,
        techniqueIndex: number
    ): GeoJsonGeometry {
        const meshBuffer = new MeshBuffer();
        const {
            positions,
            indices,
            groups,
            featureStarts,
            featureIds,
            geojsonProperties
        } = meshBuffer;

        const holesVertices: number[][] = [];

        for (const polygon of geometryData.polygons) {
            const baseVertex = positions.length / 3;

            // Holes, if any.
            if (polygon.holes.length) {
                for (let i = 0; i < polygon.holes.length; i++) {
                    if (i === polygon.holes.length - 1) {
                        holesVertices[i] = polygon.vertices.slice(polygon.holes[i] * 3);
                    } else {
                        holesVertices[i] = polygon.vertices.slice(
                            polygon.holes[i] * 3,
                            polygon.holes[i + 1] * 3
                        );
                    }
                }
            }

            featureStarts.push(indices.length / 3);
            // featureIds should be the id of the feature, but for geoJSON datasource we do not have
            // it in integers, and we do not use them. Therefore, zeroes are added.
            featureIds.push(0);
            geojsonProperties.push(polygon.geojsonProperties);

            for (let i = 0; i < polygon.vertices.length; i += 3) {
                positions.push(
                    polygon.vertices[i],
                    polygon.vertices[i + 1],
                    polygon.vertices[i + 2]
                );
            }

            const triangles = earcut(polygon.vertices, polygon.holes, 3);

            for (let i = 0; i < triangles.length; i += 3) {
                const v1 = triangles[i];
                const v2 = triangles[i + 1];
                const v3 = triangles[i + 2];
                indices.push(v1 + baseVertex, v2 + baseVertex, v3 + baseVertex);
            }
        }

        if (indices.length > 0) {
            groups.push({
                start: 0,
                count: indices.length,
                technique: techniqueIndex
            });
        }

        const geometry: GeoJsonGeometry = {
            type: GeometryType.Polygon,
            vertexAttributes: [
                {
                    name: "position",
                    buffer: new Float32Array(meshBuffer.positions).buffer,
                    itemCount: 3,
                    type: "float"
                }
            ],
            groups: meshBuffer.groups
        };

        if (meshBuffer.indices.length > 0) {
            geometry.index = {
                name: "index",
                buffer: new Uint32Array(meshBuffer.indices).buffer,
                itemCount: 1,
                type: "uint32"
            };
            geometry.featureStarts = meshBuffer.featureStarts;
            geometry.featureIds = meshBuffer.featureIds;
            geometry.objInfos = meshBuffer.geojsonProperties;
        }

        return geometry;
    }

    private static createPolygonOutlineGeometry(
        geometryData: GeometryData,
        techniqueIndex: number,
        tileWorldExtents: number
    ): GeoJsonGeometry {
        const meshBuffer = new MeshBuffer();
        const { indices, featureStarts, featureIds, geojsonProperties } = meshBuffer;

        let contour: number[];
        const holesVertices: number[][] = [];

        const solidOutline = new LineGroup();
        const position = new Array<number>();

        for (const polygon of geometryData.polygons) {
            contour = polygon.holes.length
                ? polygon.vertices.slice(0, polygon.holes[0] * 3)
                : polygon.vertices;

            // External ring.
            this.addOutlineVertices(contour, tileWorldExtents, solidOutline, position);

            // Holes, if any.
            if (polygon.holes.length) {
                for (let i = 0; i < polygon.holes.length; i++) {
                    if (i === polygon.holes.length - 1) {
                        holesVertices[i] = polygon.vertices.slice(polygon.holes[i] * 3);
                    } else {
                        holesVertices[i] = polygon.vertices.slice(
                            polygon.holes[i] * 3,
                            polygon.holes[i + 1] * 3
                        );
                    }

                    this.addOutlineVertices(
                        holesVertices[i],
                        tileWorldExtents,
                        solidOutline,
                        position
                    );
                }
            }

            featureStarts.push(indices.length / 3);
            // featureIds should be the id of the feature, but for geoJSON datasource we do not have
            // it in integers, and we do not use them. Therefore, zeroes are added.
            featureIds.push(0);
            geojsonProperties.push(polygon.geojsonProperties);
        }

        const geometry: GeoJsonGeometry = {
            type: GeometryType.SolidLine,
            index: {
                buffer: new Uint32Array(solidOutline.indices).buffer,
                itemCount: 1,
                type: "uint32",
                name: "index"
            },
            interleavedVertexAttributes: [
                {
                    type: "float",
                    stride: solidOutline.stride,
                    buffer: new Float32Array(solidOutline.vertices).buffer,
                    attributes: solidOutline.vertexAttributes
                }
            ],
            vertexAttributes: [
                {
                    name: "points",
                    buffer: new Float32Array(position).buffer as ArrayBuffer,
                    itemCount: 2,
                    type: "float"
                }
            ],
            groups: [
                {
                    start: 0,
                    count: 0,
                    technique: techniqueIndex
                }
            ]
        };

        if (meshBuffer.indices.length > 0) {
            geometry.index = {
                name: "index",
                buffer: new Uint32Array(meshBuffer.indices).buffer,
                itemCount: 1,
                type: "uint32"
            };
            geometry.featureStarts = meshBuffer.featureStarts;
            geometry.featureIds = meshBuffer.featureIds;
            geometry.objInfos = meshBuffer.geojsonProperties;
        }

        return geometry;
    }

    private static createSegmentsGeometry(
        geometryData: GeometryData,
        techniqueIndex: number
    ): GeoJsonGeometry {
        return {
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
                    technique: techniqueIndex
                }
            ]
        };
    }

    private static addOutlineVertices(
        contour: number[],
        tileExtents: number,
        lines: LineGroup,
        buffer: number[]
    ): void {
        let outline = [];
        for (let i = 0; i < contour.length; i += 3) {
            outline.push(contour[i], contour[i + 1], contour[i + 2]);
            if (
                (this.isOnTileBorder(contour[i], tileExtents) &&
                    this.isOnTileBorder(contour[i + 3], tileExtents)) ||
                (this.isOnTileBorder(contour[i + 1], tileExtents) &&
                    this.isOnTileBorder(contour[i + 4], tileExtents))
            ) {
                lines.add([...outline]);
                buffer.push(...outline);
                outline = [];
            }
        }
        lines.add([...outline]);
        buffer.push(...outline);
    }

    private static isOnTileBorder(value: number, extents: number): boolean {
        return extents - Math.abs(value) <= 0.01;
    }
}
