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
        forceContextLoss: () => undefined,
        info: { autoReset: true, reset: () => undefined },
        debug: { checkShaderErrors: true },
        capabilities: { isWebGL2: false }
    };
}
