/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { CopyShader, MSAAMaterial } from "@here/harp-materials";
import * as THREE from "three";

import { Pass } from "./Pass";

/**
 * This enum represents the sampling level to apply to
 * a {@link MSAARenderPass} instance. At level 0,
 * only one sample is performed, which is like
 * disabling the MSAA pass.
 */
export enum MSAASampling {
    "Level_0",
    "Level_1",
    "Level_2",
    "Level_3",
    "Level_4",
    "Level_5"
}

/**
 * {@link MapView}'s MSAA implementation.
 *
 * @remarks
 * MSAA stands for Multi Sampling Anti-Aliasing, and its concept
 * is to provide a rendering engine with additional color values for each pixel, so they can include
 * the missing bits between them on a screen. WebGL already comes with a native MSAA implementation
 * with four samples. Because of its native nature, it is more efficient and one may not want to use
 * MapView's MSAA implementation when these four samples are satisfying. However in some situations
 * they are not: on low devices, MSAA can impact the framerate and we may desire to reduce the
 * number of samples at runtime. On the other hand, when the interaction stops, the engine also
 * stops rendering the map, and because a map relies on many line-like patterns, aliasing can then
 * turn very noticeable. In such static renders, the number of samples could be dramatically
 * increased on a last frame to render.
 */
export class MSAARenderPass extends Pass {
    /**
     * The sampling level determines the number of samples that will be performed per frame.
     * Renders will happen `2 ^ samplingLevel` time(s). `samplingLevel` stands between `0` and `5`.
     * Therefore there can be between 1 and 32 samples.
     *
     * @default `SamplingLevel.Level_1`
     */
    samplingLevel: MSAASampling = MSAASampling.Level_1;

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

    private readonly m_quadMaterial: THREE.ShaderMaterial = new MSAAMaterial(this.m_quadUniforms);
    private readonly m_quad: THREE.Mesh = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(2, 2),
        this.m_quadMaterial
    );

    private readonly m_tmpColor = new THREE.Color();

    /**
     * The constructor for `MSAARenderPass`. It builds an internal scene with a camera looking at a
     * quad.
     *
     * @param m_scene - The scene to render.
     * @param m_camera - The camera to render the scene through.
     */
    constructor() {
        super();
        this.m_quad.frustumCulled = false;
        this.m_quadScene.add(this.m_quad);
    }

    /**
     * Releases all used resources.
     */
    dispose() {
        if (this.m_renderTarget !== null) {
            this.m_renderTarget.dispose();
            this.m_renderTarget = null;
        }
    }

    /**
     * The render function of `MSAARenderPass`.
     *
     * @remarks
     * At each call of this method, and for each sample the {@link MapView}
     * camera provided in the `render method is offset within the dimension of a
     * pixel on screen. It then renders the whole scene with this offset to a local
     * `WebGLRenderTarget` instance, via a `WebGLRenderer` instance. Finally the local camera
     * created in the constructor shoots the quad and renders to the write buffer or to the frame
     * buffer. The quad material's opacity is modified so the renders can accumulate in the
     * targetted buffer.
     *
     * The number of samples can be modified at runtime through the enum [[SamplingLevel]].
     *
     * If there is no further pass, the {@link Pass.renderToScreen} flag can be set to `true` to
     * output directly to the framebuffer.
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
        if (!this.enabled) {
            return;
        }

        // Initiates the local render target with the read buffer's dimensions, if not available.
        if (this.m_renderTarget === null) {
            this.m_renderTarget = new THREE.WebGLRenderTarget(readBuffer.width, readBuffer.height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            });
            this.m_renderTarget.texture.name = "MSAARenderPass.sample";
        }
        this.m_quadUniforms.tDiffuse.value = this.m_renderTarget.texture;

        const offsets = MSAARenderPass.OffsetVectors[this.samplingLevel];

        const rendererClearColor = renderer.getClearColor(this.m_tmpColor);
        const oldClearColor = rendererClearColor !== undefined ? rendererClearColor.getHex() : 0;

        // The method `camera.setViewOffset` will be called in the next loop. In order to maintain
        // its usability externally (like for the triple view in mosaic demo) we must cache the
        // previous values stored in `camera.view` and re-assign them at the end of the pass.

        // 1. Create a default cache object, with default dimensions the size of our read buffer.
        const oldView = {
            enabled: camera.view !== null && camera.view.enabled,
            fullWidth: readBuffer.width,
            fullHeight: readBuffer.height,
            x: 0,
            y: 0,
            width: readBuffer.width,
            height: readBuffer.height
        };

        // 2. If `camera.view` has been enabled previously, then `setViewOffset` has been called
        // externally: copy the existing `camera.view` values in the cache. Override the cache
        // object with the values provided externally.
        if (oldView.enabled && camera.view !== null) {
            oldView.fullWidth = camera.view.fullWidth;
            oldView.fullHeight = camera.view.fullHeight;
            oldView.x = camera.view.offsetX;
            oldView.y = camera.view.offsetY;
            oldView.width = camera.view.width;
            oldView.height = camera.view.height;
        }

        const oldRenderTarget = renderer.getRenderTarget();
        for (let i = 0; i < offsets.length; i++) {
            // 4. Then for each sample, call `setViewOffset` with our object. This also updates the
            // `camera.view` object in Three.js.
            const offset = offsets[i];
            camera.setViewOffset(
                oldView.fullWidth,
                oldView.fullHeight,
                oldView.x + offset[0] / 16,
                oldView.y + offset[1] / 16,
                oldView.width,
                oldView.height
            );

            // 5. Divide the opacity of the quad by the number of samples to accumulate on the
            // target buffer, and reduce the impact of the offset on color to reduce banding. Then
            // render.
            const uniformCenteredDistribution = -0.5 + (i + 0.5) / offsets.length;
            const sampleWeight = 1.0 / offsets.length + uniformCenteredDistribution / 32;

            this.m_quadUniforms.opacity.value = sampleWeight;

            renderer.setRenderTarget(this.m_renderTarget);
            renderer.clear();
            renderer.render(scene, camera);

            // 6. Render the quad on top of the previous renders.

            // NOTE: three.js doesn't like undefined as renderTarget, but works with `null`
            renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
            if (i === 0) {
                renderer.setClearColor(0x000000);
                renderer.clear();
            }
            renderer.render(this.m_quadScene, this.m_localCamera);
            if (i === 0 && rendererClearColor !== undefined) {
                renderer.setClearColor(oldClearColor);
            }
        }
        renderer.setRenderTarget(oldRenderTarget);

        // 7. Restore `camera.view` as set externally (or not).
        if (camera.view !== null) {
            camera.view.enabled = oldView.enabled;
            camera.view.offsetX = oldView.x;
            camera.view.offsetY = oldView.y;
        }
    }

    /**
     * Resize the internal render target to match the new size specified.
     *
     * @param width - New width to apply to the render target.
     * @param height - New height to apply to the render target.
     * @override
     */
    setSize(width: number, height: number) {
        if (this.m_renderTarget) {
            this.m_renderTarget.setSize(width, height);
        }
    }

    /**
     * The list of offsets to apply to the camera, per sampling level, adapted from :
     *
     * @see https://msdn.microsoft.com/en-us/library/windows/desktop/ff476218%28v=vs.85%29.aspx?f=255&MSPPError=-2147217396
     */
    static readonly OffsetVectors: number[][][] = [
        [[0, 0]],
        [
            [4, 4],
            [-4, -4]
        ],
        [
            [-2, -6],
            [6, -2],
            [-6, 2],
            [2, 6]
        ],
        [
            [1, -3],
            [-1, 3],
            [5, 1],
            [-3, -5],
            [-5, 5],
            [-7, -1],
            [3, 7],
            [7, -7]
        ],
        [
            [1, 1],
            [-1, -3],
            [-3, 2],
            [4, -1],
            [-5, -2],
            [2, 5],
            [5, 3],
            [3, -5],
            [-2, 6],
            [0, -7],
            [-4, -6],
            [-6, 4],
            [-8, 0],
            [7, -4],
            [6, 7],
            [-7, -8]
        ],
        [
            [-4, -7],
            [-7, -5],
            [-3, -5],
            [-5, -4],
            [-1, -4],
            [-2, -2],
            [-6, -1],
            [-4, 0],
            [-7, 1],
            [-1, 2],
            [-6, 3],
            [-3, 3],
            [-7, 6],
            [-3, 6],
            [-5, 7],
            [-1, 7],
            [5, -7],
            [1, -6],
            [6, -5],
            [4, -4],
            [2, -3],
            [7, -2],
            [1, -1],
            [4, -1],
            [2, 1],
            [6, 2],
            [0, 4],
            [4, 4],
            [2, 5],
            [7, 5],
            [5, 6],
            [3, 7]
        ]
    ];
}
