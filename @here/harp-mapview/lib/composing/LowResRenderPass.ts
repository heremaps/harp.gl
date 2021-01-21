/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { CopyMaterial, CopyShader } from "@here/harp-materials";
import * as THREE from "three";

import { Pass } from "./Pass";

/**
 * The `LowResRenderPass` renders the scene at a lower resolution into an internal
 * `WebGLRenderTarget`, and then copies the result into the frame buffer. The size of the internal
 * buffer is determined by the current frame buffer size multiplied by `pixelRatio`.
 *
 * @note Since no anti-aliasing is applied during dynamic rendering, visual artifacts may be
 * visible.
 */
export class LowResRenderPass extends Pass {
    private m_renderTarget: THREE.WebGLRenderTarget | null = null;
    private readonly m_localCamera: THREE.OrthographicCamera = new THREE.OrthographicCamera(
        -1,
        1,
        1,
        -1,
        0,
        1
    );

    private readonly m_quadScene: THREE.Scene = new THREE.Scene();
    private readonly m_quadUniforms: { [uniformName: string]: THREE.IUniform } =
        CopyShader.uniforms;

    private readonly m_quadMaterial: THREE.ShaderMaterial = new CopyMaterial(this.m_quadUniforms);
    private readonly m_quad: THREE.Mesh = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(2, 2),
        this.m_quadMaterial
    );

    private m_pixelRatio: number | undefined;
    private m_savedWidth = 0;
    private m_savedHeight = 0;

    /**
     * The constructor for `LowResRenderPass`. It builds an internal scene with a camera looking at
     * a quad.
     *
     * @param lowResPixelRatio - The `pixelRatio` determines the resolution of the internal
     *  `WebGLRenderTarget`. Values between 0.5 and `window.devicePixelRatio` can be tried to give
     * good results. A value of `undefined` disables the low res render pass. The value should not
     * be larger than`window.devicePixelRatio`.
     */
    constructor(public lowResPixelRatio?: number) {
        super();
        this.m_quad.frustumCulled = false;
        this.m_quadScene.add(this.m_quad);
        this.m_pixelRatio = lowResPixelRatio;
    }

    /**
     * Releases all used resources.
     */
    dispose() {
        this.m_quadMaterial.dispose();
        this.m_quad.geometry.dispose();
        if (this.m_renderTarget !== null) {
            this.m_renderTarget.dispose();
            this.m_renderTarget = null;
        }
    }

    /**
     * If a value is specified, a low resolution render pass is used to render the scene into a
     * low resolution render target, before it is copied to the screen.
     *
     * A value of `undefined` disables the low res render pass. The value should not be larger than
     * `window.devicePixelRatio`.
     *
     * @default `undefined`
     */
    set pixelRatio(ratio: number | undefined) {
        this.m_pixelRatio = ratio;
        if (this.m_renderTarget && this.pixelRatio !== undefined) {
            this.m_renderTarget.setSize(
                Math.floor(this.m_savedWidth * this.pixelRatio),
                Math.floor(this.m_savedHeight * this.pixelRatio)
            );
        }
    }

    get pixelRatio(): number | undefined {
        return this.m_pixelRatio;
    }

    /**
     * The render function of `LowResRenderPass`. It renders the whole scene into an internal
     * `WebGLRenderTarget` instance with a lower resolution, using the passed in `WebGLRenderer`.
     * The low resolution image is then copied to the `writeBuffer`, which is `undefined` in case it
     * is the screen.
     *
     * @param renderer - The ThreeJS WebGLRenderer instance to render the scene with.
     * @param scene - The ThreeJS Scene instance to render the scene with.
     * @param camera - The ThreeJS Camera instance to render the scene with.
     * @param writeBuffer - A ThreeJS WebGLRenderTarget instance to render the scene to.
     * @param readBuffer - A ThreeJS WebGLRenderTarget instance to render the scene.
     * @override
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        writeBuffer: THREE.WebGLRenderTarget | null,
        readBuffer: THREE.WebGLRenderTarget
    ) {
        if (!this.enabled || this.pixelRatio === undefined) {
            return;
        }

        // Initiates the local render target with the read buffer's dimensions, if not available.
        if (this.m_renderTarget === null) {
            this.m_savedWidth = readBuffer.width;
            this.m_savedHeight = readBuffer.height;
            this.m_renderTarget = new THREE.WebGLRenderTarget(
                Math.floor(this.m_savedWidth * this.pixelRatio),
                Math.floor(this.m_savedHeight * this.pixelRatio),
                {
                    minFilter: THREE.LinearFilter,
                    magFilter: THREE.LinearFilter,
                    format: THREE.RGBAFormat,
                    depthBuffer: true,
                    stencilBuffer: true
                }
            );
            this.m_renderTarget.texture.name = "LowResRenderPass.sample";
        }

        this.m_quadUniforms.tDiffuse.value = this.m_renderTarget.texture;
        this.m_quadUniforms.opacity.value = 1.0;

        const oldRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.m_renderTarget);
        renderer.clear();
        // Render into the low resolution internal render target.
        renderer.render(scene, camera);

        // Render the low resolution target into the screen.
        // NOTE: three.js doesn't like undefined as renderTarget, but works with `null`
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        renderer.clear();
        renderer.render(this.m_quadScene, this.m_localCamera);
        renderer.setRenderTarget(oldRenderTarget);
    }

    /**
     * Resize the internal render target to match the new size specified. The size of internal
     * buffer depends on the `pixelRatio`.
     *
     * @param width - New width to apply to the render target.
     * @param height - New height to apply to the render target.
     * @override
     */
    setSize(width: number, height: number) {
        this.m_savedWidth = width;
        this.m_savedHeight = height;
        if (this.m_renderTarget && this.pixelRatio !== undefined) {
            this.m_renderTarget.setSize(
                Math.floor(width * this.pixelRatio),
                Math.floor(height * this.pixelRatio)
            );
        }
    }
}
