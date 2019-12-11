/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    TextLayoutParameters,
    TextRenderParameters,
    TextRenderStyle
} from "@here/harp-text-canvas";
import * as THREE from "three";
import { TextElement } from "../lib/text/TextElement";
import { PoiInfoBuilder } from "./PoiInfoBuilder";

export const DEF_TEXT: string = "Text";
export const DEF_RENDER_PARAMS: TextRenderParameters = {};
export const DEF_LAYOUT_PARAMS: TextLayoutParameters = {};
export const DEF_PRIORITY: number = 0;
export const DEF_POSITION = new THREE.Vector3(0, 0, 0);
export const DEF_PATH = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.1, 0)];
export const DEF_IGNORE_DISTANCE: boolean = true;
const DEF_TILE_CENTER = new THREE.Vector3(0, 0, 0.1);

export function pointTextBuilder(text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder().withText(text).withPositionVec(DEF_POSITION);
}

export function poiBuilder(text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder()
        .withText(text)
        .withPositionVec(DEF_POSITION.clone())
        .withPoiInfo(new PoiInfoBuilder().withPoiTechnique());
}

export function pathTextBuilder(text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder()
        .withText(text)
        .withPath(DEF_PATH.map((point: THREE.Vector3) => point.clone()));
}

export function lineMarkerBuilder(text: string = DEF_TEXT): TextElementBuilder {
    return new TextElementBuilder()
        .withText(text)
        .withPath(DEF_PATH.map((point: THREE.Vector3) => point.clone()))
        .withPoiInfo(new PoiInfoBuilder().withLineMarkerTechnique());
}

export class TextElementBuilder {
    private m_text: string = DEF_TEXT;
    private m_priority: number = DEF_PRIORITY;
    private m_points: THREE.Vector3 | THREE.Vector3[] = DEF_POSITION.clone();
    private m_ignoreDistance: boolean = DEF_IGNORE_DISTANCE;
    private m_poiInfoBuilder: PoiInfoBuilder | undefined;
    private m_xOffset: number | undefined;
    private m_yOffset: number | undefined;

    withPoiInfo(poiInfoBuilder: PoiInfoBuilder): TextElementBuilder {
        this.m_poiInfoBuilder = poiInfoBuilder;
        return this;
    }

    withText(text: string): TextElementBuilder {
        this.m_text = text;
        return this;
    }

    withPriority(priority: number): TextElementBuilder {
        this.m_priority = priority;
        return this;
    }

    withPosition(x: number, y: number, z: number = 0): TextElementBuilder {
        this.m_points = new THREE.Vector3(x, y, z).add(DEF_TILE_CENTER);
        return this;
    }

    withPositionVec(position: THREE.Vector3): TextElementBuilder {
        this.m_points = position.add(DEF_TILE_CENTER);
        return this;
    }

    withPath(path: THREE.Vector3[]): TextElementBuilder {
        for (const point of path) {
            point.add(DEF_TILE_CENTER);
        }
        this.m_points = path;
        return this;
    }

    withIgnoreDistance(ignoreDistance: boolean): TextElementBuilder {
        this.m_ignoreDistance = ignoreDistance;
        return this;
    }

    withOffset(x: number, y: number): TextElementBuilder {
        this.m_xOffset = x;
        this.m_yOffset = y;
        return this;
    }

    build(sandbox: sinon.SinonSandbox): TextElement {
        const textElement = new TextElement(
            this.m_text,
            this.m_points,
            DEF_RENDER_PARAMS,
            DEF_LAYOUT_PARAMS,
            this.m_priority,
            this.m_xOffset,
            this.m_yOffset
        );
        textElement.ignoreDistance = this.m_ignoreDistance;
        if (this.m_poiInfoBuilder !== undefined) {
            textElement.poiInfo = this.m_poiInfoBuilder.build(textElement);
        }
        // Stub render style setter, so that a spy is installed on the style opacity
        // whenever it's called.
        const renderStyleProperty = Object.getOwnPropertyDescriptor(
            TextElement.prototype,
            "renderStyle"
        )!;
        sandbox.stub(textElement, "renderStyle").set((style: TextRenderStyle) => {
            sandbox.spy(style, "opacity", ["set"]);
            return renderStyleProperty.set!.call(textElement, style);
        });
        sandbox.stub(textElement, "renderStyle").get(renderStyleProperty.get!);
        return textElement;
    }
}
