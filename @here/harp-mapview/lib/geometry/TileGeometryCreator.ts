/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    Attachment,
    BaseTechniqueParams,
    BufferAttribute,
    CallExpr,
    DecodedTile,
    Env,
    Expr,
    ExtrudedPolygonTechnique,
    FillTechnique,
    Geometry,
    GeometryKind,
    GeometryKindSet,
    getArrayConstructor,
    getFeatureId,
    getPropertyValue,
    IndexedTechnique,
    InterleavedBufferAttribute,
    isCirclesTechnique,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isJsonExpr,
    isLineMarkerTechnique,
    isLineTechnique,
    isPoiTechnique,
    isSegmentsTechnique,
    isSolidLineTechnique,
    isSquaresTechnique,
    isStandardTechnique,
    isTerrainTechnique,
    isTextTechnique,
    MakeTechniqueAttrs,
    MapEnv,
    needsVertexNormals,
    setTechniqueRenderOrderOrPriority,
    SolidLineTechnique,
    StandardExtrudedLineTechnique,
    Technique,
    TerrainTechnique,
    TextPathGeometry,
    Value
} from "@here/harp-datasource-protocol";
import {
    ExprEvaluatorContext,
    OperatorDescriptor
} from "@here/harp-datasource-protocol/lib/ExprEvaluator";
import {
    EdgeLengthGeometrySubdivisionModifier,
    SubdivisionMode
} from "@here/harp-geometry/lib/EdgeLengthGeometrySubdivisionModifier";
import { SphericalGeometrySubdivisionModifier } from "@here/harp-geometry/lib/SphericalGeometrySubdivisionModifier";
import {
    EarthConstants,
    GeoBox,
    GeoCoordinates,
    Projection,
    ProjectionType
} from "@here/harp-geoutils";
import {
    EdgeMaterial,
    EdgeMaterialParameters,
    ExtrusionFeature,
    FadingFeature,
    hasExtrusionFeature,
    isHighPrecisionLineMaterial,
    MapMeshBasicMaterial,
    MapMeshDepthMaterial,
    MapMeshStandardMaterial,
    setShaderMaterialDefine,
    SolidLineMaterial
} from "@here/harp-materials";
import { ContextualArabicConverter } from "@here/harp-text-canvas";
import { assert, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import {
    applyBaseColorToMaterial,
    buildMetricValueEvaluator,
    buildObject,
    createMaterial,
    getBufferAttribute,
    usesObject3D
} from "../DecodedTileHelpers";
import {
    createDepthPrePassMesh,
    isRenderDepthPrePassEnabled,
    setDepthPrePassStencil
} from "../DepthPrePass";
import { DisplacementMap, TileDisplacementMap } from "../DisplacementMap";
import { MapAdapterUpdateEnv, MapMaterialAdapter } from "../MapMaterialAdapter";
import { MapObjectAdapter, MapObjectAdapterParams } from "../MapObjectAdapter";
import { FALLBACK_RENDER_ORDER_OFFSET } from "../MapView";
import { MapViewPoints } from "../MapViewPoints";
import { PathBlockingElement } from "../PathBlockingElement";
import { TextElement } from "../text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";
import { Tile, TileFeatureData } from "../Tile";
import { LodMesh } from "./LodMesh";

const logger = LoggerManager.instance.create("TileGeometryCreator");

const tmpVector3 = new THREE.Vector3();
const tmpVector2 = new THREE.Vector2();

class AttachmentCache {
    readonly bufferAttributes = new Map<BufferAttribute, THREE.BufferAttribute>();

    readonly interleavedAttributes = new Map<
        InterleavedBufferAttribute,
        Array<{ name: string; attribute: THREE.InterleavedBufferAttribute }>
    >();
}

class MemoCallExpr extends CallExpr implements OperatorDescriptor {
    private readonly m_deps: string[];
    private readonly m_cachedProperties: Array<Value | undefined> = [];
    private m_cachedValue?: Value;

    constructor(expr: Expr) {
        super("memo", [expr]);
        this.m_deps = Array.from(expr.dependencies().properties);
        this.descriptor = this;
    }

    call(context: ExprEvaluatorContext): Value {
        let changed = false;

        this.m_deps.forEach((d, i) => {
            const newValue = context.env.lookup(d);
            if (!changed && newValue !== this.m_cachedProperties[i]) {
                changed = true;
            }
            if (changed) {
                this.m_cachedProperties[i] = newValue;
            }
        });

        if (changed || this.m_cachedValue === undefined) {
            this.m_cachedValue = context.evaluate(this.args[0]);
        }

        return this.m_cachedValue;
    }
}

class AttachmentInfo {
    constructor(
        readonly geometry: Geometry,
        readonly info: Attachment,
        readonly cache: AttachmentCache
    ) {}

    getBufferAttribute(description: BufferAttribute): THREE.BufferAttribute {
        if (this.cache.bufferAttributes.has(description)) {
            return this.cache.bufferAttributes.get(description)!;
        }
        const attribute = getBufferAttribute(description);
        this.cache.bufferAttributes.set(description, attribute);
        return attribute;
    }

    getInterleavedBufferAttributes(description: InterleavedBufferAttribute) {
        const interleavedAttributes = this.cache.interleavedAttributes.get(description);

        if (interleavedAttributes) {
            return interleavedAttributes;
        }

        const ArrayCtor = getArrayConstructor(description.type);
        const buffer = new ArrayCtor(description.buffer);
        const interleavedBuffer = new THREE.InterleavedBuffer(buffer, description.stride);

        const attrs = description.attributes.map(interleavedAttr => {
            const attribute = new THREE.InterleavedBufferAttribute(
                interleavedBuffer,
                interleavedAttr.itemSize,
                interleavedAttr.offset,
                false
            );
            const name = interleavedAttr.name;
            return { name, attribute };
        });

        this.cache.interleavedAttributes.set(description, attrs);
        return attrs;
    }
}

function addToExtrudedMaterials(
    material: THREE.Material | THREE.Material[],
    extrudedMaterials: ExtrusionFeature[]
) {
    if (Array.isArray(material)) {
        const materials = material as ExtrusionFeature[];
        extrudedMaterials.push(...materials);
    } else {
        extrudedMaterials.push(material as ExtrusionFeature);
    }
}

export interface TileCorners {
    se: THREE.Vector3;
    sw: THREE.Vector3;
    ne: THREE.Vector3;
    nw: THREE.Vector3;
}

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
 * Support class to create geometry for a {@link Tile} from a {@link @here/harp-datasource-protocol#DecodedTile}.
 */
export class TileGeometryCreator {
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
     * @param decodedTile - The decodedTile containing the actual tile map data.
     * @param enabledKinds - Optional [[GeometryKindSet]] used to specify which object kinds should be
     *      created.
     * @param disabledKinds - Optional [[GeometryKindSet]] used to filter objects that should not be
     *      created.
     */
    initDecodedTile(
        decodedTile: DecodedTile,
        enabledKinds?: GeometryKindSet | undefined,
        disabledKinds?: GeometryKindSet | undefined
    ) {
        for (const technique of decodedTile.techniques) {
            const kind = technique.kind;

            // No info about kind, no way to filter it.
            if (kind === undefined || (kind instanceof Set && kind.size === 0)) {
                technique._kindState = true;
                continue;
            }

            // Technique is enabled only if enabledKinds is defined and technique belongs to that set or
            // if that's not the case, disabledKinds must be undefined or technique does not belong to it.
            technique._kindState =
                !(disabledKinds !== undefined && disabledKinds.hasOrIntersects(kind)) ||
                (enabledKinds !== undefined && enabledKinds.hasOrIntersects(kind));
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
     * @param tile - The {@link Tile} to process.
     * @param decodedTile - The decodedTile containing the actual tile map data.
     */
    createAllGeometries(tile: Tile, decodedTile: DecodedTile) {
        const filter = (technique: IndexedTechnique): boolean => {
            return technique._kindState !== false;
        };

        this.createObjects(tile, decodedTile, filter);

        this.preparePois(tile, decodedTile);

        // TextElements do not get their geometry created by Tile, but are managed on a
        // higher level.
        const textFilter = (technique: IndexedTechnique): boolean => {
            if (
                !isPoiTechnique(technique) &&
                !isLineMarkerTechnique(technique) &&
                !isTextTechnique(technique)
            ) {
                return false;
            }
            return filter(technique);
        };
        this.createTextElements(tile, decodedTile, textFilter);

        this.createLabelRejectionElements(tile, decodedTile);

        // HARP-7899, disable ground plane for globe
        if (tile.dataSource.addGroundPlane && tile.projection.type === ProjectionType.Planar) {
            // The ground plane is required for when we change the zoom back and we fall back to the
            // parent, in that case we reduce the renderOrder of the parent tile and this ground
            // place ensures that parent doesn't come through. This value must be above the
            // renderOrder of all objects in the fallback tile, otherwise there won't be a proper
            // covering of the parent tile by the children, hence dividing by 2. To put a bit more
            // concretely, we assume all objects are rendered with a renderOrder between 0 and
            // FALLBACK_RENDER_ORDER_OFFSET / 2, i.e. 10000. The ground plane is put at -10000, and
            // the fallback tiles have their renderOrder set between -20000 and -10000
            TileGeometryCreator.instance.addGroundPlane(tile, -FALLBACK_RENDER_ORDER_OFFSET / 2);
        }
    }

    createLabelRejectionElements(tile: Tile, decodedTile: DecodedTile) {
        if (decodedTile.pathGeometries === undefined) {
            return;
        }
        for (const path of decodedTile.pathGeometries) {
            tile.addBlockingElement(new PathBlockingElement(path.path));
        }
    }

    /**
     * Processes the given tile and assign default values for geometry kinds,
     * render orders and label priorities.
     *
     * @param {Tile} tile
     * @param {(GeometryKindSet | undefined)} enabledKinds
     * @param {(GeometryKindSet | undefined)} disabledKinds
     */
    processTechniques(
        tile: Tile,
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void {
        const decodedTile = tile.decodedTile;

        if (decodedTile === undefined) {
            return;
        }

        this.processPriorities(tile);

        // Speedup and simplify following code: Test all techniques if they intersect with
        // enabledKinds and disabledKinds, in which case they are flagged. The disabledKinds can be
        // ignored hereafter.
        this.initDecodedTile(decodedTile, enabledKinds, disabledKinds);

        // compile the dynamic expressions.
        const exprPool = tile.dataSource.exprPool;
        decodedTile.techniques.forEach((technique: any) => {
            for (const propertyName in technique) {
                if (!technique.hasOwnProperty(propertyName)) {
                    continue;
                }
                const value = technique[propertyName];
                if (isJsonExpr(value) && propertyName !== "kind") {
                    // "kind" is reserved.
                    try {
                        let expr = Expr.fromJSON(value);
                        if (expr.dependencies().volatile !== true) {
                            expr = new MemoCallExpr(Expr.fromJSON(value));
                        }
                        technique[propertyName] = expr.intern(exprPool);
                    } catch (error) {
                        logger.error("Failed to compile expression:", error);
                    }
                }
            }
        });
    }

    /**
     * Adds a THREE object to the root of the tile and register [[MapObjectAdapter]].
     *
     * Sets the owning tiles datasource.name and the `tileKey` in the `userData` property of the
     * object, such that the tile it belongs to can be identified during picking.
     *
     * @param tile - The {@link Tile} to add the object to.
     * @param object - The object to add to the root of the tile.
     * @param geometryKind - The kind of object. Can be used for filtering.
     * @param mapAdapterParams - additional parameters for [[MapObjectAdapter]]
     */
    registerTileObject(
        tile: Tile,
        object: THREE.Object3D,
        geometryKind: GeometryKind | GeometryKindSet | undefined,
        mapAdapterParams?: MapObjectAdapterParams
    ) {
        const kind =
            geometryKind instanceof Set
                ? Array.from((geometryKind as GeometryKindSet).values())
                : Array.isArray(geometryKind)
                ? geometryKind
                : [geometryKind];

        MapObjectAdapter.create(object, {
            kind,
            ...mapAdapterParams
        });

        // TODO legacy fields, encoded directly in `userData to be removed
        if (object.userData === undefined) {
            object.userData = {};
        }

        const userData = object.userData;
        userData.tileKey = tile.tileKey;
        userData.dataSource = tile.dataSource.name;

        userData.kind = kind;

        // Force a visibility check of all objects.
        tile.resetVisibilityCounter();
    }

    /**
     * Splits the text paths that contain sharp corners.
     *
     * @param tile - The {@link Tile} to process paths on.
     * @param textPathGeometries - The original path geometries that may have defects.
     * @param textFilter -: Optional filter. Should return true for any text technique that is
     *      applicable.
     */
    prepareTextPaths(
        textPathGeometries: TextPathGeometry[],
        decodedTile: DecodedTile,
        textFilter?: (technique: IndexedTechnique) => boolean
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
     * Creates {@link TextElement} objects from the decoded tile and list of materials specified. The
     * priorities of the {@link TextElement}s are updated to simplify label placement.
     *
     * @param tile - The {@link Tile} to create the testElements on.
     * @param decodedTile - The {@link @here/harp-datasource-protocol#DecodedTile}.
     * @param textFilter -: Optional filter. Should return true for any text technique that is
     *      applicable.
     */
    createTextElements(
        tile: Tile,
        decodedTile: DecodedTile,
        textFilter?: (technique: IndexedTechnique) => boolean
    ) {
        const mapView = tile.mapView;
        const textStyleCache = tile.textStyleCache;
        const worldOffsetX = tile.computeWorldOffsetX();

        const discreteZoomLevel = Math.floor(mapView.zoomLevel);
        const discreteZoomEnv = new MapEnv({ $zoom: discreteZoomLevel }, mapView.env);

        if (decodedTile.textPathGeometries !== undefined) {
            const textPathGeometries = this.prepareTextPaths(
                decodedTile.textPathGeometries,
                decodedTile,
                textFilter
            );

            for (const textPath of textPathGeometries) {
                const technique = decodedTile.techniques[textPath.technique];

                if (
                    technique._kindState === false ||
                    !isTextTechnique(technique) ||
                    (textFilter !== undefined && !textFilter(technique))
                ) {
                    continue;
                }

                const path: THREE.Vector3[] = [];
                for (let i = 0; i < textPath.path.length; i += 3) {
                    path.push(
                        new THREE.Vector3(
                            textPath.path[i] + worldOffsetX,
                            textPath.path[i + 1],
                            textPath.path[i + 2]
                        )
                    );
                }

                // Make sorting stable.
                const priority =
                    technique.priority !== undefined
                        ? getPropertyValue(technique.priority, discreteZoomEnv)
                        : 0;
                const fadeNear =
                    technique.fadeNear !== undefined
                        ? getPropertyValue(technique.fadeNear, discreteZoomEnv)
                        : technique.fadeNear;
                const fadeFar =
                    technique.fadeFar !== undefined
                        ? getPropertyValue(technique.fadeFar, discreteZoomEnv)
                        : technique.fadeFar;
                const userData = textPath.objInfos;
                const featureId = getFeatureId(userData);
                const textElement = new TextElement(
                    ContextualArabicConverter.instance.convert(textPath.text),
                    path,
                    textStyleCache.getRenderStyle(technique),
                    textStyleCache.getLayoutStyle(technique),
                    priority,
                    technique.xOffset !== undefined ? technique.xOffset : 0.0,
                    technique.yOffset !== undefined ? technique.yOffset : 0.0,
                    featureId,
                    technique.style,
                    fadeNear,
                    fadeFar,
                    tile.offset
                );
                textElement.pathLengthSqr = textPath.pathLengthSqr;
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
                textElement.textFadeTime = technique.textFadeTime;

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
                    technique._kindState === false ||
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

                const priority =
                    technique.priority !== undefined
                        ? getPropertyValue(technique.priority, discreteZoomEnv)
                        : 0;
                const fadeNear =
                    technique.fadeNear !== undefined
                        ? getPropertyValue(technique.fadeNear, discreteZoomEnv)
                        : technique.fadeNear;
                const fadeFar =
                    technique.fadeFar !== undefined
                        ? getPropertyValue(technique.fadeFar, discreteZoomEnv)
                        : technique.fadeFar;

                for (let i = 0; i < numPositions; ++i) {
                    const x = positions.getX(i) + worldOffsetX;
                    const y = positions.getY(i);
                    const z = positions.getZ(i);
                    const label = text.stringCatalog[text.texts[i]];
                    if (label === undefined) {
                        // skip missing labels
                        continue;
                    }

                    const userData = text.objInfos !== undefined ? text.objInfos[i] : undefined;
                    const featureId = getFeatureId(userData);

                    const textElement = new TextElement(
                        ContextualArabicConverter.instance.convert(label!),
                        new THREE.Vector3(x, y, z),
                        textStyleCache.getRenderStyle(technique),
                        textStyleCache.getLayoutStyle(technique),
                        priority,
                        technique.xOffset ?? 0.0,
                        technique.yOffset ?? 0.0,
                        featureId,
                        technique.style,
                        undefined,
                        undefined,
                        tile.offset
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
                    textElement.textFadeTime = technique.textFadeTime;

                    // Get the userData for text element picking.
                    textElement.userData = userData;
                    tile.addTextElement(textElement);
                }
            }
        }
    }

    /**
     * Creates `Tile` objects from the decoded tile and list of materials specified.
     *
     * @param tile - The {@link Tile} to create the geometry on.
     * @param decodedTile - The {@link @here/harp-datasource-protocol#DecodedTile}.
     * @param techniqueFilter -: Optional filter. Should return true for any technique that is
     *      applicable.
     */
    createObjects(
        tile: Tile,
        decodedTile: DecodedTile,
        techniqueFilter?: (technique: IndexedTechnique) => boolean
    ) {
        const mapView = tile.mapView;
        const materials: THREE.Material[] = [];
        const extrudedMaterials: THREE.Material[] = [];
        const animatedExtrusionHandler = mapView.animatedExtrusionHandler;
        const dataSource = tile.dataSource;
        const discreteZoomLevel = Math.floor(mapView.zoomLevel);
        const discreteZoomEnv = new MapEnv({ $zoom: discreteZoomLevel }, mapView.env);
        const objects = tile.objects;
        const viewRanges = mapView.viewRanges;
        const elevationEnabled = mapView.elevationProvider !== undefined;

        for (const attachment of this.getAttachments(decodedTile)) {
            const srcGeometry = attachment.geometry;
            const groups = attachment.info.groups;
            const groupCount = groups.length;

            for (let groupIndex = 0; groupIndex < groupCount; ) {
                const group = groups[groupIndex++];
                const start = group.start;
                const techniqueIndex = group.technique;
                const technique = decodedTile.techniques[techniqueIndex];

                if (group.createdOffsets === undefined) {
                    group.createdOffsets = [];
                }

                if (
                    group.createdOffsets!.includes(tile.offset) ||
                    technique._kindState === false ||
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

                if (!usesObject3D(technique)) {
                    continue;
                }
                const extrusionAnimationEnabled: boolean =
                    animatedExtrusionHandler?.setAnimationProperties(technique, discreteZoomEnv) ??
                    false;

                let material: THREE.Material | undefined = materials[techniqueIndex];

                if (material === undefined) {
                    const onMaterialUpdated = (texture: THREE.Texture) => {
                        dataSource.requestUpdate();
                        if (texture !== undefined) {
                            tile.addOwnedTexture(texture);
                        }
                    };
                    material = createMaterial(
                        {
                            technique,
                            env: mapView.env,
                            fog: mapView.scene.fog !== null,
                            shadowsEnabled: mapView.shadowsEnabled,
                            glslVersion: mapView.glslVersion
                        },
                        onMaterialUpdated
                    );
                    if (material === undefined) {
                        continue;
                    }
                    if (extrusionAnimationEnabled && hasExtrusionFeature(material)) {
                        addToExtrudedMaterials(material, extrudedMaterials);
                    }
                    materials[techniqueIndex] = material;
                }

                const techniqueKind = technique.kind;

                // Modify the standard textured shader to support height-based coloring.
                if (isTerrainTechnique(technique)) {
                    this.setupTerrainMaterial(technique, material, tile.mapView.clearColor);
                }

                const bufferGeometry = new THREE.BufferGeometry();

                srcGeometry.vertexAttributes?.forEach(vertexAttribute => {
                    const buffer = attachment.getBufferAttribute(vertexAttribute);
                    bufferGeometry.setAttribute(vertexAttribute.name, buffer);
                });

                srcGeometry.interleavedVertexAttributes?.forEach(attr => {
                    attachment
                        .getInterleavedBufferAttributes(attr)
                        .forEach(({ name, attribute }) =>
                            bufferGeometry.setAttribute(name, attribute)
                        );
                });

                const index = attachment.info.index ?? srcGeometry.index;
                if (index) {
                    bufferGeometry.setIndex(attachment.getBufferAttribute(index));
                }

                if (!bufferGeometry.getAttribute("normal") && needsVertexNormals(technique)) {
                    bufferGeometry.computeVertexNormals();
                }

                bufferGeometry.addGroup(start, count);

                if (isSolidLineTechnique(technique)) {
                    // TODO: Unify access to shader defines via SolidLineMaterial setters
                    assert(!isHighPrecisionLineMaterial(material));
                    const lineMaterial = material as SolidLineMaterial;
                    if (
                        technique.clipping === true &&
                        tile.projection.type === ProjectionType.Planar
                    ) {
                        tile.boundingBox.getSize(tmpVector3);
                        tmpVector2.set(tmpVector3.x, tmpVector3.y);
                        lineMaterial.clipTileSize = tmpVector2;
                    }

                    if (bufferGeometry.getAttribute("color")) {
                        setShaderMaterialDefine(lineMaterial, "USE_COLOR", true);
                    }
                }

                // Add the solid line outlines as a separate object.
                const hasSolidLinesOutlines: boolean =
                    isSolidLineTechnique(technique) && technique.secondaryWidth !== undefined;

                // When the source geometry is split in groups, we
                // should create objects with an array of materials.
                const hasFeatureGroups =
                    Expr.isExpr(technique.enabled) &&
                    srcGeometry.featureStarts &&
                    srcGeometry.featureStarts.length > 0;

                const object = buildObject(
                    technique,
                    bufferGeometry,
                    hasFeatureGroups ? [material] : material,
                    tile,
                    elevationEnabled
                );

                object.renderOrder = getPropertyValue(technique.renderOrder, mapView.env);

                if (attachment.info.uuid !== undefined) {
                    object.uuid = attachment.info.uuid;
                    object.userData.geometryId = attachment.info.uuid;
                }

                if (
                    (isCirclesTechnique(technique) || isSquaresTechnique(technique)) &&
                    technique.enablePicking !== undefined
                ) {
                    (object as MapViewPoints).enableRayTesting = technique.enablePicking!;
                }

                if (isLineTechnique(technique) || isSegmentsTechnique(technique)) {
                    const fadingParams = this.getFadingParams(discreteZoomEnv, technique);
                    FadingFeature.addRenderHelper(
                        object,
                        viewRanges,
                        fadingParams.fadeNear,
                        fadingParams.fadeFar,
                        false
                    );
                }

                if (isSolidLineTechnique(technique)) {
                    const fadingParams = this.getFadingParams(discreteZoomEnv, technique);

                    FadingFeature.addRenderHelper(
                        object,
                        viewRanges,
                        fadingParams.fadeNear,
                        fadingParams.fadeFar,
                        false
                    );
                }

                if (isExtrudedLineTechnique(technique)) {
                    // extruded lines are normal meshes, and need transparency only when fading or
                    // dynamic properties is defined.
                    if (technique.fadeFar !== undefined) {
                        const fadingParams = this.getFadingParams(
                            mapView.env,
                            technique as StandardExtrudedLineTechnique
                        );

                        FadingFeature.addRenderHelper(
                            object,
                            viewRanges,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            true
                        );
                    }
                }

                this.addUserData(tile, srcGeometry, technique, object);

                if (isExtrudedPolygonTechnique(technique)) {
                    object.castShadow = mapView.shadowsEnabled;
                    object.receiveShadow = mapView.shadowsEnabled;
                } else if (isStandardTechnique(technique) || isFillTechnique(technique)) {
                    object.receiveShadow = mapView.shadowsEnabled;
                }

                if (
                    isExtrudedPolygonTechnique(technique) ||
                    isStandardTechnique(technique) ||
                    isFillTechnique(technique)
                ) {
                    // filled polygons are normal meshes, and need transparency only when fading or
                    // dynamic properties is defined.

                    if (technique.fadeFar !== undefined) {
                        const fadingParams = this.getFadingParams(discreteZoomEnv, technique);
                        FadingFeature.addRenderHelper(
                            object,
                            viewRanges,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            true
                        );
                    }
                }

                const renderDepthPrePass =
                    isExtrudedPolygonTechnique(technique) &&
                    isRenderDepthPrePassEnabled(technique, discreteZoomEnv);

                if (renderDepthPrePass) {
                    const depthPassMesh = createDepthPrePassMesh(object as THREE.Mesh);
                    this.addUserData(tile, srcGeometry, technique, depthPassMesh);
                    // Set geometry kind for depth pass mesh so that it gets the displacement map
                    // for elevation overlay.
                    this.registerTileObject(tile, depthPassMesh, techniqueKind, {
                        technique,
                        pickable: false
                    });
                    objects.push(depthPassMesh);

                    if (extrusionAnimationEnabled) {
                        addToExtrudedMaterials(depthPassMesh.material, extrudedMaterials);
                    }

                    setDepthPrePassStencil(depthPassMesh, object as THREE.Mesh);
                }

                // register all objects as pickable except solid lines with outlines, in that case
                // it's enough to make outlines pickable.
                this.registerTileObject(tile, object, techniqueKind, {
                    technique,
                    pickable: !hasSolidLinesOutlines
                });
                objects.push(object);

                // Add the extruded polygon edges as a separate geometry.
                if (
                    isExtrudedPolygonTechnique(technique) &&
                    attachment.info.edgeIndex !== undefined
                ) {
                    // When the source geometry is split in groups, we
                    // should create objects with an array of materials.
                    const hasEdgeFeatureGroups =
                        Expr.isExpr(technique.enabled) &&
                        srcGeometry.edgeFeatureStarts &&
                        srcGeometry.edgeFeatureStarts.length > 0;

                    const buildingTechnique = technique as ExtrudedPolygonTechnique;
                    const edgeGeometry = new THREE.BufferGeometry();
                    edgeGeometry.setAttribute("position", bufferGeometry.getAttribute("position"));

                    const colorAttribute = bufferGeometry.getAttribute("color");
                    if (colorAttribute !== undefined) {
                        edgeGeometry.setAttribute("color", colorAttribute);
                    }

                    const extrusionAttribute = bufferGeometry.getAttribute("extrusionAxis");
                    if (extrusionAttribute !== undefined) {
                        edgeGeometry.setAttribute("extrusionAxis", extrusionAttribute);
                    }

                    const normalAttribute = bufferGeometry.getAttribute("normal");
                    if (normalAttribute !== undefined) {
                        edgeGeometry.setAttribute("normal", normalAttribute);
                    }

                    const uvAttribute = bufferGeometry.getAttribute("uv");
                    if (uvAttribute !== undefined) {
                        edgeGeometry.setAttribute("uv", uvAttribute);
                    }

                    edgeGeometry.setIndex(
                        attachment.getBufferAttribute(attachment.info.edgeIndex!)
                    );

                    // Read the uniforms from the technique values (and apply the default values).
                    const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;

                    const fadingParams = this.getPolygonFadingParams(
                        discreteZoomEnv,
                        extrudedPolygonTechnique
                    );

                    // Configure the edge material based on the theme values.
                    const materialParams: EdgeMaterialParameters = {
                        color: fadingParams.color,
                        colorMix: fadingParams.colorMix,
                        fadeNear: fadingParams.lineFadeNear,
                        fadeFar: fadingParams.lineFadeFar,
                        extrusionRatio: extrusionAnimationEnabled ? 0 : undefined,
                        vertexColors: bufferGeometry.getAttribute("color") ? true : false,
                        glslVersion: mapView.glslVersion
                    };
                    const edgeMaterial = new EdgeMaterial(materialParams);
                    const edgeObj = new THREE.LineSegments(
                        edgeGeometry,
                        hasEdgeFeatureGroups ? [edgeMaterial] : edgeMaterial
                    );

                    this.addUserData(tile, srcGeometry, technique, edgeObj);

                    // Set the correct render order.
                    edgeObj.renderOrder = object.renderOrder + 0.1;

                    FadingFeature.addRenderHelper(
                        edgeObj,
                        viewRanges,
                        fadingParams.lineFadeNear,
                        fadingParams.lineFadeFar,
                        false
                    );

                    if (extrusionAnimationEnabled) {
                        addToExtrudedMaterials(edgeObj.material, extrudedMaterials);
                    }

                    this.registerTileObject(tile, edgeObj, techniqueKind, {
                        technique,
                        pickable: false
                    });
                    MapMaterialAdapter.create(edgeMaterial, {
                        color: buildingTechnique.lineColor,
                        objectColor: buildingTechnique.color,
                        opacity: buildingTechnique.opacity,
                        lineWidth: (frameMapView: MapAdapterUpdateEnv) => {
                            // lineWidth for ExtrudedPolygonEdges only supports 0 or 1
                            const value = getPropertyValue(
                                buildingTechnique.lineWidth,
                                frameMapView.env
                            );
                            if (typeof value === "number") {
                                return THREE.MathUtils.clamp(value, 0, 1);
                            } else {
                                return 0;
                            }
                        }
                    });
                    objects.push(edgeObj);
                }

                // animate the extrusion of buildings
                if (isExtrudedPolygonTechnique(technique) && extrusionAnimationEnabled) {
                    object.customDepthMaterial = new MapMeshDepthMaterial({
                        depthPacking: THREE.RGBADepthPacking
                    });
                    addToExtrudedMaterials(object.customDepthMaterial, extrudedMaterials);
                }

                // Add the fill area edges as a separate geometry.

                if (isFillTechnique(technique) && attachment.info.edgeIndex) {
                    const hasEdgeFeatureGroups =
                        Expr.isExpr(technique.enabled) &&
                        srcGeometry.edgeFeatureStarts &&
                        srcGeometry.edgeFeatureStarts.length > 0;

                    const outlineGeometry = new THREE.BufferGeometry();
                    outlineGeometry.setAttribute(
                        "position",
                        bufferGeometry.getAttribute("position")
                    );
                    outlineGeometry.setIndex(
                        attachment.getBufferAttribute(attachment.info.edgeIndex!)
                    );

                    const fillTechnique = technique as FillTechnique;

                    const fadingParams = this.getPolygonFadingParams(mapView.env, fillTechnique);

                    // Configure the edge material based on the theme values.
                    const materialParams: EdgeMaterialParameters = {
                        color: fadingParams.color,
                        colorMix: fadingParams.colorMix,
                        fadeNear: fadingParams.lineFadeNear,
                        fadeFar: fadingParams.lineFadeFar,
                        vertexColors: bufferGeometry.getAttribute("color") ? true : false,
                        glslVersion: mapView.glslVersion
                    };
                    const outlineMaterial = new EdgeMaterial(materialParams);
                    const outlineObj = new THREE.LineSegments(
                        outlineGeometry,
                        hasEdgeFeatureGroups ? [outlineMaterial] : outlineMaterial
                    );
                    outlineObj.renderOrder = object.renderOrder + 0.1;

                    FadingFeature.addRenderHelper(
                        outlineObj,
                        viewRanges,
                        fadingParams.lineFadeNear,
                        fadingParams.lineFadeFar,
                        false
                    );

                    this.addUserData(tile, srcGeometry, technique, outlineObj);

                    this.registerTileObject(tile, outlineObj, techniqueKind, {
                        technique,
                        pickable: false
                    });
                    MapMaterialAdapter.create(outlineMaterial, {
                        color: fillTechnique.lineColor,
                        objectColor: fillTechnique.color,
                        opacity: fillTechnique.opacity
                    });
                    objects.push(outlineObj);
                }

                // Add the fill area edges as a separate geometry.
                if (hasSolidLinesOutlines) {
                    const outlineTechnique = technique as SolidLineTechnique;
                    const outlineMaterial = material.clone() as SolidLineMaterial;
                    applyBaseColorToMaterial(
                        outlineMaterial,
                        outlineMaterial.color,
                        outlineTechnique,
                        outlineTechnique.secondaryColor ?? 0x000000,
                        discreteZoomEnv
                    );

                    if (outlineTechnique.secondaryCaps !== undefined) {
                        outlineMaterial.caps = getPropertyValue(
                            outlineTechnique.secondaryCaps,
                            mapView.env
                        );
                    }
                    const outlineObj = buildObject(
                        technique,
                        bufferGeometry,
                        outlineMaterial,
                        tile,
                        elevationEnabled
                    );

                    outlineObj.renderOrder =
                        (getPropertyValue(outlineTechnique.secondaryRenderOrder, mapView.env) ??
                            0) - 0.0000001;

                    this.addUserData(tile, srcGeometry, technique, outlineObj);

                    const fadingParams = this.getFadingParams(discreteZoomEnv, technique);
                    FadingFeature.addRenderHelper(
                        outlineObj,
                        viewRanges,
                        fadingParams.fadeNear,
                        fadingParams.fadeFar,
                        false
                    );

                    const secondaryWidth = buildMetricValueEvaluator(
                        outlineTechnique.secondaryWidth,
                        outlineTechnique.metricUnit
                    );
                    this.registerTileObject(tile, outlineObj, techniqueKind, { technique });
                    const mainMaterialAdapter = MapMaterialAdapter.get(material);

                    const outlineMaterialAdapter = MapMaterialAdapter.create(outlineMaterial, {
                        color: outlineTechnique.secondaryColor,
                        opacity: outlineTechnique.opacity,
                        caps: outlineTechnique.secondaryCaps,
                        // Still handled above
                        lineWidth: (frameMapView: MapAdapterUpdateEnv) => {
                            if (!mainMaterialAdapter) {
                                return;
                            }
                            mainMaterialAdapter.ensureUpdated(frameMapView);
                            const mainLineWidth =
                                mainMaterialAdapter.currentStyledProperties.lineWidth;

                            const secondaryLineWidth = getPropertyValue(
                                secondaryWidth,
                                mapView.env
                            );
                            const opacity = outlineMaterialAdapter.currentStyledProperties
                                .opacity as number | null;
                            if (
                                typeof mainLineWidth === "number" &&
                                typeof secondaryLineWidth === "number"
                            ) {
                                if (
                                    secondaryLineWidth <= mainLineWidth &&
                                    (opacity === null || opacity === undefined || opacity === 1)
                                ) {
                                    // We could mark object as invisible somehow, not sure how
                                    // objectAdapter.markInvisible();
                                    return 0;
                                } else {
                                    return secondaryLineWidth;
                                }
                            } else {
                                return 0;
                            }
                        }
                    });
                    objects.push(outlineObj);
                }
            }
        }
        if (extrudedMaterials.length > 0) {
            mapView.animatedExtrusionHandler.add(tile, extrudedMaterials);
        }
    }

    /**
     * Prepare the {@link Tile}s pois. Uses the {@link PoiManager} in {@link MapView}.
     */
    preparePois(tile: Tile, decodedTile: DecodedTile) {
        if (decodedTile.poiGeometries !== undefined) {
            tile.mapView.poiManager.addPois(tile, decodedTile);
        }
    }

    /**
     * Create a ground plane mesh for a tile
     * @param tile - Tile
     * @param material - Material
     * @param createTexCoords - Enable creation of texture coordinates
     */
    createGroundPlane(
        tile: Tile,
        material: THREE.Material | THREE.Material[],
        createTexCoords: boolean,
        shadowsEnabled?: boolean
    ): THREE.Mesh {
        const { dataSource, projection, mapView } = tile;
        const sourceProjection = dataSource.getTilingScheme().projection;
        const shouldSubdivide = projection.type === ProjectionType.Spherical;
        const tmpV = new THREE.Vector3();

        function moveTileCenter(geom: THREE.BufferGeometry) {
            const attr = geom.getAttribute("position") as THREE.BufferAttribute;
            const posArray = attr.array as Float32Array;
            for (let i = 0; i < posArray.length; i += 3) {
                tmpV.set(posArray[i], posArray[i + 1], posArray[i + 2]);
                projection.reprojectPoint(sourceProjection, tmpV, tmpV);
                tmpV.sub(tile.center);
                posArray[i] = tmpV.x;
                posArray[i + 1] = tmpV.y;
                posArray[i + 2] = tmpV.z;
            }
            attr.needsUpdate = true;
        }

        const geometry = new THREE.BufferGeometry();
        // Create plane
        const tileCorners = this.generateTilePlaneCorners(tile.geoBox, sourceProjection);

        const posAttr = new THREE.BufferAttribute(
            new Float32Array([
                ...tileCorners.sw.toArray(),
                ...tileCorners.se.toArray(),
                ...tileCorners.nw.toArray(),
                ...tileCorners.ne.toArray()
            ]),
            3
        );
        geometry.setAttribute("position", posAttr);
        if (shadowsEnabled === true) {
            sourceProjection.surfaceNormal(tileCorners.sw, tmpV);
            // Webmercator needs to have it negated to work correctly.
            tmpV.negate();
            const normAttr = new THREE.BufferAttribute(
                new Float32Array([
                    ...tmpV.toArray(),
                    ...tmpV.toArray(),
                    ...tmpV.toArray(),
                    ...tmpV.toArray()
                ]),
                3
            );
            geometry.setAttribute("normal", normAttr);
        }
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));

        if (createTexCoords) {
            const uvAttr = new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2);
            geometry.setAttribute("uv", uvAttr);
        }

        if (shouldSubdivide) {
            const geometries: THREE.BufferGeometry[] = [];
            const sphericalModifier = new SphericalGeometrySubdivisionModifier(
                THREE.MathUtils.degToRad(10),
                sourceProjection
            );
            const enableMixedLod = mapView.enableMixedLod ?? mapView.enableMixedLod === undefined;

            if (enableMixedLod) {
                // Use a [[LodMesh]] to adapt tesselation of tile depending on zoom level
                for (let zoomLevelOffset = 0; zoomLevelOffset < 4; ++zoomLevelOffset) {
                    const subdivision = Math.pow(2, zoomLevelOffset);
                    const zoomLevelGeometry = geometry.clone();
                    if (subdivision > 1) {
                        const edgeModifier = new EdgeLengthGeometrySubdivisionModifier(
                            subdivision,
                            tile.geoBox,
                            SubdivisionMode.All,
                            sourceProjection
                        );
                        edgeModifier.modify(zoomLevelGeometry);
                    }
                    sphericalModifier.modify(zoomLevelGeometry);
                    moveTileCenter(zoomLevelGeometry);
                    geometries.push(zoomLevelGeometry);
                }
                return new LodMesh(geometries, material);
            } else {
                // Use static mesh if mixed LOD is disabled
                sphericalModifier.modify(geometry);
                moveTileCenter(geometry);

                return new THREE.Mesh(geometry, material);
            }
        } else {
            // Use static mesh for planar projection
            moveTileCenter(geometry);
            return new THREE.Mesh(geometry, material);
        }
    }

    generateTilePlaneCorners(geoBox: GeoBox, sourceProjection: Projection): TileCorners {
        const { east, west, north, south } = geoBox;
        const sw = sourceProjection.projectPoint(
            new GeoCoordinates(south, west),
            new THREE.Vector3()
        );
        const se = sourceProjection.projectPoint(
            new GeoCoordinates(south, east),
            new THREE.Vector3()
        );
        const nw = sourceProjection.projectPoint(
            new GeoCoordinates(north, west),
            new THREE.Vector3()
        );
        const ne = sourceProjection.projectPoint(
            new GeoCoordinates(north, east),
            new THREE.Vector3()
        );
        return { sw, se, nw, ne };
    }

    /**
     * Creates and add a background plane for the tile.
     * @param tile - Tile
     * @param renderOrder - Render order of the tile
     */
    addGroundPlane(tile: Tile, renderOrder: number) {
        const shadowsEnabled = tile.mapView.shadowsEnabled;
        const material = this.createGroundPlaneMaterial(
            new THREE.Color(tile.mapView.clearColor),
            tile.mapView.shadowsEnabled,
            tile.mapView.projection.type === ProjectionType.Spherical
        );
        const mesh = this.createGroundPlane(tile, material, false, shadowsEnabled);
        mesh.receiveShadow = shadowsEnabled;
        mesh.renderOrder = renderOrder;
        this.registerTileObject(tile, mesh, GeometryKind.Background, { pickable: false });
        tile.objects.push(mesh);
    }

    private createGroundPlaneMaterial(
        color: THREE.Color,
        shadowsEnabled: boolean,
        depthWrite: boolean
    ): THREE.Material {
        if (shadowsEnabled) {
            return new MapMeshStandardMaterial({
                color,
                visible: true,
                depthWrite,
                removeDiffuseLight: true
            });
        } else {
            return new MapMeshBasicMaterial({
                color,
                visible: true,
                depthWrite
            });
        }
    }

    /**
     * Gets the attachments of the given {@link @here/harp-datasource-protocol#DecodedTile}.
     *
     * @param decodedTile - The {@link @here/harp-datasource-protocol#DecodedTile}.
     */
    private *getAttachments(decodedTile: DecodedTile): Generator<AttachmentInfo> {
        const cache = new AttachmentCache();

        for (const geometry of decodedTile.geometries) {
            // the main attachment

            const mainAttachment: Attachment = {
                index: geometry.index,
                edgeIndex: geometry.edgeIndex,
                uuid: geometry.uuid,
                groups: geometry.groups
            };

            yield new AttachmentInfo(geometry, mainAttachment, cache);

            if (geometry.attachments) {
                // the additional attachments
                for (const info of geometry.attachments) {
                    yield new AttachmentInfo(geometry, info, cache);
                }
            }
        }
    }

    /**
     * Process the given {@link Tile} and assign default values to render orders
     * and label priorities.
     *
     * @param tile - The {@link Tile} to process.
     */
    private processPriorities(tile: Tile) {
        const decodedTile = tile.decodedTile;

        if (decodedTile === undefined) {
            return;
        }

        const theme = tile.mapView;

        if (!theme) {
            return;
        }

        decodedTile.techniques.forEach(technique => {
            setTechniqueRenderOrderOrPriority(technique, tile.mapView.theme);
        });
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

    private addUserData(
        tile: Tile,
        srcGeometry: Geometry,
        technique: Technique,
        object: THREE.Object3D
    ) {
        if (isTerrainTechnique(technique)) {
            assert(
                Object.keys(object.userData).length === 0,
                "Unexpected user data in terrain object"
            );

            assert(
                typeof srcGeometry.objInfos![0] === "object",
                "Wrong attribute map type for terrain geometry"
            );

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
                displacementMap,
                geoBox: tile.geoBox
            };
            object.userData = tileDisplacementMap;
        } else {
            // Set the feature data for picking with `MapView.intersectMapObjects()` except for
            // solid-line which uses tile-based picking.
            const isOutline =
                object.type === "LineSegments" &&
                (isExtrudedPolygonTechnique(technique) || isFillTechnique(technique));
            const featureData: TileFeatureData = {
                geometryType: srcGeometry.type,
                starts: isOutline ? srcGeometry.edgeFeatureStarts : srcGeometry.featureStarts,
                objInfos: srcGeometry.objInfos
            };
            object.userData.feature = featureData;
            object.userData.technique = technique;
        }
    }

    /**
     * Gets the fading parameters for several kinds of objects.
     */
    private getFadingParams(
        env: Env,
        technique: MakeTechniqueAttrs<BaseTechniqueParams>
    ): FadingParameters {
        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, env)
                : FadingFeature.DEFAULT_FADE_NEAR;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, env)
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
        env: Env,
        technique: FillTechnique | ExtrudedPolygonTechnique
    ): PolygonFadingParameters {
        let color: string | number | undefined;
        let colorMix = EdgeMaterial.DEFAULT_COLOR_MIX;

        if (technique.lineColor !== undefined) {
            color = getPropertyValue(technique.lineColor, env);
            if (isExtrudedPolygonTechnique(technique)) {
                const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;
                colorMix =
                    extrudedPolygonTechnique.lineColorMix !== undefined
                        ? extrudedPolygonTechnique.lineColorMix
                        : EdgeMaterial.DEFAULT_COLOR_MIX;
            }
        }

        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, env)
                : FadingFeature.DEFAULT_FADE_NEAR;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, env)
                : FadingFeature.DEFAULT_FADE_FAR;

        const lineFadeNear =
            technique.lineFadeNear !== undefined
                ? getPropertyValue(technique.lineFadeNear, env)
                : fadeNear;
        const lineFadeFar =
            technique.lineFadeFar !== undefined
                ? getPropertyValue(technique.lineFadeFar, env)
                : fadeFar;

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
