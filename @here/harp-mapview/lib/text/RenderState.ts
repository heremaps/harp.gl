/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MathUtils } from "@here/harp-utils";
import * as THREE from "three";

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

    /**
     * Updates the state to [[FadingState.FadingIn]].
     *
     * @param frameNumber Current frame number.
     * @param time Current time.
     * @param forceFadeIn If `true` state is changed to [[FadingState.FadingIn]] independently
     * of the previous state. Otherwise, change is only applied if state is
     * [[FadingState.Undefined]] or old (wasn't updated in previous frame).
     * @returns `true` if element is fading.
     */
    checkStartFadeIn(frameNumber: number, time: number, forceFadeIn = false): boolean {
        // Fade-in after skipping rendering during movement
        if (
            forceFadeIn ||
            this.state === FadingState.Undefined ||
            this.lastFrameNumber < frameNumber - 1
        ) {
            this.startFadeIn(frameNumber, time);
        }

        this.lastFrameNumber = frameNumber;

        return this.isFading();
    }

    /**
     * Updates the state to [[FadingState.FadingOut]].
     *
     * @param frameNumber Current frame number.
     * @param time Current time.
     * @param forceFadeOut If `true` state is changed to [[FadingState.FadingOut]] independently
     * of the previous state. Otherwise, change is only applied if state is
     * [[FadingState.Undefined]] or old (wasn't updated in previous frame).
     * @returns `true` if element is fading.
     */
    checkStartFadeOut(frameNumber: number, time: number, forceFadeOut = true): boolean {
        // Fade-in after skipping rendering during movement
        if (
            forceFadeOut ||
            this.state === FadingState.Undefined ||
            this.lastFrameNumber < frameNumber - 1
        ) {
            this.startFadeOut(frameNumber, time);
        }

        this.lastFrameNumber = frameNumber;

        return this.isFading();
    }

    /**
     * Updates the state to [[FadingState.FadingIn]].
     * If previous state is [[FadingState.FadingIn]] or [[FadingState.FadedIn]] it remains
     * unchanged.
     *
     * @param frameNumber Current frame number.
     * @param time Current time.
     */
    startFadeIn(frameNumber: number, time: number) {
        if (this.lastFrameNumber < frameNumber - 1) {
            this.reset();
        }

        if (this.state === FadingState.FadingIn || this.state === FadingState.FadedIn) {
            return;
        }

        if (this.state === FadingState.FadingOut) {
            // The fadeout is not complete: compute the virtual fadingStartTime in the past, to get
            // a correct end time:
            this.value = 1.0 - this.value;
            this.startTime = time - this.value * this.fadingTime;
        } else {
            this.startTime = time;
            this.value = 0.0;
            this.opacity = 0;
        }

        this.state = FadingState.FadingIn;
    }

    /**
     * Updates the state to [[FadingState.FadingOut]].
     * If previous state is [[FadingState.FadingOut]] or [[FadingState.FadedOut]] it remains
     * unchanged.
     *
     * @param frameNumber Current frame number.
     * @param time Current time.
     */
    startFadeOut(frameNumber: number, time: number) {
        if (this.lastFrameNumber < frameNumber - 1) {
            this.reset();
        }

        if (this.state === FadingState.FadingOut || this.state === FadingState.FadedOut) {
            return;
        }

        if (this.state === FadingState.FadingIn) {
            // The fade-in is not complete: compute the virtual fadingStartTime in the past, to get
            // a correct end time:
            this.startTime = time - this.value * this.fadingTime;
            this.value = 1.0 - this.value;
        } else {
            this.startTime = time;
            this.value = 0.0;
            this.opacity = 1;
        }

        this.state = FadingState.FadingOut;
    }

    /**
     * Updates opacity to current time, changing the state to [[FadingState.FadedOut]] or
     * [[FadingState.FadedIn]] when the opacity becomes 0 or 1 respectively.
     * It does nothing if [[isFading]] !== `true`.
     *
     * @param time Current time.
     */
    updateFading(time: number) {
        if (this.state !== FadingState.FadingIn && this.state !== FadingState.FadingOut) {
            return;
        }

        if (this.startTime === 0) {
            this.startTime = time;
        }

        const fadingTime = time - this.startTime;
        const startValue = this.state === FadingState.FadingIn ? 0 : 1;
        const endValue = this.state === FadingState.FadingIn ? 1 : 0;

        if (fadingTime >= this.fadingTime) {
            this.value = 1.0;
            this.opacity = endValue;
            this.state =
                this.state === FadingState.FadingIn ? FadingState.FadedIn : FadingState.FadedOut;
        } else {
            // TODO: HARP-7648. Do this once for all labels (calculate the last frame value
            // increment).
            this.value = fadingTime / this.fadingTime;

            this.opacity = THREE.Math.clamp(
                MathUtils.smootherStep(startValue, endValue, this.value),
                0,
                1
            );
        }
    }
}
