/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import {
    DecodedTile,
    ImageTexture,
    isLineMarkerTechnique,
    LineMarkerTechnique,
    PoiGeometry,
    PoiTechnique
} from "@here/datasource-protocol";
import "@here/fetch";
import {
    TextHorizontalAlignment,
    TextHorizontalAlignmentStrings,
    TextVerticalAlignment,
    TextVerticalAlignmentStrings
} from "@here/text-renderer";
import { assert, assertExists, LoggerManager } from "@here/utils";
import * as THREE from "three";

import { MapView } from "../MapView";
import { TextElement } from "../text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";
import { Tile } from "../Tile";

const logger = LoggerManager.instance.create("PoiManager");

/**
 * Interface for the [[ImageTexture]]s that are defined in the atlas.
 */
interface ImageTextureDef {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio?: number;
}

/**
 * Multiplier to apply for a random priority during construction of POIs. Important when many POIs
 * with identical priorities have the same to the camera.
 */
const RANDOM_SORT_WEIGHT_SEQUENCE = 0.01;

/**
 * POI manager class, responsible for loading the [[PoiGeometry]] objects from the [[DecodedTile]],
 * and preparing them for rendering. Also loads and manages the texture atlases for the icons.
 */
export class PoiManager {
    private m_imageTextures: Map<string, ImageTexture> = new Map();
    private m_poiShieldGroups: Map<string, number> = new Map();

    /**
     * The constructor of the `PoiManager`.
     *
     * @param mapView The [[MapView]] instance that should display the POIs.
     */
    constructor(readonly mapView: MapView) {}

    /**
     * Add all POIs from a decoded tile and store them as [[TextElement]]s in the [[Tile]].
     *
     * Also handles LineMarkers, which is a recurring marker along a line (road).
     *
     * @param tile Tile to add POIs to.
     * @param decodedTile DecodedTile containing the raw [[PoiGeometry]] objects describing the
     *  POIs.
     */
    addPois(tile: Tile, decodedTile: DecodedTile): void {
        const poiGeometries = assertExists(decodedTile.poiGeometries);

        for (const poiGeometry of poiGeometries) {
            assert(poiGeometry.technique !== undefined);
            const techniqueIndex = assertExists(poiGeometry.technique);
            const technique = decodedTile.techniques[techniqueIndex];
            if (technique.name !== "line-marker" && technique.name !== "labeled-icon") {
                continue;
            }

            const positions = new THREE.BufferAttribute(
                new Float32Array(poiGeometry.positions.buffer),
                poiGeometry.positions.itemCount
            );

            if (isLineMarkerTechnique(technique) && positions.count > 0) {
                this.addLineMarker(tile, poiGeometry, technique, positions);
            } else {
                const poiTechnique = technique as PoiTechnique;
                let imageTextureName = poiTechnique.imageTexture;

                if (poiGeometry.stringCatalog === undefined) {
                    continue;
                }

                for (let i = 0; i < positions.count; ++i) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);

                    assert(poiGeometry.texts.length > i);
                    let text = poiGeometry.stringCatalog[poiGeometry.texts[i]];
                    if (text === undefined) {
                        text = "";
                    }

                    if (
                        poiGeometry.stringCatalog !== undefined &&
                        poiGeometry.imageTextures !== undefined &&
                        poiGeometry.imageTextures[i] >= 0
                    ) {
                        assert(poiGeometry.imageTextures.length > i);
                        imageTextureName = poiGeometry.stringCatalog[poiGeometry.imageTextures[i]];
                    } else {
                        imageTextureName = poiTechnique.imageTexture;
                    }

                    const textElement = this.checkCreateTextElement(
                        text,
                        technique,
                        imageTextureName,
                        0,
                        poiGeometry.featureId,
                        x,
                        y
                    );

                    if (textElement !== undefined) {
                        tile.addTextElement(textElement);
                    }
                }
            }
        }
    }

    /**
     * Load the texture atlas that defines the segments of the texture that should be used for
     * specific icons. Creates an [[ImageTexture]] for every element in the atlas, such that it can
     * be addressed in the theme file.
     *
     * @param imageName Name of the image from the theme (NOT the url!).
     * @param atlas URL of the JSON file defining the texture atlas.
     */
    addTextureAtlas(imageName: string, atlas: string) {
        fetch(atlas)
            .then(response => {
                if (!response.ok) {
                    throw new Error(
                        `addTextureAtlas: Cannot load textureAtlas: ${response.statusText}`
                    );
                }

                return response.json();
            })
            .then((jsonAtlas: any | undefined) => {
                if (jsonAtlas === undefined) {
                    logger.info(`addTextureAtlas: TextureAtlas empty: ${atlas}`);
                    return;
                }

                try {
                    logger.log(
                        `addTextureAtlas: Loading textureAtlas '${atlas}' for image '${imageName}'`
                    );
                    for (const textureName of Object.getOwnPropertyNames(jsonAtlas)) {
                        const imageTextureDef = jsonAtlas[textureName] as ImageTextureDef;

                        const imageTexture: ImageTexture = {
                            name: textureName,
                            image: imageName,
                            xOffset: imageTextureDef.x,
                            yOffset: imageTextureDef.y,
                            width: imageTextureDef.width,
                            height: imageTextureDef.height
                        };

                        this.addImageTexture(imageTexture);
                    }
                } catch (ex) {
                    logger.error(
                        `addTextureAtlas: Failed to load textureAtlas ` + `'${atlas}' : ${ex}`
                    );
                }
                this.mapView.update();
            })

            .catch((reason: any) => {
                logger.error(`addTextureAtlas: Failed to load textureAtlas '${atlas}' : ${reason}`);
            });
    }

    /**
     * Add an [[ImageTexture]] such that it is available as a named entity for techniques in theme
     * files.
     *
     * @param imageTexture [[ImageTexture]] that should be available for POIs.
     */
    addImageTexture(imageTexture: ImageTexture) {
        if (imageTexture.name === undefined) {
            logger.error("addImageTexture: Name required", imageTexture);
            return;
        }
        if (this.m_imageTextures.get(imageTexture.name) !== undefined) {
            logger.warn(
                `addImageTexture: Name already used: ${imageTexture.name}` + ` (overriding it)`
            );
        }

        this.m_imageTextures.set(imageTexture.name, imageTexture);
    }

    /**
     * Return the [[ImageTexture]] registered under the specified name.
     *
     * @param name Name of the [[ImageTexture]].
     */
    getImageTexture(name: string): ImageTexture | undefined {
        return this.m_imageTextures.get(name);
    }

    /**
     * Clear internal state. Applicable when switching themes.
     */
    clear() {
        this.m_imageTextures.clear();
        this.m_poiShieldGroups.clear();
    }

    /**
     * Add the LineMarker as a POI with a series of positions. Make sure that the LineMarkers
     * having the same visual all get their `shieldGroupIndex` set appropriately, so it can be taken
     * care of later that not too many of them are rendered (obey `minDistance` attribute).
     */
    private addLineMarker(
        tile: Tile,
        poiGeometry: PoiGeometry,
        technique: LineMarkerTechnique | PoiTechnique,
        positions: THREE.BufferAttribute
    ) {
        let imageTexture = technique.imageTexture;
        let text: string | undefined;
        if (poiGeometry.stringCatalog !== undefined && poiGeometry.imageTextures !== undefined) {
            imageTexture = poiGeometry.stringCatalog[poiGeometry.imageTextures[0]];
            text = poiGeometry.stringCatalog[poiGeometry.texts[0]];
        }
        if (text === undefined) {
            text = "";
        }

        // let the combined image texture name (name of image in atlas, not the URL) and
        // text of the shield be the group key
        const groupKey = String(imageTexture) + "-" + text;
        let shieldGroupIndex = this.m_poiShieldGroups.get(groupKey);
        if (shieldGroupIndex === undefined) {
            shieldGroupIndex = this.m_poiShieldGroups.size;
            this.m_poiShieldGroups.set(groupKey, shieldGroupIndex);
        }

        // Debugging help to identify the group of a shield :
        // text = groupKey + ": " + text;

        const positionArray: THREE.Vector2[] = [];

        for (let i = 0; i < positions.count; i += 2) {
            positionArray.push(new THREE.Vector2(positions.getX(i), positions.getY(i)));
        }

        const textElement = this.checkCreateTextElement(
            text,
            technique,
            imageTexture,
            shieldGroupIndex,
            poiGeometry.featureId,
            positionArray
        );

        if (textElement !== undefined) {
            // If the poi icon is rendered, the label that shows its text should also be rendered.
            // The distance rule of the icon should apply, not the one for text (only) labels.
            textElement.ignoreDistance = true;
            tile.addTextElement(textElement);
        }
    }

    /**
     * Create the [[TextElement]] for a POI. Even if the POI has no text, it is required that there
     * is a [[TextElement]], since POIs are hooked onto [[TextElement]]s for sorting.(Sorted by
     * priority attribute).
     */
    private checkCreateTextElement(
        text: string,
        technique: PoiTechnique | LineMarkerTechnique,
        imageTextureName: string | undefined,
        shieldGroupIndex: number,
        featureId: number | undefined,
        x: number | THREE.Vector2[],
        y?: number
    ): TextElement | undefined {
        let textElement: TextElement | undefined;

        // need some text for now
        if (text === undefined) {
            text = "";
        }
        if (text !== undefined) {
            let priority = technique.priority !== undefined ? technique.priority : 0;

            // make sorting stable
            priority += RANDOM_SORT_WEIGHT_SEQUENCE * Math.random();

            const positions = Array.isArray(x) ? (x as THREE.Vector2[]) : new THREE.Vector2(x, y);
            textElement = new TextElement(
                text,
                positions,
                priority,
                technique.scale !== undefined ? technique.scale : 1.0,
                technique.xOffset !== undefined ? technique.xOffset : 0.0,
                technique.yOffset !== undefined ? technique.yOffset : 0.0,
                featureId,
                technique.style,
                technique.allCaps,
                technique.smallCaps,
                technique.bold,
                technique.oblique,
                technique.tracking
            );

            textElement.mayOverlap = technique.textMayOverlap === true;
            textElement.reserveSpace = technique.textReserveSpace !== false;
            textElement.alwaysOnTop = technique.alwaysOnTop === true;

            const textIsOptional = technique.textIsOptional === true;
            const iconIsOptional = technique.iconIsOptional !== false;
            const renderTextDuringMovements = !(technique.renderTextDuringMovements === false);
            const iconMayOverlap =
                technique.iconMayOverlap === undefined
                    ? textElement.textMayOverlap
                    : technique.iconMayOverlap === true;
            const iconReserveSpace =
                technique.iconReserveSpace === undefined
                    ? textElement.textReservesSpace
                    : technique.iconReserveSpace !== false;
            const distanceScale =
                technique.distanceScale !== undefined
                    ? technique.distanceScale
                    : DEFAULT_TEXT_DISTANCE_SCALE;

            if (imageTextureName !== undefined) {
                textElement.poiInfo = {
                    technique,
                    imageTextureName,
                    shieldGroupIndex,
                    textElement,
                    textIsOptional,
                    iconIsOptional,
                    renderTextDuringMovements,
                    mayOverlap: iconMayOverlap,
                    reserveSpace: iconReserveSpace,
                    featureId
                };
            }
            if (technique.color !== undefined) {
                textElement.color = new THREE.Color(technique.color);
            }
            textElement.minZoomLevel = technique.minZoomLevel;
            textElement.distanceScale = distanceScale;

            if (
                technique.hAlignment !== undefined &&
                (technique.hAlignment === TextHorizontalAlignmentStrings.Left ||
                    technique.hAlignment === TextHorizontalAlignmentStrings.Center ||
                    technique.hAlignment === TextHorizontalAlignmentStrings.Right)
            ) {
                textElement.horizontalAlignment = TextHorizontalAlignment[technique.hAlignment];
            }
            if (
                technique.vAlignment !== undefined &&
                (technique.vAlignment === TextVerticalAlignmentStrings.Above ||
                    technique.vAlignment === TextVerticalAlignmentStrings.Center ||
                    technique.vAlignment === TextVerticalAlignmentStrings.Below)
            ) {
                textElement.verticalAlignment = TextVerticalAlignment[technique.vAlignment];
            }
        }

        return textElement;
    }
}
