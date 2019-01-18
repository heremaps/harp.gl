/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    getPropertyValue,
    ImageTexture,
    isLineMarkerTechnique,
    LineMarkerTechnique,
    PoiGeometry,
    PoiTechnique
} from "@here/harp-datasource-protocol";
import {
    TextHorizontalAlignment,
    TextHorizontalAlignmentStrings,
    TextVerticalAlignment,
    TextVerticalAlignmentStrings
} from "@here/harp-text-renderer";
import { assert, assertExists, getOptionValue, LoggerManager } from "@here/harp-utils";
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
 * POI manager class, responsible for loading the [[PoiGeometry]] objects from the [[DecodedTile]],
 * and preparing them for rendering. Also loads and manages the texture atlases for the icons.
 */
export class PoiManager {
    // Keep track of the missing POI table names, but only warn once.
    private static m_missingPoiTableName: Map<string, boolean> = new Map();
    private static m_missingPoiName: Map<string, boolean> = new Map();
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

            // The POI may be in the data, and there may be a Technique, but the technique may
            // specify to not show it.
            if (technique.showOnMap === false) {
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
                const poiTableName = poiTechnique.poiTable;
                let poiName = poiTechnique.poiName;

                for (let i = 0; i < positions.count; ++i) {
                    const x = positions.getX(i);
                    const y = positions.getY(i);

                    assert(poiGeometry.texts.length > i);
                    let text = poiGeometry.stringCatalog[poiGeometry.texts[i]];
                    if (text === undefined) {
                        text = "";
                    }

                    if (poiGeometry.stringCatalog !== undefined) {
                        if (
                            poiGeometry.imageTextures !== undefined &&
                            poiGeometry.imageTextures[i] >= 0
                        ) {
                            assert(poiGeometry.imageTextures.length > i);
                            imageTextureName =
                                poiGeometry.stringCatalog[poiGeometry.imageTextures[i]];
                        } else {
                            imageTextureName = poiTechnique.imageTexture;
                        }

                        if (poiTableName !== undefined) {
                            // The POI name to be used is taken from the data, since it will
                            // specify the name of the texture to use.

                            // The POI name in the technique may override the POI name from the
                            // data.
                            poiName =
                                poiTechnique.poiName === undefined
                                    ? imageTextureName
                                    : poiTechnique.poiName;

                            imageTextureName = undefined;
                        }
                    }

                    const textElement = this.checkCreateTextElement(
                        text,
                        technique,
                        imageTextureName,
                        poiTableName,
                        poiName,
                        0,
                        poiGeometry.featureId,
                        x,
                        y,
                        tile.tileKey.level
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
     * Update the [[TextElement]] with the information taken from the [[PoiTable]] which is
     * referenced in the [[PoiInfo]] of the pointLabel.
     *
     * If the requested [[PoiTable]] is not available yet, the function returns `false`.
     * If the [[PoiTable]] is not defined, or if the references POI has no entry in
     * the [[PoiTable]], no action is taken, and the function returns `false`.
     *
     * If the [[PoiTable]] has been processed, it returns `true`, indicating that this function
     * doesn't have to be called again.
     *
     * @param pointLabel The [[TextElement]] to update.
     *
     * @returns `true` if the [[PoiTable]] has been processed, and the function does not have to be
     *          called again.
     */
    updatePoiFromPoiTable(pointLabel: TextElement): boolean {
        const poiInfo = pointLabel.poiInfo;
        if (
            poiInfo === undefined ||
            poiInfo.poiTableName === undefined ||
            poiInfo.poiName === undefined
        ) {
            return true;
        }

        let poiTableName = poiInfo.poiTableName;
        const poiTable = this.mapView.poiTableManager.getPoiTable(poiTableName);

        if (poiTable !== undefined && poiTable.isLoading) {
            // The PoiTable is still loading, we have to try again.
            return false;
        }

        if (poiTable === undefined || !poiTable.loadedOk) {
            // Warn about a missing POI table name, but only once.
            if (poiTableName === undefined) {
                poiTableName = "undefined";
            }
            if (PoiManager.m_missingPoiTableName.get(poiTableName) === undefined) {
                PoiManager.m_missingPoiTableName.set(poiTableName, true);
                if (poiTable !== undefined && !poiTable.loadedOk) {
                    logger.error(`Error loading POI table name ${poiTableName}`);
                } else {
                    logger.error(
                        `updatePoiFromPoiTable: No POI table with name '${poiTableName}' found.`
                    );
                }
            }
            return true;
        }

        let poiName = poiInfo.poiName;
        const poiTableEntry = poiTable.poiDict.get(poiName);

        if (poiTableEntry === undefined) {
            // Warn about a missing POI name, but only once.
            if (poiName === undefined) {
                poiName = "undefined";
            }
            if (PoiManager.m_missingPoiName.get(poiName) === undefined) {
                PoiManager.m_missingPoiName.set(poiName, true);
                logger.warn(`Cannot find POI info '${poiName}' found in table ${poiTableName}.`);
            }
            return true;
        }

        if (poiTableEntry.iconName !== undefined) {
            poiInfo.imageTextureName = poiTableEntry.iconName;
        }

        pointLabel.visible =
            poiTableEntry.visible !== undefined ? poiTableEntry.visible : pointLabel.visible;
        pointLabel.priority =
            poiTableEntry.priority !== undefined ? poiTableEntry.priority : pointLabel.priority;
        poiInfo.iconMinZoomLevel =
            poiTableEntry.iconMinLevel !== undefined
                ? poiTableEntry.iconMinLevel
                : poiInfo.iconMinZoomLevel;
        poiInfo.iconMaxZoomLevel =
            poiTableEntry.iconMaxLevel !== undefined
                ? poiTableEntry.iconMaxLevel
                : poiInfo.iconMaxZoomLevel;
        poiInfo.textMinZoomLevel =
            poiTableEntry.textMinLevel !== undefined
                ? poiTableEntry.textMinLevel
                : poiInfo.textMinZoomLevel;
        poiInfo.textMaxZoomLevel =
            poiTableEntry.textMaxLevel !== undefined
                ? poiTableEntry.textMaxLevel
                : poiInfo.textMaxZoomLevel;

        pointLabel.updateMinMaxZoomLevelsFromPoiInfo();

        return true;
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
            undefined, // TBD for road shields
            undefined,
            shieldGroupIndex,
            poiGeometry.featureId,
            positionArray,
            undefined,
            tile.tileKey.level
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
        poiTableName: string | undefined,
        poiName: string | undefined,
        shieldGroupIndex: number,
        featureId: number | undefined,
        x: number | THREE.Vector2[],
        y: number | undefined,
        storageLevel: number
    ): TextElement | undefined {
        let textElement: TextElement | undefined;

        // need some text for now
        if (text === undefined) {
            text = "";
        }
        if (text !== undefined) {
            const priority = technique.priority !== undefined ? technique.priority : 0;

            const positions = Array.isArray(x) ? (x as THREE.Vector2[]) : new THREE.Vector2(x, y);
            const displayZoomLevel = this.mapView.zoomLevel;
            textElement = new TextElement(
                text,
                positions,
                priority,
                getOptionValue(getPropertyValue(technique.scale, displayZoomLevel), 1.0),
                technique.xOffset !== undefined ? technique.xOffset : 0.0,
                technique.yOffset !== undefined ? technique.yOffset : 0.0,
                featureId,
                technique.style,
                technique.allCaps,
                technique.smallCaps,
                technique.bold,
                technique.oblique,
                technique.tracking,
                getPropertyValue(technique.fadeNear, displayZoomLevel),
                getPropertyValue(technique.fadeFar, displayZoomLevel)
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

            // imageTextureName may be undefined if a poiTable is used.
            if (imageTextureName === undefined && poiTableName !== undefined) {
                imageTextureName = "";
            }

            if (imageTextureName !== undefined) {
                textElement.poiInfo = {
                    technique,
                    imageTextureName,
                    poiTableName,
                    poiName,
                    shieldGroupIndex,
                    textElement,
                    textIsOptional,
                    iconIsOptional,
                    renderTextDuringMovements,
                    mayOverlap: iconMayOverlap,
                    reserveSpace: iconReserveSpace,
                    featureId,
                    iconMinZoomLevel: technique.iconMinZoomLevel,
                    iconMaxZoomLevel: technique.iconMaxZoomLevel,
                    textMinZoomLevel: technique.textMinZoomLevel,
                    textMaxZoomLevel: technique.textMaxZoomLevel
                };
                textElement.updateMinMaxZoomLevelsFromPoiInfo();
            } else {
                // Select the smaller/larger one of the two min/max values, because the TextElement
                // is a container for both.
                if (textElement.minZoomLevel === undefined) {
                    textElement.minZoomLevel = technique.textMinZoomLevel;
                }

                if (textElement.maxZoomLevel === undefined) {
                    textElement.maxZoomLevel = technique.textMaxZoomLevel;
                }
            }

            if (technique.color !== undefined) {
                textElement.color = new THREE.Color(technique.color);
            }

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
