/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    IBloomEffect,
    IOutlineEffect,
    ISepiaEffect,
    IVignetteEffect
} from "@here/harp-datasource-protocol";
import { SepiaShader, VignetteShader } from "@here/harp-materials";
import * as THREE from "three";

import { IPassManager } from "./IPassManager";
import { LowResRenderPass } from "./LowResRenderPass";
import { MSAARenderPass, MSAASampling } from "./MSAARenderPass";
import { OutlineEffect } from "./Outline";
import { RenderPass, ShaderPass } from "./Pass";
import { BloomPass } from "./UnrealBloomPass";

const DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_1;
const DEFAULT_STATIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_4;

/**
 * Interface for the antialias settings passed when instantiating
 * a {@link MapView}, and transferred to
 * the {@link MapRenderingManager} instance.
 *
 * @remarks
 * These parameters can be changed at runtime as opposed to
 * the native WebGL antialiasing.
 */
export interface IMapAntialiasSettings {
    /**
     * Whether the MSAA is enabled or not.
     *
     * @default `false`
     */
    msaaEnabled: boolean;

    /**
     * The sampling level to use for MSAA during continuous rendering.
     *
     * @default `MSAASampling.Level_1`
     */
    dynamicMsaaSamplingLevel?: MSAASampling;

    /**
     * The sampling level to use for MSAA when the rendering stops.
     *
     * @default `MSAASampling.Level_4`
     */
    staticMsaaSamplingLevel?: MSAASampling;
}

/**
 * The `MapRenderingManager` class manages the map rendering (as opposed to text) by dispatching the
 * {@link MapRenderingManager.render} call to a set of internal {@link Pass} instances.
 *
 * @remarks It provides an API to modify some of the rendering
 * processes like the antialiasing behaviour at runtime.
 */
export interface IMapRenderingManager extends IPassManager {
    /**
     * Bloom effect parameters.
     */
    bloom: IBloomEffect;

    /**
     * Outline effect parameters.
     */
    outline: IOutlineEffect;

    /**
     * Vignette effect parameters.
     */
    vignette: IVignetteEffect;

    /**
     * Sepia effect parameters.
     */
    sepia: ISepiaEffect;

    /**
     * Set a `pixelRatio` for dynamic rendering (i.e. during animations). If a value is specified,
     * the `LowResRenderPass` will be employed to used to render the scene into a lower resolution
     * render target, which will then be rendered to the screen.
     */
    lowResPixelRatio?: number;

    /**
     * The level of MSAA sampling while the user interacts. It should be a low level so that the
     * MSAA does not impact the framerate.
     */
    dynamicMsaaSamplingLevel: MSAASampling;

    /**
     * Enable or disable the MSAA. If disabled, `MapRenderingManager` will use the renderer provided
     * in the {@link MapRenderingManager.render} method to render the scene.
     */
    msaaEnabled: boolean;

    /**
     * The higher level of MSAA sampling for a last frame to render, when the camera is static. It
     * can be a high level, providing high quality renders requiring few tens of seconds, since no
     * frame is expected to immediately follow in the requestAnimationFrame. It is still limited by
     * zooming, since zooming is not requestAnimationFrame-based and can lead to stuttering if the
     * render time is too long, except on desktop Mac, where mouse interaction already implements
     * some damping. Higher levels of sampling may lead to noticeable color banding, visible in
     * areas with a slight color gradient, like large areas or the sky background.
     */
    staticMsaaSamplingLevel: MSAASampling;

    /**
     * The method to call to render the map. This method depends on an `isStaticFrame` boolean that
     * notifies the pass manager to switch to a higher level render quality for the last frame.
     *
     * @param renderer - The ThreeJS WebGLRenderer instance to render the map with.
     * @param isStaticFrame - Whether the frame to render is static or dynamic. Selects level of
     * antialiasing.
     * @param time - Optional time argument provided by the requestAnimationFrame, to pass to
     * sub-passes.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean,
        time?: number
    ): void;

    /**
     * Updating the outline rebuilds the outline materials of every outlined mesh.
     *
     * @param options - outline options from the {@link @here/harp-datasource-protocol#Theme}.
     */
    updateOutline(options: {
        thickness: number;
        color: string;
        ghostExtrudedPolygons: boolean;
    }): void;
}

/**
 * The implementation of {@link IMapRenderingManager} to
 * instantiate in {@link MapView} and manage the map
 * rendering.
 */
export class MapRenderingManager implements IMapRenderingManager {
    bloom = {
        enabled: false,
        strength: 1.5,
        radius: 0.4,
        threshold: 0.85
    };

    outline = {
        enabled: false,
        thickness: 0.005,
        color: "#000000",
        ghostExtrudedPolygons: false,
        needsUpdate: false
    };

    vignette = {
        enabled: false,
        offset: 1.0,
        darkness: 1.0
    };

    sepia = {
        enabled: false,
        amount: 0.5
    };

    private m_width: number = 1;
    private m_height: number = 1;

    private m_outlineEffect?: OutlineEffect;
    private m_msaaPass: MSAARenderPass;
    private readonly m_renderPass: RenderPass = new RenderPass();
    private readonly m_target1: THREE.WebGLRenderTarget = new THREE.WebGLRenderTarget(1, 1);
    private readonly m_target2: THREE.WebGLRenderTarget = new THREE.WebGLRenderTarget(1, 1);
    private m_bloomPass?: BloomPass;
    private m_sepiaPass: ShaderPass = new ShaderPass(SepiaShader);
    private m_vignettePass: ShaderPass = new ShaderPass(VignetteShader);
    private readonly m_readBuffer: THREE.WebGLRenderTarget;
    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;
    private m_lowResPass: LowResRenderPass;

    /**
     * The constructor of `MapRenderingManager`.
     *
     * @param width - Width of the frame buffer.
     * @param height - Height of the frame buffer.
     * @param lowResPixelRatio - The `pixelRatio` determines the resolution of the internal
     *  `WebGLRenderTarget`. Values between 0.5 and `window.devicePixelRatio` can be tried to give
     * good results. A value of `undefined` disables the low res render pass. The value should not
     * be larger than`window.devicePixelRatio`.
     * @param antialiasSetting - The object defining the demeanor of MSAA.
     */
    constructor(
        width: number,
        height: number,
        lowResPixelRatio: number | undefined,
        antialiasSettings: IMapAntialiasSettings | undefined = { msaaEnabled: false }
    ) {
        this.m_readBuffer = new THREE.WebGLRenderTarget(width, height);
        this.m_msaaPass = new MSAARenderPass();
        this.m_msaaPass.enabled =
            antialiasSettings !== undefined ? antialiasSettings.msaaEnabled === true : false;
        this.m_dynamicMsaaSamplingLevel =
            antialiasSettings.dynamicMsaaSamplingLevel === undefined
                ? DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL
                : antialiasSettings.dynamicMsaaSamplingLevel;
        this.m_staticMsaaSamplingLevel =
            antialiasSettings.staticMsaaSamplingLevel === undefined
                ? DEFAULT_STATIC_MSAA_SAMPLING_LEVEL
                : antialiasSettings.staticMsaaSamplingLevel;
        this.m_lowResPass = new LowResRenderPass(lowResPixelRatio);
        this.m_lowResPass.enabled = lowResPixelRatio !== undefined;
    }

    updateOutline(options: { thickness: number; color: string; ghostExtrudedPolygons: boolean }) {
        this.outline.color = options.color;
        this.outline.thickness = options.thickness;
        this.outline.ghostExtrudedPolygons = options.ghostExtrudedPolygons;
        this.outline.needsUpdate = true;
    }

    /**
     * The method to call to render the map with the `MapRenderingManager` instance. It contains the
     * chain of sub-passes that can transfer the write and read buffers, and other sheer rendering
     * conditions as disabling AA when a high DPI device is in use.
     *
     * @param renderer - The ThreeJS WebGLRenderer instance to render the map with.
     * @param scene - The ThreeJS Scene instance containing the map objects to render.
     * @param camera - The ThreeJS Camera instance to render the scene through.
     * @param isStaticFrame - Whether the frame to render is static or dynamic. Selects level of
     * antialiasing.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean
    ) {
        const target = null;
        if (!isStaticFrame && this.m_lowResPass.pixelRatio !== undefined) {
            // Not designed to be combined with our own MSAA
            this.m_lowResPass.renderToScreen = true;
            this.m_lowResPass.render(renderer, scene, camera, target, this.m_readBuffer);
            return;
        }

        const usePostEffects =
            this.bloom.enabled ||
            this.outline.enabled ||
            this.vignette.enabled ||
            this.sepia.enabled;

        let activeTarget: null | THREE.WebGLRenderTarget = null;

        // 1. If the bloom is enabled, clear the depth.
        if (this.bloom.enabled || this.vignette.enabled || this.sepia.enabled) {
            renderer.setRenderTarget(this.m_target1);
            renderer.clearDepth();
        }

        // 2. Render the map.

        if (this.m_msaaPass.enabled) {
            // Use a higher MSAA sampling level for static rendering.
            this.m_msaaPass.samplingLevel = isStaticFrame
                ? this.m_staticMsaaSamplingLevel
                : this.m_dynamicMsaaSamplingLevel;
            // MSAA is the only effect for the moment.
            this.m_msaaPass.renderToScreen = !usePostEffects;
            // Render to the specified target with the MSAA pass.
            this.m_msaaPass.render(renderer, scene, camera, target, this.m_readBuffer);
        } else {
            if (this.bloom.enabled || this.vignette.enabled || this.sepia.enabled) {
                activeTarget = this.m_target1;
                this.m_renderPass.render(renderer, scene, camera, this.m_target1, null!);
            } else if (!this.outline.enabled || (this.outline.enabled && !this.bloom.enabled)) {
                renderer.render(scene, camera);
            }
        }

        // 3. Apply effects
        if (this.outline.enabled) {
            if (this.m_outlineEffect === undefined) {
                this.m_outlineEffect = new OutlineEffect(renderer);
            }
            if (this.outline.needsUpdate) {
                this.m_outlineEffect.color = this.outline.color;
                this.m_outlineEffect.thickness = this.outline.thickness;
                this.m_outlineEffect.ghostExtrudedPolygons = this.outline.ghostExtrudedPolygons;
                this.outline.needsUpdate = false;
            }
            const nextEffectEnabled =
                this.bloom.enabled || this.vignette.enabled || this.sepia.enabled;
            if (nextEffectEnabled) {
                activeTarget = this.m_target1;
            }
            renderer.setRenderTarget(nextEffectEnabled ? activeTarget : null!);
            this.m_outlineEffect.render(scene, camera);
        }

        if (this.bloom.enabled) {
            if (this.m_bloomPass === undefined) {
                this.m_bloomPass = new BloomPass(
                    new THREE.Vector2(this.m_width, this.m_height),
                    this.bloom.strength,
                    this.bloom.radius,
                    this.bloom.threshold
                );
            }
            const nextEffectEnabled = this.vignette.enabled || this.sepia.enabled;
            this.m_bloomPass.renderToScreen = !nextEffectEnabled;
            this.m_bloomPass.radius = this.bloom.radius;
            this.m_bloomPass.strength = this.bloom.strength;
            this.m_bloomPass.threshold = this.bloom.threshold;
            this.m_bloomPass.render(renderer, scene, camera, null!, activeTarget!);
        } else if (this.m_bloomPass !== undefined) {
            this.m_bloomPass.dispose();
            this.m_bloomPass = undefined;
        }

        if (this.vignette.enabled) {
            const oldTarget = activeTarget!;
            const nextEffectEnabled = this.sepia.enabled;
            this.m_vignettePass.uniforms.offset.value = this.vignette.offset;
            this.m_vignettePass.uniforms.darkness.value = this.vignette.darkness;
            this.m_vignettePass.renderToScreen = !nextEffectEnabled;
            if (nextEffectEnabled) {
                activeTarget = activeTarget === this.m_target1 ? this.m_target2 : this.m_target1;
            }
            this.m_vignettePass.render(renderer, scene, camera, activeTarget!, oldTarget);
        }

        if (this.sepia.enabled) {
            this.m_sepiaPass.renderToScreen = true;
            this.m_sepiaPass.uniforms.amount.value = this.sepia.amount;
            this.m_sepiaPass.render(renderer, scene, camera, null!, activeTarget!);
        }
    }

    /**
     * The resize function to call on resize events to resize the render targets. It shall include
     * the resize methods of all the sub-passes used in `MapRenderingManager`.
     *
     * @param width - New width to use.
     * @param height - New height to use.
     */
    setSize(width: number, height: number) {
        this.m_readBuffer.setSize(width, height);
        this.m_msaaPass.setSize(width, height);
        if (this.m_bloomPass !== undefined) {
            this.m_bloomPass.setSize(width, height);
        }
        this.m_lowResPass.setSize(width, height);
        this.m_target1.setSize(width, height);
        this.m_target2.setSize(width, height);
        this.m_width = width;
        this.m_height = height;
    }

    /**
     * The `lowResPixelRatio` determines the resolution of the internal `WebGLRenderTarget`. Values
     * between 0.5 and `window.devicePixelRatio` can be tried to give  good results. A value of
     * `undefined` disables the low res render pass. The value should not be larger than
     * `window.devicePixelRatio`.
     */
    get lowResPixelRatio(): number | undefined {
        return this.m_lowResPass.pixelRatio;
    }

    set lowResPixelRatio(pixelRatio: number | undefined) {
        this.m_lowResPass.pixelRatio = pixelRatio;
        this.m_lowResPass.enabled = pixelRatio !== undefined;
    }

    /**
     * Set the level of sampling while the user interacts.
     *
     * @param samplingLevel - The sampling level.
     */
    set dynamicMsaaSamplingLevel(samplingLevel: MSAASampling) {
        this.m_dynamicMsaaSamplingLevel = samplingLevel;
    }

    /**
     * Return the sampling level defined during continuous rendering.
     */
    get dynamicMsaaSamplingLevel(): MSAASampling {
        return this.m_dynamicMsaaSamplingLevel;
    }

    /**
     * Enable or disable the MSAA. If disabled, `MapRenderingManager` will use the renderer provided
     * in the {@link MapRenderingManager.render} method to render the scene.
     *
     * @param value - If `true`, MSAA is enabled, disabled otherwise.
     */
    set msaaEnabled(value: boolean) {
        this.m_msaaPass.enabled = value;
    }

    /**
     * Return whether the MSAA is enabled.
     */
    get msaaEnabled(): boolean {
        return this.m_msaaPass.enabled;
    }

    /**
     * Set the sampling level for rendering static frames.
     *
     * @param samplingLevel - The sampling level.
     */
    set staticMsaaSamplingLevel(samplingLevel: MSAASampling) {
        this.m_staticMsaaSamplingLevel = samplingLevel;
    }

    /**
     * Return the sampling level defined for rendering static frames.
     */

    get staticMsaaSamplingLevel(): MSAASampling {
        return this.m_staticMsaaSamplingLevel;
    }
}
