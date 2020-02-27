/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    ColorUtils,
    Env,
    Expr,
    getFeatureId,
    getPropertyValue,
    isTextGeometry,
    isTextPathGeometry,
    MapEnv,
    TextGeometry,
    TextPathGeometry,
    TextTechnique
} from "@here/harp-datasource-protocol";
import {
    ContextualArabicConverter,
    TextLayoutStyle,
    TextRenderStyle
} from "@here/harp-text-canvas";
import { evaluateColorProperty } from "../DecodedTileHelpers";
import { TextElement } from "../text/TextElement";
import { DEFAULT_TEXT_DISTANCE_SCALE } from "../text/TextElementsRenderer";
import { Tile } from "../Tile";
import { techniqueHandlers, TechniqueUpdateContext } from "./TechniqueHandler";
import { ScreenSpaceTechniqueHandlerBase, TechniqueHandlerCommon } from "./TechniqueHandlerCommon";

export class TextTechniqueHandler extends ScreenSpaceTechniqueHandlerBase<TextTechnique> {
    private priority: number;
    private fadeFar: number;
    private fadeNear: number;

    private textRenderStyle: TextRenderStyle;
    private textLayoutStyle: TextLayoutStyle;
    private discreteZoomEnv: Env;

    constructor(technique: TextTechnique, tile: Tile, context: TechniqueUpdateContext) {
        super(technique);

        const mapView = tile.mapView;
        const zoomLevel = mapView.zoomLevel;
        const discreteZoomLevel = Math.floor(zoomLevel);
        this.discreteZoomEnv = new MapEnv({ $zoom: discreteZoomLevel }, context.env);

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
    addScreenSpaceObject(tile: Tile, text: TextGeometry | TextPathGeometry): TextElement[] {
        const result: TextElement[] = [];
        if (isTextGeometry(text)) {
            this.addTextGeometry(tile, text, result);
        } else if (isTextPathGeometry(text)) {
            this.addTextPathGeometry(tile, text, result);
        }
        for (const textElement of result) {
            this.objects.push({
                object: textElement,
                tile
            });
        }
        return result;
    }

    private addTextGeometry(tile: Tile, text: TextGeometry, result: TextElement[]) {
        if (text.stringCatalog === undefined) {
            return;
        }
        const worldOffsetX = tile.computeWorldOffsetX();
        const mapView = tile.mapView;
        const technique = this.technique;

        const positions = new THREE.BufferAttribute(
            new Float32Array(text.positions.buffer),
            text.positions.itemCount
        );

        const numPositions = positions.count;
        if (numPositions < 1) {
            return;
        }

        for (let i = 0; i < numPositions; ++i) {
            const x = positions.getX(i) + worldOffsetX;
            const y = positions.getY(i);
            const z = positions.getZ(i);
            const label = text.stringCatalog[text.texts[i]];
            if (label === undefined) {
                // skip missing labels
                continue;
            }

            const userData = text.objInfos !== undefined ? text.objInfos[i] : undefined;
            const featureId = getFeatureId(userData);

            const textElement = new TextElement(
                ContextualArabicConverter.instance.convert(label!),
                new THREE.Vector3(x, y, z),
                this.textRenderStyle,
                this.textLayoutStyle,
                this.priority,
                technique.xOffset || 0.0,
                technique.yOffset || 0.0,
                featureId,
                technique.style,
                undefined,
                undefined,
                tile.offset
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
            textElement.kind = technique.kind;

            textElement.fadeNear = this.fadeNear;
            textElement.fadeFar = this.fadeFar;

            // Get the userData for text element picking.
            textElement.userData = userData;

            tile.addTextElement(textElement);

            result.push(textElement);
        }
    }

    private addTextPathGeometry(tile: Tile, textPath: TextPathGeometry, result: TextElement[]) {
        const worldOffsetX = tile.computeWorldOffsetX();
        const mapView = tile.mapView;
        const technique = this.technique;

        const path: THREE.Vector3[] = [];
        for (let i = 0; i < textPath.path.length; i += 3) {
            path.push(
                new THREE.Vector3(
                    textPath.path[i] + worldOffsetX,
                    textPath.path[i + 1],
                    textPath.path[i + 2]
                )
            );
        }

        const userData = textPath.objInfos;
        const featureId = getFeatureId(userData);
        const textElement = new TextElement(
            ContextualArabicConverter.instance.convert(textPath.text),
            path,
            this.textRenderStyle,
            this.textLayoutStyle,
            this.priority,
            technique.xOffset !== undefined ? technique.xOffset : 0.0,
            technique.yOffset !== undefined ? technique.yOffset : 0.0,
            featureId,
            technique.style,
            this.fadeNear,
            this.fadeFar,
            tile.offset
        );
        textElement.pathLengthSqr = textPath.pathLengthSqr;
        textElement.minZoomLevel =
            technique.minZoomLevel !== undefined ? technique.minZoomLevel : mapView.minZoomLevel;
        textElement.maxZoomLevel =
            technique.maxZoomLevel !== undefined ? technique.maxZoomLevel : mapView.maxZoomLevel;
        textElement.distanceScale =
            technique.distanceScale !== undefined
                ? technique.distanceScale
                : DEFAULT_TEXT_DISTANCE_SCALE;
        textElement.mayOverlap = technique.mayOverlap === true;
        textElement.reserveSpace = technique.reserveSpace !== false;
        textElement.kind = technique.kind;
        // Get the userData for text element picking.
        textElement.userData = textPath.objInfos;

        result.push(textElement);
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

techniqueHandlers.text = TextTechniqueHandler;
