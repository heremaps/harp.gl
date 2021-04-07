/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    composeTechniqueTextureName,
    Env,
    getPropertyValue,
    IndexedTechniqueParams,
    LineMarkerTechnique,
    MapEnv,
    PoiTechnique
} from "@here/harp-datasource-protocol";
import { assert, LoggerManager } from "@here/harp-utils";

import { ColorCache } from "../ColorCache";
import { PoiInfo, TextElement } from "../text/TextElement";

const logger = LoggerManager.instance.create("PoiBuilder");

function getImageTexture(technique: PoiTechnique | LineMarkerTechnique, env: MapEnv | Env) {
    return technique.imageTexture !== undefined
        ? composeTechniqueTextureName(getPropertyValue(technique.imageTexture, env), technique)
        : undefined;
}

/**
 * Constructs {@link PoiInfo} objects from {@link @here/harp-datasource-protocol/Technique} and
 * an icon.
 */
export class PoiBuilder {
    private m_iconMinZoomLevel?: number;
    private m_iconMaxZoomLevel?: number;
    private m_textMinZoomLevel?: number;
    private m_textMaxZoomLevel?: number;
    private m_technique?: (PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams;
    private m_imageTextureName?: string;
    private m_shieldGroupIndex?: number;

    /**
     * Constructor
     *
     * @param m_env - The {@link @link @here/harp-datasource-protocol#MapEnv} used to evaluate
     * technique properties.
     */
    constructor(private readonly m_env: MapEnv | Env) {}

    /**
     * Sets a technique that will be used to create PoiInfos on subsequent calls to
     * {@link PoiBuilder.build} until the next call to this method.
     *
     * @param technique - The {@link @here/harp-datasource-protocol/Technique}.
     * @return This builder.
     */
    withTechnique(technique: (PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams): this {
        this.m_imageTextureName = getImageTexture(technique, this.m_env);

        this.m_iconMinZoomLevel =
            getPropertyValue(technique.iconMinZoomLevel ?? technique.minZoomLevel, this.m_env) ??
            undefined;
        this.m_iconMaxZoomLevel =
            getPropertyValue(technique.iconMaxZoomLevel ?? technique.maxZoomLevel, this.m_env) ??
            undefined;
        this.m_textMinZoomLevel =
            getPropertyValue(technique.textMinZoomLevel ?? technique.minZoomLevel, this.m_env) ??
            undefined;
        this.m_textMaxZoomLevel =
            getPropertyValue(technique.textMaxZoomLevel ?? technique.maxZoomLevel, this.m_env) ??
            undefined;

        this.m_technique = technique;
        return this;
    }

    /**
     * Sets an icon that will be used to create PoiInfos on subsequent calls to
     * {@link PoiBuilder.build} until the next call to this method.
     *
     * @param imageTextureName - The name of the icon image. If undefined, the image defined by the
     * technique set on the last call to {@link PoiBuilder.withTechnique} wil be used.
     * @param shieldGroupIndex - Index to a shield group if the icon belongs to one.
     * @return This builder.
     */
    withIcon(imageTextureName?: string, shieldGroupIndex?: number): this {
        if (imageTextureName !== undefined) {
            this.m_imageTextureName = imageTextureName;
        }
        this.m_shieldGroupIndex = shieldGroupIndex;
        return this;
    }

    /**
     * Creates a {@link PoiInfo} for the given {@link TextElement}.
     *
     * @param textElement - The text element the poi info will be attached to.
     * @return The created PoiInfo or undefined if no icon image was set for it.
     */
    build(textElement: TextElement): PoiInfo | undefined {
        assert(this.m_technique !== undefined);
        const technique = this.m_technique!;
        const env = this.m_env;
        const imageTextureName = this.m_imageTextureName;

        // The POI name to be used is taken from the data, since it will
        // specify the name of the texture to use.

        // The POI name in the technique may override the POI name from the
        // data.
        const poiName =
            technique.poiTable !== undefined ? technique.poiName ?? imageTextureName : undefined;

        if (imageTextureName !== undefined && poiName !== undefined) {
            logger.warn(
                "Possible duplicate POI icon definition via imageTextureName and poiTable!"
            );
        }

        if (imageTextureName === undefined && poiName === undefined) {
            textElement.minZoomLevel = textElement.minZoomLevel ?? this.m_textMinZoomLevel;
            textElement.maxZoomLevel = textElement.maxZoomLevel ?? this.m_textMaxZoomLevel;

            return undefined;
        }

        const textIsOptional = technique.textIsOptional === true;
        const iconIsOptional = technique.iconIsOptional === true;
        const renderTextDuringMovements = !(technique.renderTextDuringMovements === false);
        const iconMayOverlap = technique.iconMayOverlap ?? technique.textMayOverlap;

        const iconReserveSpace = technique.iconReserveSpace ?? technique.textReserveSpace;
        const iconColorRaw = getPropertyValue(technique.iconColor, env);
        const iconColor =
            iconColorRaw !== null ? ColorCache.instance.getColor(iconColorRaw) : undefined;

        const poiInfo = {
            technique,
            imageTextureName,
            poiTableName: technique.poiTable,
            poiName,
            shieldGroupIndex: this.m_shieldGroupIndex,
            textElement,
            textIsOptional,
            iconIsOptional,
            renderTextDuringMovements,
            mayOverlap: iconMayOverlap,
            reserveSpace: iconReserveSpace,
            iconBrightness: technique.iconBrightness,
            iconColor,
            iconMinZoomLevel: this.m_iconMinZoomLevel,
            iconMaxZoomLevel: this.m_iconMaxZoomLevel,
            textMinZoomLevel: this.m_textMinZoomLevel,
            textMaxZoomLevel: this.m_textMaxZoomLevel
        };

        return poiInfo;
    }
}
