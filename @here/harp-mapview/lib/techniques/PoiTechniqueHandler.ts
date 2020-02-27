/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ColorUtils,
    composeTechniqueTextureName,
    Env,
    Expr,
    getPropertyValue,
    isPoiTechnique,
    LineMarkerTechnique,
    MapEnv,
    PoiGeometry,
    PoiTechnique,
    TextGeometry,
    TextPathGeometry
} from "@here/harp-datasource-protocol";
import { TextLayoutStyle, TextRenderStyle } from "@here/harp-text-canvas";
import { assert } from "@here/harp-utils";
import { evaluateColorProperty } from "../DecodedTileHelpers";
import { TextElement } from "../text/TextElement";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext } from "./TechniqueHandler";
import { ScreenSpaceTechniqueHandlerBase, TechniqueHandlerCommon } from "./TechniqueHandlerCommon";

export class PoiTechniqueHandler extends ScreenSpaceTechniqueHandlerBase<
    PoiTechnique | LineMarkerTechnique
> {
    techniqueTextureName: string | undefined;
    priority: number;
    fadeFar: number;
    fadeNear: number;
    xOffset: number;
    yOffset: number;

    textRenderStyle: TextRenderStyle;
    textLayoutStyle: TextLayoutStyle;
    discreteZoomEnv: Env;

    constructor(technique: PoiTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique);
        assert(isPoiTechnique(technique));

        const mapView = tile.mapView;
        const zoomLevel = mapView.zoomLevel;
        const discreteZoomLevel = Math.floor(zoomLevel);
        this.discreteZoomEnv = new MapEnv({ $zoom: discreteZoomLevel }, context.env);

        this.techniqueTextureName =
            technique.imageTexture !== undefined
                ? composeTechniqueTextureName(technique.imageTexture, technique)
                : undefined;

        this.priority =
            technique.priority !== undefined
                ? getPropertyValue(technique.priority, this.discreteZoomEnv)
                : 0;
        this.fadeNear =
            technique.fadeNear !== undefined
                ? getPropertyValue(technique.fadeNear, this.discreteZoomEnv)
                : technique.fadeNear;
        this.fadeFar =
            technique.fadeFar !== undefined
                ? getPropertyValue(technique.fadeFar, this.discreteZoomEnv)
                : technique.fadeFar;

        this.xOffset = getPropertyValue(technique.xOffset, this.discreteZoomEnv);
        this.yOffset = getPropertyValue(technique.yOffset, this.discreteZoomEnv);

        // TODO, they shouldn't be cached at all!
        this.textRenderStyle = mapView.textElementsRenderer.styleCache.getRenderStyle(
            tile,
            technique
        );
        this.textLayoutStyle = mapView.textElementsRenderer.styleCache.getLayoutStyle(
            tile,
            technique
        );

        if (Expr.isExpr(technique.color) || Expr.isExpr(technique.opacity)) {
            this.updaters.push(this.updateColor.bind(this));
        }
        if (Expr.isExpr(technique.backgroundColor) || Expr.isExpr(technique.backgroundOpacity)) {
            this.updaters.push(this.updateBackgroundColor.bind(this));
        }
        if (Expr.isExpr(technique.size)) {
            this.updaters.push(this.updateSize.bind(this));
        }
    }

    /**
     * @override
     */
    addScreenSpaceObject(
        tile: Tile,
        object: TextGeometry | TextPathGeometry | PoiGeometry
    ): TextElement[] {
        // we're managing styles only, actual object creation is in PoiManager.addPois and friends.
        return [];
    }

    private updateColor(context: TechniqueUpdateContext) {
        let newColorHex = evaluateColorProperty(this.technique.color!, context.env);
        let newOpacity = getPropertyValue(this.technique.opacity, context.env) || 1;

        if (ColorUtils.hasAlphaInHex(newColorHex)) {
            const alpha = ColorUtils.getAlphaFromHex(newColorHex);
            newOpacity = newOpacity * alpha;
            newColorHex = ColorUtils.removeAlphaFromHex(newColorHex);
        }
        this.textRenderStyle.color.set(newColorHex);

        if (this.textRenderStyle.opacity !== newOpacity) {
            this.textRenderStyle.opacity = newOpacity;

            TechniqueHandlerCommon.forEachTileObject(this.objects, context, textElement => {
                textElement.visible = this.textRenderStyle.opacity > 0;
            });
        }
    }

    private updateBackgroundColor(context: TechniqueUpdateContext) {
        let newColorHex = evaluateColorProperty(this.technique.backgroundColor!, context.env);
        let newOpacity =
            getPropertyValue(
                this.technique.backgroundOpacity ?? this.technique.opacity,
                context.env
            ) || 1;

        if (ColorUtils.hasAlphaInHex(newColorHex)) {
            const alpha = ColorUtils.getAlphaFromHex(newColorHex);
            newOpacity = newOpacity * alpha;
            newColorHex = ColorUtils.removeAlphaFromHex(newColorHex);
        }
        this.textRenderStyle.backgroundColor.set(newColorHex);
        this.textRenderStyle.backgroundOpacity = newOpacity;
    }

    private updateSize(context: TechniqueUpdateContext) {
        const newSize = getPropertyValue(this.technique.size, context.env);
        if (newSize !== this.textRenderStyle.fontSize.size) {
            this.textRenderStyle.fontSize.size = newSize;
            TechniqueHandlerCommon.forEachTileObject(this.objects, context, textElement => {
                // TODO: This is experimental, it works, but not sure about performance.
                textElement.bounds = undefined;
                textElement.textBufferObject = undefined;
            });
        }
    }
}

techniqueHandlers["labeled-icon"] = PoiTechniqueHandler as any;
techniqueHandlers["line-marker"] = PoiTechniqueHandler as any;
