/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from "sinon";

interface Size {
    width: number;
    height: number;
}
const size: Size = { width: 0, height: 0 };
function setSize(w: number, h: number): void {
    size.width = w;
    size.height = h;
}
function getSize(): { width: number; height: number } {
    return size;
}

/**
 * Helper function to return options required for stub when mocking the WebGLRenderer
 * @param sandbox - The sinon sandbox
 * @param clearColorStub - The stub for clearing the color
 */
export function getWebGLRendererStub(sandbox: sinon.SinonSandbox, clearColorStub: sinon.SinonStub) {
    return {
        getClearColor: () => undefined,
        setClearColor: clearColorStub,
        setSize,
        getSize,
        getPixelRatio: () => undefined,
        setPixelRatio: () => undefined,
        clear: () => undefined,
        render: () => undefined,
        dispose: () => undefined,
        info: { autoReset: true, reset: () => undefined },
        debug: { checkShaderErrors: true }
    };
}

export function getWebGLContextStub() {
    // tslint:disable-next-line: no-empty
    const noop = () => {};

    return {
        getParameter: (param: number) => {
            switch (param) {
                case 7938:
                    return "WebGL 1";
                default:
                    return {};
            }
        },
        getExtension: (extensionName: string) => {
            // Support all extensions
            switch (extensionName) {
                case "OES_vertex_array_object": {
                    const oes_extension: OES_vertex_array_object = {
                        bindVertexArrayOES: noop,
                        createVertexArrayOES: () => {
                            return {};
                        },
                        deleteVertexArrayOES: noop,
                        isVertexArrayOES: () => true,
                        VERTEX_ARRAY_BINDING_OES: 42
                    };
                    return oes_extension;
                }
                default:
                    break;
            }
            const extension = {};
            // extension[extensionName] = noop;
            return extension;
        },
        createTexture: () => {
            return {};
        },
        activeTexture: noop,
        bindTexture: noop,
        texParameteri: noop,
        texImage2D: noop,
        createBuffer: () => {
            return {};
        },
        bindBuffer: noop,
        bufferData: noop,
        bufferSubData: noop,
        createProgram: () => {
            return {};
        },
        deleteProgram: noop,
        createShader: () => {
            return {};
        },
        compileShader: noop,
        shaderSource: noop,
        attachShader: noop,
        linkProgram: noop,
        getProgramInfoLog: () => "",
        getShaderInfoLog: () => "",
        getProgramParameter: () => {
            return true;
        },
        getActiveAttrib: () => {
            return {};
        },
        getAttribLocation: () => {
            return 0;
        },
        getActiveUniform: () => {
            return { name: "someName" };
        },
        getUniformLocation: () => {
            return {};
        },
        deleteShader: noop,
        useProgram: noop,
        clearColor: noop,
        clearDepth: noop,
        clearStencil: noop,
        clear: noop,
        enable: noop,
        disable: noop,
        colorMask: noop,
        depthMask: noop,
        depthFunc: noop,
        stencilMask: noop,
        stencilFunc: noop,
        stencilOp: noop,
        frontFace: noop,
        cullFace: noop,
        scissor: noop,
        viewport: noop,
        cancelAnimationFrame: noop,
        drawElements: noop,
        drawArrays: noop,
        blendEquation: noop,
        blendEquationSeparate: noop,
        blendFuncSeparate: noop,
        lineWidth: noop,
        createFramebuffer: () => {
            return {};
        },
        bindFramebuffer: noop,
        framebufferTexture2D: noop
    };
}
