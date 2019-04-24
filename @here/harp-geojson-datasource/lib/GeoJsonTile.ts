/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    isPoiTechnique,
    isTextTechnique,
    PoiTechnique,
    TextTechnique
} from "@here/harp-datasource-protocol";
import {
    DEFAULT_TEXT_DISTANCE_SCALE,
    getBufferAttribute,
    TextElement,
    Tile,
    TileObject
} from "@here/harp-mapview";
import { ContextualArabicConverter } from "@here/harp-text-canvas";
import * as THREE from "three";
import {
    GeoJsonPoiGeometry,
    GeoJsonTextGeometry,
    GeoJsonTextPathGeometry
} from "./GeoJsonGeometryCreator";
/**
 * The data that is contained in a [[GeoJsonTileObject]].
 */
export interface GeoJsonTileObjectData {
    type?: string;
    tileMortonCode: number;
    zoomLevel: number;
    geojsonProperties: {};
}

/**
 * Interface describing a [[GeoJsonTile]].
 */
export interface GeoJsonTileObject extends TileObject {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    userData: GeoJsonTileObjectData;
}

/**
 * Interface that describe the parameters for a labeled icon.
 */
interface LabeledIconParams {
    priority: number;
    size: number;
    xOffset: number;
    yOffset: number;
    mayOverlap: boolean;
    reserveSpace: boolean;
    alwaysOnTop: boolean;
    textIsOptional: boolean;
    iconIsOptional: boolean;
    iconMayOverlap: boolean;
    renderTextDuringMovements: boolean;
    textReserveSpace: boolean;
    imageTextureName: string;
    label: string;
    featureId: number;
}

/**
 * It contains default values for the labeled icons
 */
const DEFAULT_LABELED_ICON: Readonly<LabeledIconParams> = {
    priority: 1000,
    size: 16,
    xOffset: 0.0,
    yOffset: 0.0,
    mayOverlap: false,
    reserveSpace: true,
    alwaysOnTop: true,
    textIsOptional: true,
    iconIsOptional: false,
    iconMayOverlap: false,
    renderTextDuringMovements: true,
    textReserveSpace: true,
    imageTextureName: "location",
    label: "",
    featureId: 0
};

/**
 * The `GeoJsonTile` class is used to create objects from decoded GeoJSON data. Instances of
 * `GeoJsonTile` are created by [[GeoJsonDataSource.getTile]] and used by [[MapView]] to add tile
 * objects to the scene.
 */
export class GeoJsonTile extends Tile {
    static readonly POINT_MARKER_SIZE = 128;

    private m_currentZoomLevel: number | undefined;
    private m_preparedPaths?: GeoJsonTextPathGeometry[];

    /**
     * Tiles render at all zoom levels. This method stores the zoom level in order to know how to
     * scale the lines's width.
     *
     * @param zoomLevel zoom level.
     * @returns always returns `true`
     */
    willRender(zoomLevel: number): boolean {
        if (this.m_currentZoomLevel !== zoomLevel) {
            this.m_currentZoomLevel = zoomLevel;
        }
        return true;
    }

    /**
     * For unit testing.
     * TODO: find a better solution and/or get rid of window in this class at all.
     */
    getWindow(): Window {
        return window;
    }

    /**
     * Given a decode tile, it adds labeled icons to it. This method overrides the
     * `createTextElements` in the [[Tile]] class.
     *
     * @param decodedTile The decoded tile received by the [[GeoJsonDecoder]].
     */
    createTextElements(decodedTile: DecodedTile) {
        if (decodedTile.poiGeometries !== undefined) {
            for (const geometry of decodedTile.poiGeometries) {
                const techniqueIndex = geometry.technique!;
                const technique = decodedTile.techniques[techniqueIndex];
                if (isPoiTechnique(technique)) {
                    this.addPois(geometry, technique);
                }
            }
        }
        if (decodedTile.textGeometries !== undefined) {
            for (const geometry of decodedTile.textGeometries) {
                const techniqueIndex = geometry.technique!;
                const technique = decodedTile.techniques[techniqueIndex];
                if (isTextTechnique(technique)) {
                    this.addTexts(geometry, technique);
                }
            }
        }
        if (decodedTile.textPathGeometries !== undefined) {
            this.m_preparedPaths = this.prepareTextPaths(decodedTile.textPathGeometries);
            for (const textPath of this.m_preparedPaths) {
                const techniqueIndex = textPath.technique!;
                const technique = decodedTile.techniques[techniqueIndex];
                if (isTextTechnique(technique)) {
                    this.addTextPaths(textPath, technique);
                }
            }
        }
    }

    /**
     * Calls `addTextPath` for each TextPath.
     *
     * @param geometry The TextPath geometry.
     * @param technique Text technique.
     */
    private addTextPaths(geometry: GeoJsonTextPathGeometry, technique: TextTechnique) {
        const path: THREE.Vector2[] = [];
        for (let i = 0; i < geometry.path.length; i += 3) {
            path.push(new THREE.Vector2(geometry.path[i], geometry.path[i + 1]));
        }

        const properties = geometry.objInfos !== undefined ? geometry.objInfos : undefined;
        this.addTextPath(path, geometry.text, technique, properties);
    }

    /**
     * Add a label available for mouse picking at the given path.
     *
     * @param path Path of the text path.
     * @param technique Technique in use.
     * @param geojsonProperties Properties defined by the user.
     */
    private addTextPath(
        path: THREE.Vector2[],
        text: string,
        technique: TextTechnique,
        geojsonProperties?: {}
    ) {
        const priority =
            technique.priority === undefined ? DEFAULT_LABELED_ICON.priority : technique.priority;
        const xOffset =
            technique.xOffset === undefined ? DEFAULT_LABELED_ICON.xOffset : technique.xOffset;
        const yOffset =
            technique.yOffset === undefined ? DEFAULT_LABELED_ICON.yOffset : technique.yOffset;

        const featureId = DEFAULT_LABELED_ICON.featureId;

        const textElement = new TextElement(
            ContextualArabicConverter.instance.convert(text),
            path,
            this.getRenderStyle(technique),
            this.getLayoutStyle(technique),
            priority,
            xOffset,
            yOffset,
            featureId
        );

        // Set the userData of the TextElement to the geojsonProperties, then it will be available
        // for picking.
        if (geojsonProperties !== undefined) {
            textElement.userData = geojsonProperties;
        }

        const mayOverlap =
            technique.mayOverlap === undefined
                ? DEFAULT_LABELED_ICON.iconMayOverlap
                : technique.mayOverlap;
        const reserveSpace =
            technique.reserveSpace === undefined
                ? DEFAULT_LABELED_ICON.textReserveSpace
                : technique.reserveSpace;
        const distanceScale = DEFAULT_TEXT_DISTANCE_SCALE;

        textElement.mayOverlap = mayOverlap;
        textElement.reserveSpace = reserveSpace;
        textElement.distanceScale = distanceScale;

        this.addUserTextElement(textElement);
    }

    /**
     * Calls `addText` on each vertex of the geometry.
     *
     * @param geometry The Text geometry.
     * @param technique Text technique.
     */
    private addTexts(geometry: GeoJsonTextGeometry, technique: TextTechnique) {
        const attribute = getBufferAttribute(geometry.positions);

        for (let index = 0; index < attribute.count; index++) {
            const currentVertexCache = new THREE.Vector2(
                attribute.getX(index),
                attribute.getY(index)
            );

            const properties =
                geometry.objInfos !== undefined ? geometry.objInfos[index] : undefined;
            const text = geometry.stringCatalog![index] as string;
            this.addText(currentVertexCache, text, technique, properties);
        }
    }

    /**
     * Add a label available for mouse picking at the given position.
     *
     * @param position position of the labeled Icon, in world coordinate.
     * @param technique Technique in use.
     * @param geojsonProperties Properties defined by the user.
     */
    private addText(
        position: THREE.Vector2,
        text: string,
        technique: TextTechnique,
        geojsonProperties?: {}
    ) {
        const priority =
            technique.priority === undefined ? DEFAULT_LABELED_ICON.priority : technique.priority;
        const xOffset =
            technique.xOffset === undefined ? DEFAULT_LABELED_ICON.xOffset : technique.xOffset;
        const yOffset =
            technique.yOffset === undefined ? DEFAULT_LABELED_ICON.yOffset : technique.yOffset;

        const featureId = DEFAULT_LABELED_ICON.featureId;

        const textElement = new TextElement(
            ContextualArabicConverter.instance.convert(text),
            position,
            this.getRenderStyle(technique),
            this.getLayoutStyle(technique),
            priority,
            xOffset,
            yOffset,
            featureId
        );

        // Set the userData of the TextElement to the geojsonProperties, then it will be available
        // for picking.
        if (geojsonProperties !== undefined) {
            textElement.userData = geojsonProperties;
        }

        const mayOverlap =
            technique.mayOverlap === undefined
                ? DEFAULT_LABELED_ICON.iconMayOverlap
                : technique.mayOverlap;
        const distanceScale = DEFAULT_TEXT_DISTANCE_SCALE;

        textElement.mayOverlap = mayOverlap;
        textElement.reserveSpace = false;
        textElement.distanceScale = distanceScale;

        this.addUserTextElement(textElement);
    }

    /**
     * Calls `addPoi` on each vertex of the geometry.
     *
     * @param geometry The POI geometry.
     * @param technique POI technique.
     */
    private addPois(geometry: GeoJsonPoiGeometry, technique: PoiTechnique) {
        const attribute = getBufferAttribute(geometry.positions);

        const currentVertexCache = new THREE.Vector2();

        for (let index = 0; index < attribute.count; index++) {
            currentVertexCache.set(attribute.getX(index), attribute.getY(index));
            const properties =
                geometry.objInfos !== undefined ? geometry.objInfos[index] : undefined;
            this.addPoi(currentVertexCache, technique, properties);
        }
    }

    /**
     * Add a POI available for mouse picking at the given position.
     *
     * @param position position of the labeled Icon, in world coordinate.
     * @param technique Technique in use.
     * @param geojsonProperties Properties defined by the user.
     */
    private addPoi(position: THREE.Vector2, technique: PoiTechnique, geojsonProperties?: {}) {
        const label = DEFAULT_LABELED_ICON.label;
        const priority =
            technique.priority === undefined ? DEFAULT_LABELED_ICON.priority : technique.priority;
        const xOffset =
            technique.xOffset === undefined ? DEFAULT_LABELED_ICON.xOffset : technique.xOffset;
        const yOffset =
            technique.yOffset === undefined ? DEFAULT_LABELED_ICON.yOffset : technique.yOffset;

        const featureId = DEFAULT_LABELED_ICON.featureId;

        const textElement = new TextElement(
            ContextualArabicConverter.instance.convert(label),
            position,
            this.getRenderStyle(technique),
            this.getLayoutStyle(technique),
            priority,
            xOffset,
            yOffset,
            featureId
        );

        // Set the userData of the TextElement to the geojsonProperties, then it will be available
        // for picking.
        if (geojsonProperties !== undefined) {
            textElement.userData = geojsonProperties;
        }

        const mayOverlap =
            technique.iconMayOverlap === undefined
                ? DEFAULT_LABELED_ICON.iconMayOverlap
                : technique.iconMayOverlap;
        const reserveSpace =
            technique.iconReserveSpace === undefined
                ? DEFAULT_LABELED_ICON.textReserveSpace
                : technique.iconReserveSpace;
        const distanceScale = DEFAULT_TEXT_DISTANCE_SCALE;
        const alwaysOnTop =
            technique.alwaysOnTop === undefined
                ? DEFAULT_LABELED_ICON.alwaysOnTop
                : technique.alwaysOnTop;

        textElement.mayOverlap = mayOverlap;
        textElement.reserveSpace = reserveSpace;
        textElement.distanceScale = distanceScale;
        textElement.alwaysOnTop = alwaysOnTop;

        const textIsOptional =
            technique.textIsOptional === undefined
                ? DEFAULT_LABELED_ICON.textIsOptional
                : technique.textIsOptional;
        const iconIsOptional =
            technique.iconIsOptional === undefined
                ? DEFAULT_LABELED_ICON.iconIsOptional
                : technique.iconIsOptional;
        const renderTextDuringMovements =
            technique.renderTextDuringMovements === undefined
                ? DEFAULT_LABELED_ICON.renderTextDuringMovements
                : technique.renderTextDuringMovements;
        const imageTextureName =
            technique.imageTexture !== undefined
                ? technique.imageTexture
                : DEFAULT_LABELED_ICON.imageTextureName;

        textElement.poiInfo = {
            technique,
            imageTextureName,
            textElement,
            textIsOptional,
            iconIsOptional,
            renderTextDuringMovements,
            mayOverlap,
            reserveSpace,
            featureId
        };

        this.addUserTextElement(textElement);
    }
}
