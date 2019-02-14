/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The interface for the [[Pass]] class.
 */
export interface IPass {
    /**
     * Whether the [[Pass]] instance is active or not.
     * @default `true`.
     */
    enabled: boolean;

    /**
     * Whether the render method should target a WebGLRenderTarget instance, or the frame buffer.
     * @default `false`.
     */
    renderToScreen: boolean;

    /**
     * The resize method to extend in [[Pass]] implementations. It resizes the render targets. Call
     * on resize events.
     *
     * @param width Width to resize to.
     * @param height Height to resize to.
     */
    setSize(width: number, height: number): void;

    /**
     * The render method to extend in [[Pass]] implementations. This is the place where the desired
     * effects or render operations are executed.
     *
     * @param renderer The WebGLRenderer instance in use.
     * @param scene The scene to render.
     * @param camera The camera to render the scene through.
     * @param writeBuffer The optional WebGLRenderTarget instance to write to.
     * @param readBuffer The optional WebGLRenderTarget instance of a previous pass to write onto.
     * @param delta The time argument from the requestAnimationFrame.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        writeBuffer: THREE.WebGLRenderTarget | undefined,
        readBuffer: THREE.WebGLRenderTarget | undefined,
        delta?: number
    ): void;
}

/**
 * The base class to extend for further passes in [[MapView]], like the [[MSAARenderPass]], possibly
 * a text pass, an AO effect etc. `Pass` provides the core logic for both :
 * - render passes (proper scene renders),
 * - and shader passes (quad renders, i.e. effects added on top of the render output as a
 * postprocess).
 *
 * Even some shader passes still actually fall within the render pass category as they need to
 * re-render the scene to then deduce an effect, such as masking, AO, DoF etc. Others just need the
 * previous input image to apply a shader on top of it, as for bloom or NVIDIA's FXAA for example.
 * These only are proper shader passes.
 */
export class Pass implements IPass {
    enabled: boolean = false;
    renderToScreen: boolean = false;
    // tslint:disable-next-line:no-unused-variable
    setSize(width: number, height: number) {
        // Implemented in sub-classes.
    }
    // tslint:disable:no-unused-variable
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        writeBuffer: THREE.WebGLRenderTarget | undefined,
        readBuffer: THREE.WebGLRenderTarget | undefined,
        delta?: number
    ) {
        // Implemented in sub-classes.
    }
    // tslint:enable:no-unused-variable
}
