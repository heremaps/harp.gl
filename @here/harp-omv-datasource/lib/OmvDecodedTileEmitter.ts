/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute,
    DecodedTile,
    ExtrudedPolygonTechnique,
    FillTechnique,
    Geometry,
    GeometryType,
    getPropertyValue,
    Group,
    IndexedTechnique,
    InterleavedBufferAttribute,
    isDashedLineTechnique,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isLineMarkerTechnique,
    isLineTechnique,
    isPoiTechnique,
    isSolidLineTechnique,
    isStandardTechnique,
    isStandardTexturedTechnique,
    isTextTechnique,
    LineMarkerTechnique,
    PoiGeometry,
    PoiTechnique,
    Technique,
    TextGeometry,
    TextPathGeometry,
    TextTechnique
} from "@here/harp-datasource-protocol";
import {
    addExtrudedWalls,
    addPolygonEdges,
    IMeshBuffers,
    MapEnv,
    StyleSetEvaluator,
    Value
} from "@here/harp-datasource-protocol/index-decoder";
import { LineGroup, triangulateLine } from "@here/harp-lines";
import { assert, LoggerManager, Math2D } from "@here/harp-utils";
import earcut from "earcut";
import * as THREE from "three";

import { GeoCoordinates } from "@here/harp-geoutils";
import { ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { LinesGeometry } from "./OmvDataSource";
import { IOmvEmitter, OmvDecoder, Ring } from "./OmvDecoder";

const logger = LoggerManager.instance.create("OmvDecodedTileEmitter");

const tempTileOrigin = new THREE.Vector3();
const tempVertOrigin = new THREE.Vector3();

/**
 * Minimum number of pixels per character. Used during estimation if there is enough screen space
 * available to render a text. Based on the estimated screen size of a tile.
 */
const MIN_AVERAGE_CHAR_WIDTH = 5;

/**
 * Estimation "fudge factor", tweaking the size estimation to
 *
 * a) allow room for zooming in to the tile, and
 *
 * b) allow for some tilting, where the edge of a tile closer to the camera has more space.
 *
 * Useful values are between 0 (allow all labels), 0.5 (allow labels at twice the default display
 * size of the tile) and 1.0 (skip labels that would normally not be displayed at default tile
 * size).
 */
const SIZE_ESTIMATION_FACTOR = 0.5;

/**
 * Used to identify an invalid (or better: unused) array index.
 */
const INVALID_ARRAY_INDEX = -1;
// for tilezen by default extrude all buildings even those without height data
class MeshBuffers implements IMeshBuffers {
    readonly positions: number[] = [];
    readonly textureCoordinates: number[] = [];
    readonly colors: number[] = [];
    readonly indices: number[] = [];
    readonly edgeIndices: number[] | number[][] = [];
    readonly groups: Group[] = [];
    readonly texts: number[] = [];
    readonly pathLengths: number[] = [];
    readonly stringCatalog: Array<string | undefined> = [];
    readonly imageTextures: number[] = [];

    /**
     * Optional list of feature IDs. Currently only Number is supported, will fail if features have
     * IDs with type Long.
     */
    readonly featureIds: Array<number | undefined> = [];

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    readonly featureStarts: number[] = [];

    constructor(readonly type: GeometryType) {}

    addText(text: string) {
        let index = this.stringCatalog.indexOf(text);

        if (index < 0) {
            index = this.stringCatalog.length;
            this.stringCatalog.push(text);
        }
        return index;
    }
}

export enum LineType {
    Simple,
    Complex
}

export class OmvDecodedTileEmitter implements IOmvEmitter {
    // mapping from style index to mesh buffers
    private readonly m_meshBuffers = new Map<number, MeshBuffers>();

    private readonly m_geometries: Geometry[] = [];
    private readonly m_textGeometries: TextGeometry[] = [];
    private readonly m_textPathGeometries: TextPathGeometry[] = [];
    private readonly m_poiGeometries: PoiGeometry[] = [];
    private readonly m_simpleLines: LinesGeometry[] = [];
    private readonly m_solidLines: LinesGeometry[] = [];
    private readonly m_dashedLines: LinesGeometry[] = [];

    private readonly m_sources: string[] = [];

    constructor(
        private readonly m_decodeInfo: OmvDecoder.DecodeInfo,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_gatherFeatureIds: boolean,
        private readonly m_skipShortLabels: boolean,
        private readonly m_languages?: string[]
    ) {}

    /**
     * Creates the Point of Interest geometries for the given feature.
     *
     * @param layer Tile's layer to be processed.
     * @param feature The current feature containing the main geometry.
     * @param env The [[MapEnv]] containing the environment information for the map.
     * @param techniques The array of [[Technique]] that will be applied to the geometry.
     * @param featureId The id of the feature.
     */
    processPointFeature(
        layer: string,
        geometry: GeoCoordinates[],
        env: MapEnv,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        this.processFeatureCommon(env);

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const techniqueIndex = technique._index;
            const meshBuffers = this.findOrCreateMeshBuffers(techniqueIndex, GeometryType.Point);

            if (meshBuffers === undefined) {
                continue;
            }

            const { positions, texts, featureIds, imageTextures } = meshBuffers;

            const shouldCreateTextGeometries =
                isTextTechnique(technique) || isPoiTechnique(technique);

            let imageTexture: string | undefined;
            const wantsPoi = isPoiTechnique(technique);

            if (wantsPoi) {
                const poiTechnique = technique as PoiTechnique;
                imageTexture = poiTechnique.imageTexture;

                if (typeof poiTechnique.poiName === "string") {
                    imageTexture = poiTechnique.poiName;
                } else if (typeof poiTechnique.poiNameField === "string") {
                    const poiNameFieldValue = env.lookup(poiTechnique.poiNameField);
                    imageTexture = poiNameFieldValue as string;
                } else if (typeof poiTechnique.imageTextureField === "string") {
                    const imageTextureValue = env.lookup(poiTechnique.imageTextureField);
                    imageTexture = imageTextureValue as string;
                    if (typeof poiTechnique.imageTexturePrefix === "string") {
                        imageTexture = poiTechnique.imageTexturePrefix + imageTexture;
                    }
                    if (typeof poiTechnique.imageTexturePostfix === "string") {
                        imageTexture = imageTexture + poiTechnique.imageTexturePostfix;
                    }
                }
            }

            const worldPos = new THREE.Vector3();

            for (const geoPoint of geometry) {
                const { x, y, z } = this.m_decodeInfo.projection
                    .projectPoint(geoPoint, worldPos)
                    .sub(this.m_decodeInfo.center);
                if (shouldCreateTextGeometries) {
                    const textTechnique = technique as TextTechnique;
                    const textLabel = textTechnique.label;
                    const useAbbreviation = textTechnique.useAbbreviation as boolean;
                    const useIsoCode = textTechnique.useIsoCode as boolean;
                    const name: Value =
                        typeof textLabel === "string"
                            ? env.lookup(textLabel)
                            : OmvDecoder.getFeatureName(
                                  env,
                                  useAbbreviation,
                                  useIsoCode,
                                  this.m_languages
                              );

                    if (name && typeof name === "string") {
                        texts.push(meshBuffers.addText(name));
                    } else {
                        texts.push(INVALID_ARRAY_INDEX);
                    }
                }

                // Always store the position, otherwise the following POIs will be
                // misplaced.
                positions.push(x, y, z);

                if (this.m_gatherFeatureIds) {
                    featureIds.push(featureId);
                }
                if (isPoiTechnique) {
                    if (imageTexture === undefined) {
                        imageTextures.push(INVALID_ARRAY_INDEX);
                    } else {
                        imageTextures.push(meshBuffers.addText(imageTexture));
                    }
                }
            }
        }
    }

    /**
     *
     * Creates the line geometries for the given feature.
     *
     * @param layer Tile's layer to be processed.
     * @param feature The current feature containing the main geometry.
     * @param env The [[MapEnv]] containing the environment information for the map.
     * @param techniques The array of [[Technique]] that will be applied to the geometry.
     * @param featureId The id of the feature.
     */
    processLineFeature(
        layer: string,
        geometry: ILineGeometry[],
        env: MapEnv,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        this.processFeatureCommon(env);

        const lines: number[][] = [];

        const worldPos = new THREE.Vector3();

        const { projection, center, tileBounds } = this.m_decodeInfo;

        const tileWidth = tileBounds.max.x - tileBounds.min.x;
        const tileHeight = tileBounds.max.y - tileBounds.min.y;
        const tileSizeInMeters = Math.max(tileWidth, tileHeight);

        for (const polyline of geometry) {
            const line: number[] = [];
            polyline.coordinates.forEach(geoPoint => {
                const { x, y, z } = projection.projectPoint(geoPoint, worldPos).sub(center);
                line.push(x, y, z);
            });
            lines.push(line);
        }

        const wantCircle = this.m_decodeInfo.tileKey.level >= 11;

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const techniqueIndex = technique._index;
            const techniqueName = technique.name;

            if (
                techniqueName === "line" ||
                techniqueName === "solid-line" ||
                techniqueName === "dashed-line"
            ) {
                const lineGeometry =
                    techniqueName === "line"
                        ? this.m_simpleLines
                        : techniqueName === "solid-line"
                        ? this.m_solidLines
                        : this.m_dashedLines;

                const lineType = techniqueName === "line" ? LineType.Simple : LineType.Complex;

                this.applyLineTechnique(
                    lineGeometry,
                    technique,
                    techniqueIndex,
                    this.m_gatherFeatureIds,
                    lineType,
                    featureId,
                    lines,
                    env
                );
            } else if (
                isTextTechnique(technique) ||
                isPoiTechnique(technique) ||
                isLineMarkerTechnique(technique)
            ) {
                const textTechnique = technique as TextTechnique;
                const textLabel = textTechnique.label;
                const useAbbreviation = textTechnique.useAbbreviation as boolean;
                const useIsoCode = textTechnique.useIsoCode as boolean;
                let text: Value =
                    typeof textLabel === "string"
                        ? env.lookup(textLabel)
                        : OmvDecoder.getFeatureName(
                              env,
                              useAbbreviation,
                              useIsoCode,
                              this.m_languages
                          );

                let validLines: number[][] = [];

                if (text === undefined) {
                    continue;
                }
                text = String(text);

                if (this.m_skipShortLabels) {
                    // Filter the lines, keep only those that are long enough for labelling.
                    validLines = [];

                    const metersPerPixel = tileSizeInMeters / this.m_decodeInfo.tileSizeOnScreen;
                    const minTileSpace =
                        MIN_AVERAGE_CHAR_WIDTH *
                        text.length *
                        metersPerPixel *
                        SIZE_ESTIMATION_FACTOR;

                    // Estimate if the line is long enough for the label, otherwise ignore it for
                    // rendering text. First, compute the bounding box in world coordinates.
                    for (const aLine of lines) {
                        let minX = Number.MAX_SAFE_INTEGER;
                        let maxX = Number.MIN_SAFE_INTEGER;
                        let minY = Number.MAX_SAFE_INTEGER;
                        let maxY = Number.MIN_SAFE_INTEGER;
                        for (let i = 0; i < aLine.length; i += 3) {
                            const x = aLine[i];
                            const y = aLine[i + 1];
                            if (x < minX) {
                                minX = x;
                            }
                            if (x > maxX) {
                                maxX = x;
                            }
                            if (y < minY) {
                                minY = y;
                            }
                            if (y > maxY) {
                                maxY = y;
                            }
                        }

                        // Check if the diagonal of the bounding box would be long enough to fit the
                        // label text:
                        if (
                            (maxX - minX) * (maxX - minX) + (maxY - minY) * (maxY - minY) >=
                            minTileSpace * minTileSpace
                        ) {
                            validLines.push(aLine);
                        }
                    }
                } else {
                    validLines = lines;
                }

                if (validLines.length === 0) {
                    continue;
                }

                if (isTextTechnique(technique)) {
                    if (text === undefined) {
                        continue;
                    }
                    for (const aLine of validLines) {
                        const pathLengthSqr = Math2D.computeSquaredLineLength(aLine);
                        this.m_textPathGeometries.push({
                            technique: techniqueIndex,
                            path: aLine,
                            pathLengthSqr,
                            text: String(text),
                            featureId
                        });
                    }
                } else {
                    const lineMarkerTechnique = technique as LineMarkerTechnique;
                    let imageTexture = lineMarkerTechnique.imageTexture;

                    if (typeof lineMarkerTechnique.imageTextureField === "string") {
                        const imageTextureValue = env.lookup(lineMarkerTechnique.imageTextureField);
                        imageTexture = imageTextureValue as string;
                        if (typeof lineMarkerTechnique.imageTexturePrefix === "string") {
                            imageTexture = lineMarkerTechnique.imageTexturePrefix + imageTexture;
                        }
                        if (typeof lineMarkerTechnique.imageTexturePostfix === "string") {
                            imageTexture = imageTexture + lineMarkerTechnique.imageTexturePostfix;
                        }
                    }

                    for (const aLine of validLines) {
                        this.m_poiGeometries.push({
                            technique: techniqueIndex,
                            positions: {
                                name: "position",
                                type: "float",
                                buffer: new Float32Array(aLine).buffer,
                                itemCount: 3
                            },
                            texts: [0],
                            stringCatalog: [text, imageTexture],
                            imageTextures: [1],
                            featureId
                        });
                    }
                }
            } else if (isExtrudedLineTechnique(technique)) {
                const meshBuffers = this.findOrCreateMeshBuffers(
                    techniqueIndex,
                    GeometryType.ExtrudedLine
                );
                if (meshBuffers === undefined) {
                    continue;
                }
                const { positions, indices, groups, featureIds, featureStarts } = meshBuffers;
                const start = indices.length;

                const lineWidth = getPropertyValue(
                    technique.lineWidth,
                    this.m_decodeInfo.tileKey.level
                );

                if (lineWidth === undefined) {
                    continue;
                }

                const addCircle =
                    wantCircle && (technique.caps === undefined || technique.caps === "Circle");

                lines.forEach(aLine => {
                    triangulateLine(aLine, lineWidth, positions, indices, addCircle);

                    if (this.m_gatherFeatureIds && featureIds && featureStarts) {
                        featureIds.push(featureId);
                        featureStarts.push(start);
                    }
                });

                const count = indices.length - start;
                groups.push({ start, count, technique: techniqueIndex, featureId });
            } else {
                logger.warn(
                    `OmvDecodedTileEmitter#processLineFeature: Invalid line technique
                     ${techniqueName} for layer: ${env.entries.$layer} `
                );
            }
        }
    }

    /**
     * Creates the polygons geometries for the given feature.
     *
     * @param layer Tile's layer to be processed.
     * @param feature The current feature containing the main geometry.
     * @param env The [[MapEnv]] containing the environment information for the map.
     * @param techniques The array of [[Technique]] that will be applied to the geometry.
     * @param featureId The id of the feature.
     */
    processPolygonFeature(
        layer: string,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        this.processFeatureCommon(env);

        techniques.forEach(technique => {
            if (technique === undefined) {
                return;
            }

            const techniqueIndex = technique._index;

            if (techniqueIndex === undefined) {
                throw new Error(
                    "OmvDecodedTileEmitter#processPolygonFeature: " +
                        "Internal error - No technique index"
                );
            }

            const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
            const fillTechnique = technique as FillTechnique;

            const { projection, center, tileBounds } = this.m_decodeInfo;
            const tileSize = tileBounds.getSize(new THREE.Vector3());

            const polygons: Ring[][] = [];

            const worldPos = new THREE.Vector3();
            const texCoord = new THREE.Vector3();

            const isExtruded = isExtrudedPolygonTechnique(technique);
            const isFilled = isFillTechnique(technique);
            const isTextured = isStandardTexturedTechnique(technique);

            const isLine =
                isSolidLineTechnique(technique) ||
                isDashedLineTechnique(technique) ||
                isLineTechnique(technique);
            const isPolygon =
                isExtruded || isFilled || isStandardTechnique(technique) || isTextured;

            const edgeWidth = isExtruded
                ? extrudedPolygonTechnique.lineWidth || 0.0
                : isFilled
                ? fillTechnique.lineWidth || 0.0
                : 0.0;
            const hasEdges = edgeWidth > 0.0 || isLine;

            const vertexStride = isTextured ? 5 : 3;
            for (const polygon of geometry) {
                const rings: Ring[] = [];
                for (const outline of polygon.rings) {
                    const ringContour: number[] = [];
                    let ringEdges: boolean[] | undefined;
                    for (let coordIdx = 0; coordIdx < outline.coordinates.length; ++coordIdx) {
                        const geoPoint = outline.coordinates[coordIdx];
                        const { x, y, z } = projection.projectPoint(geoPoint, worldPos).sub(center);
                        ringContour.push(x, y, z);

                        if (hasEdges && outline.outlines !== undefined) {
                            const edge = outline.outlines[coordIdx];
                            if (ringEdges === undefined) {
                                ringEdges = [edge];
                            } else {
                                ringEdges.push(edge);
                            }
                        }

                        if (isTextured) {
                            const { x: u, y: v } = projection
                                .projectPoint(geoPoint, texCoord)
                                .sub(tileBounds.min)
                                .divide(tileSize);
                            ringContour.push(u, v);
                        }
                    }
                    rings.push(new Ring(vertexStride, ringContour, ringEdges));
                }
                polygons.push(rings);
            }

            if (isPolygon) {
                this.applyPolygonTechnique(polygons, technique, techniqueIndex, featureId, env);
            } else if (isLine) {
                const lineGeometry =
                    technique.name === "line"
                        ? this.m_simpleLines
                        : technique.name === "solid-line"
                        ? this.m_solidLines
                        : this.m_dashedLines;

                const lineType = technique.name === "line" ? LineType.Simple : LineType.Complex;
                polygons.forEach(rings => {
                    rings.forEach(ring => {
                        const lines = ring.getOutlines();
                        if (lines.length === 0) {
                            return;
                        }
                        this.applyLineTechnique(
                            lineGeometry,
                            technique,
                            techniqueIndex,
                            this.m_gatherFeatureIds,
                            lineType,
                            featureId,
                            lines,
                            env
                        );
                    });
                });
            }
        });
    }

    /**
     * Creates the geometries that belongs to the [[Tile].
     *
     * @returns The [[DecodedTile]]
     */
    getDecodedTile(): DecodedTile {
        this.createGeometries();
        this.processSimpleLines(this.m_simpleLines);
        this.processLines(this.m_solidLines);
        this.processLines(this.m_dashedLines);

        const decodedTile: DecodedTile = {
            techniques: this.m_styleSetEvaluator.techniques,
            geometries: this.m_geometries,
            decodeTime: undefined
        };
        if (this.m_textGeometries.length > 0) {
            decodedTile.textGeometries = this.m_textGeometries;
        }
        if (this.m_poiGeometries.length > 0) {
            decodedTile.poiGeometries = this.m_poiGeometries;
        }
        if (this.m_textPathGeometries.length > 0) {
            decodedTile.textPathGeometries = this.m_textPathGeometries;
        }
        if (this.m_sources.length !== 0) {
            decodedTile.copyrightHolderIds = this.m_sources;
        }
        return decodedTile;
    }

    private applyLineTechnique(
        linesGeometry: LinesGeometry[],
        technique: Technique,
        techniqueIndex: number,
        gatherFeatureIds: boolean,
        lineType = LineType.Complex,
        featureId: number | undefined,
        lines: number[][],
        env: MapEnv
    ): void {
        const renderOrderOffset = technique.renderOrderBiasProperty
            ? env.lookup(technique.renderOrderBiasProperty)
            : 0;
        let lineGroup: LineGroup;
        const lineGroupGeometries = linesGeometry.find(aLine => {
            return (
                aLine.technique === techniqueIndex && aLine.renderOrderOffset === renderOrderOffset
            );
        });
        if (lineGroupGeometries === undefined) {
            lineGroup = new LineGroup(undefined, lineType === LineType.Simple);
            const aLine: LinesGeometry = {
                type: lineType === LineType.Complex ? GeometryType.SolidLine : GeometryType.Line,
                technique: techniqueIndex,
                renderOrderOffset:
                    renderOrderOffset !== undefined ? Number(renderOrderOffset) : undefined,
                lines: lineGroup
            };

            if (gatherFeatureIds) {
                // if this technique is transient, do not save the featureIds with the geometry
                aLine.featureIds = technique.transient === true ? undefined : [featureId];
                aLine.featureStarts = technique.transient === true ? undefined : [0];
            }

            linesGeometry.push(aLine);
        } else {
            lineGroup = lineGroupGeometries.lines;

            if (
                gatherFeatureIds &&
                lineGroupGeometries.featureIds &&
                lineGroupGeometries.featureStarts
            ) {
                // Add ID to tag the geometry, also provide the current length of the index
                // attribute
                lineGroupGeometries.featureIds.push(featureId);
                lineGroupGeometries.featureStarts.push(lineGroup.indices.length);
            }
        }
        lines.forEach(aLine => {
            lineGroup.add(aLine, this.m_decodeInfo.center);
        });
    }

    private applyPolygonTechnique(
        polygons: Ring[][],
        technique: Technique,
        techniqueIndex: number,
        featureId: number | undefined,
        env: MapEnv
    ): void {
        const isExtruded = isExtrudedPolygonTechnique(technique);

        const geometryType = isExtruded ? GeometryType.ExtrudedPolygon : GeometryType.Polygon;
        const meshBuffers = this.findOrCreateMeshBuffers(techniqueIndex, geometryType);

        if (meshBuffers === undefined) {
            return;
        }

        const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;

        const isFilled = isFillTechnique(technique);
        const isTextured = isStandardTexturedTechnique(technique);

        // Get the height values for the footprint and extrusion.
        const currentHeight = env.lookup("height") as number;
        const currentMinHeight = env.lookup("min_height") as number;
        const defaultHeight = extrudedPolygonTechnique.defaultHeight;
        const constantHeight = extrudedPolygonTechnique.constantHeight;
        const minHeight = currentMinHeight !== undefined && !isFilled ? currentMinHeight : 0;
        const height =
            currentHeight !== undefined
                ? currentHeight
                : defaultHeight !== undefined
                ? defaultHeight
                : 0;

        this.m_decodeInfo.tileBounds.getCenter(tempTileOrigin);

        const { positions, textureCoordinates, colors, indices, edgeIndices, groups } = meshBuffers;

        const stride = isTextured ? 5 : 3;
        for (const rings of polygons) {
            const start = indices.length;
            const basePosition = positions.length;

            const tileWorldBounds = new THREE.Box3();
            this.m_decodeInfo.projection.projectBox(this.m_decodeInfo.geoBox, tileWorldBounds);

            let contour: number[];
            let contourOutlines: boolean[] | undefined;
            for (let ringIndex = 0; ringIndex < rings.length; ) {
                const baseVertex = positions.length / 3;

                // Get the contour vertices for this ring.
                contour = rings[ringIndex].contour;
                contourOutlines = rings[ringIndex].contourOutlines;
                ringIndex++;

                let edgeIndexBuffer = edgeIndices as number[];
                if (isFilled && contourOutlines !== undefined) {
                    edgeIndexBuffer = [];
                    (edgeIndices as number[][]).push(edgeIndexBuffer);
                }

                let vertices: number[] = contour;
                if (isExtruded) {
                    addExtrudedWalls(
                        indices,
                        baseVertex,
                        stride,
                        contour,
                        contourOutlines,
                        extrudedPolygonTechnique.boundaryWalls
                    );
                }
                if (contourOutlines !== undefined) {
                    addPolygonEdges(
                        edgeIndexBuffer,
                        baseVertex,
                        stride,
                        contour,
                        contourOutlines,
                        isExtruded,
                        extrudedPolygonTechnique.footprint,
                        extrudedPolygonTechnique.maxSlope
                    );
                }

                // Repeat the process for all the inner rings (holes).
                const holes: number[] = [];
                for (; ringIndex < rings.length && rings[ringIndex].isInnerRing; ++ringIndex) {
                    holes.push(vertices.length / 3);

                    contour = rings[ringIndex].contour;
                    contourOutlines = rings[ringIndex].contourOutlines;
                    // As we are predicting the indexes before the vertices are added,
                    // the vertex offset has to be taken into account
                    const vertexOffset = (vertices.length / 3) * 2;
                    vertices = vertices.concat(contour);

                    if (isExtruded) {
                        addExtrudedWalls(
                            indices,
                            vertexOffset + baseVertex,
                            stride,
                            contour,
                            contourOutlines,
                            extrudedPolygonTechnique.boundaryWalls
                        );
                    }
                    if (contourOutlines !== undefined) {
                        addPolygonEdges(
                            edgeIndexBuffer,
                            (isExtruded ? vertexOffset : vertexOffset / 2) + baseVertex,
                            stride,
                            contour,
                            contourOutlines,
                            isExtruded,
                            extrudedPolygonTechnique.footprint,
                            extrudedPolygonTechnique.maxSlope
                        );
                    }
                }

                try {
                    // Triangulate the footprint polyline.
                    const triangles = earcut(vertices, holes, stride);

                    // Add the footprint/roof vertices to the position buffer.
                    for (let i = 0; i < vertices.length; i += stride) {
                        let scaleFactor = 1.0;
                        if (isExtruded && constantHeight !== true) {
                            tempVertOrigin.set(
                                tempTileOrigin.x + vertices[i],
                                tempTileOrigin.y + vertices[i + 1],
                                tempTileOrigin.z + vertices[i + 2]
                            );
                            scaleFactor = this.m_decodeInfo.projection.getScaleFactor(
                                tempVertOrigin
                            );
                        }

                        positions.push(
                            vertices[i],
                            vertices[i + 1],
                            vertices[i + 2] + minHeight * scaleFactor
                        );
                        if (isExtruded) {
                            positions.push(
                                vertices[i],
                                vertices[i + 1],
                                vertices[i + 2] + height * scaleFactor
                            );
                        } else if (isTextured) {
                            textureCoordinates.push(vertices[i + 3], vertices[i + 4]);
                        }
                    }

                    // Add the footprint/roof indices to the index buffer.
                    const vertexStride = isExtruded ? 2 : 1;
                    for (let i = 0; i < triangles.length; i += 3) {
                        const v0 = baseVertex + triangles[i + 0] * vertexStride;
                        const v1 = baseVertex + triangles[i + 1] * vertexStride;
                        const v2 = baseVertex + triangles[i + 2] * vertexStride;
                        indices.push(v0, v1, v2);

                        if (isExtruded) {
                            const v3 = baseVertex + triangles[i + 0] * vertexStride + 1;
                            const v4 = baseVertex + triangles[i + 1] * vertexStride + 1;
                            const v5 = baseVertex + triangles[i + 2] * vertexStride + 1;
                            indices.push(v3, v4, v5);
                        }
                    }
                } catch (err) {
                    logger.error(`cannot triangulate geometry`, err);
                }
            }

            const positionCount = (positions.length - basePosition) / 3;
            const count = indices.length - start;

            if (isExtrudedPolygonTechnique(technique) && technique.vertexColors === true) {
                const color = new THREE.Color(
                    this.isColorStringValid(technique.color)
                        ? technique.color
                        : this.isColorStringValid(env.lookup("color") as string)
                        ? (env.lookup("color") as string)
                        : technique.defaultColor
                );

                for (let i = 0; i < positionCount; ++i) {
                    colors.push(color.r, color.g, color.b);
                }
            }

            if (count > 0) {
                groups.push({
                    start,
                    count,
                    technique: techniqueIndex,
                    featureId
                });
            }
        }
    }

    private createGeometries(): any {
        this.m_meshBuffers.forEach((meshBuffers, techniqueIdx) => {
            if (meshBuffers.positions.length === 0) {
                return;
            } // nothing to do

            if (
                !this.m_styleSetEvaluator.techniques ||
                this.m_styleSetEvaluator.techniques.length <= techniqueIdx
            ) {
                throw new Error("Invalid technique index");
            }

            const technique = this.m_styleSetEvaluator.techniques[techniqueIdx];
            if (technique === undefined) {
                return;
            }

            const positionElements = new Float32Array(meshBuffers.positions);

            if (meshBuffers.texts.length > 0 && isTextTechnique(technique)) {
                this.m_textGeometries.push({
                    positions: {
                        name: "position",
                        type: "float",
                        buffer: positionElements.buffer as ArrayBuffer,
                        itemCount: 3
                    },
                    texts: meshBuffers.texts,
                    technique: techniqueIdx,
                    featureId: meshBuffers.featureIds ? meshBuffers.featureIds[0] : undefined,
                    stringCatalog: meshBuffers.stringCatalog
                });
                return;
            }

            if (meshBuffers.texts.length > 0 && isPoiTechnique(technique)) {
                this.m_poiGeometries.push({
                    positions: {
                        name: "position",
                        type: "float",
                        buffer: positionElements.buffer as ArrayBuffer,
                        itemCount: 3
                    },
                    texts: meshBuffers.texts,
                    technique: techniqueIdx,
                    featureId: meshBuffers.featureIds ? meshBuffers.featureIds[0] : undefined,
                    stringCatalog: meshBuffers.stringCatalog,
                    imageTextures: meshBuffers.imageTextures
                });
                return;
            }

            if (meshBuffers.groups.length === 0) {
                // create a default group containing all the vertices in the position attribute.

                meshBuffers.groups.push({
                    start: 0,
                    count: positionElements.length / 3,
                    technique: techniqueIdx
                });
            }

            const geometry: Geometry = {
                type: meshBuffers.type,
                vertexAttributes: [
                    {
                        name: "position",
                        buffer: positionElements.buffer as ArrayBuffer,
                        itemCount: 3,
                        type: "float"
                    }
                ],
                groups: meshBuffers.groups
            };

            if (meshBuffers.colors.length > 0) {
                const colors = new Float32Array(meshBuffers.colors);
                assert(
                    colors.length === positionElements.length,
                    "length of colors buffer is different than the length of the " +
                        "position buffer"
                );

                geometry.vertexAttributes.push({
                    name: "color",
                    buffer: colors.buffer as ArrayBuffer,
                    itemCount: 3,
                    type: "float"
                });
            }

            if (meshBuffers.textureCoordinates.length > 0) {
                const positionCount = meshBuffers.positions.length / 3;
                const texCoordCount = meshBuffers.textureCoordinates.length / 2;
                assert(
                    texCoordCount === positionCount,
                    "length of textureCoordinates buffer is different than the length of the" +
                        "position buffer"
                );

                const textureCoordinates = new Float32Array(meshBuffers.textureCoordinates);
                geometry.vertexAttributes.push({
                    name: "uv",
                    buffer: textureCoordinates.buffer as ArrayBuffer,
                    itemCount: 2,
                    type: "float"
                });
            }

            if (meshBuffers.indices.length > 0) {
                // TODO: use uint16 for buffers when possible
                geometry.index = {
                    name: "index",
                    buffer: new Uint32Array(meshBuffers.indices).buffer as ArrayBuffer,
                    itemCount: 1,
                    type: "uint32"
                };
            }

            if (meshBuffers.edgeIndices.length > 0) {
                if (meshBuffers.edgeIndices[0] instanceof Array) {
                    geometry.edgeIndex = [];
                    for (const edgeIndexBuffer of meshBuffers.edgeIndices as number[][]) {
                        // TODO: use uint16 for buffers when possible. Issue HARP-3987
                        geometry.edgeIndex.push({
                            name: "edgeIndex",
                            buffer: new Uint32Array(edgeIndexBuffer).buffer as ArrayBuffer,
                            itemCount: 1,
                            type: "uint32"
                        });
                    }
                } else {
                    // TODO: use uint16 for buffers when possible. Issue HARP-3987
                    geometry.edgeIndex = {
                        name: "edgeIndex",
                        buffer: new Uint32Array(meshBuffers.edgeIndices as number[])
                            .buffer as ArrayBuffer,
                        itemCount: 1,
                        type: "uint32"
                    };
                }
            }

            if (this.m_gatherFeatureIds) {
                geometry.featureIds = meshBuffers.featureIds;
                geometry.featureStarts = meshBuffers.featureStarts;
            }

            this.m_geometries.push(geometry);
        });
    }

    private processLines(linesArray: LinesGeometry[]) {
        linesArray.forEach(linesGeometry => {
            const { vertices, indices } = linesGeometry.lines;
            const renderOrderOffset = linesGeometry.renderOrderOffset;
            const technique = linesGeometry.technique;
            const buffer = new Float32Array(vertices).buffer as ArrayBuffer;
            const index = new Uint32Array(indices).buffer as ArrayBuffer;
            const attr: InterleavedBufferAttribute = {
                type: "float",
                stride: linesGeometry.lines.stride,
                buffer,
                attributes: linesGeometry.lines.vertexAttributes
            };
            const geometry: Geometry = {
                type: GeometryType.SolidLine,
                index: {
                    buffer: index,
                    itemCount: 1,
                    type: "uint32",
                    name: "index"
                },
                interleavedVertexAttributes: [attr],
                groups: [{ start: 0, count: indices.length, technique, renderOrderOffset }],
                vertexAttributes: []
            };

            if (this.m_gatherFeatureIds) {
                geometry.featureIds = linesGeometry.featureIds;
                geometry.featureStarts = linesGeometry.featureStarts;
            }

            this.m_geometries.push(geometry);
        });
    }

    private processSimpleLines(linesArray: LinesGeometry[]) {
        linesArray.forEach(linesGeometry => {
            const { vertices, indices } = linesGeometry.lines;
            const renderOrderOffset = linesGeometry.renderOrderOffset;
            const technique = linesGeometry.technique;
            const buffer = new Float32Array(vertices).buffer as ArrayBuffer;
            const index = new Uint32Array(indices).buffer as ArrayBuffer;
            const attr: BufferAttribute = {
                buffer,
                itemCount: 3,
                type: "float",
                name: "position"
            };
            const geometry: Geometry = {
                type: GeometryType.Line,
                index: {
                    buffer: index,
                    itemCount: 1,
                    type: "uint32",
                    name: "index"
                },
                vertexAttributes: [attr],
                groups: [{ start: 0, count: indices.length, technique, renderOrderOffset }]
            };

            if (this.m_gatherFeatureIds) {
                geometry.featureIds = linesGeometry.featureIds;
                geometry.featureStarts = linesGeometry.featureStarts;
            }
            this.m_geometries.push(geometry);
        });
    }

    private findOrCreateMeshBuffers(index: number, type: GeometryType): MeshBuffers | undefined {
        let buffers = this.m_meshBuffers.get(index);

        if (buffers !== undefined) {
            if (buffers.type !== type) {
                logger.error(`MeshBuffer has been created with wrong type "${GeometryType[type]}"
                instead of "${GeometryType[buffers.type]}"`);
                return undefined;
            }
            return buffers;
        }
        buffers = new MeshBuffers(type);
        this.m_meshBuffers.set(index, buffers);
        return buffers;
    }

    private processFeatureCommon(env: MapEnv) {
        const source = env.lookup("source");
        if (typeof source === "string" && source !== "") {
            if (!this.m_sources.includes(source)) {
                this.m_sources.push(source);
            }
        }
    }

    private isColorStringValid(color: Value): boolean {
        return typeof color === "string" && color.length > 0;
    }
}
