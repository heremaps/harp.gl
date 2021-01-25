/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert, MathUtils } from "@here/harp-utils";
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
     * Current fading value [0..1]
     */
    value: number = 0.0;

    /**
     * Timestamp the fading started.
     */
    startTime: number = 0;

    /**
     * Computed opacity depending on value.
     */
    opacity: number = 0.0;

    private m_state = FadingState.Undefined;

    /**
     * Create a `RenderState`.
     *
     * @param fadeTime - The duration of the fading in milliseconds.
     */
    constructor(public fadeTime = DEFAULT_FADE_TIME) {}

    /**
     * Reset existing `RenderState` to appear like a fresh state.
     */
    reset() {
        this.m_state = FadingState.Undefined;
        this.value = 0.0;
        this.startTime = 0.0;
        this.opacity = 0.0;
    }

    /**
     * @returns `true` if element state is `FadingState.Undefined`.
     */
    isUndefined(): boolean {
        return this.m_state === FadingState.Undefined;
    }

    /**
     * @returns `true` if element is either fading in or fading out.
     */
    isFading(): boolean {
        const fading =
            this.m_state === FadingState.FadingIn || this.m_state === FadingState.FadingOut;
        return fading;
    }

    /**
     * @returns `true` if element is fading in.
     */
    isFadingIn(): boolean {
        const fadingIn = this.m_state === FadingState.FadingIn;
        return fadingIn;
    }

    /**
     * @returns `true` if element is fading out.
     */
    isFadingOut(): boolean {
        const fadingOut = this.m_state === FadingState.FadingOut;
        return fadingOut;
    }

    /**
     * @returns `true` if element is done with fading in.
     */
    isFadedIn(): boolean {
        const fadedIn = this.m_state === FadingState.FadedIn;
        return fadedIn;
    }

    /**
     * @returns `true` if element is done with fading out.
     */
    isFadedOut(): boolean {
        const fadedOut = this.m_state === FadingState.FadedOut;
        return fadedOut;
    }

    /**
     * @returns `true` if state is neither faded out nor undefined and the opacity is larger
     * than 0.
     */
    isVisible(): boolean {
        return (
            this.m_state !== FadingState.FadedOut &&
            this.m_state !== FadingState.Undefined &&
            this.opacity > 0
        );
    }

    /**
     * Updates the state to [[FadingState.FadingIn]].
     * If previous state is [[FadingState.FadingIn]] or [[FadingState.FadedIn]] it remains
     * unchanged.
     *
     * @param time - Current time.
     * @param disableFading - Optional flag to disable fading.
     */
    startFadeIn(time: number, disableFading?: boolean) {
        if (this.m_state === FadingState.FadingIn || this.m_state === FadingState.FadedIn) {
            return;
        }

        if (disableFading === true) {
            this.value = 1;
            this.opacity = 1;
            this.m_state = FadingState.FadedIn;
            this.startTime = time;

            return;
        }

        if (this.m_state === FadingState.FadingOut) {
            // The fadeout is not complete: compute the virtual fadingStartTime in the past, to get
            // a correct end time:
            this.value = 1.0 - this.value;
            this.startTime = time - this.value * this.fadeTime;
        } else {
            this.startTime = time;
            this.value = 0.0;
            this.opacity = 0;
        }

        this.m_state = FadingState.FadingIn;
    }

    /**
     * Updates the state to [[FadingState.FadingOut]].
     * If previous state is [[FadingState.FadingOut]], [[FadingState.FadedOut]] or
     * [[FadingState.Undefined]] it remains unchanged.
     *
     * @param time - Current time.
     */
    startFadeOut(time: number) {
        if (
            this.m_state === FadingState.FadingOut ||
            this.m_state === FadingState.FadedOut ||
            this.m_state === FadingState.Undefined
        ) {
            return;
        }

        if (this.m_state === FadingState.FadingIn) {
            // The fade-in is not complete: compute the virtual fadingStartTime in the past, to get
            // a correct end time:
            this.startTime = time - this.value * this.fadeTime;
            this.value = 1.0 - this.value;
        } else {
            this.startTime = time;
            this.value = 0.0;
            this.opacity = 1;
        }

        this.m_state = FadingState.FadingOut;
    }

    /**
     * Updates opacity to current time, changing the state to [[FadingState.FadedOut]] or
     * [[FadingState.FadedIn]] when the opacity becomes 0 or 1 respectively.
     * It does nothing if [[isFading]] !== `true`.
     *
     * @param time - Current time.
     * @param disableFading - `true` if fading is disabled, `false` otherwise.
     */
    updateFading(time: number, disableFading: boolean): void {
        if (this.m_state !== FadingState.FadingIn && this.m_state !== FadingState.FadingOut) {
            return;
        }

        if (this.startTime === 0) {
            this.startTime = time;
        }

        const fadingTime = time - this.startTime;
        const startValue = this.m_state === FadingState.FadingIn ? 0 : 1;
        const endValue = this.m_state === FadingState.FadingIn ? 1 : 0;

        if (disableFading || fadingTime >= this.fadeTime) {
            this.value = 1.0;
            this.opacity = endValue;
            this.m_state =
                this.m_state === FadingState.FadingIn ? FadingState.FadedIn : FadingState.FadedOut;
        } else {
            // TODO: HARP-7648. Do this once for all labels (calculate the last frame value
            // increment).
            this.value = fadingTime / this.fadeTime;

            this.opacity = THREE.MathUtils.clamp(
                MathUtils.smootherStep(startValue, endValue, this.value),
                0,
                1
            );
            assert(this.isFading());
        }
    }
}
