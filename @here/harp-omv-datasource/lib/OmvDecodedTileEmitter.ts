/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeMap,
    BufferAttribute,
    composeTechniqueTextureName,
    DecodedTile,
    ExtendedTileInfo,
    ExtrudedPolygonTechnique,
    FillTechnique,
    Geometry,
    GeometryType,
    getFeatureId,
    Group,
    IndexedTechnique,
    InterleavedBufferAttribute,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isLabelRejectionLineTechnique,
    isLineMarkerTechnique,
    isLineTechnique,
    isPoiTechnique,
    isSolidLineTechnique,
    isSpecialDashesLineTechnique,
    isStandardTechnique,
    isTextTechnique,
    LineMarkerTechnique,
    PathGeometry,
    PoiGeometry,
    PoiTechnique,
    StyleColor,
    Technique,
    TextGeometry,
    TextPathGeometry,
    TextTechnique,
    textureCoordinateType,
    TextureCoordinateType
} from "@here/harp-datasource-protocol";
import {
    Env,
    IMeshBuffers,
    StyleSetEvaluator,
    Value
} from "@here/harp-datasource-protocol/index-decoder";
import { LineGroup } from "@here/harp-lines/lib/Lines";
import { triangulateLine } from "@here/harp-lines/lib/TriangulateLines";
import { assert, getOptionValue, LoggerManager, Math2D } from "@here/harp-utils";
import earcut from "earcut";
import * as THREE from "three";

import {
    normalizedEquirectangularProjection,
    ProjectionType,
    Vector3Like,
    webMercatorProjection
} from "@here/harp-geoutils";

import { ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { LinesGeometry } from "./OmvDataSource";
import { IOmvEmitter, OmvDecoder, Ring } from "./OmvDecoder";
import {
    tile2world,
    webMercatorTile2TargetTile,
    webMercatorTile2TargetWorld,
    world2tile
} from "./OmvUtils";

import {
    AttrEvaluationContext,
    evaluateTechniqueAttr
} from "@here/harp-datasource-protocol/lib/TechniqueAttr";
import {
    EdgeLengthGeometrySubdivisionModifier,
    SubdivisionMode
} from "@here/harp-geometry/lib/EdgeLengthGeometrySubdivisionModifier";
// tslint:disable-next-line:max-line-length
import { SphericalGeometrySubdivisionModifier } from "@here/harp-geometry/lib/SphericalGeometrySubdivisionModifier";
import { ExtrusionFeatureDefs } from "@here/harp-materials/lib/MapMeshMaterialsDefs";
import { clipPolygon } from "./clipPolygon";

const logger = LoggerManager.instance.create("OmvDecodedTileEmitter");

const tempTileOrigin = new THREE.Vector3();
const tempVertOrigin = new THREE.Vector3();
const tempVertNormal = new THREE.Vector3();
const tempFootDisp = new THREE.Vector3();
const tempRoofDisp = new THREE.Vector3();

const tmpV2 = new THREE.Vector2();
const tmpV2r = new THREE.Vector2();
const tmpV3 = new THREE.Vector3();
const tmpV3r = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();

const tempP0 = new THREE.Vector2();
const tempP1 = new THREE.Vector2();
const tempPreviousTangent = new THREE.Vector2();

const tmpPointA = new THREE.Vector3();
const tmpPointB = new THREE.Vector3();
const tmpPointC = new THREE.Vector3();
const tmpPointD = new THREE.Vector3();
const tmpPointE = new THREE.Vector3();
const tmpLine = new THREE.Line3();

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
 * Maximum allowed corner angle inside a label path.
 */
const MAX_CORNER_ANGLE = Math.PI / 8;

/**
 * Used to identify an invalid (or better: unused) array index.
 */
const INVALID_ARRAY_INDEX = -1;

// for tilezen by default extrude all buildings even those without height data
class MeshBuffers implements IMeshBuffers {
    readonly positions: number[] = [];
    readonly normals: number[] = [];
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
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    readonly featureStarts: number[] = [];

    /**
     * An optional list of additional data that can be used as additional data for the object
     * picking.
     */
    readonly objInfos: AttributeMap[] = [];

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

type TexCoordsFunction = (tilePos: THREE.Vector2, tileExtents: number) => { u: number; v: number };
const tmpColor = new THREE.Color();

export class OmvDecodedTileEmitter implements IOmvEmitter {
    // mapping from style index to mesh buffers
    private readonly m_meshBuffers = new Map<number, MeshBuffers>();

    private readonly m_geometries: Geometry[] = [];
    private readonly m_textGeometries: TextGeometry[] = [];
    private readonly m_textPathGeometries: TextPathGeometry[] = [];
    private readonly m_pathGeometries: PathGeometry[] = [];
    private readonly m_poiGeometries: PoiGeometry[] = [];
    private readonly m_simpleLines: LinesGeometry[] = [];
    private readonly m_solidLines: LinesGeometry[] = [];

    private readonly m_sources: string[] = [];
    private m_maxGeometryHeight: number = 0;

    constructor(
        private readonly m_decodeInfo: OmvDecoder.DecodeInfo,
        private readonly m_styleSetEvaluator: StyleSetEvaluator,
        private readonly m_gatherFeatureAttributes: boolean,
        private readonly m_skipShortLabels: boolean,
        private readonly m_enableElevationOverlay: boolean,
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
     * @param extents Tile's layer extents.
     * @param geometry The current feature containing the main geometry.
     * @param env The [[MapEnv]] containing the environment information for the map.
     * @param techniques The array of [[Technique]] that will be applied to the geometry.
     * @param featureId The id of the feature.
     */
    processPointFeature(
        layer: string,
        extents: number,
        geometry: THREE.Vector2[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const env = context.env;
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

            const { positions, texts, imageTextures, objInfos } = meshBuffers;

            const shouldCreateTextGeometries =
                isTextTechnique(technique) || isPoiTechnique(technique);

            let imageTexture: string | undefined;
            const wantsPoi = isPoiTechnique(technique);

            if (wantsPoi) {
                const poiTechnique = technique as PoiTechnique;
                imageTexture = evaluateTechniqueAttr(context, poiTechnique.imageTexture);

                // TODO: Move to decoder independent parts of code.
                if (poiTechnique.poiName !== undefined) {
                    imageTexture = evaluateTechniqueAttr(context, poiTechnique.poiName);
                } else if (typeof poiTechnique.poiNameField === "string") {
                    const poiNameFieldValue = env.lookup(poiTechnique.poiNameField) as string;
                    imageTexture = poiNameFieldValue;
                } else if (typeof poiTechnique.imageTextureField === "string") {
                    const imageTextureValue = env.lookup(poiTechnique.imageTextureField) as string;
                    imageTexture = composeTechniqueTextureName(imageTextureValue, poiTechnique);
                }
            }

            for (const pos of geometry) {
                if (shouldCreateTextGeometries) {
                    const textTechnique = technique as TextTechnique;
                    const text = ExtendedTileInfo.getFeatureText(
                        context,
                        textTechnique,
                        this.m_languages
                    );

                    if (text !== undefined && text.length > 0) {
                        texts.push(meshBuffers.addText(text));
                    } else {
                        texts.push(INVALID_ARRAY_INDEX);
                    }
                }

                // Always store the position, otherwise the following POIs will be
                // misplaced.
                if (shouldCreateTextGeometries) {
                    webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos, tmpV3);
                } else {
                    webMercatorTile2TargetTile(extents, this.m_decodeInfo, pos, tmpV3);
                }
                positions.push(tmpV3.x, tmpV3.y, tmpV3.z);
                objInfos.push(
                    this.m_gatherFeatureAttributes ? env.entries : getFeatureId(env.entries)
                );

                if (wantsPoi) {
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
     * @param extents Tile's layer extents.
     * @param geometry The current feature containing the main geometry.
     * @param env The [[MapEnv]] containing the environment information for the map.
     * @param techniques The array of [[Technique]] that will be applied to the geometry.
     * @param featureId The id of the feature.
     */
    processLineFeature(
        layer: string,
        extents: number,
        geometry: ILineGeometry[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const env = context.env;
        this.processFeatureCommon(env);

        const localLines: number[][] = []; // lines in target tile space.
        const worldLines: number[][] = []; // lines in world space.
        const uvs: number[][] = [];
        const offsets: number[][] = [];
        const projectedBoundingBox = this.m_decodeInfo.projectedBoundingBox;

        let localLineSegments: number[][]; // lines in target tile space for special dashes.

        const tileWidth = projectedBoundingBox.extents.x * 2;
        const tileHeight = projectedBoundingBox.extents.y * 2;
        const tileSizeWorld = Math.max(tileWidth, tileHeight);

        let computeTexCoords: TexCoordsFunction | undefined;
        let texCoordinateType: TextureCoordinateType | undefined;

        const hasUntiledLines = geometry[0].untiledPositions !== undefined;

        // If true, special handling for dashes is required (round and diamond shaped dashes).
        let hasIndividualLineSegments = false;
        let hasContinuousLineSegments = false;

        // Check if any of the techniques needs texture coordinates
        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }
            if (!computeTexCoords) {
                computeTexCoords = this.getComputeTexCoordsFunc(technique);
                texCoordinateType = this.getTextureCoordinateType(technique);
            } else {
                // Support generation of only one type of texture coordinates.
                const otherTexCoordType = this.getTextureCoordinateType(technique);
                assert(otherTexCoordType === undefined || texCoordinateType === otherTexCoordType);
            }

            hasIndividualLineSegments =
                hasIndividualLineSegments || isSpecialDashesLineTechnique(technique);

            hasContinuousLineSegments = hasContinuousLineSegments || !hasIndividualLineSegments;
        }

        for (const polyline of geometry) {
            // Compute the world position of the untiled line and its distance to the origin of the
            // line to properly join lines.
            const untiledLine: number[] = [];
            let lineDist = 0;
            if (hasUntiledLines) {
                this.m_decodeInfo.targetProjection.projectPoint(
                    polyline.untiledPositions![0],
                    tmpV3r
                );
                polyline.untiledPositions!.forEach(pos => {
                    // Calculate the distance to the next un-normalized point.
                    this.m_decodeInfo.targetProjection.projectPoint(pos, tmpV3);
                    lineDist += tmpV3.distanceTo(tmpV3r);
                    tmpV3r.copy(tmpV3);

                    // Pushed the normalized point for line matching.
                    this.m_decodeInfo.targetProjection.projectPoint(pos.normalized(), tmpV3);
                    untiledLine.push(tmpV3.x, tmpV3.y, tmpV3.z, lineDist);
                });
            }

            // Add continuous line as individual segments to improve special dashes by overlapping
            // their connecting vertices. The technique/style should defined round or rectangular
            // caps.
            if (hasIndividualLineSegments) {
                localLineSegments = [];

                // Compute length of whole line and offsets of individual segments.
                let lineLength = 0;
                const pointCount = polyline.positions.length;
                if (pointCount > 1) {
                    let lastSegmentOffset = 0;

                    for (let i = 0; i < pointCount - 1; i++) {
                        const localLine: number[] = [];
                        const worldLine: number[] = [];
                        const lineUvs: number[] = [];
                        const segmentOffsets: number[] = [];

                        const pos1 = polyline.positions[i];
                        const pos2 = polyline.positions[i + 1];
                        webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos1, tmpV3);
                        worldLine.push(tmpV3.x, tmpV3.y, tmpV3.z);
                        webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos2, tmpV4);
                        worldLine.push(tmpV4.x, tmpV4.y, tmpV4.z);

                        if (computeTexCoords) {
                            {
                                const { u, v } = computeTexCoords(pos1, extents);
                                lineUvs.push(u, v);
                            }
                            {
                                const { u, v } = computeTexCoords(pos2, extents);
                                lineUvs.push(u, v);
                            }
                        }
                        if (hasUntiledLines) {
                            // Find where in the [0...1] range relative to the line our current
                            // vertex lies.
                            let offset =
                                this.findRelativePositionInLine(tmpV3, untiledLine) / lineDist;
                            segmentOffsets.push(offset);
                            offset = this.findRelativePositionInLine(tmpV4, untiledLine) / lineDist;
                            segmentOffsets.push(offset);
                        } else {
                            segmentOffsets.push(lastSegmentOffset);

                            // Compute length of segment and whole line to scale down later.
                            const segmentLength = tmpV3.distanceTo(tmpV4);
                            lineLength += segmentLength;
                            lastSegmentOffset += segmentLength;
                            segmentOffsets.push(lastSegmentOffset);
                        }

                        tmpV3.sub(this.m_decodeInfo.center);
                        localLine.push(tmpV3.x, tmpV3.y, tmpV3.z);
                        tmpV4.sub(this.m_decodeInfo.center);
                        localLine.push(tmpV4.x, tmpV4.y, tmpV4.z);

                        localLineSegments!.push(localLine);
                        worldLines.push(worldLine);
                        uvs.push(lineUvs);
                        offsets.push(segmentOffsets);
                    }
                }

                if (!hasUntiledLines && lineLength > 0) {
                    // Scale down each individual segment to range [0..1] for whole line.
                    for (const segOffsets of offsets) {
                        segOffsets.forEach((offs, index) => {
                            segOffsets[index] = offs / lineLength;
                        });
                    }
                }
            }

            // Add continuous lines
            if (hasContinuousLineSegments) {
                const localLine: number[] = [];
                const worldLine: number[] = [];
                const lineUvs: number[] = [];
                const lineOffsets: number[] = [];
                polyline.positions.forEach(pos => {
                    webMercatorTile2TargetWorld(extents, this.m_decodeInfo, pos, tmpV3);
                    worldLine.push(tmpV3.x, tmpV3.y, tmpV3.z);

                    if (computeTexCoords) {
                        const { u, v } = computeTexCoords(pos, extents);
                        lineUvs.push(u, v);
                    }
                    if (hasUntiledLines) {
                        // Find where in the [0...1] range relative to the line our current vertex
                        // lines.
                        const offset =
                            this.findRelativePositionInLine(tmpV3, untiledLine) / lineDist;
                        lineOffsets.push(offset);
                    }
                    tmpV3.sub(this.m_decodeInfo.center);
                    localLine.push(tmpV3.x, tmpV3.y, tmpV3.z);
                });
                localLines.push(localLine);
                worldLines.push(worldLine);
                uvs.push(lineUvs);
                offsets.push(lineOffsets);
            }
        }

        const wantCircle = this.m_decodeInfo.tileKey.level >= 11;

        for (const technique of techniques) {
            if (technique === undefined) {
                continue;
            }
            const techniqueIndex = technique._index;
            const techniqueName = technique.name;

            if (isLineTechnique(technique) || isSolidLineTechnique(technique)) {
                const lineGeometry = isLineTechnique(technique)
                    ? this.m_simpleLines
                    : this.m_solidLines;

                const lineType = isLineTechnique(technique) ? LineType.Simple : LineType.Complex;

                if (hasIndividualLineSegments) {
                    assert(
                        localLineSegments! !== undefined,
                        "OmvDecodedTileEmitter#processLineFeature: " +
                            "Internal error - No localLineSegments"
                    );

                    this.applyLineTechnique(
                        lineGeometry,
                        technique,
                        techniqueIndex,
                        lineType,
                        env.entries,
                        localLineSegments!,
                        context,
                        this.getTextureCoordinateType(technique) ? uvs : undefined,
                        offsets
                    );
                }
                if (localLines.length > 0) {
                    this.applyLineTechnique(
                        lineGeometry,
                        technique,
                        techniqueIndex,
                        lineType,
                        env.entries,
                        localLines,
                        context,
                        this.getTextureCoordinateType(technique) ? uvs : undefined,
                        hasUntiledLines ? offsets : undefined
                    );
                }
            } else if (
                isTextTechnique(technique) ||
                isPoiTechnique(technique) ||
                isLineMarkerTechnique(technique)
            ) {
                const textTechnique = technique as TextTechnique;
                const text = ExtendedTileInfo.getFeatureText(
                    context,
                    textTechnique,
                    this.m_languages
                );

                if (text === undefined || text.length === 0) {
                    continue;
                }
                let validLines: number[][] = [];

                if (this.m_skipShortLabels) {
                    // Filter the lines, keep only those that are long enough for labelling. Also,
                    // split jagged label paths to keep processing and rendering only those that
                    // have no sharp corners, which would not be rendered anyway.

                    const worldUnitsPerPixel = tileSizeWorld / this.m_decodeInfo.tileSizeOnScreen;
                    const minEstimatedLabelLength =
                        MIN_AVERAGE_CHAR_WIDTH *
                        text.length *
                        worldUnitsPerPixel *
                        SIZE_ESTIMATION_FACTOR;
                    const minEstimatedLabelLengthSqr =
                        minEstimatedLabelLength * minEstimatedLabelLength;

                    validLines = this.splitJaggyLines(
                        worldLines,
                        minEstimatedLabelLengthSqr,
                        MAX_CORNER_ANGLE
                    );
                } else {
                    validLines = worldLines;
                }

                if (validLines.length === 0) {
                    continue;
                }

                if (isTextTechnique(technique)) {
                    if (text === undefined) {
                        continue;
                    }
                    for (const path of validLines) {
                        const pathLengthSqr = Math2D.computeSquaredLineLength(path);
                        this.m_textPathGeometries.push({
                            technique: techniqueIndex,
                            path,
                            pathLengthSqr,
                            text: String(text),
                            objInfos: this.m_gatherFeatureAttributes
                                ? env.entries
                                : getFeatureId(env.entries)
                        });
                    }
                } else {
                    const lineMarkerTechnique = technique as LineMarkerTechnique;

                    let imageTexture = evaluateTechniqueAttr(
                        context,
                        lineMarkerTechnique.imageTexture
                    );

                    // TODO: `imageTextureField` and `imageTexturePrefix` and `imageTexturePostfix`
                    // are now deprecated

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
                            objInfos: this.m_gatherFeatureAttributes
                                ? [env.entries]
                                : [getFeatureId(env.entries)]
                        });
                    }
                }
            } else if (isLabelRejectionLineTechnique(technique)) {
                for (const path of worldLines) {
                    const worldPath: Vector3Like[] = [];
                    for (let i = 0; i < path.length; i += 3) {
                        worldPath.push(new THREE.Vector3().fromArray(path, i) as Vector3Like);
                    }
                    this.m_pathGeometries.push({
                        path: worldPath
                    });
                }
            } else if (isExtrudedLineTechnique(technique)) {
                const meshBuffers = this.findOrCreateMeshBuffers(
                    techniqueIndex,
                    GeometryType.ExtrudedLine
                );
                if (meshBuffers === undefined) {
                    continue;
                }
                const { positions, indices, groups, featureStarts, objInfos } = meshBuffers;
                const start = indices.length;

                const lineWidth = evaluateTechniqueAttr<number>(context, technique.lineWidth);

                if (lineWidth === undefined) {
                    continue;
                }

                const techniqueCaps = evaluateTechniqueAttr<string>(
                    context,
                    technique.caps,
                    "Circle"
                );

                const addCircle = wantCircle && techniqueCaps === "Circle";

                localLines.forEach(aLine => {
                    triangulateLine(aLine, lineWidth, positions, indices, addCircle);
                    featureStarts.push(start);
                    objInfos.push(
                        this.m_gatherFeatureAttributes ? env.entries : getFeatureId(env.entries)
                    );
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
     * @param extents Tile's layer extents.
     * @param geometry The current feature containing the main geometry.
     * @param feature The [[MapEnv]] containing the environment information for the map.
     * @param techniques The array of [[Technique]] that will be applied to the geometry.
     * @param featureId The id of the feature.
     */
    processPolygonFeature(
        layer: string,
        extents: number,
        geometry: IPolygonGeometry[],
        context: AttrEvaluationContext,
        techniques: IndexedTechnique[],
        featureId: number | undefined
    ): void {
        const env = context.env;
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

            const polygons: Ring[][] = [];

            const isExtruded = isExtrudedPolygonTechnique(technique);
            const isFilled = isFillTechnique(technique);
            const isStandard = isStandardTechnique(technique);

            const isPolygon = isExtruded || isFilled || isStandard;
            const computeTexCoords = this.getComputeTexCoordsFunc(technique);
            const vertexStride = computeTexCoords !== undefined ? 4 : 2;

            let clipRing: THREE.Vector2[] | undefined;

            for (const polygon of geometry) {
                const rings: Ring[] = [];

                for (const outline of polygon.rings) {
                    const ringContour: number[] = [];

                    let coords = outline;

                    if (isFilled || isStandard) {
                        const shouldClipPolygon = coords.some(
                            p => p.x < 0 || p.x > extents || p.y < 0 || p.y > extents
                        );

                        if (shouldClipPolygon) {
                            if (!clipRing) {
                                clipRing = [
                                    new THREE.Vector2(0, 0),
                                    new THREE.Vector2(extents, 0),
                                    new THREE.Vector2(extents, extents),
                                    new THREE.Vector2(0, extents)
                                ];
                            }

                            coords = clipPolygon(coords, clipRing);
                        }
                    }

                    if (coords.length === 0) {
                        continue;
                    }

                    for (const coord of coords) {
                        ringContour.push(coord.x, coord.y);
                        if (computeTexCoords !== undefined) {
                            const { u, v } = computeTexCoords(coord, extents);
                            ringContour.push(u, v);
                        }
                    }

                    rings.push(new Ring(extents, vertexStride, ringContour));
                }

                if (rings.length === 0) {
                    continue;
                }

                polygons.push(rings);
            }

            const isLine = isSolidLineTechnique(technique) || isLineTechnique(technique);
            if (isPolygon) {
                this.applyPolygonTechnique(
                    polygons,
                    technique,
                    techniqueIndex,
                    featureId,
                    context,
                    extents
                );
            } else if (isLine) {
                const lineGeometry =
                    technique.name === "line" ? this.m_simpleLines : this.m_solidLines;

                const lineType = technique.name === "line" ? LineType.Simple : LineType.Complex;

                // Use individual line segments instead of a continuous line in special cases (round
                // and diamond shaped dashes).
                const needIndividualLineSegments = isSpecialDashesLineTechnique(technique);

                polygons.forEach(rings => {
                    const lines: number[][] = [];
                    const offsets: number[][] | undefined = needIndividualLineSegments
                        ? []
                        : undefined;
                    rings.forEach(ring => {
                        const length = ring.contour.length / ring.vertexStride;
                        let line: number[] = [];

                        // Compute length of whole line and offsets of individual segments.
                        let ringLength = 0;
                        let lastSegmentOffset = 0;
                        let segmentOffsets: number[] | undefined = needIndividualLineSegments
                            ? []
                            : undefined;

                        for (let i = 0; i < length; ++i) {
                            if (needIndividualLineSegments && line.length > 0) {
                                // Allocate a line for every segment.
                                line = [];
                                segmentOffsets = [];
                            }

                            const nextIdx = (i + 1) % length;
                            const currX = ring.contour[i * ring.vertexStride];
                            const currY = ring.contour[i * ring.vertexStride + 1];
                            const nextX = ring.contour[nextIdx * ring.vertexStride];
                            const nextY = ring.contour[nextIdx * ring.vertexStride + 1];

                            const isOutline = !(
                                (currX <= 0 && nextX <= 0) ||
                                (currX >= ring.extents && nextX >= ring.extents) ||
                                (currY <= 0 && nextY <= 0) ||
                                (currY >= ring.extents && nextY >= ring.extents)
                            );

                            if (!isOutline && line.length !== 0) {
                                lines.push(line);
                                line = [];
                            } else if (isOutline && line.length === 0) {
                                webMercatorTile2TargetTile(
                                    extents,
                                    this.m_decodeInfo,
                                    tmpV2.set(currX, currY),
                                    tmpV3
                                );
                                line.push(tmpV3.x, tmpV3.y, tmpV3.z);

                                if (needIndividualLineSegments) {
                                    // Add next point as the end point of this line segment.
                                    webMercatorTile2TargetTile(
                                        extents,
                                        this.m_decodeInfo,
                                        tmpV2.set(nextX, nextY),
                                        tmpV4
                                    );
                                    line.push(tmpV4.x, tmpV4.y, tmpV4.z);

                                    segmentOffsets!.push(lastSegmentOffset);

                                    // Compute length of segment and whole line to scale down later.
                                    const segmentLength = tmpV3.distanceTo(tmpV4);
                                    ringLength += segmentLength;
                                    lastSegmentOffset += segmentLength;
                                    segmentOffsets!.push(lastSegmentOffset);
                                }
                            }
                            if (isOutline && !needIndividualLineSegments) {
                                webMercatorTile2TargetTile(
                                    extents,
                                    this.m_decodeInfo,
                                    tmpV2.set(nextX, nextY),
                                    tmpV3
                                );
                                line.push(tmpV3.x, tmpV3.y, tmpV3.z);
                            }

                            if (needIndividualLineSegments && line.length > 0 && ringLength > 0) {
                                // Scale down each individual segment to range [0..1] for the whole
                                // line.
                                segmentOffsets!.forEach((offs, index) => {
                                    segmentOffsets![index] = offs / ringLength;
                                });

                                // Close the line segment as a single line.
                                lines.push(line);
                                offsets!.push(segmentOffsets!);
                            }
                        }

                        if (!needIndividualLineSegments && line.length > 0) {
                            lines.push(line);
                        }
                    });

                    if (lines.length === 0) {
                        return;
                    }

                    this.applyLineTechnique(
                        lineGeometry,
                        technique,
                        techniqueIndex,
                        lineType,
                        env.entries,
                        lines,
                        context,
                        undefined,
                        offsets!
                    );
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

        const decodedTile: DecodedTile = {
            techniques: this.m_styleSetEvaluator.decodedTechniques,
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
        if (this.m_pathGeometries.length > 0) {
            decodedTile.pathGeometries = this.m_pathGeometries;
        }
        if (this.m_sources.length !== 0) {
            decodedTile.copyrightHolderIds = this.m_sources;
        }
        decodedTile.maxGeometryHeight = this.m_maxGeometryHeight;
        return decodedTile;
    }

    /**
     * Split the lines array into multiple parts if there are sharp corners. Reject parts that are
     * too short to display the label text.
     *
     * @param {number[][]} lines Array containing the points of the paths.
     * @param {number} minEstimatedLabelLengthSqr Minimum label size squared.
     * @param {number} maxCornerAngle Maximum angle between consecutive path segments in radians.
     * @returns The split and filtered lines array.
     */
    protected splitJaggyLines(
        lines: number[][],
        minEstimatedLabelLengthSqr: number,
        maxCornerAngle: number
    ): number[][] {
        const validLines: number[][] = [];

        const computeBoundingBoxSizeSqr = (
            aLine: number[],
            startIndex: number,
            endIndex: number
        ): number => {
            let minX = Number.MAX_SAFE_INTEGER;
            let maxX = Number.MIN_SAFE_INTEGER;
            let minY = Number.MAX_SAFE_INTEGER;
            let maxY = Number.MIN_SAFE_INTEGER;
            for (let i = startIndex; i < endIndex; i += 3) {
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

            return (maxX - minX) * (maxX - minX) + (maxY - minY) * (maxY - minY);
        };

        // Work on a copy of the path.
        const pathsToCheck = lines.slice();

        while (pathsToCheck.length > 0) {
            const path = pathsToCheck.pop();

            if (path === undefined || path.length < 6) {
                continue;
            }

            let splitIndex = -1;

            for (let i = 0; i < path.length - 3; i += 3) {
                tempP0.set(path[i], path[i + 1]);
                tempP1.set(path[i + 3], path[i + 4]);
                const tangent = tempP1.sub(tempP0).normalize();

                if (i > 0) {
                    const theta = Math.atan2(
                        tempPreviousTangent.x * tangent.y - tangent.x * tempPreviousTangent.y,
                        tangent.dot(tempPreviousTangent)
                    );

                    if (Math.abs(theta) > maxCornerAngle) {
                        splitIndex = i;
                        break;
                    }
                }
                tempPreviousTangent.set(tangent.x, tangent.y);
            }

            if (splitIndex > 0) {
                // Estimate if the first part of the path is long enough for the label.
                const firstPathLengthSqr = computeBoundingBoxSizeSqr(path, 0, splitIndex + 3);
                // Estimate if the second part of the path is long enough for the label.
                const secondPathLengthSqr = computeBoundingBoxSizeSqr(
                    path,
                    splitIndex,
                    path.length
                );

                if (firstPathLengthSqr > minEstimatedLabelLengthSqr) {
                    // Split off the valid first path points with a clone of the path.
                    validLines.push(path.slice(0, splitIndex + 3));
                }

                if (secondPathLengthSqr > minEstimatedLabelLengthSqr) {
                    // Now process the second part of the path, it may have to be split
                    // again.
                    pathsToCheck.push(path.slice(splitIndex));
                }
            } else {
                // Estimate if the path is long enough for the label, otherwise ignore
                // it for rendering text. First, compute the bounding box in world
                // coordinates.
                const pathLengthSqr = computeBoundingBoxSizeSqr(path, 0, path.length);

                if (pathLengthSqr > minEstimatedLabelLengthSqr) {
                    validLines.push(path);
                }
            }
        }

        return validLines;
    }

    private getTextureCoordinateType(technique: Technique): TextureCoordinateType | undefined {
        // Set TileSpace coordinate type to generate texture coordinates for the displacement map
        // used in elevation overlay.
        if (
            (isFillTechnique(technique) ||
                isSolidLineTechnique(technique) ||
                isExtrudedPolygonTechnique(technique)) &&
            this.m_enableElevationOverlay
        ) {
            return TextureCoordinateType.TileSpace;
        }

        return textureCoordinateType(technique);
    }

    private getComputeTexCoordsFunc(technique: Technique): TexCoordsFunction | undefined {
        const texCoordType = this.getTextureCoordinateType(technique);

        return texCoordType === TextureCoordinateType.TileSpace
            ? (tilePos: THREE.Vector2, tileExtents: number) => {
                  const { x: u, y: v } = new THREE.Vector2()
                      .copy(tilePos)
                      .divideScalar(tileExtents);
                  return { u, v: 1 - v };
              }
            : texCoordType === TextureCoordinateType.EquirectangularSpace
            ? (tilePos: THREE.Vector2, extents: number) => {
                  const worldPos = tile2world(extents, this.m_decodeInfo, tilePos, false, tmpV2r);
                  const { x: u, y: v } = normalizedEquirectangularProjection.reprojectPoint(
                      webMercatorProjection,
                      new THREE.Vector3(worldPos.x, worldPos.y, 0)
                  );
                  return { u, v };
              }
            : undefined;
    }

    private applyLineTechnique(
        linesGeometry: LinesGeometry[],
        technique: IndexedTechnique,
        techniqueIndex: number,
        lineType = LineType.Complex,
        featureAttributes: AttributeMap,
        lines: number[][],
        context: AttrEvaluationContext,
        uvs?: number[][],
        offsets?: number[][]
    ): void {
        const renderOrderOffset = evaluateTechniqueAttr<number>(
            context,
            technique.renderOrderOffset,
            0
        );

        let lineGroup: LineGroup;
        const lineGroupGeometries = linesGeometry.find(aLine => {
            return (
                aLine.technique === techniqueIndex && aLine.renderOrderOffset === renderOrderOffset
            );
        });
        const hasNormalsAndUvs = uvs !== undefined;
        if (lineGroupGeometries === undefined) {
            lineGroup = new LineGroup(hasNormalsAndUvs, undefined, lineType === LineType.Simple);
            const aLine: LinesGeometry = {
                type: lineType === LineType.Complex ? GeometryType.SolidLine : GeometryType.Line,
                technique: techniqueIndex,
                renderOrderOffset:
                    renderOrderOffset !== undefined ? Number(renderOrderOffset) : undefined,
                lines: lineGroup
            };

            const techniqueTransient = evaluateTechniqueAttr<boolean>(
                context,
                technique.transient,
                false
            );
            if (!techniqueTransient && this.m_gatherFeatureAttributes) {
                // if this technique is transient, do not save the featureIds with the geometry
                aLine.objInfos = [featureAttributes];
                aLine.featureStarts = [0];
            }

            linesGeometry.push(aLine);
        } else {
            lineGroup = lineGroupGeometries.lines;

            if (
                this.m_gatherFeatureAttributes &&
                lineGroupGeometries.objInfos &&
                lineGroupGeometries.featureStarts
            ) {
                // Add ID to tag the geometry, also provide the current length of the index
                // attribute
                lineGroupGeometries.objInfos.push(featureAttributes);
                lineGroupGeometries.featureStarts.push(lineGroup.indices.length);
            }
        }
        let i = 0;
        lines.forEach(aLine => {
            lineGroup.add(
                this.m_decodeInfo.center,
                aLine,
                this.projection,
                offsets ? offsets[i] : undefined,
                uvs ? uvs[i] : undefined
            );
            i++;
        });
    }

    private applyPolygonTechnique(
        polygons: Ring[][],
        technique: Technique,
        techniqueIndex: number,
        featureId: number | undefined,
        context: AttrEvaluationContext,
        extents: number
    ): void {
        const isExtruded = isExtrudedPolygonTechnique(technique);

        const geometryType = isExtruded ? GeometryType.ExtrudedPolygon : GeometryType.Polygon;
        const meshBuffers = this.findOrCreateMeshBuffers(techniqueIndex, geometryType);

        if (meshBuffers === undefined) {
            return;
        }

        const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
        const fillTechnique = technique as FillTechnique;
        const boundaryWalls = extrudedPolygonTechnique.boundaryWalls !== false;

        const isFilled = isFillTechnique(technique);
        const texCoordType = this.getTextureCoordinateType(technique);

        let height = evaluateTechniqueAttr<number>(context, extrudedPolygonTechnique.height);

        let floorHeight = evaluateTechniqueAttr<number>(
            context,
            extrudedPolygonTechnique.floorHeight
        );

        if (height === undefined) {
            // Get the height values for the footprint and extrusion.
            const featureHeight = context.env.lookup("height") as number;
            const styleSetDefaultHeight = evaluateTechniqueAttr<number>(
                context,
                // tslint:disable-next-line: deprecation
                extrudedPolygonTechnique.defaultHeight
            );
            height =
                featureHeight !== undefined
                    ? featureHeight
                    : styleSetDefaultHeight !== undefined
                    ? styleSetDefaultHeight
                    : 0;
        }

        if (floorHeight === undefined) {
            const featureMinHeight = context.env.lookup("min_height") as number;
            floorHeight = featureMinHeight !== undefined && !isFilled ? featureMinHeight : 0;
        }

        // Prevent that extruded buildings are completely flat (can introduce errors in normal
        // computation and extrusion).
        height = Math.max(floorHeight + ExtrusionFeatureDefs.MIN_BUILDING_HEIGHT, height);

        const styleSetConstantHeight = getOptionValue(
            extrudedPolygonTechnique.constantHeight,
            false
        );

        this.m_decodeInfo.tileBounds.getCenter(tempTileOrigin);

        const {
            positions,
            normals,
            textureCoordinates,
            colors,
            extrusionAxis,
            indices,
            edgeIndices,
            groups
        } = meshBuffers;

        const featureStride = texCoordType !== undefined ? 4 : 2;
        const vertexStride = featureStride + 2;
        const isSpherical = this.m_decodeInfo.targetProjection.type === ProjectionType.Spherical;

        const edgeWidth = isExtruded
            ? extrudedPolygonTechnique.lineWidth || 0.0
            : isFilled
            ? fillTechnique.lineWidth || 0.0
            : 0.0;
        const hasEdges = edgeWidth > 0.0;

        let color: THREE.Color | undefined;
        if (isExtrudedPolygonTechnique(technique)) {
            if (getOptionValue(technique.vertexColors, false)) {
                let colorValue = evaluateTechniqueAttr<StyleColor>(context, technique.color);
                if (colorValue === undefined) {
                    const featureColor = context.env.lookup("color");
                    if (this.isColorStringValid(featureColor)) {
                        colorValue = String(featureColor);
                    }
                }
                if (colorValue === undefined) {
                    colorValue = evaluateTechniqueAttr<number | string>(
                        context,
                        technique.defaultColor,
                        0x000000
                    );
                }

                if (colorValue === undefined) {
                    colorValue = 0x000000;
                }
                tmpColor.set(colorValue as any);

                color = tmpColor;
            }
        }

        for (const polygon of polygons) {
            const startIndexCount = indices.length;

            for (let ringIndex = 0; ringIndex < polygon.length; ) {
                const vertices: number[] = [];
                const polygonBaseVertex = positions.length / 3;

                const { contour, winding } = polygon[ringIndex++];
                for (let i = 0; i < contour.length / featureStride; ++i) {
                    // Invert the Y component to preserve the correct winding without transforming
                    // from webMercator's local to global space.
                    for (let j = 0; j < featureStride; ++j) {
                        vertices.push((j === 1 ? -1 : 1) * contour[i * featureStride + j]);
                    }

                    // Calculate nextEdge and nextWall.
                    const nextIdx = (i + 1) % (contour.length / featureStride);
                    const currX = contour[i * featureStride];
                    const currY = contour[i * featureStride + 1];
                    const nextX = contour[nextIdx * featureStride];
                    const nextY = contour[nextIdx * featureStride + 1];
                    const insideExtents = !(
                        (currX <= 0 && nextX <= 0) ||
                        (currX >= extents && nextX >= extents) ||
                        (currY <= 0 && nextY <= 0) ||
                        (currY >= extents && nextY >= extents)
                    );

                    vertices.push(
                        insideExtents ? nextIdx : -1,
                        boundaryWalls || insideExtents ? nextIdx : -1
                    );
                }

                // Iterate over the inner rings. The inner rings have the opposite winding
                // of the outer rings.
                const holes: number[] = [];
                while (ringIndex < polygon.length && polygon[ringIndex].winding !== winding) {
                    const vertexOffset = vertices.length / vertexStride;
                    holes.push(vertexOffset);

                    const hole = polygon[ringIndex++].contour;
                    for (let i = 0; i < hole.length / featureStride; ++i) {
                        // Invert the Y component to preserve the correct winding without
                        // transforming from webMercator's local to global space.
                        for (let j = 0; j < featureStride; ++j) {
                            vertices.push((j === 1 ? -1 : 1) * hole[i * featureStride + j]);
                        }

                        // Calculate nextEdge and nextWall.
                        const nextIdx = (i + 1) % (hole.length / featureStride);
                        const currX = hole[i * featureStride];
                        const currY = hole[i * featureStride + 1];
                        const nextX = hole[nextIdx * featureStride];
                        const nextY = hole[nextIdx * featureStride + 1];
                        const insideExtents = !(
                            (currX <= 0 && nextX <= 0) ||
                            (currX >= extents && nextX >= extents) ||
                            (currY <= 0 && nextY <= 0) ||
                            (currY >= extents && nextY >= extents)
                        );

                        vertices.push(
                            insideExtents ? vertexOffset + nextIdx : -1,
                            boundaryWalls || insideExtents ? vertexOffset + nextIdx : -1
                        );
                    }
                }

                try {
                    // Triangulate the footprint polyline.
                    const triangles = earcut(vertices, holes, vertexStride);
                    const originalVertexCount = vertices.length / vertexStride;

                    // Subdivide for spherical projections if needed.
                    if (isSpherical) {
                        const geom = new THREE.BufferGeometry();

                        const positionArray = [];
                        const uvArray = [];
                        const edgeArray = [];
                        const wallArray = [];

                        // Transform to global webMercator coordinates to be able to reproject to
                        // sphere.
                        for (let i = 0; i < vertices.length; i += vertexStride) {
                            const worldPos = tile2world(
                                extents,
                                this.m_decodeInfo,
                                tmpV2.set(vertices[i], vertices[i + 1]),
                                true,
                                tmpV2r
                            );
                            positionArray.push(worldPos.x, worldPos.y, 0);
                            if (texCoordType !== undefined) {
                                uvArray.push(vertices[i + 2], vertices[i + 3]);
                            }
                            edgeArray.push(vertices[i + featureStride]);
                            wallArray.push(vertices[i + featureStride + 1]);
                        }

                        // Create the temporary geometry used for subdivision.
                        const posAttr = new THREE.BufferAttribute(
                            new Float32Array(positionArray),
                            3
                        );
                        geom.setAttribute("position", posAttr);
                        let uvAttr: THREE.BufferAttribute | undefined;
                        if (texCoordType !== undefined) {
                            uvAttr = new THREE.BufferAttribute(new Float32Array(uvArray), 2);
                            geom.setAttribute("uv", uvAttr);
                        }
                        const edgeAttr = new THREE.BufferAttribute(new Float32Array(edgeArray), 1);
                        geom.setAttribute("edge", edgeAttr);
                        const wallAttr = new THREE.BufferAttribute(new Float32Array(wallArray), 1);
                        geom.setAttribute("wall", edgeAttr);
                        const indexAttr = new THREE.BufferAttribute(new Uint32Array(triangles), 1);
                        geom.setIndex(indexAttr);

                        // Increase tesselation of polygons for certain zoom levels
                        // to remove mixed LOD cracks
                        const zoomLevel = this.m_decodeInfo.tileKey.level;
                        if (zoomLevel >= 3 && zoomLevel < 9) {
                            const subdivision = Math.pow(2, 9 - zoomLevel);
                            const { geoBox } = this.m_decodeInfo;
                            const edgeModifier = new EdgeLengthGeometrySubdivisionModifier(
                                subdivision,
                                geoBox,
                                SubdivisionMode.NoDiagonals,
                                webMercatorProjection
                            );
                            edgeModifier.modify(geom);
                        }

                        // FIXME(HARP-5700): Subdivision modifier ignores texture coordinates.
                        const modifier = new SphericalGeometrySubdivisionModifier(
                            THREE.MathUtils.degToRad(10),
                            webMercatorProjection
                        );
                        modifier.modify(geom);

                        // Reassemble the vertex buffer, transforming the subdivided global
                        // webMercator points back to local space.
                        vertices.length = 0;
                        triangles.length = 0;
                        for (let i = 0; i < posAttr.array.length; i += 3) {
                            const tilePos = world2tile(
                                extents,
                                this.m_decodeInfo,
                                tmpV2.set(posAttr.array[i], posAttr.array[i + 1]),
                                true,
                                tmpV2r
                            );
                            vertices.push(tilePos.x, tilePos.y);
                            if (texCoordType !== undefined) {
                                vertices.push(uvAttr!.array[(i / 3) * 2]);
                                vertices.push(uvAttr!.array[(i / 3) * 2 + 1]);
                            }
                            vertices.push(edgeAttr.array[i / 3]);
                            vertices.push(wallAttr.array[i / 3]);
                        }

                        const geomIndex = geom.getIndex();
                        if (geomIndex !== null) {
                            triangles.push(...(geomIndex.array as Float32Array));
                        }
                    }

                    // Add the footprint/roof vertices to the position buffer.
                    tempVertNormal.set(0, 0, 1);

                    // Assemble the vertex buffer.
                    for (let i = 0; i < vertices.length; i += vertexStride) {
                        webMercatorTile2TargetTile(
                            extents,
                            this.m_decodeInfo,
                            tmpV2.set(vertices[i], vertices[i + 1]),
                            tmpV3,
                            true
                        );

                        let scaleFactor = 1.0;
                        if (isExtruded && styleSetConstantHeight !== true) {
                            tempVertOrigin.set(
                                tempTileOrigin.x + tmpV3.x,
                                tempTileOrigin.y + tmpV3.y,
                                tempTileOrigin.z + tmpV3.z
                            );
                            scaleFactor = this.m_decodeInfo.targetProjection.getScaleFactor(
                                tempVertOrigin
                            );
                        }
                        this.m_maxGeometryHeight = Math.max(
                            this.m_maxGeometryHeight,
                            scaleFactor * height
                        );

                        if (isSpherical) {
                            tempVertNormal
                                .set(tmpV3.x, tmpV3.y, tmpV3.z)
                                .add(this.center)
                                .normalize();
                        }

                        tempFootDisp.copy(tempVertNormal).multiplyScalar(floorHeight * scaleFactor);
                        tempRoofDisp.copy(tempVertNormal).multiplyScalar(height * scaleFactor);
                        positions.push(
                            tmpV3.x + tempFootDisp.x,
                            tmpV3.y + tempFootDisp.y,
                            tmpV3.z + tempFootDisp.z
                        );
                        if (texCoordType !== undefined) {
                            textureCoordinates.push(vertices[i + 2], vertices[i + 3]);
                        }
                        if (this.m_enableElevationOverlay) {
                            normals.push(...tempVertNormal.toArray());
                        }
                        if (isExtruded) {
                            positions.push(
                                tmpV3.x + tempRoofDisp.x,
                                tmpV3.y + tempRoofDisp.y,
                                tmpV3.z + tempRoofDisp.z
                            );
                            extrusionAxis.push(
                                0.0,
                                0.0,
                                0.0,
                                0.0,
                                tempRoofDisp.x - tempFootDisp.x,
                                tempRoofDisp.y - tempFootDisp.y,
                                tempRoofDisp.z - tempFootDisp.z,
                                1.0
                            );
                            if (texCoordType !== undefined) {
                                textureCoordinates.push(vertices[i + 2], vertices[i + 3]);
                            }
                            if (this.m_enableElevationOverlay) {
                                normals.push(...tempVertNormal.toArray());
                            }
                            if (color !== undefined) {
                                colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
                            }
                        }
                    }

                    // Add the footprint/roof indices to the index buffer.
                    for (let i = 0; i < triangles.length; i += 3) {
                        if (isExtruded) {
                            // When extruding we duplicate the vertices, so that all even vertices
                            // belong to the bottom and all odd vertices belong to the top.
                            const i0 = polygonBaseVertex + triangles[i + 0] * 2 + 1;
                            const i1 = polygonBaseVertex + triangles[i + 1] * 2 + 1;
                            const i2 = polygonBaseVertex + triangles[i + 2] * 2 + 1;
                            indices.push(i0, i1, i2);
                        } else {
                            const i0 = polygonBaseVertex + triangles[i + 0];
                            const i1 = polygonBaseVertex + triangles[i + 1];
                            const i2 = polygonBaseVertex + triangles[i + 2];
                            indices.push(i0, i1, i2);
                        }
                    }

                    // Assemble the index buffer for edges (follow vertices as linked list).
                    if (hasEdges) {
                        this.addEdges(
                            polygonBaseVertex,
                            originalVertexCount,
                            vertexStride,
                            featureStride,
                            positions,
                            vertices,
                            edgeIndices,
                            isExtruded,
                            extrudedPolygonTechnique.footprint,
                            extrudedPolygonTechnique.maxSlope
                        );
                    }
                    if (isExtruded) {
                        this.addWalls(
                            polygonBaseVertex,
                            originalVertexCount,
                            vertexStride,
                            featureStride,
                            vertices,
                            indices
                        );
                    }
                } catch (err) {
                    logger.error(`cannot triangulate geometry`, err);
                }
            }

            if (this.m_gatherFeatureAttributes) {
                meshBuffers.objInfos.push(context.env.entries);
                meshBuffers.featureStarts.push(startIndexCount);
            }

            const count = indices.length - startIndexCount;
            if (count > 0) {
                groups.push({
                    start: startIndexCount,
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
                    stringCatalog: meshBuffers.stringCatalog,
                    objInfos: meshBuffers.objInfos
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

            const vertexAttributes: BufferAttribute[] = [
                {
                    name: "position",
                    buffer: positionElements.buffer,
                    itemCount: 3,
                    type: "float"
                }
            ];

            const geometry: Geometry = {
                type: meshBuffers.type,
                vertexAttributes,
                groups: meshBuffers.groups
            };

            if (meshBuffers.normals.length > 0) {
                const normals = new Float32Array(meshBuffers.normals);
                assert(
                    normals.length === positionElements.length,
                    "length of normals buffer is different than the length of the " +
                        "position buffer"
                );

                vertexAttributes.push({
                    name: "normal",
                    buffer: normals.buffer,
                    itemCount: 3,
                    type: "float"
                });
            }

            if (meshBuffers.colors.length > 0) {
                const colors = new Float32Array(meshBuffers.colors);
                assert(
                    colors.length === positionElements.length,
                    "length of colors buffer is different than the length of the " +
                        "position buffer"
                );

                vertexAttributes.push({
                    name: "color",
                    buffer: colors.buffer,
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
                vertexAttributes.push({
                    name: "uv",
                    buffer: textureCoordinates.buffer as ArrayBuffer,
                    itemCount: 2,
                    type: "float"
                });
            }

            if (meshBuffers.extrusionAxis.length > 0) {
                const extrusionAxis = new Float32Array(meshBuffers.extrusionAxis);
                assert(
                    extrusionAxis.length / 4 === positionElements.length / 3,
                    "length of extrusionAxis buffer is different than the length of the " +
                        "position buffer"
                );

                vertexAttributes.push({
                    name: "extrusionAxis",
                    buffer: extrusionAxis.buffer as ArrayBuffer,
                    itemCount: 4,
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

            geometry.featureStarts = meshBuffers.featureStarts;
            geometry.objInfos = meshBuffers.objInfos;

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
                vertexAttributes: [],
                featureStarts: linesGeometry.featureStarts,
                objInfos: linesGeometry.objInfos
            };

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
                groups: [{ start: 0, count: indices.length, technique, renderOrderOffset }],
                featureStarts: linesGeometry.featureStarts,
                objInfos: linesGeometry.objInfos
            };

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

    private processFeatureCommon(env: Env) {
        const source = env.lookup("source");
        if (typeof source === "string" && source !== "") {
            if (!this.m_sources.includes(source)) {
                this.m_sources.push(source);
            }
        }
    }

    private isColorStringValid(color: Value | undefined): color is string {
        return typeof color === "string" && color.length > 0;
    }

    private addEdges(
        featureBaseVertex: number,
        featureVertexCount: number,
        vertexStride: number,
        featureStride: number,
        positions: number[],
        vertices: number[],
        indices: number[],
        isExtruded: boolean,
        hasFootprint?: boolean,
        maxSlope?: number
    ) {
        const tmpEdgeA = new THREE.Vector3();
        const tmpEdgeB = new THREE.Vector3();
        let firstRingVertex: number | undefined;
        let prevRingVertex: number | undefined;
        let currRingVertex = 0;
        let maxRingVertex = 0;

        while (currRingVertex < featureVertexCount) {
            while (currRingVertex !== firstRingVertex) {
                if (firstRingVertex === undefined) {
                    firstRingVertex = currRingVertex;
                }
                if (currRingVertex < featureVertexCount) {
                    maxRingVertex = Math.max(maxRingVertex, currRingVertex);
                }

                const nextRingVertex = vertices[currRingVertex * vertexStride + featureStride];
                if (nextRingVertex < 0) {
                    break;
                } else {
                    if (!isExtruded) {
                        indices.push(
                            featureBaseVertex + currRingVertex,
                            featureBaseVertex + nextRingVertex
                        );
                    } else {
                        if (hasFootprint === true) {
                            indices.push(
                                featureBaseVertex + currRingVertex * 2,
                                featureBaseVertex + nextRingVertex * 2
                            );
                        }
                        indices.push(
                            featureBaseVertex + currRingVertex * 2 + 1,
                            featureBaseVertex + nextRingVertex * 2 + 1
                        );

                        if (maxSlope !== undefined) {
                            if (prevRingVertex !== undefined) {
                                const prevPos = (featureBaseVertex + prevRingVertex * 2) * 3;
                                const currPos = (featureBaseVertex + currRingVertex * 2) * 3;
                                const nextPos = (featureBaseVertex + nextRingVertex * 2) * 3;
                                tmpEdgeA
                                    .set(
                                        positions[currPos] - positions[prevPos],
                                        positions[currPos + 1] - positions[prevPos + 1],
                                        positions[currPos + 2] - positions[prevPos + 2]
                                    )
                                    .normalize();
                                tmpEdgeB
                                    .set(
                                        positions[nextPos] - positions[currPos],
                                        positions[nextPos + 1] - positions[currPos + 1],
                                        positions[nextPos + 2] - positions[currPos + 2]
                                    )
                                    .normalize();
                                if (tmpEdgeA.dot(tmpEdgeB) <= maxSlope) {
                                    indices.push(
                                        featureBaseVertex + currRingVertex * 2,
                                        featureBaseVertex + currRingVertex * 2 + 1
                                    );
                                }
                            }
                        } else {
                            indices.push(
                                featureBaseVertex + currRingVertex * 2,
                                featureBaseVertex + currRingVertex * 2 + 1
                            );
                        }
                    }
                    prevRingVertex = currRingVertex;
                    currRingVertex = nextRingVertex;
                }
            }
            currRingVertex = maxRingVertex + 1;
            firstRingVertex = undefined;
            prevRingVertex = undefined;
        }
    }

    private addWalls(
        featureBaseVertex: number,
        featureVertexCount: number,
        vertexStride: number,
        featureStride: number,
        vertices: number[],
        indices: number[]
    ) {
        let firstRingVertex: number | undefined;
        let currRingVertex = 0;
        let maxRingVertex = 0;

        while (currRingVertex < featureVertexCount) {
            while (currRingVertex !== firstRingVertex) {
                if (firstRingVertex === undefined) {
                    firstRingVertex = currRingVertex;
                }
                if (currRingVertex < featureVertexCount) {
                    maxRingVertex = Math.max(maxRingVertex, currRingVertex);
                }

                const nextRingVertex = vertices[currRingVertex * vertexStride + featureStride + 1];
                if (nextRingVertex < 0) {
                    break;
                } else {
                    indices.push(
                        featureBaseVertex + currRingVertex * 2,
                        featureBaseVertex + currRingVertex * 2 + 1,
                        featureBaseVertex + nextRingVertex * 2 + 1,
                        featureBaseVertex + nextRingVertex * 2 + 1,
                        featureBaseVertex + nextRingVertex * 2,
                        featureBaseVertex + currRingVertex * 2
                    );
                }
                currRingVertex = nextRingVertex;
            }
            currRingVertex = maxRingVertex + 1;
            firstRingVertex = undefined;
        }
    }

    private findRelativePositionInLine(p: THREE.Vector3, line: number[]): number {
        let lineDist = Infinity;
        let lineOffset = 0;
        for (let i = 0; i < line.length; i += 4) {
            // Find the closest point C in segment AB to point P.
            tmpLine.set(
                tmpPointA.set(line[i], line[i + 1], line[i + 2]),
                tmpPointB.set(line[i + 4], line[i + 5], line[i + 6])
            );
            tmpLine.closestPointToPoint(p, true, tmpPointC);

            // If P is in AB (or really close), save A as anchor point and C (to estimate distance
            // from segment origin).
            const dist = tmpPointC.distanceTo(p);
            if (dist < lineDist) {
                tmpPointD.copy(tmpPointC);
                tmpPointE.copy(tmpPointA);
                lineDist = dist;
                lineOffset = line[i + 3];
            }
        }
        // Return the relative position of P inside the line.
        return lineOffset + tmpPointD.distanceTo(tmpPointE);
    }
}
