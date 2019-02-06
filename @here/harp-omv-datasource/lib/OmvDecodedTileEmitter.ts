/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BasicExtrudedLineTechnique,
    BufferAttribute,
    DecodedTile,
    ExtrudedPolygonTechnique,
    Extruder,
    FillTechnique,
    Geometry,
    GeometryType,
    getPropertyValue,
    Group,
    IMeshBuffers,
    InterleavedBufferAttribute,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isStandardTexturedTechnique,
    LineMarkerTechnique,
    Outliner,
    PoiGeometry,
    PoiTechnique,
    StyleSetEvaluator,
    Technique,
    TextGeometry,
    TextPathGeometry,
    TextTechnique,
    Value
} from "@here/harp-datasource-protocol";
import { MapEnv } from "@here/harp-datasource-protocol/lib/Theme";
import { LINE_VERTEX_ATTRIBUTE_DESCRIPTORS, Lines, triangulateLine } from "@here/harp-lines";
import { assert, LoggerManager, Math2D } from "@here/harp-utils";
import earcut from "earcut";
import * as THREE from "three";

import { identityProjection } from "@here/harp-geoutils";
import { GeometryCommands, isClosePathCommand, isLineToCommand, isMoveToCommand } from "./OmvData";
import { LinesGeometry } from "./OmvDataSource";
import { IOmvEmitter, OmvDecoder, Ring } from "./OmvDecoder";
import { com } from "./proto/vector_tile";

const logger = LoggerManager.instance.create("OmvDecodedTileEmitter");

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
    readonly edgeIndices: number[] = [];
    readonly outlineIndices: number[][] = [];
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

    private readonly m_geometryCommands = new GeometryCommands();

    private m_outliner: Outliner = new Outliner();
    private m_extruder: Extruder = new Extruder();
    private readonly m_sources: string[] = [];

    constructor(
        private readonly m_decodeInfo: OmvDecoder.DecodeInfo,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_gatherFeatureIds: boolean,
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
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void {
        if (!feature.geometry) {
            return;
        }

        this.processFeatureCommon(env);

        const geometry = feature.geometry;

        const worldPos = new THREE.Vector3();

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const techniqueIndex = technique._index;
            if (techniqueIndex === undefined) {
                throw new Error(
                    "OmvDecodedTileEmitter#processPointFeature: Internal error " +
                        "- No technique index"
                );
            }

            const meshBuffers = this.findOrCreateMeshBuffers(techniqueIndex, GeometryType.Point);

            if (meshBuffers === undefined) {
                continue;
            }

            const { positions, texts, featureIds, imageTextures } = meshBuffers;

            const shouldCreateTextGeometries =
                technique.name === "text" || technique.name === "labeled-icon";

            let imageTexture: string | undefined;
            const isPoiTechnique = technique.name === "labeled-icon";

            if (isPoiTechnique) {
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

            this.m_geometryCommands.accept(
                geometry,
                this.m_decodeInfo.tileKey,
                this.m_decodeInfo.geoBox,
                layer.extent,
                {
                    visitCommand: command => {
                        if (isMoveToCommand(command)) {
                            const { x, y } = this.m_decodeInfo.projection
                                .projectPoint(command, worldPos)
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
                            positions.push(x, y, 0);

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
            );
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
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void {
        if (!feature.geometry) {
            return;
        }

        this.processFeatureCommon(env);

        const lines: number[][] = [];
        let line: number[];

        const worldPos = new THREE.Vector3();

        this.m_geometryCommands.accept(
            feature.geometry,
            this.m_decodeInfo.tileKey,
            this.m_decodeInfo.geoBox,
            layer.extent,
            {
                visitCommand: command => {
                    if (isMoveToCommand(command)) {
                        this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        line = [worldPos.x, worldPos.y];
                        lines.push(line);
                    } else if (isLineToCommand(command)) {
                        this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        line.push(worldPos.x, worldPos.y);
                    }
                }
            }
        );

        const wantCircle = this.m_decodeInfo.tileKey.level >= 11;

        function applyLineTechnique(
            linesGeometry: LinesGeometry[],
            technique: Technique,
            techniqueIndex: number,
            gatherFeatureIds: boolean,
            lineType = LineType.Complex
        ): void {
            const renderOrderOffset = technique.renderOrderBiasProperty
                ? env.lookup(technique.renderOrderBiasProperty)
                : 0;
            let linesInstance: Lines;
            const linesInstanceGeometries = linesGeometry.find(aLine => {
                return (
                    aLine.technique === techniqueIndex &&
                    aLine.renderOrderOffset === renderOrderOffset
                );
            });
            if (linesInstanceGeometries === undefined) {
                linesInstance = new Lines();
                const aLine: LinesGeometry = {
                    type:
                        lineType === LineType.Complex ? GeometryType.SolidLine : GeometryType.Line,
                    technique: techniqueIndex,
                    renderOrderOffset:
                        renderOrderOffset !== undefined ? Number(renderOrderOffset) : undefined,
                    lines: linesInstance
                };

                if (gatherFeatureIds) {
                    // if this technique is transient, do not save the featureIds with the geometry
                    aLine.featureIds = technique.transient === true ? undefined : [featureId];
                    aLine.featureStarts = technique.transient === true ? undefined : [0];
                }

                linesGeometry.push(aLine);
            } else {
                linesInstance = linesInstanceGeometries.lines;

                if (
                    gatherFeatureIds &&
                    linesInstanceGeometries.featureIds &&
                    linesInstanceGeometries.featureStarts
                ) {
                    // Add ID to tag the geometry, also provide the current length of the index
                    // attribute
                    linesInstanceGeometries.featureIds.push(featureId);
                    linesInstanceGeometries.featureStarts.push(linesInstance.indices.length);
                }
            }
            lines.forEach(aLine => {
                linesInstance.add(aLine, lineType === LineType.Simple);
            });
        }

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }

            const techniqueIndex = technique._index;
            if (techniqueIndex === undefined) {
                throw new Error(
                    "OmvDecodedTileEmitter#processLineFeature: Internal error - No technique idx"
                );
            }

            const techniqueName = technique.name;

            if (techniqueName === "line") {
                applyLineTechnique(
                    this.m_simpleLines,
                    technique,
                    techniqueIndex,
                    this.m_gatherFeatureIds,
                    LineType.Simple
                );
            } else if (techniqueName === "solid-line") {
                applyLineTechnique(
                    this.m_solidLines,
                    technique,
                    techniqueIndex,
                    this.m_gatherFeatureIds,
                    LineType.Complex
                );
            } else if (techniqueName === "dashed-line") {
                applyLineTechnique(
                    this.m_dashedLines,
                    technique,
                    techniqueIndex,
                    this.m_gatherFeatureIds,
                    LineType.Complex
                );
            } else if (techniqueName === "text" || techniqueName === "line-marker") {
                const textTechnique = technique as TextTechnique;
                const textLabel = textTechnique.label;
                const useAbbreviation = textTechnique.useAbbreviation as boolean;
                const useIsoCode = textTechnique.useIsoCode as boolean;
                const text: Value =
                    typeof textLabel === "string"
                        ? env.lookup(textLabel)
                        : OmvDecoder.getFeatureName(
                              env,
                              useAbbreviation,
                              useIsoCode,
                              this.m_languages
                          );

                if (techniqueName === "text") {
                    if (text === undefined) {
                        continue;
                    }
                    for (const aLine of lines) {
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

                    for (const aLine of lines) {
                        this.m_poiGeometries.push({
                            technique: techniqueIndex,
                            positions: {
                                name: "position",
                                type: "float",
                                buffer: new Float32Array(aLine).buffer,
                                itemCount: 2
                            },
                            texts: [0],
                            stringCatalog: [String(text), imageTexture],
                            imageTextures: [1],
                            featureId
                        });
                    }
                }
            } else if (techniqueName === "extruded-line") {
                const meshBuffers = this.findOrCreateMeshBuffers(
                    techniqueIndex,
                    GeometryType.ExtrudedLine
                );
                if (meshBuffers === undefined) {
                    continue;
                }
                const { positions, indices, groups, featureIds, featureStarts } = meshBuffers;
                const start = indices.length;

                const extrudedLineTechnique = technique as BasicExtrudedLineTechnique;

                const lineWidth = getPropertyValue(
                    extrudedLineTechnique.lineWidth,
                    this.m_decodeInfo.displayZoomLevel
                );

                if (lineWidth === undefined) {
                    continue;
                }

                const addCircle =
                    wantCircle &&
                    (extrudedLineTechnique.caps === undefined ||
                        extrudedLineTechnique.caps === "Circle");

                lines.forEach(aLine => {
                    triangulateLine(aLine, lineWidth, positions, indices, addCircle);

                    if (this.m_gatherFeatureIds && featureIds && featureStarts) {
                        featureIds.push(featureId);
                        featureStarts.push(start);
                    }
                });

                const count = indices.length - start;
                groups.push({ start, count, technique: techniqueIndex, featureId });
            } else if (techniqueName !== "none") {
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
        layer: com.mapbox.pb.Tile.ILayer,
        feature: com.mapbox.pb.Tile.IFeature,
        env: MapEnv,
        techniques: Technique[],
        featureId: number | undefined
    ): void {
        if (!feature.geometry) {
            return;
        }

        this.processFeatureCommon(env);

        const techniqueIndex = techniques[0]._index;
        if (techniqueIndex === undefined) {
            throw new Error(
                "OmvDecodedTileEmitter#processPolygonFeature: Internal error - No technique index"
            );
        }

        const meshBuffers = this.findOrCreateMeshBuffers(techniqueIndex, GeometryType.Polygon);
        if (meshBuffers === undefined) {
            return;
        }
        const {
            positions,
            textureCoordinates,
            colors,
            indices,
            edgeIndices,
            outlineIndices,
            groups
        } = meshBuffers;

        const technique = techniques[0];
        const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
        const fillTechnique = technique as FillTechnique;

        const isExtruded = isExtrudedPolygonTechnique(technique);
        const isFilled = isFillTechnique(technique);
        const isTextured = isStandardTexturedTechnique(technique);

        if (technique === undefined) {
            return;
        }

        const worldPos = new THREE.Vector3();
        const rings = new Array<Ring>();
        let ring: number[];
        let ringTexCoords: number[];

        const texCoord = new THREE.Vector3();
        const texCoordProjection = identityProjection;
        const texCoordBox = texCoordProjection.projectBox(
            this.m_decodeInfo.geoBox,
            new THREE.Box3()
        );
        const texCoordBoxSize = texCoordBox.getSize(new THREE.Vector3());

        this.m_geometryCommands.accept(
            feature.geometry,
            this.m_decodeInfo.tileKey,
            this.m_decodeInfo.geoBox,
            layer.extent,
            {
                visitCommand: command => {
                    if (isMoveToCommand(command)) {
                        const { x, y } = this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        ring = [x, y];
                        if (isTextured) {
                            const { x: u, y: v } = texCoordProjection
                                .projectPoint(command, texCoord)
                                .sub(texCoordBox.min)
                                .divide(texCoordBoxSize);
                            ringTexCoords = [u, v];
                        }
                    } else if (isLineToCommand(command)) {
                        const { x, y } = this.m_decodeInfo.projection
                            .projectPoint(command, worldPos)
                            .sub(this.m_decodeInfo.center);
                        ring.push(x, y);
                        if (isTextured) {
                            const { x: u, y: v } = texCoordProjection
                                .projectPoint(command, texCoord)
                                .sub(texCoordBox.min)
                                .divide(texCoordBoxSize);
                            ringTexCoords.push(u, v);
                        }
                    } else if (isClosePathCommand(command)) {
                        rings.push(new Ring(ring, ringTexCoords));
                    }
                }
            }
        );

        let minHeight = 0;
        let height = 0;
        // Use the height data if it is present in the data received
        const currentHeight = env.lookup("height") as number;
        // A defaultHeight can be defined in the theme
        const defaultHeight = extrudedPolygonTechnique.defaultHeight;

        if (isExtruded) {
            const origin = new THREE.Vector3();
            this.m_decodeInfo.tileBounds.getCenter(origin);
            origin.x += rings[0].contour[0];
            origin.y += rings[0].contour[1];
            const scaleFactor = this.m_decodeInfo.projection.getScaleFactor(origin);
            const currentMinHeight = env.lookup("min_height") as number;

            minHeight = currentMinHeight !== undefined ? currentMinHeight * scaleFactor : minHeight;

            height =
                currentHeight !== undefined
                    ? currentHeight * scaleFactor
                    : defaultHeight !== undefined
                    ? defaultHeight * scaleFactor
                    : height;
        }

        const start = indices.length;

        const basePosition = positions.length;

        const tileWorldBounds = new THREE.Box3();
        this.m_decodeInfo.projection.projectBox(this.m_decodeInfo.geoBox, tileWorldBounds);
        const tileWorldExtents = tileWorldBounds.max.sub(this.m_decodeInfo.center).x;

        const maxSlope =
            extrudedPolygonTechnique.maxSlope !== undefined
                ? extrudedPolygonTechnique.maxSlope
                : 0.9;
        const footprintEdges =
            extrudedPolygonTechnique.footprint !== undefined
                ? extrudedPolygonTechnique.footprint
                : true;
        const extrudedEdgeWidth =
            extrudedPolygonTechnique.lineWidth !== undefined
                ? extrudedPolygonTechnique.lineWidth
                : 0.0;
        const outlineColor = getPropertyValue(
            fillTechnique.lineColor,
            this.m_decodeInfo.displayZoomLevel
        );

        let contour: number[];
        let contourTexCoords: number[] | undefined;
        for (let ringIndex = 0; ringIndex < rings.length; ) {
            const baseVertex = positions.length / 3;

            // Get the contour vertices for this ring.
            contour = rings[ringIndex].contour;
            contourTexCoords = rings[ringIndex].countourTexCoords;
            ringIndex++;
            let vertices: number[] = contour;
            let texCoords: number[] | undefined = contourTexCoords;
            // TODO: Add similar edgeIndex check for filled-polygon edges.
            if (isExtruded) {
                this.m_extruder.addExtrudedWalls(
                    indices,
                    baseVertex,
                    contour,
                    extrudedEdgeWidth > 0.0,
                    edgeIndices,
                    tileWorldExtents,
                    footprintEdges,
                    maxSlope
                );
            }

            if (outlineColor !== undefined && isFilled) {
                this.m_outliner.addEdges(baseVertex, contour, tileWorldExtents, outlineIndices);
            }

            // Repeat the process for all the inner rings (holes).
            const holes: number[] = [];
            for (; ringIndex < rings.length && rings[ringIndex].isInnerRing; ++ringIndex) {
                holes.push(vertices.length / 2);

                contour = rings[ringIndex].contour;
                contourTexCoords = rings[ringIndex++].countourTexCoords;
                // As we are predicting the indexes before the vertices are added, the vertex offset
                // has to be taken into account
                const vertexOffset = vertices.length;
                const vertexOffsetFill = vertices.length / 2;
                vertices = vertices.concat(contour);
                if (contourTexCoords && texCoords) {
                    texCoords = texCoords.concat(contourTexCoords);
                }

                if (isExtruded) {
                    this.m_extruder.addExtrudedWalls(
                        indices,
                        vertexOffset + baseVertex,
                        contour,
                        extrudedEdgeWidth > 0.0,
                        edgeIndices,
                        tileWorldExtents,
                        footprintEdges,
                        maxSlope
                    );
                }

                if (outlineColor !== undefined && isFilled) {
                    const offset = baseVertex + vertexOffsetFill;
                    this.m_outliner.addEdges(offset, contour, tileWorldExtents, outlineIndices);
                }
            }

            try {
                // Triangulate the footprint polyline.
                const triangles = earcut(vertices, holes);

                // Add the footprint/roof vertices to the position buffer.
                for (let i = 0; i < vertices.length; i += 2) {
                    positions.push(vertices[i], vertices[i + 1], minHeight);
                    if (isExtruded) {
                        positions.push(vertices[i], vertices[i + 1], height);
                    } else if (isTextured && texCoords) {
                        textureCoordinates.push(texCoords[i], texCoords[i + 1]);
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

        this.m_outliner.fill(outlineIndices);
        const positionCount = (positions.length - basePosition) / 3;
        const count = indices.length - start;

        if (technique.name === "extruded-polygon") {
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

            if (meshBuffers.texts.length > 0 && technique.name === "text") {
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

            if (meshBuffers.texts.length > 0 && technique.name === "labeled-icon") {
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
                // create the index buffer

                // TODO: use uint16 for buffers when possible
                geometry.index = {
                    name: "index",
                    buffer: new Uint32Array(meshBuffers.indices).buffer as ArrayBuffer,
                    itemCount: 1,
                    type: "uint32"
                };
            }

            if (this.m_gatherFeatureIds) {
                geometry.featureIds = meshBuffers.featureIds;
                geometry.featureStarts = meshBuffers.featureStarts;
            }

            this.m_extruder.addEdgeIndicesArrayToGeometry(meshBuffers, geometry);
            this.m_outliner.addOutlineIndicesArrayToGeometry(meshBuffers, geometry);

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
                stride: 12,
                buffer,
                attributes: LINE_VERTEX_ATTRIBUTE_DESCRIPTORS
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
