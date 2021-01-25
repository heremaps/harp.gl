/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { ImageTexture, LineMarkerTechnique, PoiTechnique } from "@here/harp-datasource-protocol";
import * as THREE from "three";

import { ImageItem } from "../lib/image/Image";
import { BoxBuffer } from "../lib/poi/BoxBuffer";
import { PoiBuffer, PoiLayer } from "../lib/poi/PoiRenderer";
import { PoiInfo, TextElement } from "../lib/text/TextElement";

export class PoiInfoBuilder {
    static readonly DEF_ICON_TEXT_MIN_ZL: number = 0;
    static readonly DEF_ICON_TEXT_MAX_ZL: number = 20;
    static readonly DEF_TEXT_OPT: boolean = false;
    static readonly DEF_ICON_OPT: boolean = false;
    static readonly DEF_MAY_OVERLAP: boolean = false;
    static readonly DEF_RESERVE_SPACE: boolean = true;
    static readonly DEF_VALID: boolean = true;
    static readonly DEF_RENDER_ON_MOVE: boolean = true;
    static readonly DEF_WIDTH_HEIGHT: number = 10;
    static readonly POI_TECHNIQUE: PoiTechnique = {
        name: "labeled-icon",
        renderOrder: 0
    };

    static readonly LINE_MARKER_TECHNIQUE: LineMarkerTechnique = {
        name: "line-marker",
        renderOrder: 0
    };

    static readonly DEF_TECHNIQUE = PoiInfoBuilder.POI_TECHNIQUE;
    static readonly DEF_IMAGE_TEXTURE_NAME = "dummy";

    private readonly m_iconMinZl: number = PoiInfoBuilder.DEF_ICON_TEXT_MIN_ZL;
    private readonly m_iconMaxZl: number = PoiInfoBuilder.DEF_ICON_TEXT_MAX_ZL;
    private readonly m_textMinZl: number = PoiInfoBuilder.DEF_ICON_TEXT_MIN_ZL;
    private readonly m_textMaxZl: number = PoiInfoBuilder.DEF_ICON_TEXT_MAX_ZL;
    private m_textOpt: boolean = PoiInfoBuilder.DEF_TEXT_OPT;
    private m_iconOpt: boolean = PoiInfoBuilder.DEF_ICON_OPT;
    private m_mayOverlap: boolean = PoiInfoBuilder.DEF_MAY_OVERLAP;
    private readonly m_reserveSpace: boolean = PoiInfoBuilder.DEF_RESERVE_SPACE;
    private m_valid: boolean = PoiInfoBuilder.DEF_VALID;
    private readonly m_renderOnMove: boolean = PoiInfoBuilder.DEF_RENDER_ON_MOVE;
    private readonly m_width: number = PoiInfoBuilder.DEF_WIDTH_HEIGHT;
    private readonly m_height: number = PoiInfoBuilder.DEF_WIDTH_HEIGHT;
    private m_technique: PoiTechnique | LineMarkerTechnique = PoiInfoBuilder.DEF_TECHNIQUE;
    private m_imageTextureName: string | undefined = PoiInfoBuilder.DEF_IMAGE_TEXTURE_NAME;
    private m_imageTexture?: ImageTexture;
    private m_renderOrder: number = 0;
    private m_imageItem?: ImageItem;

    withPoiTechnique(): PoiInfoBuilder {
        this.m_technique = { ...PoiInfoBuilder.POI_TECHNIQUE };
        return this;
    }

    withLineMarkerTechnique(): PoiInfoBuilder {
        this.m_technique = { ...PoiInfoBuilder.LINE_MARKER_TECHNIQUE };
        return this;
    }

    withIconOffset(x: number, y: number): PoiInfoBuilder {
        this.m_technique.iconXOffset = x;
        this.m_technique.iconYOffset = y;
        return this;
    }

    withMayOverlap(mayOverlap: boolean): PoiInfoBuilder {
        this.m_mayOverlap = mayOverlap;
        return this;
    }

    withIconOptional(iconOptional: boolean): PoiInfoBuilder {
        this.m_iconOpt = iconOptional;
        return this;
    }

    withIconValid(iconValid: boolean): PoiInfoBuilder {
        this.m_valid = iconValid;
        return this;
    }

    withTextOptional(textOptional: boolean): PoiInfoBuilder {
        this.m_textOpt = textOptional;
        return this;
    }

    withImageTextureName(name?: string): PoiInfoBuilder {
        this.m_imageTextureName = name;
        return this;
    }

    withImageTexture(imageTexture: ImageTexture): PoiInfoBuilder {
        this.m_imageTexture = imageTexture;
        return this;
    }

    withRenderOrder(renderOrder: number): PoiInfoBuilder {
        this.m_renderOrder = renderOrder;
        return this;
    }

    withImageItem(): PoiInfoBuilder {
        this.m_imageItem = new ImageItem("dummy", {
            height: this.m_height,
            width: this.m_width,
            data: new Uint8ClampedArray(this.m_height * this.m_width * 4)
        });

        return this;
    }

    build(textElement: TextElement): PoiInfo {
        return {
            technique: this.m_technique,
            imageTextureName: this.m_imageTextureName,
            imageTexture: this.m_imageTexture,
            imageItem: this.m_imageItem,
            iconMinZoomLevel: this.m_iconMinZl,
            iconMaxZoomLevel: this.m_iconMaxZl,
            textMinZoomLevel: this.m_textMinZl,
            textMaxZoomLevel: this.m_textMaxZl,
            textIsOptional: this.m_textOpt,
            iconIsOptional: this.m_iconOpt,
            mayOverlap: this.m_mayOverlap,
            reserveSpace: this.m_reserveSpace,
            isValid: this.m_valid,
            renderTextDuringMovements: this.m_renderOnMove,
            computedWidth: this.m_width,
            computedHeight: this.m_height,
            textElement,
            renderOrder: this.m_renderOrder,
            buffer: new PoiBuffer(new BoxBuffer(new THREE.Material()), {} as PoiLayer, () => {})
        };
    }
}
