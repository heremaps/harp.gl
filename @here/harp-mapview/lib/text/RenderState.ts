/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * State of fading.
 */
export enum FadingState {
    Undefined = 0,
    FadingIn = 1,
    FadedIn = 2,
    FadingOut = -1,
    FadedOut = -2
}

/**
 * Time to fade in/fade out the labels in milliseconds.
 */
export const DEFAULT_FADE_TIME = 800;

/**
 * State of rendering of the icon and text part of the `TextElement`. Mainly for fading the elements
 * in and out, to compute the opacity.
 *
 * @hidden
 */
export class RenderState {
    /**
     * Create a `RenderState`.
     *
     * @param state Fading state.
     * @param value Current fading value [0..1].
     * @param startTime Time stamp the fading started.
     * @param opacity Computed opacity depending on value.
     * @param lastFrameNumber Latest frame the elements was rendered, allows to detect some less
     *                        obvious states, like popping up after being hidden.
     * @param fadingTime Time used to fade in or out.
     */
    constructor(
        public state = FadingState.Undefined,
        public value = 0.0,
        public startTime = 0,
        public opacity = 1.0,
        public lastFrameNumber = Number.MIN_SAFE_INTEGER,
        public fadingTime: number = DEFAULT_FADE_TIME
    ) {}
    /**
     * Reset existing `RenderState` to appear like a fresh state.
     */
    reset() {
        this.state = FadingState.Undefined;
        this.value = 0.0;
        this.startTime = 0.0;
        this.opacity = 1.0;
        this.lastFrameNumber = Number.MIN_SAFE_INTEGER;
    }
    /**
     * @returns `true` if element is either fading in or fading out.
     */
    isFading(): boolean {
        const fading = this.state === FadingState.FadingIn || this.state === FadingState.FadingOut;
        return fading;
    }
    /**
     * @returns `true` if element is fading in.
     */
    isFadingIn(): boolean {
        const fadingIn = this.state === FadingState.FadingIn;
        return fadingIn;
    }
    /**
     * @returns `true` if element is fading out.
     */
    isFadingOut(): boolean {
        const fadingOut = this.state === FadingState.FadingOut;
        return fadingOut;
    }
    /**
     * @returns `true` if element is done with fading in.
     */
    isFadedIn(): boolean {
        const fadedIn = this.state === FadingState.FadedIn;
        return fadedIn;
    }
    /**
     * @returns `true` if element is done with fading out.
     */
    isFadedOut(): boolean {
        const fadedOut = this.state === FadingState.FadedOut;
        return fadedOut;
    }
    /**
     * @returns `true` if element is either faded in, is fading in or is fading out.
     */
    isVisible(): boolean {
        const visible =
            this.state === FadingState.FadingIn ||
            this.state === FadingState.FadedIn ||
            this.state === FadingState.FadingOut;
        return visible;
    }
}
