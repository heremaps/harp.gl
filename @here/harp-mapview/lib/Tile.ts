/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    BaseTechnique,
    BufferAttribute,
    DecodedTile,
    ExtrudedPolygonTechnique,
    FillTechnique,
    Geometry,
    getArrayConstructor,
    getPropertyValue,
    isCirclesTechnique,
    isDashedLineTechnique,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isSolidLineTechnique,
    isSquaresTechnique,
    isStandardTechnique,
    isStandardTexturedTechnique,
    LineMarkerTechnique,
    PoiTechnique,
    StandardExtrudedLineTechnique,
    Technique,
    TextPathGeometry,
    TextTechnique
} from "@here/harp-datasource-protocol";
import { GeoBox, TileKey } from "@here/harp-geoutils";
import {
    DashedLineMaterial,
    EdgeMaterial,
    EdgeMaterialParameters,
    FadingFeature,
    MapMeshBasicMaterial,
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
    VerticalAlignment
} from "@here/harp-text-canvas";
import {
    CachedResource,
    getOptionValue,
    GroupedPriorityList,
    PerformanceTimer
} from "@here/harp-utils";
import * as THREE from "three";
import { ColorCache } from "./ColorCache";
import { CopyrightInfo } from "./CopyrightInfo";
import { DataSource } from "./DataSource";
import { createMaterial, getBufferAttribute, getObjectConstructor } from "./DecodedTileHelpers";
import {
    createDepthPrePassMesh,
    isRenderDepthPrePassEnabled,
    setDepthPrePassStencil
} from "./DepthPrePass";
import {
    ITile,
    ITileLoader,
    RoadIntersectionData,
    TileFeatureData,
    TileObject,
    TileResourceUsageInfo
} from "./ITile";
import { MapView } from "./MapView";
import { MapViewPoints } from "./MapViewPoints";
import { PerformanceStatistics } from "./Statistics";
import { TextElement } from "./text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "./text/TextElementsRenderer";
import { computeStyleCacheId } from "./text/TextStyleCache";
import { MapViewUtils } from "./Utils";

/*  */
interface DisposableObject {
    geometry?: THREE.BufferGeometry | THREE.Geometry;
    material?: THREE.Material[] | THREE.Material;
}

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
 * A factor used for memory estimation.
 */
const MEMORY_UNDERESTIMATION_FACTOR = 2;

/**
 * Parameters that control fading.
 */
interface FadingParameters {
    fadeNear?: number;
    fadeFar?: number;
}

/**
 * Parameters that control fading for extruded buildings with fading edges.
 */
interface PolygonFadingParameters extends FadingParameters {
    color?: string | number;
    colorMix?: number;
    lineFadeNear?: number;
    lineFadeFar?: number;
}

/**
 * The class that holds the tiled data for a [[DataSource]].
 */
export class Tile implements CachedResource, ITile {
    get placedTextElements(): GroupedPriorityList<TextElement> {
        return this.m_placedTextElements;
    }

    get memoryUsage(): number {
        if (this.m_memoryUsage !== undefined) {
            return this.m_memoryUsage;
        }
        let numBytesUsed = 0;
        if (this.decodedTile !== undefined) {
            numBytesUsed += MapViewUtils.estimateObjectSize(this.decodedTile);
        }
        numBytesUsed += MapViewUtils.estimateObjectSize(this.textElementGroups);
        numBytesUsed += MapViewUtils.estimateObjectSize(this.objects);
        numBytesUsed += MapViewUtils.estimateObjectSize(this.preparedTextPaths);
        if (this.roadIntersectionData) {
            numBytesUsed += MapViewUtils.estimateObjectSize(this.roadIntersectionData);
        }
        this.m_memoryUsage = numBytesUsed;
        return numBytesUsed * MEMORY_UNDERESTIMATION_FACTOR;
    }

    get usageStatistics(): TileResourceUsageInfo {
        const renderInfo: TileResourceUsageInfo = {
            estimatedMemoryUsage: this.memoryUsage,
            numVertices: this.m_numVertices,
            numColors: ColorCache.instance.size,
            numObjects: this.objects.length,
            numGeometries:
                this.m_decodedTile !== undefined ? this.m_decodedTile.geometries.length : 0,
            numMaterials: this.getMaterialsCount()
        };
        return renderInfo;
    }

    get userTextElements(): TextElement[] {
        return this.m_userTextElements;
    }

    get offset() {
        return 0;
    }

    get isProxy() {
        return false;
    }

    get textElementGroups(): GroupedPriorityList<TextElement> {
        return this.m_textElementGroups;
    }

    get textElementsChanged(): boolean {
        return this.m_textElementsChanged;
    }

    set textElementsChanged(changed: boolean) {
        this.m_textElementsChanged = changed;
    }

    get visibleArea(): number {
        return this.m_visibleArea;
    }

    set visibleArea(area: number) {
        this.m_visibleArea = area;
        if (this.tileLoader !== undefined) {
            this.tileLoader.updatePriority(area);
        }
    }

    get decodedTile(): DecodedTile | undefined {
        return this.m_decodedTile;
    }

    get disposed(): boolean {
        return this.m_disposed;
    }

    get hasGeometry(): boolean {
        if (this.m_forceHasGeometry === undefined) {
            return this.objects.length !== 0;
        } else {
            return this.m_forceHasGeometry;
        }
    }

    get tileLoader(): ITileLoader | undefined {
        return this.m_tileLoader;
    }

    set tileLoader(tileLoader: ITileLoader | undefined) {
        this.m_tileLoader = tileLoader;
    }

    readonly objects: TileObject[] = [];

    readonly geoBox: GeoBox;

    readonly boundingBox: THREE.Box3 = new THREE.Box3();

    readonly center: THREE.Vector3 = new THREE.Vector3();

    roadIntersectionData?: RoadIntersectionData;

    copyrightInfo?: CopyrightInfo[];

    frameNumRequested: number = -1;

    frameNumVisible: number = -1;

    frameNumLastVisible: number = -1;

    numFramesVisible: number = 0;

    isVisible: boolean = false;

    geometryVersion: number = 0;

    private m_disposed: boolean = false;

    private m_forceHasGeometry: boolean | undefined = undefined;

    private m_tileLoader?: ITileLoader;
    private m_decodedTile?: DecodedTile;

    /**
     * Prepared text geometries optimized for display.
     */
    private m_preparedTextPaths: TextPathGeometry[] = new Array();

    // Used for [[TextElement]]s which the developer defines.
    private readonly m_userTextElements: TextElement[] = [];

    // Used for [[TextElement]]s that are stored in the data, and that are placed explicitly,
    // fading in and out.
    private readonly m_textElementGroups: GroupedPriorityList<
        TextElement
    > = new GroupedPriorityList<TextElement>();

    // All visible [[TextElement]]s.
    private readonly m_placedTextElements: GroupedPriorityList<
        TextElement
    > = new GroupedPriorityList<TextElement>();
    private m_numVertices: number = 0;

    private m_memoryUsage: number | undefined = undefined;

    // If `true`, the text content of the [[Tile]] changed.
    private m_textElementsChanged: boolean = false;

    private m_colorMap: Map<string, THREE.Color> = new Map();

    private m_visibleArea: number = 0;

    /**
     * Creates a new `Tile`.
     *
     * @param dataSource The [[DataSource]] that created this `Tile`.
     * @param tileKey The unique identifier for this `Tile`.
     */
    constructor(readonly dataSource: DataSource, readonly tileKey: TileKey) {
        this.geoBox = this.dataSource.getTilingScheme().getGeoBox(this.tileKey);
        this.dataSource.projection.projectBox(this.geoBox, this.boundingBox);
        this.boundingBox.getCenter(this.center);
    }

    addUserTextElement(textElement: TextElement) {
        this.m_userTextElements.push(textElement);
        this.textElementsChanged = true;
    }

    removeUserTextElement(textElement: TextElement): boolean {
        const foundIndex = this.m_userTextElements.indexOf(textElement);
        if (foundIndex >= 0) {
            this.m_userTextElements.splice(foundIndex, 1);
            this.textElementsChanged = true;
            return true;
        }
        return false;
    }

    addTextElement(textElement: TextElement) {
        this.textElementGroups.add(textElement);
        this.textElementsChanged = true;
    }

    removeTextElement(textElement: TextElement): boolean {
        if (this.textElementGroups.remove(textElement)) {
            this.textElementsChanged = true;
            return true;
        }
        return false;
    }

    prepareForRender() {
        if (!this.m_decodedTile || this.m_disposed) {
            return;
        }

        // If the tile is not ready for display, or if it has become invisible while being loaded,
        // for example by moving the camera, the tile is not finished and its geometry is not
        // created. This is an optimization for fast camera movements and zooms.
        if (!this.isVisible) {
            return;
        }

        const decodedTile = this.m_decodedTile;

        if (decodedTile.tileInfo !== undefined) {
            this.roadIntersectionData = this.dataSource.mapView.pickHandler.registerTile(this);
        }

        this.m_decodedTile = undefined;

        setTimeout(() => {
            const stats = PerformanceStatistics.instance;

            // If the tile has become invisible while being loaded, for example by moving the
            // camera, the tile is not finished and its geometry is not created. This is an
            // optimization for fast camera movements and zooms.
            if (!this.isVisible) {
                // Dispose the tile from the visible set, so it can be reloaded properly next time
                // it is needed.
                this.mapView.visibleTileSet.disposeTile(this);

                if (stats.enabled) {
                    stats.currentFrame.addMessage(
                        `Decoded tile: ${this.dataSource.name} # lvl=${this.tileKey.level} col=${
                            this.tileKey.column
                        } row=${this.tileKey.row} DISCARDED - invisible`
                    );
                }

                return;
            }

            let now = 0;
            if (stats.enabled) {
                now = PerformanceTimer.now();
            }

            this.createGeometries(decodedTile);

            if (stats.enabled) {
                const geometryCreationTime = PerformanceTimer.now() - now;
                const currentFrame = stats.currentFrame;

                currentFrame.addValue("geometry.geometryCreationTime", geometryCreationTime);

                currentFrame.addValue("geometryCount.numGeometries", decodedTile.geometries.length);
                currentFrame.addValue("geometryCount.numTechniques", decodedTile.techniques.length);
                currentFrame.addValue(
                    "geometryCount.numPoiGeometries",
                    decodedTile.poiGeometries !== undefined ? decodedTile.poiGeometries.length : 0
                );
                currentFrame.addValue(
                    "geometryCount.numTextGeometries",
                    decodedTile.textGeometries !== undefined ? decodedTile.textGeometries.length : 0
                );
                currentFrame.addValue(
                    "geometryCount.numTextPathGeometries",
                    decodedTile.textPathGeometries !== undefined
                        ? decodedTile.textPathGeometries.length
                        : 0
                );
                currentFrame.addMessage(
                    `Decoded tile: ${this.dataSource.name} # lvl=${this.tileKey.level} col=${
                        this.tileKey.column
                    } row=${this.tileKey.row}`
                );
            }

            this.dataSource.requestUpdate();
        }, 0);
    }

    willRender(_zoomLevel: number): boolean {
        return true;
    }

    didRender(): void {
        // to be overridden by subclasses
    }

    setDecodedTile(decodedTile: DecodedTile) {
        this.m_decodedTile = decodedTile;
        this.invalidateUsageInfoCache();

        const stats = PerformanceStatistics.instance;
        if (stats.enabled && decodedTile !== undefined && decodedTile.decodeTime !== undefined) {
            stats.currentFrame.addValue("decode.decodingTime", decodedTile.decodeTime);
        }
    }

    // tslint:disable-next-line:no-unused-variable
    shouldDisposeObjectGeometry(object: TileObject): boolean {
        return true;
    }

    // tslint:disable-next-line:no-unused-variable
    shouldDisposeObjectMaterial(object: TileObject): boolean {
        return true;
    }

    forceHasGeometry(value: boolean) {
        this.m_forceHasGeometry = value;
    }

    reload() {
        this.dataSource.updateTile(this);
    }

    dispose() {
        if (this.m_disposed) {
            return;
        }
        if (this.m_tileLoader) {
            this.m_tileLoader.dispose();
            this.m_tileLoader = undefined;
        }
        this.clear();
        this.userTextElements.length = 0;
        this.m_disposed = true;

        // Ensure that tile is removable from tile cache.
        this.isVisible = false;
    }

    prepareTextPaths(textPathGeometries: TextPathGeometry[]): TextPathGeometry[] {
        const processedPaths = new Array<TextPathGeometry>();

        const MAX_CORNER_ANGLE = Math.PI / 8;

        const newPaths = textPathGeometries.slice();

        // maximum reuse of variables to reduce allocations
        const p0 = new THREE.Vector2();
        const p1 = new THREE.Vector2();
        const previousTangent = new THREE.Vector2();

        while (newPaths.length > 0) {
            const textPath = newPaths.pop();

            if (textPath === undefined) {
                break;
            }

            let splitIndex = -1;

            for (let i = 0; i < textPath.path.length - 2; i += 2) {
                p0.set(textPath.path[i], textPath.path[i + 1]);
                p1.set(textPath.path[i + 2], textPath.path[i + 3]);
                const tangent = p1.sub(p0).normalize();

                if (i > 0) {
                    const theta = Math.atan2(
                        previousTangent.x * tangent.y - tangent.x * previousTangent.y,
                        tangent.dot(previousTangent)
                    );

                    if (Math.abs(theta) > MAX_CORNER_ANGLE) {
                        splitIndex = i;
                        break;
                    }
                }
                previousTangent.set(tangent.x, tangent.y);
            }

            if (splitIndex > 0) {
                // split off the valid first path points with a clone of the path
                const firstTextPath = {
                    path: textPath.path.slice(0, splitIndex + 2),
                    text: textPath.text,
                    // Used for placement priorities only, can be kept although it could also be
                    // recomputed
                    pathLengthSqr: textPath.pathLengthSqr,
                    technique: textPath.technique,
                    featureId: textPath.featureId
                };

                processedPaths.push(firstTextPath);

                // setup a second part with the rest of the path points and process again
                const secondTextPath = {
                    path: textPath.path.slice(splitIndex),
                    text: textPath.text,
                    // Used for placement priorities only, can be kept although it could also be
                    // recomputed
                    pathLengthSqr: textPath.pathLengthSqr,
                    technique: textPath.technique,
                    featureId: textPath.featureId
                };

                newPaths.push(secondTextPath);
            } else {
                processedPaths.push(textPath);
            }
        }
        return processedPaths;
    }

    createTextElements(decodedTile: DecodedTile) {
        // gather the sum of [[TextElement]]s (upper boundary), to compute the priority, such that
        // the text elements that come first get the highest priority, so they get placed first.
        let numTextElements = 0;
        let numTextElementsCreated = 0;

        if (decodedTile.textPathGeometries !== undefined) {
            numTextElements += decodedTile.textPathGeometries.length;
        }
        if (decodedTile.textGeometries !== undefined) {
            numTextElements += decodedTile.textGeometries.length;
        }

        const displayZoomLevel = Math.floor(this.mapView.zoomLevel);
        if (decodedTile.textPathGeometries !== undefined) {
            this.m_preparedTextPaths = this.prepareTextPaths(decodedTile.textPathGeometries);

            // Compute maximum street length (squared). Longer streets should be labelled first,
            // they have a higher chance of being placed in case the number of text elements is
            // limited.
            let maxPathLengthSqr = 0;
            for (const textPath of this.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (technique.name !== "text") {
                    continue;
                }
                if (textPath.pathLengthSqr > maxPathLengthSqr) {
                    maxPathLengthSqr = textPath.pathLengthSqr;
                }
            }

            for (const textPath of this.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (technique.name !== "text") {
                    continue;
                }

                const path: THREE.Vector2[] = [];
                for (let i = 0; i < textPath.path.length; i += 2) {
                    path.push(new THREE.Vector2(textPath.path[i], textPath.path[i + 1]));
                }

                // Make sorting stable and make pathLengthSqr a differentiator for placement.
                const priority =
                    getOptionValue(getPropertyValue(technique.priority, displayZoomLevel), 0) +
                    (maxPathLengthSqr > 0
                        ? (SORT_WEIGHT_PATH_LENGTH * textPath.pathLengthSqr) / maxPathLengthSqr
                        : 0);

                const textElement = new TextElement(
                    ContextualArabicConverter.instance.convert(textPath.text),
                    path,
                    this.getRenderStyle(technique),
                    this.getLayoutStyle(technique),
                    priority,
                    technique.xOffset !== undefined ? technique.xOffset : 0.0,
                    technique.yOffset !== undefined ? technique.yOffset : 0.0,
                    textPath.featureId,
                    technique.style,
                    getPropertyValue(technique.fadeNear, displayZoomLevel),
                    getPropertyValue(technique.fadeFar, displayZoomLevel)
                );
                textElement.minZoomLevel =
                    technique.minZoomLevel !== undefined
                        ? technique.minZoomLevel
                        : this.mapView.minZoomLevel;
                textElement.maxZoomLevel =
                    technique.maxZoomLevel !== undefined
                        ? technique.maxZoomLevel
                        : this.mapView.maxZoomLevel;
                textElement.distanceScale =
                    technique.distanceScale !== undefined
                        ? technique.distanceScale
                        : DEFAULT_TEXT_DISTANCE_SCALE;
                textElement.mayOverlap = technique.mayOverlap === true;
                textElement.reserveSpace = technique.reserveSpace !== false;

                this.addTextElement(textElement);
                numTextElementsCreated++;
            }
        }

        if (decodedTile.textGeometries !== undefined) {
            for (const text of decodedTile.textGeometries) {
                if (text.technique === undefined || text.stringCatalog === undefined) {
                    continue;
                }

                const technique = decodedTile.techniques[text.technique];

                if (technique.name !== "text") {
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

                const priority = getOptionValue(
                    getPropertyValue(technique.priority, displayZoomLevel),
                    0
                );

                for (let i = 0; i < numPositions; ++i) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);
                    const label = text.stringCatalog[text.texts[i]];
                    if (label === undefined) {
                        // skip missing labels
                        continue;
                    }

                    const textElement = new TextElement(
                        ContextualArabicConverter.instance.convert(label!),
                        new THREE.Vector2(x, y),
                        this.getRenderStyle(technique),
                        this.getLayoutStyle(technique),
                        priority,
                        technique.xOffset || 0.0,
                        technique.yOffset || 0.0,
                        text.featureId,
                        technique.style
                    );

                    textElement.minZoomLevel =
                        technique.minZoomLevel !== undefined
                            ? technique.minZoomLevel
                            : this.mapView.minZoomLevel;
                    textElement.maxZoomLevel =
                        technique.maxZoomLevel !== undefined
                            ? technique.maxZoomLevel
                            : this.mapView.maxZoomLevel;
                    textElement.mayOverlap = technique.mayOverlap === true;
                    textElement.reserveSpace = technique.reserveSpace !== false;

                    textElement.fadeNear = getPropertyValue(technique.fadeNear, displayZoomLevel);
                    textElement.fadeFar = getPropertyValue(technique.fadeFar, displayZoomLevel);

                    this.addTextElement(textElement);
                    numTextElementsCreated++;
                }
            }
        }
    }

    /**
     * Counts the number of vertices in a tile.
     */
    protected countVertices(): void {
        this.objects
            .filter(object => object instanceof THREE.Mesh)
            .forEach(object => {
                const mesh = object as THREE.Mesh;
                if (mesh.geometry instanceof THREE.BufferGeometry) {
                    if (mesh.geometry.index !== undefined && mesh.geometry.index !== null) {
                        this.m_numVertices += mesh.geometry.index.count;
                    } else {
                        this.m_numVertices += mesh.geometry.getAttribute("position").count / 3;
                    }
                }
                if (mesh.geometry instanceof THREE.Geometry) {
                    this.m_numVertices = mesh.geometry.vertices.length;
                }
            });
    }

    /**
     * Creates `Tile` objects from the decoded tile and list of materials specified.
     *
     * @param decodedTile The [[DecodedTile]].
     * @param objects The current list of tile objects.
     */
    protected createObjects(decodedTile: DecodedTile, objects: TileObject[]) {
        const materials: THREE.Material[] = [];
        const displayZoomLevel = this.mapView.zoomLevel;

        if (this.dataSource.addTileBackground) {
            // Add a ground plane to the tile.
            const planeSize = new THREE.Vector3();
            this.boundingBox.getSize(planeSize);
            const groundPlane = this.createPlane(
                planeSize.x,
                planeSize.y,
                this.center,
                this.dataSource.tileBackgroundColor === undefined
                    ? this.mapView.clearColor
                    : this.dataSource.tileBackgroundColor,
                this.dataSource.tileBackgroundIsVisible
            );

            this.registerTileObject(groundPlane);
            objects.push(groundPlane);
        }

        for (const srcGeometry of decodedTile.geometries) {
            const groups = srcGeometry.groups;
            const groupCount = groups.length;

            for (let groupIndex = 0; groupIndex < groupCount; ) {
                const group = groups[groupIndex++];
                const start = group.start;
                const techniqueIndex = group.technique;
                const technique = decodedTile.techniques[techniqueIndex];

                let count = group.count;

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
                }

                const ObjectCtor = getObjectConstructor(technique);

                if (ObjectCtor === undefined) {
                    continue;
                }

                let material: THREE.Material | undefined = materials[techniqueIndex];

                if (material === undefined) {
                    const onMaterialUpdated = () => {
                        this.dataSource.requestUpdate();
                    };
                    material = createMaterial(
                        {
                            technique,
                            level: Math.floor(displayZoomLevel),
                            fog: this.mapView.scene.fog !== null
                        },
                        onMaterialUpdated
                    );
                    if (material === undefined) {
                        continue;
                    }
                    materials[techniqueIndex] = material;
                }

                const bufferGeometry = new THREE.BufferGeometry();

                srcGeometry.vertexAttributes.forEach(vertexAttribute => {
                    const buffer = getBufferAttribute(vertexAttribute);
                    bufferGeometry.addAttribute(vertexAttribute.name, buffer);
                });

                if (srcGeometry.interleavedVertexAttributes !== undefined) {
                    srcGeometry.interleavedVertexAttributes.forEach(attr => {
                        const ArrayCtor = getArrayConstructor(attr.type);
                        const buffer = new THREE.InterleavedBuffer(
                            new ArrayCtor(attr.buffer),
                            attr.stride
                        );
                        attr.attributes.forEach(interleavedAttr => {
                            const attribute = new THREE.InterleavedBufferAttribute(
                                buffer,
                                interleavedAttr.itemSize,
                                interleavedAttr.offset,
                                false
                            );
                            bufferGeometry.addAttribute(interleavedAttr.name, attribute);
                        });
                    });
                }

                if (srcGeometry.index) {
                    bufferGeometry.setIndex(getBufferAttribute(srcGeometry.index));
                }

                if (
                    !bufferGeometry.getAttribute("normal") &&
                    (isStandardTechnique(technique) || isStandardTexturedTechnique(technique))
                ) {
                    bufferGeometry.computeVertexNormals();
                }

                bufferGeometry.addGroup(start, count);

                if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
                    const lineMaterial = material as THREE.RawShaderMaterial;
                    lineMaterial.uniforms.opacity.value = material.opacity;

                    if (technique.clipping !== false) {
                        const tileSize = lineMaterial.uniforms.tileSize;
                        const size = new THREE.Vector3();
                        this.boundingBox.getSize(size);
                        tileSize.value.x = size.x;
                        tileSize.value.y = size.y;
                        lineMaterial.defines.TILE_CLIP = 1;
                    }
                }

                // Add polygon offset to the extruded buildings and to the fill area to avoid depth
                // problems when rendering edges.
                const hasExtrudedOutlines: boolean =
                    isExtrudedPolygonTechnique(technique) && srcGeometry.edgeIndex !== undefined;
                const hasFillOutlines: boolean =
                    isFillTechnique(technique) && srcGeometry.edgeIndex !== undefined;
                if (hasExtrudedOutlines || hasFillOutlines) {
                    material.polygonOffset = true;
                    material.polygonOffsetFactor = 0.75;
                    material.polygonOffsetUnits = 4.0;
                }

                const object = new ObjectCtor(bufferGeometry, material);

                object.frustumCulled = false;

                if (technique.renderOrder !== undefined) {
                    object.renderOrder = technique.renderOrder;
                } else {
                    if (technique._renderOrderAuto === undefined) {
                        throw new Error("Technique has no renderOrderAuto");
                    }
                    object.renderOrder = technique._renderOrderAuto;
                }

                if (group.renderOrderOffset !== undefined) {
                    object.renderOrder += group.renderOrderOffset;
                }

                if (srcGeometry.uuid !== undefined) {
                    object.userData.geometryId = srcGeometry.uuid;
                }

                if (
                    (isCirclesTechnique(technique) || isSquaresTechnique(technique)) &&
                    technique.enablePicking !== undefined
                ) {
                    (object as MapViewPoints).enableRayTesting = technique.enablePicking;
                }

                // Lines renderOrder fix: Render them as transparent objects, but make sure they end
                // up in the opaque rendering queue (by disabling transparency onAfterRender, and
                // enabling it onBeforeRender).
                if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
                    const fadingParams = this.getFadingParams(technique);
                    FadingFeature.addRenderHelper(
                        object,
                        fadingParams.fadeNear,
                        fadingParams.fadeFar,
                        true,
                        false,
                        (renderer, mat) => {
                            const lineMaterial = mat as SolidLineMaterial;

                            const metricUnits = getPropertyValue(
                                technique.metricUnit,
                                this.tileKey.level
                            );
                            const unitFactor =
                                metricUnits === "Pixel" ? this.mapView.pixelToWorld * 0.5 : 1.0;

                            lineMaterial.lineWidth =
                                getOptionValue(
                                    getPropertyValue(technique.lineWidth, this.mapView.zoomLevel),
                                    SolidLineMaterial.DEFAULT_WIDTH
                                ) * unitFactor;

                            // Do the same for dashSize and gapSize for dashed lines.
                            if (isDashedLineTechnique(technique)) {
                                const dashedLineMaterial = lineMaterial as DashedLineMaterial;

                                dashedLineMaterial.dashSize =
                                    getOptionValue(
                                        getPropertyValue(
                                            technique.dashSize,
                                            this.mapView.zoomLevel
                                        ),
                                        DashedLineMaterial.DEFAULT_DASH_SIZE
                                    ) * unitFactor;

                                dashedLineMaterial.gapSize =
                                    getOptionValue(
                                        getPropertyValue(technique.gapSize, this.mapView.zoomLevel),
                                        DashedLineMaterial.DEFAULT_GAP_SIZE
                                    ) * unitFactor;
                            }
                        }
                    );
                }

                if (isExtrudedLineTechnique(technique)) {
                    // extruded lines are normal meshes, and need transparency only when fading
                    // is defined.
                    if (technique.fadeFar !== undefined) {
                        const fadingParams = this.getFadingParams(
                            technique as StandardExtrudedLineTechnique
                        );
                        FadingFeature.addRenderHelper(
                            object,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            true,
                            true
                        );
                    }
                }

                this.addFeatureData(srcGeometry, technique, object);

                if (isExtrudedPolygonTechnique(technique) || isFillTechnique(technique)) {
                    // filled polygons are normal meshes, and need transparency only when fading is
                    // defined.
                    if (technique.fadeFar !== undefined) {
                        const fadingParams = this.getFadingParams(technique);
                        FadingFeature.addRenderHelper(
                            object,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            true,
                            true
                        );
                    }
                }

                const renderDepthPrePass =
                    technique.name === "extruded-polygon" && isRenderDepthPrePassEnabled(technique);

                if (renderDepthPrePass) {
                    const depthPassMesh = createDepthPrePassMesh(object as THREE.Mesh);
                    objects.push(depthPassMesh);

                    setDepthPrePassStencil(depthPassMesh, object as THREE.Mesh);
                }

                this.registerTileObject(object);
                objects.push(object);

                // Add the extruded building edges as a separate geometry.
                if (hasExtrudedOutlines) {
                    const edgeGeometry = new THREE.BufferGeometry();
                    edgeGeometry.addAttribute("position", bufferGeometry.getAttribute("position"));
                    edgeGeometry.addAttribute("color", bufferGeometry.getAttribute("color"));
                    edgeGeometry.setIndex(
                        getBufferAttribute(srcGeometry.edgeIndex! as BufferAttribute)
                    );

                    // Read the uniforms from the technique values (and apply the default values).
                    const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;

                    const fadingParams = this.getPolygonFadingParams(extrudedPolygonTechnique);

                    // Configure the edge material based on the theme values.
                    const materialParams: EdgeMaterialParameters = {
                        color: fadingParams.color,
                        colorMix: fadingParams.colorMix,
                        fadeNear: fadingParams.lineFadeNear,
                        fadeFar: fadingParams.lineFadeFar
                    };
                    const edgeMaterial = new EdgeMaterial(materialParams);
                    const edgeObj = new THREE.LineSegments(edgeGeometry, edgeMaterial);

                    // Set the correct render order.
                    edgeObj.renderOrder = object.renderOrder + 0.1;

                    FadingFeature.addRenderHelper(
                        edgeObj,
                        fadingParams.lineFadeNear,
                        fadingParams.lineFadeFar,
                        false,
                        false
                    );

                    this.registerTileObject(edgeObj);
                    objects.push(edgeObj);
                }

                // Add the fill area edges as a separate geometry.
                if (hasFillOutlines) {
                    const edgeIndexBuffers = srcGeometry.edgeIndex! as BufferAttribute[];
                    for (const edgeIndexBufferAttribute of edgeIndexBuffers) {
                        const outlineGeometry = new THREE.BufferGeometry();
                        outlineGeometry.addAttribute(
                            "position",
                            bufferGeometry.getAttribute("position")
                        );
                        outlineGeometry.setIndex(getBufferAttribute(edgeIndexBufferAttribute));

                        const fillTechnique = technique as FillTechnique;

                        const fadingParams = this.getPolygonFadingParams(fillTechnique);

                        // Configure the edge material based on the theme values.
                        const materialParams: EdgeMaterialParameters = {
                            color: fadingParams.color,
                            colorMix: fadingParams.colorMix,
                            fadeNear: fadingParams.lineFadeNear,
                            fadeFar: fadingParams.lineFadeFar
                        };
                        const outlineMaterial = new EdgeMaterial(materialParams);
                        const outlineObj = new THREE.LineSegments(outlineGeometry, outlineMaterial);
                        outlineObj.renderOrder = object.renderOrder + 0.1;

                        FadingFeature.addRenderHelper(
                            outlineObj,
                            fadingParams.lineFadeNear,
                            fadingParams.lineFadeFar,
                            true,
                            false
                        );

                        this.registerTileObject(outlineObj);
                        objects.push(outlineObj);
                    }
                }
            }
        }
    }

    /**
     * Missing Typedoc
     */
    protected preparePois(decodedTile: DecodedTile) {
        if (decodedTile.poiGeometries !== undefined) {
            this.mapView.poiManager.addPois(this, decodedTile);
        }
    }

    /**
     * Gets the appropiate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param technique Label's technique.
     * @param techniqueIdx Label's technique index.
     */
    protected getRenderStyle(
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextRenderStyle {
        const cacheId = computeStyleCacheId(
            this.dataSource.name,
            technique,
            this.mapView.zoomLevel
        );
        let renderStyle = this.mapView.textRenderStyleCache.get(cacheId);
        if (renderStyle === undefined) {
            const defaultRenderParams =
                this.mapView.textElementsRenderer !== undefined
                    ? this.mapView.textElementsRenderer.defaultStyle.renderParams
                    : {
                          fontSize: {
                              unit: FontUnit.Pixel,
                              size: 32,
                              backgroundSize: 8
                          }
                      };

            const textSize = getOptionValue(
                getPropertyValue(technique.size, Math.floor(this.mapView.zoomLevel)),
                defaultRenderParams.fontSize!.size
            );
            const bgSize = getOptionValue(
                getPropertyValue(technique.backgroundSize, Math.floor(this.mapView.zoomLevel)),
                defaultRenderParams.fontSize!.backgroundSize
            );

            const hexColor = getPropertyValue(technique.color, Math.floor(this.mapView.zoomLevel));
            if (hexColor !== undefined) {
                this.m_colorMap.set(cacheId, ColorCache.instance.getColor(hexColor));
            }
            const styleColor = getOptionValue(
                this.m_colorMap.get(cacheId),
                defaultRenderParams.color
            );

            const hexBgColor = getPropertyValue(
                technique.backgroundColor,
                Math.floor(this.mapView.zoomLevel)
            );
            if (hexBgColor !== undefined) {
                this.m_colorMap.set(cacheId + "_bg", ColorCache.instance.getColor(hexBgColor));
            }
            const styleBgColor = getOptionValue(
                this.m_colorMap.get(cacheId + "_bg"),
                defaultRenderParams.backgroundColor
            );

            const bgAlpha = getOptionValue(
                getPropertyValue(technique.backgroundAlpha, Math.floor(this.mapView.zoomLevel)),
                defaultRenderParams.backgroundOpacity
            );

            const isSmallCaps =
                technique.smallCaps === true ||
                defaultRenderParams.fontVariant === FontVariant.SmallCaps;
            const isAllCaps =
                technique.allCaps === true ||
                defaultRenderParams.fontVariant === FontVariant.AllCaps;
            const styleFontVariant = isSmallCaps
                ? FontVariant.SmallCaps
                : isAllCaps
                ? FontVariant.AllCaps
                : undefined;
            const styleFontStyle =
                technique.bold === true
                    ? technique.oblique
                        ? FontStyle.BoldItalic
                        : FontStyle.Bold
                    : technique.oblique === true
                    ? FontStyle.Italic
                    : defaultRenderParams.fontStyle;

            const renderParams = {
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: textSize,
                    backgroundSize: bgSize
                },
                color: styleColor,
                backgroundColor: styleBgColor,
                backgroundOpacity: bgAlpha,
                fontVariant: styleFontVariant,
                fontStyle: styleFontStyle
            };

            const themeRenderParams =
                this.mapView.textElementsRenderer !== undefined
                    ? this.mapView.textElementsRenderer!.getTextElementStyle(technique.style)
                          .renderParams
                    : {};
            renderStyle = new TextRenderStyle({
                ...themeRenderParams,
                ...renderParams
            });
            this.mapView.textRenderStyleCache.set(cacheId, renderStyle);
        }

        return renderStyle;
    }

    /**
     * Gets the appropiate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param technique Label's technique.
     */
    protected getLayoutStyle(
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextLayoutStyle {
        const cacheId = computeStyleCacheId(
            this.dataSource.name,
            technique,
            this.mapView.zoomLevel
        );
        let layoutStyle = this.mapView.textLayoutStyleCache.get(cacheId);
        if (layoutStyle === undefined) {
            const defaultLayoutParams =
                this.mapView.textElementsRenderer !== undefined
                    ? this.mapView.textElementsRenderer.defaultStyle.layoutParams
                    : {};

            const trackingFactor = getOptionValue(technique.tracking, defaultLayoutParams.tracking);
            let hAlignment = defaultLayoutParams.horizontalAlignment;
            if (
                technique.hAlignment === "Left" ||
                technique.hAlignment === "Center" ||
                technique.hAlignment === "Right"
            ) {
                hAlignment = HorizontalAlignment[technique.hAlignment];
            }
            let vAlignment = defaultLayoutParams.verticalAlignment;
            if (
                technique.vAlignment === "Above" ||
                technique.vAlignment === "Center" ||
                technique.vAlignment === "Below"
            ) {
                vAlignment = VerticalAlignment[technique.vAlignment];
            }

            const layoutParams = {
                tracking: trackingFactor,
                horizontalAlignment: hAlignment,
                verticalAlignment: vAlignment
            };

            const themeLayoutParams =
                this.mapView.textElementsRenderer !== undefined
                    ? this.mapView.textElementsRenderer!.getTextElementStyle(technique.style)
                          .layoutParams
                    : {};
            layoutStyle = new TextLayoutStyle({
                ...themeLayoutParams,
                ...layoutParams
            });
            this.mapView.textLayoutStyleCache.set(cacheId, layoutStyle);
        }

        return layoutStyle;
    }

    /**
     * Called after the [[ITile]] has been decoded.
     *
     * @param decodedTile The [[DecodedTile]].
     */
    protected createGeometries(decodedTile: DecodedTile) {
        this.clear();
        this.preparePois(decodedTile);
        this.createTextElements(decodedTile);
        this.createObjects(decodedTile, this.objects);
        this.countVertices();
        this.geometryVersion++;
    }

    /**
     * Adds a THREE object to the root of the tile. Sets the owning tiles datasource.name and the
     * tileKey in the `userData` property of the object, such that the tile it belongs to can be
     * identified during picking.
     *
     * @param object The object to add to the root of the tile.
     */
    private registerTileObject(object: THREE.Object3D) {
        const userData = object.userData || {};
        userData.tileKey = this.tileKey;
        userData.dataSource = this.dataSource.name;
    }

    /**
     * Frees the rendering resources allocated by this [[ITile]].
     *
     * The default implementation of this method frees the geometries and
     * the materials for all the reachable objects.
     */
    private clear() {
        const disposeObject = (object: TileObject & DisposableObject) => {
            if (object.geometry !== undefined && this.shouldDisposeObjectGeometry(object)) {
                object.geometry.dispose();
            }

            if (object.material !== undefined && this.shouldDisposeObjectMaterial(object)) {
                if (object.material instanceof Array) {
                    object.material.forEach(material => {
                        if (material !== undefined) {
                            material.dispose();
                        }
                    });
                } else {
                    object.material.dispose();
                }
            }
        };

        this.objects.forEach((rootObject: TileObject & DisposableObject) => {
            rootObject.traverse((object: TileObject & DisposableObject) => {
                disposeObject(object);
            });

            disposeObject(rootObject);
        });

        this.objects.length = 0;
        if (this.m_preparedTextPaths) {
            this.m_preparedTextPaths = [];
        }

        this.placedTextElements.clear();
        this.textElementGroups.clear();
        this.userTextElements.length = 0;
        this.invalidateUsageInfoCache();
    }

    /**
     * Gets the prepared text geometries that are optimized for display.
     */
    private get preparedTextPaths(): TextPathGeometry[] {
        return this.m_preparedTextPaths;
    }

    /**
     * Get the map view from the data source.
     */
    private get mapView(): MapView {
        return this.dataSource.mapView;
    }

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
            // All 2D ground geometry is rendered with renderOrder set and with depthTest === false.
            depthTest: false
        });
        const plane = new THREE.Mesh(geometry, material);
        plane.position.copy(planeCenter);
        // Render before everything else
        plane.renderOrder = Number.MIN_SAFE_INTEGER;
        return plane;
    }

    /**
     * Invalidates resource usage data.
     */
    private invalidateUsageInfoCache(): void {
        this.m_numVertices = 0;
        this.m_memoryUsage = undefined;
    }

    private getMaterialsCount() {
        let num = 0;
        this.objects.forEach((rootObject: TileObject & DisposableObject) => {
            if (rootObject.material) {
                if (Array.isArray(rootObject.material)) {
                    num += rootObject.material.length;
                } else {
                    num += 1;
                }
            }
        });
        return num;
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
                technique.name === "circles" ||
                technique.name === "squares") &&
            technique.name !== "solid-line" &&
            technique.name !== "dashed-line"
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

    /**
     * Gets the fading parameters for several kinds of objects.
     */
    private getFadingParams(technique: BaseTechnique): FadingParameters {
        const displayZoomLevel = this.mapView.zoomLevel;
        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, displayZoomLevel)
                : FadingFeature.DEFAULT_FADE_NEAR;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, displayZoomLevel)
                : FadingFeature.DEFAULT_FADE_FAR;
        return {
            fadeNear,
            fadeFar
        };
    }

    /**
     * Gets the fading parameters for several kinds of objects.
     */
    private getPolygonFadingParams(
        technique: FillTechnique | ExtrudedPolygonTechnique
    ): PolygonFadingParameters {
        let color: string | number = EdgeMaterial.DEFAULT_COLOR;
        let colorMix = EdgeMaterial.DEFAULT_COLOR_MIX;

        if (technique.lineColor !== undefined) {
            color = technique.lineColor;
            if (isExtrudedPolygonTechnique(technique)) {
                const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
                colorMix =
                    extrudedPolygonTechnique.lineColorMix !== undefined
                        ? extrudedPolygonTechnique.lineColorMix
                        : EdgeMaterial.DEFAULT_COLOR_MIX;
            }
        }
        const displayZoomLevel = this.mapView.zoomLevel;

        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, displayZoomLevel)
                : FadingFeature.DEFAULT_FADE_NEAR;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, displayZoomLevel)
                : FadingFeature.DEFAULT_FADE_FAR;

        const lineFadeNear =
            technique.lineFadeNear !== undefined
                ? getPropertyValue(technique.lineFadeNear, displayZoomLevel)
                : fadeNear;
        const lineFadeFar =
            technique.lineFadeFar !== undefined
                ? getPropertyValue(technique.lineFadeFar, displayZoomLevel)
                : fadeFar;

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
