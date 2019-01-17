/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export class RenderLoopController {
    private m_startedAnimations: number = 0;
    private m_pendingAnimationFrameRequestId: number | undefined;

    constructor(public renderFunction?: ((time: number) => void) | undefined) {}

    /**
     * Request a single redraw of the scene.
     */
    update() {
        this.requestFrameIfNeeded();
    }

    /**
     * Begin animating the scene.
     */
    beginAnimating() {
        this.m_startedAnimations++;
        this.requestFrameIfNeeded();
    }

    /**
     * Stop animating the scene.
     */
    endAnimating() {
        this.m_startedAnimations--;
    }

    /**
     * Ensure that no pending `renderFunction` calls by cancelling any pensing animation frames.
     */
    dispose() {
        if (this.m_pendingAnimationFrameRequestId !== undefined) {
            cancelAnimationFrame(this.m_pendingAnimationFrameRequestId);
            this.m_pendingAnimationFrameRequestId = undefined;
        }
    }

    /**
     * Returns `true` if this loop controller is constantly redrawing the scene.
     */
    isAnimating() {
        return this.m_startedAnimations > 0;
    }

    /**
     * Returns `true` if an update has already been requested, such that after a currently rendering
     * frame, the next frame will be rendered immediately.
     */
    isUpdatePending() {
        return this.m_pendingAnimationFrameRequestId !== undefined;
    }

    private requestFrameIfNeeded() {
        if (this.isUpdatePending()) {
            return;
        }

        this.m_pendingAnimationFrameRequestId = requestAnimationFrame(this.render);
    }

    private render = (time: number) => {
        this.m_pendingAnimationFrameRequestId = undefined;

        if (this.renderFunction !== undefined) {
            this.renderFunction(time);
        }
        if (this.isAnimating() && !this.isUpdatePending()) {
            this.requestFrameIfNeeded();
        }
    };
}
