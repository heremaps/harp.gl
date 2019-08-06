/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    BufferAttribute,
    DecodedTile,
    ExtrudedPolygonTechnique,
    FillTechnique,
    Geometry,
    GeometryKind,
    GeometryKindSet,
    getArrayConstructor,
    getPropertyValue,
    isCirclesTechnique,
    isDashedLineTechnique,
    isDynamicTechniqueExpr,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isInterpolatedProperty,
    isLineMarkerTechnique,
    isLineTechnique,
    isPoiTechnique,
    isSegmentsTechnique,
    isSolidLineTechnique,
    isSquaresTechnique,
    isTerrainTechnique,
    isTextTechnique,
    LineMarkerTechnique,
    needsVertexNormals,
    PoiTechnique,
    SolidLineTechnique,
    Technique,
    TerrainTechnique,
    TextPathGeometry,
    TextTechnique
} from "@here/harp-datasource-protocol";
// tslint:disable:max-line-length
import { SphericalGeometrySubdivisionModifier } from "@here/harp-geometry/lib/SphericalGeometrySubdivisionModifier";
import { EarthConstants, GeoCoordinates, ProjectionType } from "@here/harp-geoutils";
import {
    DashedLineMaterial,
    EdgeMaterial,
    EdgeMaterialParameters,
    FadingFeature,
    MapMeshBasicMaterial,
    MapMeshStandardMaterial,
    SolidLineMaterial
} from "@here/harp-materials";
import {
    ContextualArabicConverter,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    TextLayoutStyle,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";
import { getOptionValue, LoggerManager } from "@here/harp-utils";

import { AnimatedExtrusionTileHandler } from "../AnimatedExtrusionHandler";
import { ColorCache } from "../ColorCache";
import { createMaterial, getBufferAttribute, getObjectConstructor } from "../DecodedTileHelpers";
import {
    createDepthPrePassMesh,
    isRenderDepthPrePassEnabled,
    setDepthPrePassStencil
} from "../DepthPrePass";
import { DisplacementMap, TileDisplacementMap } from "../DisplacementMap";
import { MapViewPoints } from "../MapViewPoints";
import { TextElement } from "../text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";
import { computeStyleCacheId } from "../text/TextStyleCache";
import { Tile, TileFeatureData } from "../Tile";
import { TileGeometryLoader } from "./TileGeometryLoader";

const logger = LoggerManager.instance.create("TileGeometryCreator");

/**
 * The SORT_WEIGHT_PATH_LENGTH constants control how the priority of the labels are computed based
 * on the length of the label strings.
 *
 * Consequently, the [[Technique]]s priority is slightly modified while generating
 * [[TextElement]]s from the [[DecodedTile]], to get a more meaningful priority and stable results.
 */

/**
 * Gives [[TextElement]]s with longer paths a higher priority.
 */
const SORT_WEIGHT_PATH_LENGTH = 0.1;

/**
 * Parameters that control fading.
 */
export interface FadingParameters {
    fadeNear?: number;
    fadeFar?: number;
}

/**
 * Parameters that control fading for extruded buildings with fading edges.
 */
export interface PolygonFadingParameters extends FadingParameters {
    color?: string | number;
    colorMix?: number;
    lineFadeNear?: number;
    lineFadeFar?: number;
}

/**
 * Support class to create geometry for a [[Tile]] from a [[DecodedTile]].
 */
export class TileGeometryCreator {
    /**
     * Cache for named colors.
     */
    private static m_colorMap: Map<string, THREE.Color> = new Map();

    private static m_instance: TileGeometryCreator;

    /**
     * The `instance` of the `TileGeometryCreator`.
     *
     * @returns TileGeometryCreator
     */
    static get instance(): TileGeometryCreator {
        return this.m_instance || (this.m_instance = new TileGeometryCreator());
    }

    /**
     *  Creates an instance of TileGeometryCreator. Access is allowed only through `instance`.
     */
    private constructor() {
        //
    }

    /**
     * Apply `enabledKinds` and `disabledKinds` to all techniques in the `decodedTile`. If a
     * technique is identified as disabled, its property `enabled` is set to `false`.
     *
     * @param decodedTile The decodedTile containing the actual tile map data.
     * @param enabledKinds Optional [[GeometryKindSet]] used to specify which object kinds should be
     *      created.
     * @param disabledKinds Optional [[GeometryKindSet]] used to filter objects that should not be
     *      created.
     */
    initDecodedTile(
        decodedTile: DecodedTile,
        enabledKinds?: GeometryKindSet | undefined,
        disabledKinds?: GeometryKindSet | undefined
    ) {
        for (const technique of decodedTile.techniques) {
            // Already processed
            if (technique.enabled !== undefined) {
                continue;
            }

            // Turn technique.kind from the style, which may be a string or an array of strings,
            // into a GeometryKindSet.
            if (technique.kind !== undefined) {
                if (Array.isArray(technique.kind)) {
                    technique.kind = new GeometryKindSet(technique.kind);
                } else if (typeof technique.kind !== "string") {
                    logger.warn("Technique has unknown type of kind:", technique);
                    technique.kind = undefined;
                }
            }

            // No info about kind, no way to filter it.
            if (
                technique.kind === undefined ||
                (technique.kind instanceof Set && (technique.kind as GeometryKindSet).size === 0)
            ) {
                technique.enabled = true;
                continue;
            }

            technique.enabled =
                !(disabledKinds !== undefined && disabledKinds.hasOrIntersects(technique.kind)) ||
                (enabledKinds !== undefined && enabledKinds.hasOrIntersects(technique.kind));
        }
        for (const srcGeometry of decodedTile.geometries) {
            for (const group of srcGeometry.groups) {
                group.createdOffsets = [];
            }
        }
    }

    /**
     * Called after the `Tile` has been decoded. It is required to call `initDecodedTile` before
     * calling this method.
     *
     * @see [[TileGeometryCreator#initDecodedTile]]
     *
     * @param tile The [[Tile]] to process.
     * @param decodedTile The decodedTile containing the actual tile map data.
     */
    createAllGeometries(tile: Tile, decodedTile: DecodedTile) {
        tile.clear();

        const filter = (technique: Technique): boolean => {
            return technique.enabled !== false;
        };

        this.createObjects(tile, decodedTile, filter);

        const textFilter = (technique: Technique): boolean => {
            if (
                !isPoiTechnique(technique) &&
                !isLineMarkerTechnique(technique) &&
                !isTextTechnique(technique)
            ) {
                return false;
            }
            return filter(technique);
        };

        this.preparePois(tile, decodedTile);

        // TextElements do not get their geometry created by Tile, but are managed on a
        // higher level.
        this.createTextElements(tile, decodedTile, textFilter);
    }

    /**
     * Apply enabled and disabled kinds as a filter.
     *
     * @param {DecodedTile} decodedTile
     * @param {(GeometryKindSet | undefined)} enabledKinds
     * @param {(GeometryKindSet | undefined)} disabledKinds
     */
    processTechniques(
        decodedTile: DecodedTile,
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void {
        if (decodedTile === undefined) {
            return;
        }

        for (const technique of decodedTile.techniques) {
            // Make sure that all technique have their geometryKind set, either from the Theme or
            // their default value.
            if (technique.kind === undefined) {
                TileGeometryLoader.setDefaultGeometryKind(technique);
            }
        }

        // Speedup and simplify following code: Test all techniques if they intersect with
        // enabledKinds and disabledKinds, in which case they are flagged. The disabledKinds can be
        // ignored hereafter.
        this.initDecodedTile(decodedTile, enabledKinds, disabledKinds);
    }

    /**
     * Adds a THREE object to the root of the tile. Sets the owning tiles datasource.name and the
     * tileKey in the `userData` property of the object, such that the tile it belongs to can be
     * identified during picking.
     *
     * @param tile The [[Tile]] to add the object to.
     * @param object The object to add to the root of the tile.
     * @param geometryKind The kind of object. Can be used for filtering.
     */
    registerTileObject(
        tile: Tile,
        object: THREE.Object3D,
        geometryKind: GeometryKind | GeometryKindSet | undefined
    ) {
        if (object.userData === undefined) {
            object.userData = {};
        }
        const userData = object.userData;
        userData.tileKey = tile.tileKey;
        userData.dataSource = tile.dataSource.name;

        userData.kind =
            geometryKind instanceof Set
                ? Array.from((geometryKind as GeometryKindSet).values())
                : Array.isArray(geometryKind)
                ? geometryKind
                : [geometryKind];

        // Force a visibility check of all objects.
        tile.resetVisibilityCounter();
    }

    /**
     * Splits the text paths that contain sharp corners.
     *
     * @param tile The [[Tile]] to process paths on.
     * @param textPathGeometries The original path geometries that may have defects.
     * @param textFilter: Optional filter. Should return true for any text technique that is
     *      applicable.
     */
    prepareTextPaths(
        textPathGeometries: TextPathGeometry[],
        decodedTile: DecodedTile,
        textFilter?: (technique: Technique) => boolean
    ): TextPathGeometry[] {
        const processedPaths = new Array<TextPathGeometry>();
        const newPaths = textPathGeometries.slice();

        while (newPaths.length > 0) {
            const textPath = newPaths.pop();

            if (textPath === undefined) {
                break;
            }

            const technique = decodedTile.techniques[textPath.technique];
            if (
                !isTextTechnique(technique) ||
                (textFilter !== undefined && !textFilter(technique))
            ) {
                continue;
            }

            processedPaths.push(textPath);
        }
        return processedPaths;
    }

    /**
     * Creates [[TextElement]] objects from the decoded tile and list of materials specified. The
     * priorities of the [[TextElement]]s are updated to simplify label placement.
     *
     * @param tile The [[Tile]] to create the testElements on.
     * @param decodedTile The [[DecodedTile]].
     * @param textFilter: Optional filter. Should return true for any text technique that is
     *      applicable.
     */
    createTextElements(
        tile: Tile,
        decodedTile: DecodedTile,
        textFilter?: (technique: Technique) => boolean
    ) {
        const dynamicTechniqueHandler = tile.dynamicTechniqueHandler;
        const mapView = tile.mapView;
        if (decodedTile.textPathGeometries !== undefined) {
            const textPathGeometries = this.prepareTextPaths(
                decodedTile.textPathGeometries,
                decodedTile,
                textFilter
            );

            // Compute maximum street length (squared). Longer streets should be labelled first,
            // they have a higher chance of being placed in case the number of text elements is
            // limited.
            let maxPathLengthSqr = 0;
            for (const textPath of textPathGeometries) {
                const technique = decodedTile.techniques[textPath.technique];
                if (technique.enabled === false || !isTextTechnique(technique)) {
                    continue;
                }
                if (textPath.pathLengthSqr > maxPathLengthSqr) {
                    maxPathLengthSqr = textPath.pathLengthSqr;
                }
            }

            for (const textPath of textPathGeometries) {
                const technique = decodedTile.techniques[textPath.technique];

                if (
                    technique.enabled === false ||
                    !isTextTechnique(technique) ||
                    (textFilter !== undefined && !textFilter(technique))
                ) {
                    continue;
                }

                const path: THREE.Vector3[] = [];
                for (let i = 0; i < textPath.path.length; i += 3) {
                    path.push(
                        new THREE.Vector3(
                            textPath.path[i],
                            textPath.path[i + 1],
                            textPath.path[i + 2]
                        )
                    );
                }

                // Make sorting stable and make pathLengthSqr a differentiator for placement.
                const priority =
                    dynamicTechniqueHandler.evaluateDynamicAttr(technique.priority, 0) +
                    (maxPathLengthSqr > 0
                        ? (SORT_WEIGHT_PATH_LENGTH * textPath.pathLengthSqr) / maxPathLengthSqr
                        : 0);
                const fadeNear = dynamicTechniqueHandler.evaluateDynamicAttr<number>(
                    technique.fadeNear
                );
                const fadeFar = dynamicTechniqueHandler.evaluateDynamicAttr<number>(
                    technique.fadeFar
                );

                const textElement = new TextElement(
                    ContextualArabicConverter.instance.convert(textPath.text),
                    path,
                    this.getRenderStyle(tile, technique),
                    this.getLayoutStyle(tile, technique),
                    priority,
                    technique.xOffset !== undefined ? technique.xOffset : 0.0,
                    technique.yOffset !== undefined ? technique.yOffset : 0.0,
                    textPath.featureId,
                    technique.style,
                    fadeNear,
                    fadeFar
                );
                textElement.minZoomLevel =
                    technique.minZoomLevel !== undefined
                        ? technique.minZoomLevel
                        : mapView.minZoomLevel;
                textElement.maxZoomLevel =
                    technique.maxZoomLevel !== undefined
                        ? technique.maxZoomLevel
                        : mapView.maxZoomLevel;
                textElement.distanceScale =
                    technique.distanceScale !== undefined
                        ? technique.distanceScale
                        : DEFAULT_TEXT_DISTANCE_SCALE;
                textElement.mayOverlap = technique.mayOverlap === true;
                textElement.reserveSpace = technique.reserveSpace !== false;
                textElement.kind = technique.kind;
                // Get the userData for text element picking.
                textElement.userData = textPath.objInfos;

                tile.addTextElement(textElement);
            }
        }

        if (decodedTile.textGeometries !== undefined) {
            for (const text of decodedTile.textGeometries) {
                if (text.technique === undefined || text.stringCatalog === undefined) {
                    continue;
                }

                const technique = decodedTile.techniques[text.technique];

                if (
                    technique.enabled === false ||
                    !isTextTechnique(technique) ||
                    (textFilter !== undefined && !textFilter(technique))
                ) {
                    continue;
                }

                const positions = new THREE.BufferAttribute(
                    new Float32Array(text.positions.buffer),
                    text.positions.itemCount
                );

                const numPositions = positions.count;
                if (numPositions < 1) {
                    continue;
                }

                const priority = dynamicTechniqueHandler.evaluateDynamicAttr<number>(
                    technique.priority,
                    0
                );
                const fadeNear = dynamicTechniqueHandler.evaluateDynamicAttr<number>(
                    technique.fadeNear
                );
                const fadeFar = dynamicTechniqueHandler.evaluateDynamicAttr<number>(
                    technique.fadeFar
                );

                for (let i = 0; i < numPositions; ++i) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);
                    const z = positions.getZ(i);
                    const label = text.stringCatalog[text.texts[i]];
                    if (label === undefined) {
                        // skip missing labels
                        continue;
                    }

                    const textElement = new TextElement(
                        ContextualArabicConverter.instance.convert(label!),
                        new THREE.Vector3(x, y, z),
                        this.getRenderStyle(tile, technique),
                        this.getLayoutStyle(tile, technique),
                        priority,
                        technique.xOffset || 0.0,
                        technique.yOffset || 0.0,
                        text.featureId,
                        technique.style
                    );

                    textElement.minZoomLevel =
                        technique.minZoomLevel !== undefined
                            ? technique.minZoomLevel
                            : mapView.minZoomLevel;
                    textElement.maxZoomLevel =
                        technique.maxZoomLevel !== undefined
                            ? technique.maxZoomLevel
                            : mapView.maxZoomLevel;
                    textElement.mayOverlap = technique.mayOverlap === true;
                    textElement.reserveSpace = technique.reserveSpace !== false;
                    textElement.kind = technique.kind;

                    textElement.fadeNear = fadeNear;
                    textElement.fadeFar = fadeFar;

                    if (text.objInfos !== undefined) {
                        // Get the userData for text element picking.
                        textElement.userData = text.objInfos[i];
                    }

                    textElement.isPointLabel = true;

                    tile.addTextElement(textElement);
                }
            }
        }
    }

    doCreateMainMaterial(technique: Technique, tile: Tile) {
        const mapView = tile.mapView;

        const onMaterialUpdated = (texture: THREE.Texture) => {
            tile.dataSource.requestUpdate();
            if (texture !== undefined) {
                tile.addOwnedTexture(texture);
            }
        };

        const material = createMaterial(technique, onMaterialUpdated, {
            fog: mapView.scene.fog !== null
        });
        if (material === undefined) {
            return undefined;
        }

        if (
            isLineTechnique(technique) ||
            (isSegmentsTechnique(technique) &&
                technique.color !== undefined &&
                isInterpolatedProperty(technique.color))
        ) {
            FadingFeature.preprocessFadingTechniqueAttrs(
                material,
                technique.fadeFar,
                technique.fadeNear,
                tile.dynamicTechniqueHandler
            );
        }

        if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
            const lineMaterial = material as THREE.RawShaderMaterial;
            lineMaterial.uniforms.opacity.value = material.opacity;

            if (technique.clipping !== false && tile.projection.type === ProjectionType.Planar) {
                const tileSize = lineMaterial.uniforms.tileSize;
                const size = new THREE.Vector3();
                tile.boundingBox.getSize(size);
                tileSize.value.x = size.x;
                tileSize.value.y = size.y;
                lineMaterial.defines.TILE_CLIP = 1;
            }
        }

        if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
            FadingFeature.preprocessFadingTechniqueAttrs(
                material,
                technique.fadeFar,
                technique.fadeNear,
                tile.dynamicTechniqueHandler
            );

            const lineMaterial = material as SolidLineMaterial;
            const unitFactor = technique.metricUnit === "Pixel" ? mapView.pixelToWorld : 1.0;

            tile.dynamicTechniqueHandler.addDynamicAttrHandler(technique.color, color => {
                if (typeof color === "string" || typeof color === "number") {
                    lineMaterial.color.set(color as number);
                }
            });

            tile.dynamicTechniqueHandler.addDynamicAttrHandler<number>(
                technique.lineWidth,
                lineWidth => {
                    // TODO fix this lineWidth vs extrusionFactor naming mess
                    lineMaterial.lineWidth = lineWidth! * unitFactor * 0.5;
                }
            );
        }

        if (isDashedLineTechnique(technique)) {
            const dashedLineMaterial = material as DashedLineMaterial;

            const unitFactor = technique.metricUnit === "Pixel" ? mapView.pixelToWorld : 1.0;

            tile.dynamicTechniqueHandler.addDynamicAttrHandler<number>(
                technique.dashSize,
                dashSize => {
                    dashedLineMaterial.dashSize = dashSize! * unitFactor * 0.5;
                }
            );

            tile.dynamicTechniqueHandler.addDynamicAttrHandler<number>(
                technique.gapSize,
                gapSize => {
                    dashedLineMaterial.gapSize = gapSize! * unitFactor * 0.5;
                }
            );
        }

        if (isExtrudedLineTechnique(technique)) {
            FadingFeature.preprocessFadingTechniqueAttrs(
                material,
                technique.fadeFar,
                technique.fadeNear,
                tile.dynamicTechniqueHandler
            );

            const extrudedMaterial = material as MapMeshStandardMaterial | MapMeshBasicMaterial;
            tile.dynamicTechniqueHandler.addDynamicAttrHandler(technique.color, color => {
                if (typeof color === "string" || typeof color === "number") {
                    extrudedMaterial.color.set(color as number);
                }
            });
        }
        if (isExtrudedPolygonTechnique(technique) || isFillTechnique(technique)) {
            tile.dynamicTechniqueHandler.addDynamicAttrHandler(technique.color, color => {
                const polygonMaterial = material as MapMeshBasicMaterial;
                if (typeof color === "string" || typeof color === "number") {
                    polygonMaterial.color.set(color as number);
                }
            });

            tile.dynamicTechniqueHandler.addDynamicAttrHandler(technique.color, color => {
                const polygonMaterial = material as MapMeshStandardMaterial;

                if (typeof color === "string" || typeof color === "number") {
                    polygonMaterial.emissive.set(color as number);
                }
            });
        }
        return material;
    }

    getOrCreateMaterial(tile: Tile, technique: Technique) {
        const doCreateMaterial = () => {
            return this.doCreateMainMaterial(technique, tile);
        };
        const shareable = technique._cacheKey !== undefined;

        return shareable
            ? tile.dynamicTechniqueHandler.getOrCreateSharable(
                  `${technique._cacheKey}:mainMaterial`,
                  doCreateMaterial
              )
            : doCreateMaterial();
    }

    /**
     * Creates `Tile` objects from the decoded tile and list of materials specified.
     *
     * @param tile The [[Tile]] to create the geometry on.
     * @param decodedTile The [[DecodedTile]].
     * @param techniqueFilter: Optional filter. Should return true for any technique that is
     *      applicable.
     */
    createObjects(
        tile: Tile,
        decodedTile: DecodedTile,
        techniqueFilter?: (technique: Technique) => boolean
    ) {
        const dynamicTechniqueHandler = tile.dynamicTechniqueHandler;
        const materials: THREE.Material[] = [];
        const mapView = tile.mapView;
        const objects = tile.objects;

        for (const srcGeometry of decodedTile.geometries) {
            const groups = srcGeometry.groups;
            const groupCount = groups.length;

            for (let groupIndex = 0; groupIndex < groupCount; ) {
                const group = groups[groupIndex++];
                const start = group.start;
                const techniqueIndex = group.technique;
                const technique = dynamicTechniqueHandler.getTechnique(
                    decodedTile.techniques[techniqueIndex]
                );

                if (
                    group.createdOffsets!.indexOf(tile.offset) !== -1 ||
                    technique.enabled === false ||
                    (techniqueFilter !== undefined && !techniqueFilter(technique))
                ) {
                    continue;
                }

                let count = group.count;
                group.createdOffsets!.push(tile.offset);

                // compress consecutive groups
                for (
                    ;
                    groupIndex < groupCount && groups[groupIndex].technique === techniqueIndex;
                    ++groupIndex
                ) {
                    if (start + count !== groups[groupIndex].start) {
                        break;
                    }

                    count += groups[groupIndex].count;

                    // Mark this group as created, so it does not get processed again.
                    groups[groupIndex].createdOffsets!.push(tile.offset);
                }

                const ObjectCtor = getObjectConstructor(technique);

                if (ObjectCtor === undefined) {
                    continue;
                }

                let material: THREE.Material | undefined = materials[techniqueIndex];

                if (material === undefined) {
                    material = this.getOrCreateMaterial(tile, technique);
                    if (material === undefined) {
                        continue;
                    }
                    materials[techniqueIndex] = material;
                }

                // Modify the standard textured shader to support height-based coloring.
                if (isTerrainTechnique(technique)) {
                    this.setupTerrainMaterial(technique, material, tile.mapView.clearColor);
                }

                const bufferGeometry = new THREE.BufferGeometry();

                srcGeometry.vertexAttributes.forEach((vertexAttribute: BufferAttribute) => {
                    const buffer = getBufferAttribute(vertexAttribute);
                    bufferGeometry.addAttribute(vertexAttribute.name, buffer);
                });

                if (srcGeometry.interleavedVertexAttributes !== undefined) {
                    srcGeometry.interleavedVertexAttributes.forEach(
                        (attr: {
                            type: any;
                            buffer: any;
                            stride: any;
                            attributes: {
                                forEach: (
                                    arg0: (interleavedAttr: {
                                        itemSize: any;
                                        offset: any;
                                        name: any;
                                    }) => void
                                ) => void;
                            };
                        }) => {
                            const ArrayCtor = getArrayConstructor(attr.type);
                            const buffer = new THREE.InterleavedBuffer(
                                new ArrayCtor(attr.buffer),
                                attr.stride
                            );
                            attr.attributes.forEach(
                                (interleavedAttr: { itemSize: any; offset: any; name: any }) => {
                                    const attribute = new THREE.InterleavedBufferAttribute(
                                        buffer,
                                        interleavedAttr.itemSize,
                                        interleavedAttr.offset,
                                        false
                                    );
                                    bufferGeometry.addAttribute(interleavedAttr.name, attribute);
                                }
                            );
                        }
                    );
                }

                if (srcGeometry.index) {
                    bufferGeometry.setIndex(getBufferAttribute(srcGeometry.index));
                }

                if (!bufferGeometry.getAttribute("normal") && needsVertexNormals(technique)) {
                    bufferGeometry.computeVertexNormals();
                }

                bufferGeometry.addGroup(start, count);

                if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
                    const lineMaterial = material as THREE.RawShaderMaterial;

                    // this should be part of material cacheKey
                    if (bufferGeometry.getAttribute("color")) {
                        lineMaterial.defines.USE_COLOR = 1;
                    }
                }

                // Add the solid line outlines as a separate object.
                const hasSolidLinesOutlines: boolean =
                    isSolidLineTechnique(technique) && technique.secondaryWidth !== undefined;

                const object = new ObjectCtor(bufferGeometry, material);

                object.frustumCulled = false;

                const renderOrderOffset =
                    group.renderOrderOffset !== undefined ? group.renderOrderOffset : 0;

                object.renderOrder = technique.renderOrder! + renderOrderOffset;

                if (srcGeometry.uuid !== undefined) {
                    object.userData.geometryId = srcGeometry.uuid;
                }

                if (
                    (isCirclesTechnique(technique) || isSquaresTechnique(technique)) &&
                    technique.enablePicking !== undefined
                ) {
                    // tslint:disable-next-line:max-line-length
                    (object as MapViewPoints).enableRayTesting = technique.enablePicking!;
                }

                if (
                    isLineTechnique(technique) ||
                    (isSegmentsTechnique(technique) &&
                        technique.color !== undefined &&
                        isInterpolatedProperty(technique.color))
                ) {
                    FadingFeature.addTransparencyHack(object, false, false);
                }

                // Lines renderOrder fix: Render them as transparent objects, but make sure they end
                // up in the opaque rendering queue (by disabling transparency onAfterRender, and
                // enabling it onBeforeRender).
                if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
                    FadingFeature.addTransparencyHack(object, true, false);
                }

                if (isExtrudedLineTechnique(technique)) {
                    // extruded lines are normal meshes, and need transparency only when fading or
                    // dynamic properties is defined.
                    if (
                        technique.fadeFar !== undefined ||
                        isDynamicTechniqueExpr(technique.color)
                    ) {
                        FadingFeature.addTransparencyHack(object, true, true);
                    }
                }

                this.addFeatureData(srcGeometry, technique, object);
                this.addGeometryObjInfos(tile, srcGeometry, technique, object);

                if (isExtrudedPolygonTechnique(technique) || isFillTechnique(technique)) {
                    // filled polygons are normal meshes, and need transparency only when fading or
                    // dynamic properties is defined.
                    const hasDynamicColor =
                        isDynamicTechniqueExpr(technique.color) ||
                        (isExtrudedPolygonTechnique(technique) &&
                            isDynamicTechniqueExpr(technique.emissive));
                    if (technique.fadeFar !== undefined || hasDynamicColor) {
                        FadingFeature.addTransparencyHack(object, true, true);
                    }
                }

                const extrudedObjects: Array<{
                    object: THREE.Object3D;
                    /**
                     * If set to `true`, an [[ExtrusionFeature]] that injects extrusion shader
                     * chunk will be applied to the material. Otherwise, extrusion should
                     * be added in the material's shader manually.
                     */
                    materialFeature: boolean;
                }> = [];

                const animatedExtrusionHandler = mapView.animatedExtrusionHandler;

                let extrusionAnimationEnabled: boolean | undefined = false;

                if (
                    isExtrudedPolygonTechnique(technique) &&
                    animatedExtrusionHandler !== undefined
                ) {
                    let animateExtrusionValue = technique.animateExtrusion;

                    if (animateExtrusionValue !== undefined) {
                        animateExtrusionValue =
                            typeof animateExtrusionValue === "boolean"
                                ? animateExtrusionValue
                                : typeof animateExtrusionValue === "number"
                                ? animateExtrusionValue !== 0
                                : false;
                    }
                    extrusionAnimationEnabled =
                        animateExtrusionValue !== undefined &&
                        animatedExtrusionHandler.forceEnabled === false
                            ? animateExtrusionValue
                            : animatedExtrusionHandler.enabled;
                }

                const renderDepthPrePass =
                    isExtrudedPolygonTechnique(technique) && isRenderDepthPrePassEnabled(technique);

                if (renderDepthPrePass) {
                    const depthPassMesh = createDepthPrePassMesh(object as THREE.Mesh);
                    // Set geometry kind for depth pass mesh so that it gets the displacement map
                    // for elevation overlay.
                    this.registerTileObject(tile, depthPassMesh, technique.kind);
                    objects.push(depthPassMesh);

                    if (extrusionAnimationEnabled) {
                        extrudedObjects.push({
                            object: depthPassMesh,
                            materialFeature: true
                        });
                    }

                    setDepthPrePassStencil(depthPassMesh, object as THREE.Mesh);
                }

                this.registerTileObject(tile, object, technique.kind);
                objects.push(object);

                // Add the extruded building edges as a separate geometry.
                if (isExtrudedPolygonTechnique(technique) && srcGeometry.edgeIndex !== undefined) {
                    const edgeGeometry = new THREE.BufferGeometry();
                    edgeGeometry.addAttribute("position", bufferGeometry.getAttribute("position"));

                    const colorAttribute = bufferGeometry.getAttribute("color");
                    if (colorAttribute !== undefined) {
                        edgeGeometry.addAttribute("color", colorAttribute);
                    }

                    const extrusionAttribute = bufferGeometry.getAttribute("extrusionAxis");
                    if (extrusionAttribute !== undefined) {
                        edgeGeometry.addAttribute("extrusionAxis", extrusionAttribute);
                    }

                    const normalAttribute = bufferGeometry.getAttribute("normal");
                    if (normalAttribute !== undefined) {
                        edgeGeometry.addAttribute("normal", normalAttribute);
                    }

                    const uvAttribute = bufferGeometry.getAttribute("uv");
                    if (uvAttribute !== undefined) {
                        edgeGeometry.addAttribute("uv", uvAttribute);
                    }

                    edgeGeometry.setIndex(
                        getBufferAttribute(srcGeometry.edgeIndex! as BufferAttribute)
                    );

                    // Read the uniforms from the technique values (and apply the default values).
                    const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;

                    const fadingParams = this.getPolygonFadingParams(
                        tile,
                        extrudedPolygonTechnique
                    );

                    // Configure the edge material based on the theme values.

                    const edgeMaterial = dynamicTechniqueHandler.getOrCreateSharable(
                        `${technique._cacheKey}:outlineMaterial`,
                        () => {
                            const materialParams: EdgeMaterialParameters = {
                                color: fadingParams.color,
                                colorMix: fadingParams.colorMix,
                                fadeNear: fadingParams.lineFadeNear,
                                fadeFar: fadingParams.lineFadeFar
                            };
                            const edgeMaterialInt = new EdgeMaterial(materialParams);

                            FadingFeature.preprocessFadingTechniqueAttrs(
                                edgeMaterialInt,
                                extrudedPolygonTechnique.lineFadeFar ||
                                    extrudedPolygonTechnique.fadeFar,
                                extrudedPolygonTechnique.lineFadeNear ||
                                    extrudedPolygonTechnique.fadeNear,
                                dynamicTechniqueHandler
                            );

                            dynamicTechniqueHandler.addDynamicAttrHandler(
                                extrudedPolygonTechnique.lineColor,
                                color => {
                                    if (typeof color === "string" || typeof color === "number") {
                                        edgeMaterialInt.color.set(color as number);
                                    }
                                }
                            );

                            return edgeMaterialInt;
                        }
                    );
                    const edgeObj = new THREE.LineSegments(edgeGeometry, edgeMaterial);

                    // Set the correct render order.
                    edgeObj.renderOrder = object.renderOrder + 0.1;
                    FadingFeature.addTransparencyHack(edgeObj, false, false);

                    if (extrusionAnimationEnabled) {
                        extrudedObjects.push({
                            object: edgeObj,
                            materialFeature: false
                        });
                    }

                    this.registerTileObject(tile, edgeObj, technique.kind);
                    objects.push(edgeObj);
                }

                // animate the extrusion of buildings
                if (isExtrudedPolygonTechnique(technique) && extrusionAnimationEnabled) {
                    extrudedObjects.push({
                        object,
                        materialFeature: true
                    });

                    const extrusionAnimationDuration =
                        technique.animateExtrusionDuration !== undefined &&
                        animatedExtrusionHandler.forceEnabled === false
                            ? technique.animateExtrusionDuration
                            : animatedExtrusionHandler.duration;

                    tile.animatedExtrusionTileHandler = new AnimatedExtrusionTileHandler(
                        tile,
                        extrudedObjects,
                        extrusionAnimationDuration
                    );
                    mapView.animatedExtrusionHandler.add(tile.animatedExtrusionTileHandler);
                }

                // Add the fill area edges as a separate geometry.

                if (isFillTechnique(technique) && srcGeometry.edgeIndex !== undefined) {
                    const outlineGeometry = new THREE.BufferGeometry();
                    outlineGeometry.addAttribute(
                        "position",
                        bufferGeometry.getAttribute("position")
                    );
                    outlineGeometry.setIndex(getBufferAttribute(srcGeometry.edgeIndex!));

                    const fillTechnique = technique as FillTechnique;

                    const fadingParams = this.getPolygonFadingParams(tile, fillTechnique);

                    // Configure the edge material based on the theme values.
                    const outlineMaterial = dynamicTechniqueHandler.getOrCreateSharable(
                        `${technique._cacheKey}:outlineMaterial`,
                        () => {
                            const materialParams: EdgeMaterialParameters = {
                                color: fadingParams.color,
                                colorMix: fadingParams.colorMix,
                                fadeNear: fadingParams.lineFadeNear,
                                fadeFar: fadingParams.lineFadeFar
                            };
                            const outlineMaterialInt = new EdgeMaterial(materialParams);

                            FadingFeature.preprocessFadingTechniqueAttrs(
                                outlineMaterialInt,
                                fillTechnique.lineFadeFar || fillTechnique.fadeFar,
                                fillTechnique.lineFadeNear || fillTechnique.fadeNear,
                                dynamicTechniqueHandler
                            );

                            dynamicTechniqueHandler.addDynamicAttrHandler(
                                fillTechnique.lineColor,
                                color => {
                                    if (typeof color === "string" || typeof color === "number") {
                                        outlineMaterialInt.color.set(color as number);
                                    }
                                }
                            );

                            return outlineMaterialInt;
                        }
                    );

                    const outlineObj = new THREE.LineSegments(outlineGeometry, outlineMaterial);
                    outlineObj.renderOrder = object.renderOrder + 0.1;

                    FadingFeature.addTransparencyHack(outlineObj, true, false);

                    this.registerTileObject(tile, outlineObj, technique.kind);
                    objects.push(outlineObj);
                }

                // Add the fill area edges as a separate geometry.
                if (hasSolidLinesOutlines) {
                    const outlineTechnique = technique as SolidLineTechnique;
                    const outlineMaterial = dynamicTechniqueHandler.getOrCreateSharable(
                        `${technique._cacheKey}:solidLineOutLineMaterial`,
                        () => {
                            const newMaterial = material!.clone() as SolidLineMaterial;

                            FadingFeature.preprocessFadingTechniqueAttrs(
                                newMaterial,
                                outlineTechnique.fadeFar,
                                outlineTechnique.fadeNear,
                                dynamicTechniqueHandler
                            );

                            const unitFactor =
                                outlineTechnique.metricUnit === "Pixel"
                                    ? mapView.pixelToWorld
                                    : 1.0;

                            if (outlineTechnique.secondaryColor) {
                                outlineTechnique.secondaryColor = 0;
                            }
                            dynamicTechniqueHandler.addDynamicAttrHandler(
                                outlineTechnique.secondaryColor,
                                color => {
                                    if (typeof color === "string" || typeof color === "number") {
                                        newMaterial.color.set(color as number);
                                    }
                                    outlineMaterial.uniforms.diffuse.value = outlineColor;
                                }
                            );
                            dynamicTechniqueHandler.addDynamicAttrHandler(
                                outlineTechnique.secondaryWidth,
                                lineWidth => {
                                    newMaterial.lineWidth = Number(lineWidth) * unitFactor * 0.5;
                                }
                            );
                            return newMaterial;
                        }
                    );

                    const outlineColor = ColorCache.instance.getColor(
                        dynamicTechniqueHandler.evaluateDynamicAttr(
                            outlineTechnique.secondaryColor,
                            "0x000000"
                        )
                    );

                    outlineMaterial.uniforms.diffuse.value = outlineColor;
                    const outlineObj = new ObjectCtor(bufferGeometry, outlineMaterial);

                    outlineObj.renderOrder =
                        outlineTechnique.secondaryRenderOrder !== undefined
                            ? outlineTechnique.secondaryRenderOrder
                            : technique.renderOrder! - 0.0000001;

                    if (group.renderOrderOffset !== undefined) {
                        outlineObj.renderOrder += group.renderOrderOffset;
                    }

                    FadingFeature.addTransparencyHack(outlineObj, true, false);

                    this.registerTileObject(tile, outlineObj, technique.kind);
                    objects.push(outlineObj);
                }
            }
        }
    }

    /**
     * Prepare the [[Tile]]s pois. Uses the [[PoiManager]] in [[MapView]].
     */
    preparePois(tile: Tile, decodedTile: DecodedTile) {
        if (decodedTile.poiGeometries !== undefined) {
            tile.mapView.poiManager.addPois(tile, decodedTile);
        }
    }

    /**
     * Gets the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param technique Label's technique.
     * @param techniqueIdx Label's technique index.
     */
    getRenderStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextRenderStyle {
        const dynamicTechniqueHandler = tile.dynamicTechniqueHandler;
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const zoomLevel = mapView.zoomLevel;

        const cacheId = computeStyleCacheId(dataSource.name, technique, Math.floor(zoomLevel));
        let renderStyle = mapView.textRenderStyleCache.get(cacheId);
        if (renderStyle === undefined) {
            const defaultRenderParams =
                mapView.textElementsRenderer !== undefined
                    ? mapView.textElementsRenderer.defaultStyle.renderParams
                    : {
                          fontSize: {
                              unit: FontUnit.Pixel,
                              size: 32,
                              backgroundSize: 8
                          }
                      };

            const color = getPropertyValue(technique.color, Math.floor(zoomLevel));
            if (color !== undefined) {
                TileGeometryCreator.m_colorMap.set(cacheId, ColorCache.instance.getColor(color));
            }
            const bgColor = getPropertyValue(technique.backgroundColor, Math.floor(zoomLevel));
            if (bgColor !== undefined) {
                TileGeometryCreator.m_colorMap.set(
                    cacheId + "_bg",
                    ColorCache.instance.getColor(bgColor)
                );
            }

            const renderParams = {
                fontName: getOptionValue(technique.fontName, defaultRenderParams.fontName),
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: dynamicTechniqueHandler.evaluateDynamicAttr(
                        technique.size,
                        defaultRenderParams.fontSize!.size
                    ),
                    backgroundSize: dynamicTechniqueHandler.evaluateDynamicAttr(
                        technique.backgroundSize,
                        defaultRenderParams.fontSize!.backgroundSize
                    )
                },
                fontStyle:
                    technique.fontStyle === "Regular" ||
                    technique.fontStyle === "Bold" ||
                    technique.fontStyle === "Italic" ||
                    technique.fontStyle === "BoldItalic"
                        ? FontStyle[technique.fontStyle]
                        : defaultRenderParams.fontStyle,
                fontVariant:
                    technique.fontVariant === "Regular" ||
                    technique.fontVariant === "AllCaps" ||
                    technique.fontVariant === "SmallCaps"
                        ? FontVariant[technique.fontVariant]
                        : defaultRenderParams.fontVariant,
                rotation: getOptionValue(technique.rotation, defaultRenderParams.rotation),
                color: getOptionValue(
                    TileGeometryCreator.m_colorMap.get(cacheId),
                    defaultRenderParams.color
                ),
                backgroundColor: getOptionValue(
                    TileGeometryCreator.m_colorMap.get(cacheId + "_bg"),
                    defaultRenderParams.backgroundColor
                ),
                opacity: dynamicTechniqueHandler.evaluateDynamicAttr(
                    technique.opacity,
                    defaultRenderParams.opacity
                ),
                backgroundOpacity: dynamicTechniqueHandler.evaluateDynamicAttr(
                    technique.backgroundOpacity,
                    defaultRenderParams.backgroundOpacity
                )
            };

            const themeRenderParams =
                mapView.textElementsRenderer !== undefined
                    ? mapView.textElementsRenderer!.getTextElementStyle(technique.style)
                          .renderParams
                    : {};
            renderStyle = new TextRenderStyle({
                ...themeRenderParams,
                ...renderParams
            });
            mapView.textRenderStyleCache.set(cacheId, renderStyle);
        }

        return renderStyle;
    }

    /**
     * Gets the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param tile The [[Tile]] to process.
     * @param technique Label's technique.
     */
    getLayoutStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextLayoutStyle {
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const zoomLevel = mapView.zoomLevel;

        const cacheId = computeStyleCacheId(dataSource.name, technique, Math.floor(zoomLevel));
        let layoutStyle = mapView.textLayoutStyleCache.get(cacheId);
        if (layoutStyle === undefined) {
            const defaultLayoutParams =
                mapView.textElementsRenderer !== undefined
                    ? mapView.textElementsRenderer.defaultStyle.layoutParams
                    : {};

            const layoutParams = {
                tracking: getOptionValue(technique.tracking, defaultLayoutParams.tracking),
                leading: getOptionValue(technique.leading, defaultLayoutParams.leading),
                maxLines: getOptionValue(technique.maxLines, defaultLayoutParams.maxLines),
                lineWidth: getOptionValue(technique.lineWidth, defaultLayoutParams.lineWidth),
                canvasRotation: getOptionValue(
                    technique.canvasRotation,
                    defaultLayoutParams.canvasRotation
                ),
                lineRotation: getOptionValue(
                    technique.lineRotation,
                    defaultLayoutParams.lineRotation
                ),
                wrappingMode:
                    technique.wrappingMode === "None" ||
                    technique.wrappingMode === "Character" ||
                    technique.wrappingMode === "Word"
                        ? WrappingMode[technique.wrappingMode]
                        : defaultLayoutParams.wrappingMode,
                horizontalAlignment:
                    technique.hAlignment === "Left" ||
                    technique.hAlignment === "Center" ||
                    technique.hAlignment === "Right"
                        ? HorizontalAlignment[technique.hAlignment]
                        : defaultLayoutParams.horizontalAlignment,
                verticalAlignment:
                    technique.vAlignment === "Above" ||
                    technique.vAlignment === "Center" ||
                    technique.vAlignment === "Below"
                        ? VerticalAlignment[technique.vAlignment]
                        : defaultLayoutParams.verticalAlignment
            };

            const themeLayoutParams =
                mapView.textElementsRenderer !== undefined
                    ? mapView.textElementsRenderer!.getTextElementStyle(technique.style)
                          .layoutParams
                    : {};
            layoutStyle = new TextLayoutStyle({
                ...themeLayoutParams,
                ...layoutParams
            });
            mapView.textLayoutStyleCache.set(cacheId, layoutStyle);
        }

        return layoutStyle;
    }

    /**
     * Creates and add a background plane for the tile.
     */
    addGroundPlane(tile: Tile) {
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const projection = tile.projection;

        const color = mapView.clearColor;
        const tmpV = new THREE.Vector3();

        if (tile.projection.type === ProjectionType.Spherical) {
            const { east, west, north, south } = tile.geoBox;
            const sourceProjection = dataSource.getTilingScheme().projection;
            const g = new THREE.BufferGeometry();
            const posAttr = new THREE.BufferAttribute(
                new Float32Array([
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(south, west), tmpV)
                        .toArray(),
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(south, east), tmpV)
                        .toArray(),
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(north, west), tmpV)
                        .toArray(),
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(north, east), tmpV)
                        .toArray()
                ]),
                3
            );
            g.addAttribute("position", posAttr);
            g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
            const modifier = new SphericalGeometrySubdivisionModifier(
                THREE.Math.degToRad(10),
                sourceProjection
            );
            modifier.modify(g);

            for (let i = 0; i < posAttr.array.length; i += 3) {
                tmpV.set(posAttr.array[i], posAttr.array[i + 1], posAttr.array[i + 2]);
                projection.reprojectPoint(sourceProjection, tmpV, tmpV);
                tmpV.sub(tile.center);
                (posAttr.array as Float32Array)[i] = tmpV.x;
                (posAttr.array as Float32Array)[i + 1] = tmpV.y;
                (posAttr.array as Float32Array)[i + 2] = tmpV.z;
            }
            posAttr.needsUpdate = true;

            const material = new MapMeshBasicMaterial({
                color,
                visible: true,
                depthWrite: true
            });
            const mesh = new THREE.Mesh(g, material);
            mesh.renderOrder = Number.MIN_SAFE_INTEGER;
            this.registerTileObject(tile, mesh, GeometryKind.Background);
            tile.objects.push(mesh);
        } else {
            // Add a ground plane to the tile.
            tile.boundingBox.getSize(tmpV);
            const groundPlane = this.createPlane(tmpV.x, tmpV.y, tile.center, color, true);

            this.registerTileObject(tile, groundPlane, GeometryKind.Background);
            tile.objects.push(groundPlane);
        }
    }

    private setupTerrainMaterial(
        technique: TerrainTechnique,
        material: THREE.Material,
        terrainColor: number
    ) {
        if (technique.displacementMap === undefined) {
            // Render terrain using the given color.
            const stdMaterial = material as MapMeshStandardMaterial;
            stdMaterial.color.set(terrainColor);
            return;
        }

        // Render terrain using height-based colors.
        (material as any).onBeforeCompile = (shader: THREE.Shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_pars_fragment>",
                `#include <map_pars_fragment>
    uniform sampler2D displacementMap;
    uniform float displacementScale;
    uniform float displacementBias;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                `#ifdef USE_MAP
    float minElevation = ${EarthConstants.MIN_ELEVATION.toFixed(1)};
    float maxElevation = ${EarthConstants.MAX_ELEVATION.toFixed(1)};
    float elevationRange = maxElevation - minElevation;

    float disp = texture2D( displacementMap, vUv ).x * displacementScale + displacementBias;
    vec4 texelColor = texture2D( map, vec2((disp - minElevation) / elevationRange, 0.0) );
    texelColor = mapTexelToLinear( texelColor );
    diffuseColor *= texelColor;
#endif`
            );
            // We remove the displacement map from manipulating the vertices, it is
            // however still required for the pixel shader, so it can't be directly
            // removed.
            shader.vertexShader = shader.vertexShader.replace(
                "#include <displacementmap_vertex>",
                ""
            );
        };
        (material as MapMeshStandardMaterial).displacementMap!.needsUpdate = true;
    }

    /**
     * Create a simple flat plane for a [[Tile]].
     *
     * @param {number} width Width of plane.
     * @param {number} height Height of plane.
     * @param {THREE.Vector3} planeCenter Center of plane.
     * @param {number} colorHex Color of the plane mesh.
     * @param {boolean} isVisible `True` to make the mesh visible.
     * @returns {THREE.Mesh} The created plane.
     */
    private createPlane(
        width: number,
        height: number,
        planeCenter: THREE.Vector3,
        colorHex: number,
        isVisible: boolean
    ): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(width, height, 1);
        // TODO cache the material HARP-4207
        const material = new MapMeshBasicMaterial({
            color: colorHex,
            visible: isVisible,
            depthWrite: false
        });
        const plane = new THREE.Mesh(geometry, material);
        plane.position.copy(planeCenter);
        // Render before everything else
        plane.renderOrder = Number.MIN_SAFE_INTEGER;
        return plane;
    }

    /**
     * Pass the feature data on to the object, so it can be used in picking
     * `MapView.intersectMapObjects()`. Do not pass the feature data if the technique is a
     * dashed-line or a solid-line, because the line picking functionality for the lines is not
     * object based, but tile based.
     *
     * @param srcGeometry The original [[Geometry]].
     * @param technique The corresponding [[Technique]].
     * @param object The object to pass info to.
     */
    private addFeatureData(srcGeometry: Geometry, technique: Technique, object: THREE.Object3D) {
        if (
            ((srcGeometry.featureIds !== undefined && srcGeometry.featureIds.length > 0) ||
                isCirclesTechnique(technique) ||
                isSquaresTechnique(technique)) &&
            !isSolidLineTechnique(technique) &&
            !isDashedLineTechnique(technique)
        ) {
            const featureData: TileFeatureData = {
                geometryType: srcGeometry.type,
                ids: srcGeometry.featureIds,
                starts: srcGeometry.featureStarts
            };
            object.userData.feature = featureData;

            if (srcGeometry.objInfos !== undefined) {
                object.userData.feature.objInfos = srcGeometry.objInfos;
            }
        }
    }

    private addGeometryObjInfos(
        tile: Tile,
        srcGeometry: Geometry,
        technique: Technique,
        object: THREE.Object3D
    ) {
        if (srcGeometry.objInfos === undefined || Object.keys(object.userData).length > 0) {
            return;
        }

        if (isTerrainTechnique(technique)) {
            const displacementMap = (srcGeometry.objInfos as DisplacementMap[])[0];
            const tileDisplacementMap: TileDisplacementMap = {
                tileKey: tile.tileKey,
                texture: new THREE.DataTexture(
                    displacementMap.buffer,
                    displacementMap.xCountVertices,
                    displacementMap.yCountVertices,
                    THREE.LuminanceFormat,
                    THREE.FloatType
                ),
                displacementMap
            };
            object.userData = tileDisplacementMap;
        } else {
            object.userData = srcGeometry.objInfos;
        }
    }

    /**
     * Gets the fading parameters for several kinds of objects.
     */
    private getPolygonFadingParams(
        tile: Tile,
        technique: FillTechnique | ExtrudedPolygonTechnique
    ): PolygonFadingParameters {
        const dynamicTechniqueHandler = tile.dynamicTechniqueHandler;
        let color = dynamicTechniqueHandler.evaluateDynamicAttr(technique.lineColor);
        let colorMix = EdgeMaterial.DEFAULT_COLOR_MIX;

        if (color !== undefined) {
            if (isExtrudedPolygonTechnique(technique)) {
                const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
                colorMix = getOptionValue(
                    extrudedPolygonTechnique.lineColorMix,
                    EdgeMaterial.DEFAULT_COLOR_MIX
                );
            }
        }

        const fadeNear = dynamicTechniqueHandler.evaluateDynamicAttr(
            technique.fadeNear,
            FadingFeature.DEFAULT_FADE_NEAR
        );
        const fadeFar = dynamicTechniqueHandler.evaluateDynamicAttr(
            technique.fadeFar,
            FadingFeature.DEFAULT_FADE_FAR
        );

        const lineFadeNear = dynamicTechniqueHandler.evaluateDynamicAttr(
            technique.lineFadeNear,
            fadeNear
        );
        const lineFadeFar = dynamicTechniqueHandler.evaluateDynamicAttr(
            technique.lineFadeFar,
            fadeFar
        );

        if (color === undefined) {
            color = EdgeMaterial.DEFAULT_COLOR;
        }

        return {
            color,
            colorMix,
            fadeNear,
            fadeFar,
            lineFadeNear,
            lineFadeFar
        };
    }
}
