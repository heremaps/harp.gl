/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AdditionParameters,
    FontCatalog,
    GlyphData,
    MeasurementParameters,
    TextBufferAdditionParameters,
    TextBufferObject,
    TextCanvas
} from "@here/harp-text-canvas";
import * as sinon from "sinon";
import * as THREE from "three";

import { TextCanvasFactory } from "../lib/text/TextCanvasFactory";

/**
 * Creates a TextCanvas stub.
 * @param sandbox - Sinon sandbox to keep track of created stubs.
 * @param addTextSpy - Spy that will be called when [[addText]] method is called.
 * @param addTextBufferObjSpy - Spy that will be called when [[addTextBufferObject]] method is
 *                              called on the created TextCanvas stub.
 * @param fontCatalog - Font catalog used by the created text canvas.
 * @param textWidthHeight - Text width and height used to compute bounds.
 * @returns TextCanvas stub.
 */
export function stubTextCanvas(
    sandbox: sinon.SinonSandbox,
    addTextSpy: sinon.SinonSpy,
    addTextBufferObjSpy: sinon.SinonSpy,
    fontCatalog: FontCatalog,
    textWidth: number,
    textHeight: number
): TextCanvas {
    const renderer = ({ capabilities: { isWebGL2: false } } as any) as THREE.WebGLRenderer;
    const textCanvas = new TextCanvas({
        renderer,
        fontCatalog,
        minGlyphCount: 1,
        maxGlyphCount: 1
    });

    // Workaround to capture the value of params.pickingData on the time of the call,
    // otherwise it's lost afterwards since the same parameter object is reused between calls.
    sandbox
        .stub(textCanvas, "addText")
        .callsFake(
            (
                _text: string | GlyphData[],
                _position: THREE.Vector3,
                params?: AdditionParameters
            ) => {
                if (params !== undefined) {
                    addTextSpy(params.pickingData, textCanvas.textRenderStyle.opacity);
                }
                return true;
            }
        );

    sandbox
        .stub(textCanvas, "measureText")
        .callsFake(
            (
                _text: string | GlyphData[],
                outputBounds: THREE.Box2,
                params: MeasurementParameters | undefined
            ) => {
                // Return a box centered on origin with dimensions DEF_TEXT_WIDTH_HEIGHT
                outputBounds.set(
                    new THREE.Vector2(-textWidth / 2, -textHeight / 2),
                    new THREE.Vector2(textWidth / 2, textHeight / 2)
                );
                // Same bbox for character bounds, as if text had a single character.
                if (params !== undefined && params.outputCharacterBounds !== undefined) {
                    params.outputCharacterBounds.push(outputBounds.clone());
                }
                return true;
            }
        );
    sandbox.stub(textCanvas, "createTextBufferObject").callsFake(() => {
        return new TextBufferObject([], new Float32Array());
    });
    // Workaround to capture the opacity on the time of the call,
    // otherwise it's lost afterwards since the same params object is used for all calls to this
    // method.
    sandbox
        .stub(textCanvas, "addTextBufferObject")
        .callsFake((textBufferObject: TextBufferObject, params?: TextBufferAdditionParameters) => {
            addTextBufferObjSpy(
                params?.pickingData,
                params?.opacity,
                params?.position?.toArray().slice(0, 2)
            );
            return true;
        });
    sandbox.stub(textCanvas, "render"); // do nothing.

    return textCanvas;
}

/**
 * Stubs text canvas factory.
 * @param sandbox - Sinon sandbox to keep track of created stubs.
 * @param textCanvas - The text canvas to be returned by the factory.
 * @returns TextCanvasFactory stub.
 */
export function stubTextCanvasFactory(
    sandbox: sinon.SinonSandbox,
    textCanvas: TextCanvas
): sinon.SinonStubbedInstance<TextCanvasFactory> {
    const textCanvasFactoryStub = sandbox.createStubInstance(TextCanvasFactory);
    textCanvasFactoryStub.createTextCanvas.returns((textCanvas as unknown) as TextCanvas);

    return textCanvasFactoryStub;
}
