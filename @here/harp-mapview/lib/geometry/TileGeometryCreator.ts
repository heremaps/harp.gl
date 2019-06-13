/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    BaseTechniqueParams,
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
    isInterpolatedProperty,
    isLineTechnique,
    isSegmentsTechnique,
    isSolidLineTechnique,
    isSquaresTechnique,
    isTerrainTechnique,
    isTextTechnique,
    LineMarkerTechnique,
    needsVertexNormals,
    PoiTechnique,
    SolidLineTechnique,
    StandardExtrudedLineTechnique,
    Technique,
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
import { getOptionValue } from "@here/harp-utils";
import * as THREE from "three";

import { AnimatedExtrusionTileHandler } from "../AnimatedExtrusionHandler";
import { ColorCache } from "../ColorCache";
import { createMaterial, getBufferAttribute, getObjectConstructor } from "../DecodedTileHelpers";
import {
    createDepthPrePassMesh,
    isRenderDepthPrePassEnabled,
    setDepthPrePassStencil
} from "../DepthPrePass";
import { MapViewPoints } from "../MapViewPoints";
import { TextElement } from "../text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";
import { computeStyleCacheId } from "../text/TextStyleCache";
import { Tile, TileFeatureData } from "../Tile";

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

    /**
     * Prepare decoded tile for geometry creation.
     *
     * @param decodedTile The decodedTile containing the actual tile map data.
     */
    initDecodedTile(_decodedTile: DecodedTile) {
        //
    }

    /**
     * Called after the `Tile` has been decoded.
     *
     * @param tile The [[Tile]] to process.
     * @param decodedTile The decodedTile containing the actual tile map data.
     */
    createAllGeometries(tile: Tile, decodedTile: DecodedTile) {
        tile.clear();
        this.preparePois(tile, decodedTile);
        this.createTextElements(tile, decodedTile);
        this.createObjects(tile, decodedTile);
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
    registerTileObject(tile: Tile, object: THREE.Object3D) {
        const userData = object.userData || {};
        userData.tileKey = tile.tileKey;
        userData.dataSource = tile.dataSource.name;
    }

    /**
     * Splits the text paths that contain sharp corners.
     *
     * @param tile The [[Tile]] to process paths on.
     * @param textPathGeometries The original path geometries that may have defects.
     */
    prepareTextPaths(tile: Tile, textPathGeometries: TextPathGeometry[]): TextPathGeometry[] {
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

            for (let i = 0; i < textPath.path.length - 3; i += 3) {
                p0.set(textPath.path[i], textPath.path[i + 1]);
                p1.set(textPath.path[i + 3], textPath.path[i + 4]);
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
                    path: textPath.path.slice(0, splitIndex + 3),
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

    /**
     * Creates [[TextElement]] objects from the decoded tile and list of materials specified. The
     * priorities of the [[TextElement]]s are updated to simplify label placement.
     *
     * @param tile The [[Tile]] to create the testElements on.
     * @param decodedTile The [[DecodedTile]].
     */
    createTextElements(tile: Tile, decodedTile: DecodedTile) {
        const mapView = tile.mapView;
        const displayZoomLevel = Math.floor(mapView.zoomLevel);
        if (decodedTile.textPathGeometries !== undefined) {
            tile.preparedTextPaths = this.prepareTextPaths(tile, decodedTile.textPathGeometries);

            // Compute maximum street length (squared). Longer streets should be labelled first,
            // they have a higher chance of being placed in case the number of text elements is
            // limited.
            let maxPathLengthSqr = 0;
            for (const textPath of tile.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (!isTextTechnique(technique)) {
                    continue;
                }
                if (textPath.pathLengthSqr > maxPathLengthSqr) {
                    maxPathLengthSqr = textPath.pathLengthSqr;
                }
            }

            for (const textPath of tile.preparedTextPaths) {
                const technique = decodedTile.techniques[textPath.technique];
                if (!isTextTechnique(technique)) {
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
                    getOptionValue(getPropertyValue(technique.priority, displayZoomLevel), 0) +
                    (maxPathLengthSqr > 0
                        ? (SORT_WEIGHT_PATH_LENGTH * textPath.pathLengthSqr) / maxPathLengthSqr
                        : 0);

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
                    getPropertyValue(technique.fadeNear, displayZoomLevel),
                    getPropertyValue(technique.fadeFar, displayZoomLevel)
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

                tile.addTextElement(textElement);
            }
        }

        if (decodedTile.textGeometries !== undefined) {
            for (const text of decodedTile.textGeometries) {
                if (text.technique === undefined || text.stringCatalog === undefined) {
                    continue;
                }

                const technique = decodedTile.techniques[text.technique];

                if (!isTextTechnique(technique)) {
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

                    textElement.fadeNear = getPropertyValue(technique.fadeNear, displayZoomLevel);
                    textElement.fadeFar = getPropertyValue(technique.fadeFar, displayZoomLevel);

                    tile.addTextElement(textElement);
                }
            }
        }
    }

    /**
     * Creates `Tile` objects from the decoded tile and list of materials specified.
     *
     * @param tile The [[Tile]] to create the geometry on.
     * @param decodedTile The [[DecodedTile]].
     */
    createObjects(tile: Tile, decodedTile: DecodedTile) {
        const materials: THREE.Material[] = [];
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const displayZoomLevel = Math.floor(mapView.zoomLevel);
        const objects = tile.objects;

        if (dataSource.addTileBackground) {
            this.addGroundPlane(tile);
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
                    const onMaterialUpdated = (texture: THREE.Texture) => {
                        dataSource.requestUpdate();
                        if (texture !== undefined) {
                            tile.addOwnedTexture(texture);
                        }
                    };
                    material = createMaterial(
                        {
                            technique,
                            level: displayZoomLevel,
                            fog: mapView.scene.fog !== null
                        },
                        onMaterialUpdated
                    );
                    if (material === undefined) {
                        continue;
                    }
                    materials[techniqueIndex] = material;
                }

                // Modify the standard textured shader to support height-based coloring.
                if (
                    isTerrainTechnique(technique) &&
                    technique.heightBasedColors !== undefined &&
                    technique.displacementMap !== undefined
                ) {
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
                    lineMaterial.uniforms.opacity.value = material.opacity;

                    if (
                        technique.clipping !== false &&
                        tile.projection.type === ProjectionType.Planar
                    ) {
                        const tileSize = lineMaterial.uniforms.tileSize;
                        const size = new THREE.Vector3();
                        tile.boundingBox.getSize(size);
                        tileSize.value.x = size.x;
                        tileSize.value.y = size.y;
                        lineMaterial.defines.TILE_CLIP = 1;
                    }

                    if (bufferGeometry.getAttribute("color")) {
                        lineMaterial.defines.USE_COLOR = 1;
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

                // Add the solid line outlines as a separate object.
                const hasSolidLinesOutlines: boolean =
                    isSolidLineTechnique(technique) && technique.secondaryWidth !== undefined;

                const object = new ObjectCtor(bufferGeometry, material);

                object.frustumCulled = false;

                object.renderOrder = technique.renderOrder;

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
                    // tslint:disable-next-line:max-line-length
                    (object as MapViewPoints).enableRayTesting = technique.enablePicking!;
                }

                if (isLineTechnique(technique) || isSegmentsTechnique(technique)) {
                    if (isInterpolatedProperty(technique.color)) {
                        const fadingParams = this.getFadingParams(displayZoomLevel, technique);
                        FadingFeature.addRenderHelper(
                            object,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            false,
                            false,
                            (renderer, mat) => {
                                const lineMaterial = mat as THREE.LineBasicMaterial;

                                lineMaterial.color.set(
                                    getOptionValue(
                                        getPropertyValue(technique.color, mapView.zoomLevel),
                                        "#000000"
                                    )
                                );
                            }
                        );
                    }
                }

                // Lines renderOrder fix: Render them as transparent objects, but make sure they end
                // up in the opaque rendering queue (by disabling transparency onAfterRender, and
                // enabling it onBeforeRender).
                if (isSolidLineTechnique(technique) || isDashedLineTechnique(technique)) {
                    const fadingParams = this.getFadingParams(displayZoomLevel, technique);
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
                                tile.tileKey.level
                            );
                            const unitFactor =
                                metricUnits === "Pixel" ? mapView.pixelToWorld * 0.5 : 1.0;

                            lineMaterial.color.set(
                                getOptionValue(
                                    getPropertyValue(technique.color, mapView.zoomLevel),
                                    "#000000"
                                )
                            );

                            lineMaterial.lineWidth =
                                getOptionValue(
                                    getPropertyValue(technique.lineWidth, mapView.zoomLevel),
                                    SolidLineMaterial.DEFAULT_WIDTH
                                ) * unitFactor;

                            // Do the same for dashSize and gapSize for dashed lines.
                            if (isDashedLineTechnique(technique)) {
                                const dashedLineMaterial = lineMaterial as DashedLineMaterial;

                                dashedLineMaterial.dashSize =
                                    getOptionValue(
                                        getPropertyValue(technique.dashSize, mapView.zoomLevel),
                                        DashedLineMaterial.DEFAULT_DASH_SIZE
                                    ) * unitFactor;

                                dashedLineMaterial.gapSize =
                                    getOptionValue(
                                        getPropertyValue(technique.gapSize, mapView.zoomLevel),
                                        DashedLineMaterial.DEFAULT_GAP_SIZE
                                    ) * unitFactor;
                            }
                        }
                    );
                }

                if (isExtrudedLineTechnique(technique)) {
                    // extruded lines are normal meshes, and need transparency only when fading or
                    // dynamic properties is defined.
                    if (
                        technique.fadeFar !== undefined ||
                        isInterpolatedProperty(technique.color)
                    ) {
                        const fadingParams = this.getFadingParams(
                            displayZoomLevel,
                            technique as StandardExtrudedLineTechnique
                        );

                        FadingFeature.addRenderHelper(
                            object,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            true,
                            true,
                            isInterpolatedProperty(technique.color)
                                ? (renderer, mat) => {
                                      const extrudedMaterial = mat as
                                          | MapMeshStandardMaterial
                                          | MapMeshBasicMaterial;

                                      extrudedMaterial.color.set(
                                          getOptionValue(
                                              getPropertyValue(technique.color, mapView.zoomLevel),
                                              "#000000"
                                          )
                                      );
                                  }
                                : undefined
                        );
                    }
                }

                this.addFeatureData(srcGeometry, technique, object);
                this.addGeometryObjInfos(srcGeometry, object);

                if (isExtrudedPolygonTechnique(technique) || isFillTechnique(technique)) {
                    // filled polygons are normal meshes, and need transparency only when fading or
                    // dynamic properties is defined.
                    const hasDynamicColor =
                        isInterpolatedProperty(technique.color) ||
                        (isExtrudedPolygonTechnique(technique) &&
                            isInterpolatedProperty(technique.emissive));
                    if (technique.fadeFar !== undefined || hasDynamicColor) {
                        const fadingParams = this.getFadingParams(displayZoomLevel, technique);
                        FadingFeature.addRenderHelper(
                            object,
                            fadingParams.fadeNear,
                            fadingParams.fadeFar,
                            true,
                            true,
                            hasDynamicColor
                                ? (renderer, mat) => {
                                      const polygonMaterial = mat as
                                          | MapMeshBasicMaterial
                                          | MapMeshStandardMaterial;

                                      polygonMaterial.color.set(
                                          getOptionValue(
                                              getPropertyValue(technique.color, mapView.zoomLevel),
                                              "#000000"
                                          )
                                      );

                                      if (isExtrudedPolygonTechnique(technique)) {
                                          const standardMat = mat as MapMeshStandardMaterial;

                                          standardMat.emissive.set(
                                              getOptionValue(
                                                  getPropertyValue(
                                                      technique.emissive,
                                                      mapView.zoomLevel
                                                  ),
                                                  "#000000"
                                              )
                                          );
                                      }
                                  }
                                : undefined
                        );
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
                    let animateExtrusionValue = getPropertyValue(
                        technique.animateExtrusion,
                        displayZoomLevel
                    );

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
                    objects.push(depthPassMesh);

                    if (extrusionAnimationEnabled) {
                        extrudedObjects.push({
                            object: depthPassMesh,
                            materialFeature: true
                        });
                    }

                    setDepthPrePassStencil(depthPassMesh, object as THREE.Mesh);
                }

                this.registerTileObject(tile, object);
                objects.push(object);

                // Add the extruded building edges as a separate geometry.
                if (hasExtrudedOutlines) {
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

                    edgeGeometry.setIndex(
                        getBufferAttribute(srcGeometry.edgeIndex! as BufferAttribute)
                    );

                    // Read the uniforms from the technique values (and apply the default values).
                    const extrudedPolygonTechnique = technique as ExtrudedPolygonTechnique;

                    const fadingParams = this.getPolygonFadingParams(
                        displayZoomLevel,
                        extrudedPolygonTechnique
                    );

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
                        false,
                        isInterpolatedProperty(extrudedPolygonTechnique.lineColor)
                            ? (renderer, mat) => {
                                  edgeMaterial.color.set(
                                      getOptionValue(
                                          getPropertyValue(
                                              extrudedPolygonTechnique.lineColor,
                                              mapView.zoomLevel
                                          ),
                                          "#000000"
                                      )
                                  );
                              }
                            : undefined
                    );

                    if (extrusionAnimationEnabled) {
                        extrudedObjects.push({
                            object: edgeObj,
                            materialFeature: false
                        });
                    }

                    this.registerTileObject(tile, edgeObj);
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
                if (hasFillOutlines) {
                    const outlineGeometry = new THREE.BufferGeometry();
                    outlineGeometry.addAttribute(
                        "position",
                        bufferGeometry.getAttribute("position")
                    );
                    outlineGeometry.setIndex(getBufferAttribute(srcGeometry.edgeIndex!));

                    const fillTechnique = technique as FillTechnique;

                    const fadingParams = this.getPolygonFadingParams(
                        displayZoomLevel,
                        fillTechnique
                    );

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
                        false,
                        isInterpolatedProperty(fillTechnique.lineColor)
                            ? (renderer, mat) => {
                                  const edgeMaterial = mat as EdgeMaterial;
                                  edgeMaterial.color.set(
                                      getOptionValue(
                                          getPropertyValue(
                                              fillTechnique.lineColor,
                                              mapView.zoomLevel
                                          ),
                                          "#000000"
                                      )
                                  );
                              }
                            : undefined
                    );

                    this.registerTileObject(tile, outlineObj);
                    objects.push(outlineObj);
                }

                // Add the fill area edges as a separate geometry.
                if (hasSolidLinesOutlines) {
                    const outlineTechnique = technique as SolidLineTechnique;
                    const outlineMaterial = material.clone() as SolidLineMaterial;
                    const outlineColor = ColorCache.instance.getColor(
                        getOptionValue(
                            getPropertyValue(outlineTechnique.secondaryColor, displayZoomLevel),
                            "#000000"
                        )
                    );
                    outlineMaterial.uniforms.diffuse.value = outlineColor;
                    const outlineObj = new ObjectCtor(bufferGeometry, outlineMaterial);

                    outlineObj.renderOrder =
                        outlineTechnique.secondaryRenderOrder !== undefined
                            ? outlineTechnique.secondaryRenderOrder
                            : technique.renderOrder - 0.0000001;

                    if (group.renderOrderOffset !== undefined) {
                        outlineObj.renderOrder += group.renderOrderOffset;
                    }

                    const fadingParams = this.getFadingParams(displayZoomLevel, technique);
                    FadingFeature.addRenderHelper(
                        outlineObj,
                        fadingParams.fadeNear,
                        fadingParams.fadeFar,
                        true,
                        false,
                        (renderer, mat) => {
                            const lineMaterial = mat as SolidLineMaterial;

                            const metricUnits = getPropertyValue(
                                outlineTechnique.metricUnit,
                                tile.tileKey.level
                            );
                            const unitFactor =
                                metricUnits === "Pixel" ? mapView.pixelToWorld * 0.5 : 1.0;

                            lineMaterial.color.set(
                                getOptionValue(
                                    getPropertyValue(
                                        outlineTechnique.secondaryColor,
                                        mapView.zoomLevel
                                    ),
                                    "#000000"
                                )
                            );

                            lineMaterial.lineWidth =
                                getOptionValue(
                                    getPropertyValue(
                                        outlineTechnique.secondaryWidth,
                                        mapView.zoomLevel
                                    ),
                                    SolidLineMaterial.DEFAULT_WIDTH
                                ) * unitFactor;
                        }
                    );

                    this.registerTileObject(tile, outlineObj);
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

            const hexColor = getPropertyValue(technique.color, Math.floor(zoomLevel));
            if (hexColor !== undefined) {
                TileGeometryCreator.m_colorMap.set(cacheId, ColorCache.instance.getColor(hexColor));
            }
            const hexBgColor = getPropertyValue(technique.backgroundColor, Math.floor(zoomLevel));
            if (hexBgColor !== undefined) {
                TileGeometryCreator.m_colorMap.set(
                    cacheId + "_bg",
                    ColorCache.instance.getColor(hexBgColor)
                );
            }

            const renderParams = {
                fontName: getOptionValue(technique.fontName, defaultRenderParams.fontName),
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: getOptionValue(
                        getPropertyValue(technique.size, Math.floor(zoomLevel)),
                        defaultRenderParams.fontSize!.size
                    ),
                    backgroundSize: getOptionValue(
                        getPropertyValue(technique.backgroundSize, Math.floor(zoomLevel)),
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
                opacity: getOptionValue(
                    getPropertyValue(technique.opacity, Math.floor(zoomLevel)),
                    defaultRenderParams.opacity
                ),
                backgroundOpacity: getOptionValue(
                    getPropertyValue(technique.backgroundOpacity, Math.floor(zoomLevel)),
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

        const color =
            dataSource.tileBackgroundColor === undefined
                ? mapView.clearColor
                : dataSource.tileBackgroundColor;

        if (tile.projection.type === ProjectionType.Spherical) {
            const { east, west, north, south } = tile.geoBox;
            const g = new THREE.Geometry();
            g.vertices.push(
                projection.projectPoint(new GeoCoordinates(south, west), new THREE.Vector3()),
                projection.projectPoint(new GeoCoordinates(south, east), new THREE.Vector3()),
                projection.projectPoint(new GeoCoordinates(north, west), new THREE.Vector3()),
                projection.projectPoint(new GeoCoordinates(north, east), new THREE.Vector3())
            );
            g.faces.push(new THREE.Face3(0, 1, 2), new THREE.Face3(2, 1, 3));
            const modifier = new SphericalGeometrySubdivisionModifier(THREE.Math.degToRad(10));
            modifier.modify(g);
            g.vertices.forEach(v => projection.scalePointToSurface(v));
            g.translate(-tile.center.x, -tile.center.y, -tile.center.z);
            const material = new MapMeshBasicMaterial({
                color,
                visible: dataSource.tileBackgroundIsVisible
            });
            const mesh = new THREE.Mesh(g, material);
            mesh.renderOrder = Number.MIN_SAFE_INTEGER;
            this.registerTileObject(tile, mesh);
            tile.objects.push(mesh);
        } else {
            // Add a ground plane to the tile.
            const planeSize = new THREE.Vector3();
            tile.boundingBox.getSize(planeSize);
            const groundPlane = this.createPlane(
                planeSize.x,
                planeSize.y,
                tile.center,
                color,
                dataSource.tileBackgroundIsVisible
            );

            this.registerTileObject(tile, groundPlane);
            tile.objects.push(groundPlane);
        }
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
            visible: isVisible
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

    private addGeometryObjInfos(srcGeometry: Geometry, object: THREE.Object3D) {
        if (srcGeometry.objInfos !== undefined && Object.keys(object.userData).length === 0) {
            object.userData = srcGeometry.objInfos;
        }
    }

    /**
     * Gets the fading parameters for several kinds of objects.
     */
    private getFadingParams(
        displayZoomLevel: number,
        technique: BaseTechniqueParams
    ): FadingParameters {
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
        displayZoomLevel: number,
        technique: FillTechnique | ExtrudedPolygonTechnique
    ): PolygonFadingParameters {
        let color: string | number | undefined;
        let colorMix = EdgeMaterial.DEFAULT_COLOR_MIX;

        if (technique.lineColor !== undefined) {
            color = getPropertyValue(technique.lineColor, displayZoomLevel);
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
