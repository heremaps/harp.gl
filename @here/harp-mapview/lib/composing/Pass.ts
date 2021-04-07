/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * The interface for the {@link Pass} class.
 */
export interface IPass {
    /**
     * Whether the {@link Pass} instance is active or not.
     * @default `true`.
     */
    enabled: boolean;

    /**
     * Whether the render method should target a WebGLRenderTarget instance, or the frame buffer.
     * @default `false`.
     */
    renderToScreen: boolean;

    /**
     * The resize method to extend in {@link Pass} implementations.
     *
     * @remarks
     * It resizes the render targets. Call on resize events.
     *
     * @param width - Width to resize to.
     * @param height - Height to resize to.
     */
    setSize(width: number, height: number): void;

    /**
     * The render method to extend in {@link Pass} implementations.
     *
     * @remarks
     * This is the place where the desired
     * effects or render operations are executed.
     *
     * @param renderer - The WebGLRenderer instance in use.
     * @param scene - The scene to render.
     * @param camera - The camera to render the scene through.
     * @param writeBuffer - The optional WebGLRenderTarget instance to write to.
     * @param readBuffer - The optional WebGLRenderTarget instance of a previous pass to write onto.
     * @param delta - The time argument from the requestAnimationFrame.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        writeBuffer: THREE.WebGLRenderTarget | null,
        readBuffer: THREE.WebGLRenderTarget | null,
        delta?: number
    ): void;
}

/**
 * The base class to extend for further passes in {@link MapView},
 * like the {@link MSAARenderPass},
 *
 * @remarks
 * `Pass` provides the core logic for both :
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
    setSize(width: number, height: number) {
        // Implemented in sub-classes.
    }

    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        writeBuffer: THREE.WebGLRenderTarget | null,
        readBuffer: THREE.WebGLRenderTarget | null,
        delta?: number
    ) {
        // Implemented in sub-classes.
    }
}

/**
 * The pass that does a default normal scene rendering for further post-effects.
 */
export class RenderPass extends Pass {
    constructor() {
        super();
    }

    /** @override */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        writeBuffer: THREE.WebGLRenderTarget | null,
        readBuffer: THREE.WebGLRenderTarget | null
    ) {
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        renderer.render(scene, camera);
    }
}

/**
 * The base class to extend for post-effects on the final render (like Vignette, Sepia, color
 * correction...)
 */
export class ShaderPass extends Pass {
    uniforms: { [uniform: string]: THREE.IUniform };
    material: THREE.Material;
    fsQuad: FullScreenQuad;
    constructor(shader: THREE.Shader, private readonly textureID: string = "tDiffuse") {
        super();
        if (shader instanceof THREE.ShaderMaterial) {
            this.uniforms = shader.uniforms;
            this.material = shader;
        } else {
            this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
            this.material = new THREE.ShaderMaterial({
                defines: { ...(shader as any).defines },
                uniforms: this.uniforms,
                vertexShader: shader.vertexShader,
                fragmentShader: shader.fragmentShader
            });
        }
        this.fsQuad = new FullScreenQuad(this.material);
    }

    /** @override */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        writeBuffer: THREE.WebGLRenderTarget,
        readBuffer: THREE.WebGLRenderTarget,
        delta?: number
    ) {
        if (this.uniforms[this.textureID]) {
            this.uniforms[this.textureID].value = readBuffer.texture;
        }
        this.fsQuad.material = this.material;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.fsQuad.render(renderer);
    }
}

class FullScreenQuad {
    private m_mesh: THREE.Mesh;
    private readonly m_camera: THREE.Camera;
    constructor(material: THREE.Material) {
        this.m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneBufferGeometry(2, 2);
        this.m_mesh = new THREE.Mesh(geometry, material);
    }

    get material(): THREE.Material {
        return this.m_mesh.material as THREE.Material;
    }

    set material(value: THREE.Material) {
        this.m_mesh.material = value;
    }

    render(renderer: THREE.WebGLRenderer) {
        renderer.render((this.m_mesh as any) as THREE.Scene, this.m_camera);
    }
}
