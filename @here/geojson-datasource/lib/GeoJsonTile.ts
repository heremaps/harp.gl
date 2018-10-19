/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTile,
    Geometry,
    getBufferAttribute,
    PoiTechnique,
    Technique
} from "@here/datasource-protocol";
import { DEFAULT_TEXT_DISTANCE_SCALE, TextElement, Tile, TileObject } from "@here/mapview";
import * as THREE from "three";

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
    scale: number;
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
    scale: 0.5,
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
     * Given a decode tile, it adds labeled icons to it. This methods ovveride the
     * `createTextElements` in the [[Tile]] class.
     *
     * @param decodedTile The decoded tile received by the [[GeoJsonDecoder]]
     */
    createTextElements(decodedTile: DecodedTile) {
        super.createTextElements(decodedTile);
        if (decodedTile.geometries !== undefined) {
            for (const geometry of decodedTile.geometries) {
                const groups = geometry.groups;
                const groupCount = groups.length;

                for (let groupIndex = 0; groupIndex < groupCount; ) {
                    const group = groups[groupIndex++];
                    const techniqueIndex = group.technique;
                    const technique = decodedTile.techniques[techniqueIndex];

                    if (technique.name === "labeled-icon") {
                        this.addLabeledIcons(geometry, technique);
                    }
                }
            }
        }
    }

    private addLabeledIcons(geometry: Geometry, technique: Technique) {
        geometry.vertexAttributes.forEach(vertexAttribute => {
            const attribute = getBufferAttribute(vertexAttribute);
            for (let index = 0; index < attribute.count; index++) {
                const position = new THREE.Vector3(
                    attribute.getX(index),
                    attribute.getY(index),
                    attribute.getZ(index)
                );

                let geojsonProperties;
                if (geometry.objInfos !== undefined) {
                    geojsonProperties = geometry.objInfos[index];
                }

                this.addLabeledIcon(position, technique, geojsonProperties);
            }
        });
    }

    /**
     * Add a labeled icon available for mouse picking at the given position.
     *
     * @param position position of the labeled Icon, in world coordinate.
     * @param tec Technique in use.
     * @param geojsonProperties Properties defined by the user.
     */
    private addLabeledIcon(position: THREE.Vector3, tec: Technique, geojsonProperties?: {}) {
        const technique = tec as PoiTechnique;

        const label = DEFAULT_LABELED_ICON.label;
        const priority =
            technique.priority === undefined ? DEFAULT_LABELED_ICON.priority : technique.priority;
        const scale = technique.scale === undefined ? DEFAULT_LABELED_ICON.scale : technique.scale;
        const xOffset =
            technique.xOffset === undefined ? DEFAULT_LABELED_ICON.xOffset : technique.xOffset;
        const yOffset =
            technique.yOffset === undefined ? DEFAULT_LABELED_ICON.yOffset : technique.yOffset;
        const mayOverlap =
            technique.iconMayOverlap === undefined
                ? DEFAULT_LABELED_ICON.iconMayOverlap
                : technique.iconMayOverlap;
        const reserveSpace =
            technique.textReserveSpace === undefined
                ? DEFAULT_LABELED_ICON.textReserveSpace
                : technique.textReserveSpace;
        const alwaysOnTop =
            technique.alwaysOnTop === undefined
                ? DEFAULT_LABELED_ICON.alwaysOnTop
                : technique.alwaysOnTop;
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

        const featureId = DEFAULT_LABELED_ICON.featureId;
        const textElement = new TextElement(
            label,
            position,
            priority,
            scale,
            xOffset,
            yOffset,
            featureId
        );

        textElement.mayOverlap = mayOverlap;
        textElement.reserveSpace = reserveSpace;
        textElement.alwaysOnTop = alwaysOnTop;

        // Set the userData of the TextElement to the geojsonProperties, then it will be available
        // for picking.
        if (geojsonProperties !== undefined) {
            textElement.userData = geojsonProperties;
        }

        const distanceScale = DEFAULT_TEXT_DISTANCE_SCALE;

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

        textElement.distanceScale = distanceScale;

        this.addUserTextElement(textElement);
    }
}
