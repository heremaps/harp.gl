/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeMap,
    composeTechniqueTextureName,
    DecodedTile,
    getFeatureId,
    getPropertyValue,
    ImageTexture,
    IndexedTechnique,
    IndexedTechniqueParams,
    isLineMarkerTechnique,
    isPoiTechnique,
    LineMarkerTechnique,
    PoiGeometry,
    PoiTechnique
} from "@here/harp-datasource-protocol";
import { ContextualArabicConverter } from "@here/harp-text-canvas";
import { assert, assertExists, LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { ColorCache } from "../ColorCache";
import { MapView } from "../MapView";
import { TextElement } from "../text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";
import { Tile } from "../Tile";
import { PoiTable } from "./PoiTableManager";

const logger = LoggerManager.instance.create("PoiManager");

/**
 * Interface for the {@link @here/harp-datasource-protocol#ImageTexture}s
 * that are defined in the atlas.
 */
interface ImageTextureDef {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio?: number;
}

/**
 * POI manager class, responsible for loading the
 * {@link @here/harp-datasource-protocol#PoiGeometry} objects
 * from the {@link @here/harp-datasource-protocol#DecodedTile},
 * and preparing them for rendering.
 *
 * @remarks
 * Also loads and manages the texture atlases for the icons.
 */
export class PoiManager {
    // Keep track of the missing POI table names, but only warn once.
    private static readonly m_missingPoiTableName: Map<string, boolean> = new Map();
    private static readonly m_missingPoiName: Map<string, boolean> = new Map();

    /**
     * Warn about a missing POI table name, but only once.
     * @param poiTableName - POI mapping table name.
     * @param poiTable - POI table instance.
     */
    private static notifyMissingPoiTable(
        poiTableName: string,
        poiTable: PoiTable | undefined
    ): void {
        if (poiTableName === undefined) {
            poiTableName = "undefined";
        }
        if (PoiManager.m_missingPoiTableName.get(poiTableName) === undefined) {
            PoiManager.m_missingPoiTableName.set(poiTableName, true);
            if (poiTable !== undefined && !poiTable.loadedOk) {
                logger.error(`updatePoiFromPoiTable: Could not load POI table '${poiTableName}'!`);
            } else {
                logger.error(
                    `updatePoiFromPoiTable: No POI table with name '${poiTableName}' found!`
                );
            }
        }
    }

    /**
     * Warn about a missing POI name, but only once.
     * @param poiName - name of POI.
     * @param poiTableName - POI mapping table name.
     */
    private static notifyMissingPoi(poiName: string, poiTableName: string): void {
        if (poiName === undefined) {
            poiName = "undefined";
        }
        const key: string = `${poiTableName}[${poiName}]`;
        if (PoiManager.m_missingPoiName.get(key) === undefined) {
            PoiManager.m_missingPoiName.set(key, true);
            logger.warn(
                `updatePoiFromPoiTable: ` +
                    `Cannot find POI info for '${poiName}' in table '${poiTableName}'.`
            );
        }
    }

    private readonly m_imageTextures: Map<string, ImageTexture> = new Map();
    private readonly m_poiShieldGroups: Map<string, number> = new Map();

    /**
     * The constructor of the `PoiManager`.
     *
     * @param mapView - The {@link MapView} instance that should display the POIs.
     */
    constructor(readonly mapView: MapView) {}

    /**
     * Add all POIs from a decoded tile and store them as {@link TextElement}s in the {@link Tile}.
     *
     * Also handles LineMarkers, which is a recurring marker along a line (road).
     *
     * @param tile - Tile to add POIs to.
     * @param decodedTile - DecodedTile containing the raw
     *                      {@link @here/harp-datasource-protocol#PoiGeometry}
     *                      objects describing the POIs.
     */
    addPois(tile: Tile, decodedTile: DecodedTile): void {
        const poiGeometries = assertExists(decodedTile.poiGeometries);
        const worldOffsetX = tile.computeWorldOffsetX();

        for (const poiGeometry of poiGeometries) {
            assert(poiGeometry.technique !== undefined);
            const techniqueIndex = assertExists(poiGeometry.technique);
            const technique = decodedTile.techniques[techniqueIndex] as IndexedTechnique;

            if (
                technique._kindState === false ||
                (!isLineMarkerTechnique(technique) && !isPoiTechnique(technique))
            ) {
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
                this.addLineMarker(tile, poiGeometry, technique, positions, worldOffsetX);
            } else if (isPoiTechnique(technique)) {
                this.addPoi(tile, poiGeometry, technique, positions, worldOffsetX);
            }
        }
    }

    /**
     * Load the texture atlas that defines the segments of the texture that should be used for
     * specific icons.
     *
     * @remarks
     * Creates an {@link @here/harp-datasource-protocol#ImageTexture}
     * for every element in the atlas, such that it can
     * be addressed in the theme file.
     *
     * @param imageName - Name of the image from the theme (NOT the url!).
     * @param atlas - URL of the JSON file defining the texture atlas.
     * @param abortSignal - Signal to Abort the loading of the Atlas Image
     */
    async addTextureAtlas(imageName: string, atlas: string, abortSignal?: AbortSignal) {
        const response = await fetch(atlas, { signal: abortSignal });
        if (!response.ok) {
            throw new Error(`addTextureAtlas: Cannot load textureAtlas: ${response.statusText}`);
        }
        try {
            const jsonAtlas: any | undefined = await response.json();

            if (jsonAtlas === undefined) {
                logger.info(`addTextureAtlas: TextureAtlas empty: ${atlas}`);
                return;
            }

            logger.debug(
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
            this.mapView.update();
        } catch (error) {
            logger.error(`addTextureAtlas: Failed to load textureAtlas '${atlas}' : ${error}`);
        }
    }

    /**
     * Add an {@link @here/harp-datasource-protocol#ImageTexture} such that it
     * is available as a named entity for techniques in theme files.
     *
     * @param imageTexture - {@link @here/harp-datasource-protocol#ImageTexture}
     *                       that should be available for POIs.
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
     * Return the {@link @here/harp-datasource-protocol#ImageTexture}
     * registered under the specified name.
     *
     * @param name - Name of the {@link @here/harp-datasource-protocol#ImageTexture}.
     */
    getImageTexture(name: string): ImageTexture | undefined {
        return this.m_imageTextures.get(name);
    }

    /**
     * Update the {@link TextElement} with the information taken from the {@link PoiTable} which is
     * referenced in the {@link PoiInfo} of the pointLabel.
     *
     * If the requested {@link PoiTable} is not available yet, the function returns `false`.
     * If the {@link PoiTable} is not defined, or if the references POI has no entry in
     * the {@link PoiTable}, no action is taken, and the function returns `false`.
     *
     * If the {@link PoiTable} has been processed, it returns `true`, indicating that this function
     * doesn't have to be called again.
     *
     * @param pointLabel - The {@link TextElement} to update.
     *
     * @returns `true` if the {@link PoiTable} has been processed, and the
     *          function does not have to be called again.
     */
    updatePoiFromPoiTable(pointLabel: TextElement): boolean {
        const poiInfo = pointLabel.poiInfo;
        // PoiTable requires poiName to be defined otherwise mapping via PoiTable is
        // not possible, such as table key is not defined.
        if (
            poiInfo === undefined ||
            poiInfo.poiTableName === undefined ||
            poiInfo.poiName === undefined
        ) {
            return true;
        }

        // Try to acquire PoiTable
        const poiTableName = poiInfo.poiTableName;
        const poiTable = this.mapView.poiTableManager.getPoiTable(poiTableName);

        // Check if PoiTable is found, but its still loading.
        if (poiTable !== undefined && poiTable.isLoading) {
            // The PoiTable is still loading, we have to try again.
            return false;
        }

        // Remove poiTableName to mark this POI as processed.
        poiInfo.poiTableName = undefined;

        // PoiTable not found or can not be loaded.
        if (poiTable === undefined || !poiTable.loadedOk) {
            PoiManager.notifyMissingPoiTable(poiTableName, poiTable);
            return true;
        }

        // Try to acquire PoiTableEntry.
        const poiName = poiInfo.poiName;
        const poiTableEntry = poiTable.getEntry(poiName);
        if (poiTableEntry === undefined) {
            PoiManager.notifyMissingPoi(poiName, poiTableName);
            return true;
        }

        if (poiTableEntry.iconName !== undefined && poiTableEntry.iconName.length > 0) {
            poiInfo.imageTextureName = composeTechniqueTextureName(
                poiTableEntry.iconName,
                poiInfo.technique
            );
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
        technique: LineMarkerTechnique & IndexedTechniqueParams,
        positions: THREE.BufferAttribute,
        worldOffsetX: number
    ) {
        const env = this.mapView.env;

        let imageTextureName: string | undefined =
            technique.imageTexture !== undefined
                ? composeTechniqueTextureName(
                      getPropertyValue(technique.imageTexture, env),
                      technique
                  )
                : undefined;

        let text: string = "";
        let userData: AttributeMap | undefined;
        let featureId: number | undefined;

        if (poiGeometry.stringCatalog !== undefined) {
            assert(poiGeometry.texts.length > 0);
            text = poiGeometry.stringCatalog[poiGeometry.texts[0]] ?? "";
            if (poiGeometry.objInfos !== undefined) {
                userData = poiGeometry.objInfos[0];
                featureId = getFeatureId(userData);
            }

            if (poiGeometry.imageTextures !== undefined) {
                assert(poiGeometry.imageTextures.length > 0);
                imageTextureName = poiGeometry.stringCatalog[poiGeometry.imageTextures[0]];
            }
        }

        // let the combined image texture name (name of image in atlas, not the URL) and
        // text of the shield be the group key, at worst scenario it may be:
        // "undefined-"
        const groupKey = String(imageTextureName) + "-" + text;
        let shieldGroupIndex = this.m_poiShieldGroups.get(groupKey);
        if (shieldGroupIndex === undefined) {
            shieldGroupIndex = this.m_poiShieldGroups.size;
            this.m_poiShieldGroups.set(groupKey, shieldGroupIndex);
        }

        // Debugging help to identify the group of a shield :
        // text = groupKey + ": " + text;

        const positionArray: THREE.Vector3[] = [];
        for (let i = 0; i < positions.count; i += 3) {
            const x = positions.getX(i) + worldOffsetX;
            const y = positions.getY(i);
            const z = positions.getZ(i);
            positionArray.push(new THREE.Vector3(x, y, z));
        }
        const textElement = this.checkCreateTextElement(
            tile,
            text,
            technique,
            imageTextureName,
            undefined, // TBD for road shields
            undefined,
            shieldGroupIndex,
            featureId,
            positionArray,
            undefined,
            undefined,
            undefined,
            userData
        );

        // If the poi icon is rendered, the label that shows text should also be rendered.
        // The distance rule of the icon should apply, not the one for text (only) labels.
        textElement.ignoreDistance = false;
        tile.addTextElement(textElement);
    }

    /**
     * Create and add POI {@link TextElement}s to tile with a series of positions.
     */
    private addPoi(
        tile: Tile,
        poiGeometry: PoiGeometry,
        technique: PoiTechnique & IndexedTechniqueParams,
        positions: THREE.BufferAttribute,
        worldOffsetX: number
    ) {
        if (poiGeometry.stringCatalog === undefined) {
            return;
        }

        const env = tile.mapView.env;

        const techniqueTextureName: string | undefined =
            technique.imageTexture !== undefined
                ? composeTechniqueTextureName(
                      getPropertyValue(technique.imageTexture, env),
                      technique
                  )
                : undefined;

        const poiTechnique = technique as PoiTechnique;
        const poiTableName = poiTechnique.poiTable;
        let poiName = poiTechnique.poiName;

        for (let i = 0; i < positions.count; ++i) {
            const x = positions.getX(i) + worldOffsetX;
            const y = positions.getY(i);
            const z = positions.getZ(i);

            assert(poiGeometry.texts.length > i);
            let imageTextureName = techniqueTextureName;
            const text: string = poiGeometry.stringCatalog[poiGeometry.texts[i]] ?? "";
            const userData =
                poiGeometry.objInfos !== undefined ? poiGeometry.objInfos[i] : undefined;
            const featureId = getFeatureId(userData);
            const offsetDirection =
                poiGeometry.offsetDirections === undefined ? 0 : poiGeometry.offsetDirections[i];
            if (poiGeometry.imageTextures !== undefined && poiGeometry.imageTextures[i] >= 0) {
                assert(poiGeometry.imageTextures.length > i);
                imageTextureName = poiGeometry.stringCatalog[poiGeometry.imageTextures[i]];
            }
            if (poiTableName !== undefined) {
                // The POI name to be used is taken from the data, since it will
                // specify the name of the texture to use.

                // The POI name in the technique may override the POI name from the
                // data.
                poiName =
                    poiTechnique.poiName === undefined ? imageTextureName : poiTechnique.poiName;

                imageTextureName = undefined;
            }

            const textElement = this.checkCreateTextElement(
                tile,
                text,
                technique,
                imageTextureName,
                poiTableName,
                poiName,
                0,
                featureId,
                x,
                y,
                z,
                offsetDirection,
                userData
            );

            tile.addTextElement(textElement);
        }
    }

    /**
     * Create the {@link TextElement} for a POI.
     *
     * @remarks
     * Even if the POI has no text, it is required that there
     * is a {@link TextElement}, since POIs are hooked onto {@link TextElement}s
     * for sorting.(Sorted by priority attribute).
     */
    private checkCreateTextElement(
        tile: Tile,
        text: string,
        technique: (PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams,
        imageTextureName: string | undefined,
        poiTableName: string | undefined,
        poiName: string | undefined,
        shieldGroupIndex: number,
        featureId: number | undefined,
        x: number | THREE.Vector3[],
        y: number | undefined,
        z: number | undefined,
        offsetDirection?: number,
        userData?: {}
    ): TextElement {
        const priority = technique.priority !== undefined ? technique.priority : 0;
        const positions = Array.isArray(x) ? (x as THREE.Vector3[]) : new THREE.Vector3(x, y, z);

        // The current zoomlevel of mapview. Since this method is called for all tiles in the
        // VisibleTileSet we can be sure that the current zoomlevel matches the zoomlevel where
        // the tile should be shown.
        const env = this.mapView.env;
        const fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, env)
                : technique.fadeNear;
        const fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, env)
                : technique.fadeFar;
        const xOffset = getPropertyValue(technique.xOffset, env);
        const yOffset = getPropertyValue(technique.yOffset, env);

        const textElement: TextElement = new TextElement(
            ContextualArabicConverter.instance.convert(text),
            positions,
            tile.textStyleCache.getRenderStyle(technique),
            tile.textStyleCache.getLayoutStyle(technique),
            getPropertyValue(priority, env),
            xOffset !== undefined ? xOffset : 0.0,
            yOffset !== undefined ? yOffset : 0.0,
            featureId,
            technique.style,
            fadeNear,
            fadeFar,
            tile.offset,
            offsetDirection
        );

        textElement.mayOverlap = technique.textMayOverlap === true;
        textElement.reserveSpace = technique.textReserveSpace !== false;
        textElement.alwaysOnTop = technique.alwaysOnTop === true;
        textElement.userData = userData;

        // imageTextureName may be undefined if a poiTable is used.
        if (imageTextureName === undefined && poiTableName !== undefined) {
            imageTextureName = "";
        } else if (imageTextureName !== undefined && poiTableName !== undefined) {
            logger.warn(
                "Possible duplicate POI icon definition via imageTextureName and poiTable!"
            );
        }

        if (imageTextureName !== undefined) {
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

            const iconColorRaw = technique.iconColor
                ? getPropertyValue(technique.iconColor, env)
                : null;
            const iconColor =
                iconColorRaw !== null ? ColorCache.instance.getColor(iconColorRaw) : undefined;

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
                iconBrightness: technique.iconBrightness,
                iconColor,
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

        textElement.distanceScale =
            technique.distanceScale !== undefined
                ? technique.distanceScale
                : DEFAULT_TEXT_DISTANCE_SCALE;

        textElement.kind = technique.kind;
        return textElement;
    }
}
