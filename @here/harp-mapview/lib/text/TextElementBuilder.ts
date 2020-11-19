/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeMap,
    getFeatureId,
    getPropertyValue,
    IndexedTechniqueParams,
    MapEnv,
    TextTechnique
} from "@here/harp-datasource-protocol";
import {
    ContextualArabicConverter,
    TextLayoutStyle,
    TextRenderStyle
} from "@here/harp-text-canvas";
import { assert } from "@here/harp-utils";

import { TextElement } from "./TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "./TextElementsRenderer";
import { TileTextStyleCache } from "./TileTextStyleCache";

/**
 * Constructs {@link TextElement} objects from {@link @here/harp-datasource-protocol/Technique},
 * text and coordinates.
 */
export class TextElementBuilder {
    private m_priority?: number;
    private m_fadeNear?: number;
    private m_fadeFar?: number;
    private m_minZoomLevel?: number;
    private m_maxZoomLevel?: number;
    private m_distanceScale: number = DEFAULT_TEXT_DISTANCE_SCALE;
    private m_mayOverlap?: boolean;
    private m_reserveSpace?: boolean;
    private m_renderStyle?: TextRenderStyle;
    private m_layoutStype?: TextLayoutStyle;
    private m_technique?: TextTechnique & IndexedTechniqueParams;
    private m_xOffset?: number;
    private m_yOffset?: number;

    /**
     * Constructor
     *
     * @param m_env - The {@link @link @here/harp-datasource-protocol#MapEnv} used to evaluate
     * technique properties.
     * @param m_styleCache - To cache instances of {@link @here/harp-text-canvas/TextRenderStyle}
     * and {@link @here/harp-text-canvas/TextLayoutStyle}.
     */
    constructor(
        private readonly m_env: MapEnv,
        private readonly m_styleCache: TileTextStyleCache
    ) {}

    /**
     * Sets a technique that will be used to create text elements on subsequent calls to
     * {@link TextElementBuilder.build} until the next call to this method.
     *
     * @param technique - The {@link @here/harp-datasource-protocol/Technique}.
     */
    withTechnique(technique: TextTechnique & IndexedTechniqueParams): this {
        this.m_technique = technique;

        // Make sorting stable.
        this.m_priority = getPropertyValue(technique.priority, this.m_env) ?? 0;

        this.m_fadeNear = getPropertyValue(technique.fadeNear, this.m_env) ?? undefined;
        this.m_fadeFar = getPropertyValue(technique.fadeFar, this.m_env) ?? undefined;
        this.m_minZoomLevel = getPropertyValue(technique.minZoomLevel, this.m_env) ?? undefined;
        this.m_maxZoomLevel = getPropertyValue(technique.maxZoomLevel, this.m_env) ?? undefined;
        this.m_distanceScale = technique.distanceScale ?? DEFAULT_TEXT_DISTANCE_SCALE;
        this.m_mayOverlap = technique.mayOverlap === true;
        this.m_reserveSpace = technique.reserveSpace !== false;
        this.m_renderStyle = this.m_styleCache.getRenderStyle(technique);
        this.m_layoutStype = this.m_styleCache.getLayoutStyle(technique);
        this.m_xOffset = getPropertyValue(technique.xOffset, this.m_env);
        this.m_yOffset = getPropertyValue(technique.yOffset, this.m_env);

        return this;
    }

    /**
     * Creates a {@link TextElement} with the given properties.
     *
     * @param text - The text to be displayed.
     * @param points - The position(s) for the text element.
     * @param tileOffset - The TextElement's tile offset, see {@link Tile.offset}.
     * @param attributes - TextElement attribute map.
     * @param pathLengthSqr - Precomputed path length squared for path labels.
     */
    build(
        text: string,
        points: THREE.Vector3 | THREE.Vector3[],
        tileOffset: number,
        attributes?: AttributeMap,
        pathLengthSqr?: number
    ): TextElement {
        const featureId = getFeatureId(attributes);
        assert(this.m_technique !== undefined);
        assert(this.m_renderStyle !== undefined);
        assert(this.m_layoutStype !== undefined);

        const technique = this.m_technique!;
        const renderStyle = this.m_renderStyle!;
        const layoutStyle = this.m_layoutStype!;

        const textElement = new TextElement(
            ContextualArabicConverter.instance.convert(text),
            points,
            renderStyle,
            layoutStyle,
            this.m_priority,
            this.m_xOffset,
            this.m_yOffset,
            featureId,
            technique.style,
            this.m_fadeNear,
            this.m_fadeFar,
            tileOffset
        );
        textElement.minZoomLevel = this.m_minZoomLevel;
        textElement.maxZoomLevel = this.m_maxZoomLevel;
        textElement.distanceScale = this.m_distanceScale;
        textElement.mayOverlap = this.m_mayOverlap;
        textElement.reserveSpace = this.m_reserveSpace;
        textElement.kind = technique.kind;
        // Get the userData for text element picking.
        textElement.userData = attributes;
        textElement.textFadeTime = technique.textFadeTime;
        textElement.pathLengthSqr = pathLengthSqr;

        return textElement;
    }
}
