/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute,
    composeTechniqueTextureName,
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
    isTextTechnique,
    LineMarkerTechnique,
    PoiGeometry,
    PoiTechnique,
    Technique,
    TextGeometry,
    TextPathGeometry,
    TextTechnique,
    textureCoordinateType,
    TextureCoordinateType
} from "@here/harp-datasource-protocol";
import {
    addExtrudedWalls,
    addPolygonEdges,
    IMeshBuffers,
    MapEnv,
    StyleSetEvaluator,
    Value
} from "@here/harp-datasource-protocol/index-decoder";
import { LineGroup } from "@here/harp-lines/lib/Lines";
import { triangulateLine } from "@here/harp-lines/lib/TriangulateLines";
import { assert, LoggerManager, Math2D } from "@here/harp-utils";
import earcut from "earcut";
import * as THREE from "three";

import {
    mercatorProjection,
    normalizedEquirectangularProjection,
    ProjectionType,
    webMercatorProjection
} from "@here/harp-geoutils";

import { ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { LinesGeometry } from "./OmvDataSource";
import { IOmvEmitter, OmvDecoder, Ring } from "./OmvDecoder";

// tslint:disable-next-line: max-line-length
import { SphericalGeometrySubdivisionModifier } from "@here/harp-geometry/lib/SphericalGeometrySubdivisionModifier";

const logger = LoggerManager.instance.create("OmvDecodedTileEmitter");

const tempTileOrigin = new THREE.Vector3();
const tempVertOrigin = new THREE.Vector3();
const tempVertNormal = new THREE.Vector3();
const tempFootDisp = new THREE.Vector3();
const tempRoofDisp = new THREE.Vector3();

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
    readonly extrusionAxis: number[] = [];
    readonly indices: number[] = [];
    readonly edgeIndices: number[] = [];
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

    /**
     * An optional list of additional data that can be used as additional data for the object
     * picking.
     */
    readonly objInfos: Array<{} | undefined> = [];

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

    get projection() {
        return this.m_decodeInfo.targetProjection;
    }

    get center() {
        return this.m_decodeInfo.center;
    }

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
        geometry: THREE.Vector3[],
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

            const { positions, texts, featureIds, imageTextures, objInfos } = meshBuffers;

            const shouldCreateTextGeometries =
                isTextTechnique(technique) || isPoiTechnique(technique);

            let imageTexture: string | undefined;
            const wantsPoi = isPoiTechnique(technique);

            if (wantsPoi) {
                const poiTechnique = technique as PoiTechnique;
                imageTexture = poiTechnique.imageTexture;

                // TODO: Move to decoder independent parts of code.
                if (typeof poiTechnique.poiName === "string") {
                    imageTexture = poiTechnique.poiName;
                } else if (typeof poiTechnique.poiNameField === "string") {
                    const poiNameFieldValue = env.lookup(poiTechnique.poiNameField) as string;
                    imageTexture = poiNameFieldValue;
                } else if (typeof poiTechnique.imageTextureField === "string") {
                    const imageTextureValue = env.lookup(poiTechnique.imageTextureField) as string;
                    imageTexture = composeTechniqueTextureName(imageTextureValue, poiTechnique);
                }
            }

            const worldPos = new THREE.Vector3();

            for (const pos of geometry) {
                const { x, y, z } = this.m_decodeInfo.targetProjection
                    .reprojectPoint(webMercatorProjection, pos, worldPos)
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
                    objInfos.push(env.entries);
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

        const { targetProjection, center, projectedTileBounds } = this.m_decodeInfo;

        const tileWidth = projectedTileBounds.max.x - projectedTileBounds.min.x;
        const tileHeight = projectedTileBounds.max.y - projectedTileBounds.min.y;
        const tileSizeInMeters = Math.max(tileWidth, tileHeight);

        for (const polyline of geometry) {
            const line: number[] = [];
            polyline.positions.forEach(pos => {
                const { x, y, z } = targetProjection
                    .reprojectPoint(webMercatorProjection, pos, worldPos)
                    .sub(center);
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
                            featureId,
                            objInfos: this.m_gatherFeatureIds ? env.entries : undefined
                        });
                    }
                } else {
                    const lineMarkerTechnique = technique as LineMarkerTechnique;
                    let imageTexture = lineMarkerTechnique.imageTexture;

                    // TODO: Move to decoder independent parts of code.
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
                            featureId,
                            objInfos: this.m_gatherFeatureIds ? [env.entries] : undefined
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
                const {
                    positions,
                    indices,
                    groups,
                    featureIds,
                    featureStarts,
                    objInfos
                } = meshBuffers;
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

                    if (this.m_gatherFeatureIds) {
                        featureIds.push(featureId);
                        featureStarts.push(start);
                        objInfos.push(env.entries);
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

        const { targetProjection, center } = this.m_decodeInfo;

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

            const polygons: Ring[][] = [];

            const worldPos = new THREE.Vector3();

            const isExtruded = isExtrudedPolygonTechnique(technique);
            const isFilled = isFillTechnique(technique);
            const texCoordType = textureCoordinateType(technique);

            const isLine =
                isSolidLineTechnique(technique) ||
                isDashedLineTechnique(technique) ||
                isLineTechnique(technique);
            const isPolygon = isExtruded || isFilled || isStandardTechnique(technique);

            const edgeWidth = isExtruded
                ? extrudedPolygonTechnique.lineWidth || 0.0
                : isFilled
                ? fillTechnique.lineWidth || 0.0
                : 0.0;
            const hasEdges = edgeWidth > 0.0 || isLine;

            const isSpherical = targetProjection.type === ProjectionType.Spherical;

            const tempTexcoords = new THREE.Vector3();

            const computeTexCoords =
                texCoordType === TextureCoordinateType.TileSpace
                    ? (pos: THREE.Vector3) => {
                          const { x: u, y: v } = tempTexcoords
                              .copy(pos)
                              .sub(this.m_decodeInfo.tileBounds.min)
                              .divide(this.m_decodeInfo.tileSize);
                          return { u, v: 1 - v };
                      }
                    : texCoordType === TextureCoordinateType.EquirectangularSpace
                    ? (pos: THREE.Vector3) => {
                          const { x: u, y: v } = normalizedEquirectangularProjection.reprojectPoint(
                              webMercatorProjection,
                              pos
                          );
                          return { u, v };
                      }
                    : undefined;

            const vertexStride = computeTexCoords !== undefined ? 5 : 3;

            for (const polygon of geometry) {
                const rings: Ring[] = [];

                for (const outline of polygon.rings) {
                    const ringContour: number[] = [];
                    const ringPoints: number[] | undefined = isSpherical ? [] : undefined;
                    let ringEdges: boolean[] | undefined;

                    for (let coordIdx = 0; coordIdx < outline.positions.length; ++coordIdx) {
                        const pos = outline.positions[coordIdx];
                        targetProjection
                            .reprojectPoint(webMercatorProjection, pos, worldPos)
                            .sub(center);

                        ringContour.push(worldPos.x, worldPos.y, worldPos.z);

                        if (ringPoints !== undefined) {
                            mercatorProjection.reprojectPoint(webMercatorProjection, pos, worldPos);

                            ringPoints.push(worldPos.x, worldPos.y, worldPos.z);
                        }

                        if (hasEdges && outline.outlines !== undefined) {
                            const edge = outline.outlines[coordIdx];
                            if (ringEdges === undefined) {
                                ringEdges = [edge];
                            } else {
                                ringEdges.push(edge);
                            }
                        }

                        if (computeTexCoords !== undefined) {
                            const { u, v } = computeTexCoords(pos);
                            ringContour.push(u, v);
                            if (ringPoints !== undefined) {
                                ringPoints.push(u, v);
                            }
                        }
                    }

                    rings.push(new Ring(vertexStride, ringContour, ringEdges, ringPoints));
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
            lineGroup.add(this.m_decodeInfo.center, aLine);
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
        const texCoordType = textureCoordinateType(technique);

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

        const {
            positions,
            textureCoordinates,
            colors,
            extrusionAxis,
            indices,
            edgeIndices,
            groups
        } = meshBuffers;

        const stride = texCoordType !== undefined ? 5 : 3;
        const isSpherical = this.m_decodeInfo.targetProjection.type === ProjectionType.Spherical;

        for (const rings of polygons) {
            const start = indices.length;
            const basePosition = positions.length;

            for (let ringIndex = 0; ringIndex < rings.length; ) {
                const baseVertex = positions.length / 3;

                // Get the contour vertices for this ring.
                const ring = rings[ringIndex++];

                const vertices: number[] = [...ring.contour];
                const points: number[] = [...ring.points];

                if (isExtruded) {
                    addExtrudedWalls(
                        indices,
                        baseVertex,
                        stride,
                        ring.contour,
                        ring.contourOutlines,
                        extrudedPolygonTechnique.boundaryWalls
                    );
                }
                if (ring.contourOutlines !== undefined) {
                    addPolygonEdges(
                        edgeIndices,
                        baseVertex,
                        stride,
                        ring.contour,
                        ring.contourOutlines,
                        isExtruded,
                        extrudedPolygonTechnique.footprint,
                        extrudedPolygonTechnique.maxSlope
                    );
                }

                // Repeat the process for all the inner rings (holes).
                const outerRingWinding = ring.winding;
                const holes: number[] = [];

                // Iterate over the inner rings. The inner rings have the oppositve winding
                // of the outer rings.
                while (ringIndex < rings.length && rings[ringIndex].winding !== outerRingWinding) {
                    const current = rings[ringIndex++];
                    holes.push(vertices.length / stride);

                    // As we are predicting the indexes before the vertices are added,
                    // the vertex offset has to be taken into account
                    const vertexOffset = (vertices.length / stride) * 2;
                    vertices.push(...current.contour);
                    points.push(...current.points);

                    if (isExtruded) {
                        addExtrudedWalls(
                            indices,
                            vertexOffset + baseVertex,
                            stride,
                            current.contour,
                            current.contourOutlines,
                            extrudedPolygonTechnique.boundaryWalls
                        );
                    }
                    if (current.contourOutlines !== undefined) {
                        addPolygonEdges(
                            edgeIndices,
                            (isExtruded ? vertexOffset : vertexOffset / 2) + baseVertex,
                            stride,
                            current.contour,
                            current.contourOutlines,
                            isExtruded,
                            extrudedPolygonTechnique.footprint,
                            extrudedPolygonTechnique.maxSlope
                        );
                    }
                }

                try {
                    // Triangulate the footprint polyline.
                    // For sphere projection the stride of Ring.contour and Ring.points can be
                    // different b/c Ring.contour contains texture coordinates where Ring.points
                    // does not.
                    const triangles = earcut(points, holes, stride);

                    if (isSpherical) {
                        const geom = new THREE.Geometry();

                        for (let i = 0; i < vertices.length; i += stride) {
                            geom.vertices.push(
                                new THREE.Vector3(points[i], points[i + 1], points[i + 2])
                            );
                        }
                        for (let i = 0; i < triangles.length; i += 3) {
                            geom.faces.push(
                                new THREE.Face3(triangles[i], triangles[i + 1], triangles[i + 2])
                            );
                            if (texCoordType !== undefined) {
                                const i0 = triangles[i] * stride;
                                const i1 = triangles[i + 1] * stride;
                                const i2 = triangles[i + 2] * stride;
                                geom.faceVertexUvs[0][i / 3] = [
                                    new THREE.Vector2(points[i0 + 3], points[i0 + 4]),
                                    new THREE.Vector2(points[i1 + 3], points[i1 + 4]),
                                    new THREE.Vector2(points[i2 + 3], points[i2 + 4])
                                ];
                            }
                        }

                        // FIXME(HARP-5700): Subdivison modifer ignores texture coordinates.
                        const modifier = new SphericalGeometrySubdivisionModifier(
                            THREE.Math.degToRad(10),
                            mercatorProjection
                        );

                        modifier.modify(geom);

                        vertices.length = 0;
                        triangles.length = 0;

                        geom.vertices.forEach(p => {
                            this.projection.reprojectPoint(mercatorProjection, p, p);
                            p.sub(this.m_decodeInfo.center);
                            vertices.push(p.x, p.y, p.z);
                            if (texCoordType !== undefined) {
                                vertices.push(0, 0);
                            }
                        });

                        geom.faces.forEach((face, i) => {
                            const { a, b, c } = face;
                            triangles.push(a, b, c);
                            if (texCoordType !== undefined) {
                                const vertexUvs = geom.faceVertexUvs[0][i];
                                if (vertexUvs !== undefined) {
                                    vertexUvs[0].toArray(vertices, a * stride + 3);
                                    vertexUvs[1].toArray(vertices, b * stride + 3);
                                    vertexUvs[2].toArray(vertices, c * stride + 3);
                                }
                            }
                        });
                    }

                    // Add the footprint/roof vertices to the position buffer.
                    tempVertNormal.set(0, 0, 1);
                    for (let i = 0; i < vertices.length; i += stride) {
                        let scaleFactor = 1.0;
                        if (isExtruded && constantHeight !== true) {
                            tempVertOrigin.set(
                                tempTileOrigin.x + vertices[i],
                                tempTileOrigin.y + vertices[i + 1],
                                tempTileOrigin.z + vertices[i + 2]
                            );
                            scaleFactor = this.m_decodeInfo.targetProjection.getScaleFactor(
                                tempVertOrigin
                            );
                        }

                        if (isSpherical) {
                            tempVertNormal
                                .set(vertices[i], vertices[i + 1], vertices[i + 2])
                                .add(this.center)
                                .normalize();
                        }

                        tempFootDisp.copy(tempVertNormal).multiplyScalar(minHeight * scaleFactor);
                        tempRoofDisp.copy(tempVertNormal).multiplyScalar(height * scaleFactor);
                        positions.push(
                            vertices[i] + tempFootDisp.x,
                            vertices[i + 1] + tempFootDisp.y,
                            vertices[i + 2] + tempFootDisp.z
                        );
                        if (texCoordType !== undefined) {
                            textureCoordinates.push(vertices[i + 3], vertices[i + 4]);
                        }

                        if (isExtruded) {
                            positions.push(
                                vertices[i] + tempRoofDisp.x,
                                vertices[i + 1] + tempRoofDisp.y,
                                vertices[i + 2] + tempRoofDisp.z
                            );
                            extrusionAxis.push(
                                0,
                                0,
                                0,
                                tempRoofDisp.x - tempFootDisp.x,
                                tempRoofDisp.y - tempFootDisp.y,
                                tempRoofDisp.z - tempFootDisp.z
                            );
                            if (texCoordType !== undefined) {
                                textureCoordinates.push(vertices[i + 3], vertices[i + 4]);
                            }
                        }
                    }

                    // Add the footprint/roof indices to the index buffer.
                    for (let i = 0; i < triangles.length; i += 3) {
                        if (isExtruded) {
                            // When extruding we duplicate the vertices, so that all even vertices
                            // belong to the bottom and all odd vertices belong to the top.
                            const i0 = baseVertex + triangles[i + 0] * 2 + 1;
                            const i1 = baseVertex + triangles[i + 1] * 2 + 1;
                            const i2 = baseVertex + triangles[i + 2] * 2 + 1;
                            indices.push(i0, i1, i2);
                        } else {
                            const i0 = baseVertex + triangles[i + 0];
                            const i1 = baseVertex + triangles[i + 1];
                            const i2 = baseVertex + triangles[i + 2];
                            indices.push(i0, i1, i2);
                        }
                    }
                } catch (err) {
                    logger.error(`cannot triangulate geometry`, err);
                }
            }

            if (isExtrudedPolygonTechnique(technique) && technique.vertexColors === true) {
                const positionCount = (positions.length - basePosition) / 3;
                const color = new THREE.Color(
                    technique.color !== undefined
                        ? getPropertyValue(technique.color, this.m_decodeInfo.tileKey.level)
                        : this.isColorStringValid(env.lookup("color") as string)
                        ? (env.lookup("color") as string)
                        : technique.defaultColor !== undefined
                        ? getPropertyValue(technique.defaultColor, this.m_decodeInfo.tileKey.level)
                        : 0x000000
                );

                for (let i = 0; i < positionCount; ++i) {
                    colors.push(color.r, color.g, color.b);
                }
            }

            if (this.m_gatherFeatureIds) {
                meshBuffers.objInfos.push(env.entries);
                meshBuffers.featureIds.push(featureId);
                meshBuffers.featureStarts.push(start);
            }

            const count = indices.length - start;
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

    private createGeometries() {
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
                    stringCatalog: meshBuffers.stringCatalog,
                    objInfos: this.m_gatherFeatureIds ? meshBuffers.objInfos : undefined
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
                    imageTextures: meshBuffers.imageTextures,
                    objInfos: meshBuffers.objInfos
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

            if (meshBuffers.extrusionAxis.length > 0) {
                const extrusionAxis = new Float32Array(meshBuffers.extrusionAxis);
                assert(
                    extrusionAxis.length === positionElements.length,
                    "length of extrusionAxis buffer is different than the length of the " +
                        "position buffer"
                );

                geometry.vertexAttributes.push({
                    name: "extrusionAxis",
                    buffer: extrusionAxis.buffer as ArrayBuffer,
                    itemCount: 3,
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
                // TODO: use uint16 for buffers when possible. Issue HARP-3987
                geometry.edgeIndex = {
                    name: "edgeIndex",
                    buffer: new Uint32Array(meshBuffers.edgeIndices as number[])
                        .buffer as ArrayBuffer,
                    itemCount: 1,
                    type: "uint32"
                };
            }

            if (this.m_gatherFeatureIds) {
                geometry.featureIds = meshBuffers.featureIds;
                geometry.featureStarts = meshBuffers.featureStarts;
                geometry.objInfos = meshBuffers.objInfos;
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
