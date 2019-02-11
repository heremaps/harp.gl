/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebGLRenderTarget } from "three";
import { IPassManager } from "./IPassManager";
import { MSAARenderPass, MSAASampling } from "./MSAARenderPass";

const DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_1;
const DEFAULT_STATIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_4;

/**
 * Interface for the antialias settings passed when instantiating a [[MapView]], and transferred to
 * the [[MapRenderingManager]] instance. These parameters can be changed at runtime as opposed to
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
 * [[MapRenderingManager.render]] call to a set of internal [[Pass]] instances. It provides an API
 * to modify some of the rendering processes like the antialiasing behaviour at runtime.
 */
export interface IMapRenderingManager extends IPassManager {
    /**
     * The level of MSAA sampling while the user interacts. It should be a low level so that the
     * MSAA does not impact the framerate.
     */
    dynamicMsaaSamplingLevel: MSAASampling;

    /**
     * Enable or disable the MSAA. If disabled, `MapRenderingManager` will use the renderer provided
     * in the [[MapRenderingManager.render]] method to render the scene.
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
     * @param renderer The ThreeJS WebGLRenderer instance to render the map with.
     * @param isStaticFrame Whether the frame to render is static or dynamic. Selects level of
     * antialiasing.
     * @param time Optional time argument provided by the requestAnimationFrame, to pass to
     * sub-passes.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean,
        time?: number
    ): void;
}

/**
 * The implementation of [[IMapRenderingManager]] to instantiate in [[MapView]] and manage the map
 * rendering.
 */
export class MapRenderingManager implements IMapRenderingManager {
    private m_msaaPass: MSAARenderPass;
    private m_readBuffer: THREE.WebGLRenderTarget;
    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;

    /**
     * The constructor of `MapRenderingManager`.
     *
     * @param width Width of the frame buffer.
     * @param height Height of the frame buffer.
     * @param antialiasSetting The object defining the demeanor of MSAA.
     */
    constructor(
        width: number,
        height: number,
        antialiasSettings: IMapAntialiasSettings | undefined = { msaaEnabled: false }
    ) {
        this.m_readBuffer = new WebGLRenderTarget(width, height);
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
    }

    /**
     * The method to call to render the map with the `MapRenderingManager` instance. It contains the
     * chain of sub-passes that can transfer the write and read buffers, and other sheer rendering
     * conditions as disabling AA when a high DPI device is in use.
     *
     * @param renderer The ThreeJS WebGLRenderer instance to render the map with.
     * @param scene The ThreeJS Scene instance containing the map objects to render.
     * @param camera The ThreeJS Camera instance to render the scene through.
     * @param isStaticFrame Whether the frame to render is static or dynamic. Selects level of
     * antialiasing.
     * @param time Optional time argument provided by the requestAnimationFrame, to pass to
     * sub-passes.
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean
    ) {
        const isHighDpiDevice = renderer.getPixelRatio() > 1.1; // On desktop IE11 is ~1.01.

        // 1. First pass (and only for the map part) : base scene render.
        if (isHighDpiDevice) {
            // On smartphones, discard AAs as the pixel ratio already stands for this and also makes
            // AA passes much more expensive.
            renderer.render(scene, camera);
        } else {
            // Later with further effects, a ThreeJS WebGLRenderTarget will be needed as the
            // destination of the render call.
            const target = undefined;
            if (this.m_msaaPass.enabled) {
                // Use a higher MSAA sampling level for static rendering.
                this.m_msaaPass.samplingLevel = isStaticFrame
                    ? this.m_staticMsaaSamplingLevel
                    : this.m_dynamicMsaaSamplingLevel;
                // MSAA is the only effect for the moment.
                this.m_msaaPass.renderToScreen = true;
                // Render to the specified target with the MSAA pass.
                this.m_msaaPass.render(renderer, scene, camera, target, this.m_readBuffer);
            } else {
                renderer.render(scene, camera, target);
            }
        }

        // 2. Further passes could then be implemented here on top of the base pass.
    }

    /**
     * The resize function to call on resize events to resize the render targets. It shall include
     * the resize methods of all the sub-passes used in `MapRenderingManager`.
     *
     * @param width New width to use.
     * @param height New height to use.
     */
    setSize(width: number, height: number) {
        this.m_readBuffer.setSize(width, height);
        this.m_msaaPass.setSize(width, height);
    }

    /**
     * Set the level of sampling while the user interacts.
     *
     * @param samplingLevel The sampling level.
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
     * in the [[MapRenderingManager.render]] method to render the scene.
     *
     * @param value If `true`, MSAA is enabled, disabled otherwise.
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
     * @param samplingLevel The sampling level.
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
