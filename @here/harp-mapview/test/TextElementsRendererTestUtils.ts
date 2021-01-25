/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_FADE_TIME } from "../lib/text/RenderState";
import { TextElementBuilder } from "./TextElementBuilder";

/**
 * Auxiliary types, constants and functions used to test TextElementsRenderer.
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

// time must not be 0 b/c 0 is used as a special value in TextElementsRenderer.
export const INITIAL_TIME: number = 1;

export enum FadeState {
    FadingIn,
    FadedIn,
    FadingOut,
    FadedOut
}

/**
 * Constants and functions used to generate number arrays representing frame times given
 * as input for the tests.
 */
export const FADE_CYCLE: number[] = [
    INITIAL_TIME,
    INITIAL_TIME + DEFAULT_FADE_TIME / 3,
    INITIAL_TIME + DEFAULT_FADE_TIME / 2,
    INITIAL_TIME + DEFAULT_FADE_TIME
];

export function fadeNCycles(n: number): number[] {
    if (n === 0) {
        return [];
    }

    let result = FADE_CYCLE.slice();
    for (let i = 1; i < n; ++i) {
        result = result.concat(FADE_CYCLE.slice(1).map(x => x + i * DEFAULT_FADE_TIME));
    }
    return result;
}

export const FADE_2_CYCLES: number[] = fadeNCycles(2);

/**
 * Constants and functions used to generate FadeState arrays representing the expected fading
 * state of a text element for each frame.
 */
export const FADE_IN: FadeState[] = [
    FadeState.FadedOut,
    FadeState.FadingIn,
    FadeState.FadingIn,
    FadeState.FadedIn
];

export const FADE_OUT: FadeState[] = [FadeState.FadingOut, FadeState.FadingOut, FadeState.FadedOut];

export const FADE_IN_OUT: FadeState[] = FADE_IN.concat(FADE_OUT);

export function fadedIn(frames: number): FadeState[] {
    return new Array<FadeState>(frames).fill(FadeState.FadedIn);
}

export function fadeInAndFadedOut(frames: number): FadeState[] {
    if (frames < FADE_IN.length) {
        return FADE_IN.slice(0, frames);
    }
    return FADE_IN.concat(fadedOut(frames - FADE_IN.length));
}

export function fadedOut(frames: number): FadeState[] {
    return new Array<FadeState>(frames).fill(FadeState.FadedOut);
}

export function fadeIn(frames: number): FadeState[] {
    if (frames < FADE_IN.length) {
        return FADE_IN.slice(0, frames);
    }
    return FADE_IN.concat(fadedIn(frames - FADE_IN.length));
}

export function fadeOut(frames: number): FadeState[] {
    if (frames < FADE_OUT.length) {
        return FADE_OUT.slice(0, frames);
    }
    return FADE_OUT.concat(fadedOut(frames - FADE_OUT.length));
}

/**
 * Helper functions to generate boolean arrays used to indicate on what frames
 * an input test tile is visible (see [[InputTile]]).
 */
export function firstNFrames(frames: number[], n: number): boolean[] {
    return new Array<boolean>(frames.length).fill(false).fill(true, 0, n);
}

export function not(input: boolean[]): boolean[] {
    return input.map(function (e: boolean) {
        return !e;
    });
}

export function lastNFrames(frames: number[], n: number): boolean[] {
    return new Array<boolean>(frames.length).fill(false).fill(true, -n);
}

export function allFrames(frames: number[]): boolean[] {
    return new Array<boolean>(frames.length).fill(true);
}

/**
 * Types to hold input data for TextElementsRenderer tests.
 */
export type InputTextElement =
    | [TextElementBuilder, FadeState[]] // Text-only element.
    | [TextElementBuilder, FadeState[], boolean[]] // booleans mark frames where element is present.
    | [TextElementBuilder, FadeState[], boolean[], FadeState[]] // POIs (icon and text)
    | [TextElementBuilder, FadeState[][], boolean[], FadeState[][]]; // line marker

export function builder(input: InputTextElement): TextElementBuilder {
    return input[0];
}

export function frameStates(input: InputTextElement): FadeState[] | FadeState[][] {
    return input[1];
}

// If frame states array is empty, same text frame states are used also for icons.
export function iconFrameStates(input: InputTextElement): FadeState[] | FadeState[][] | undefined {
    return input.length > 3 ? (input[3]!.length > 0 ? input[3] : input[1]) : undefined;
}

export function framesEnabled(input: InputTextElement): boolean[] | undefined {
    return input.length > 2 ? input[2] : undefined;
}

export interface InputTile {
    // Labels in the tile, including their builder and expected fade state per frame.
    labels: InputTextElement[];
    // Frames where tile will be visited (default: all)
    frames?: boolean[];
    // Frames where corresponding terrain tile will be available (default: terrain disabled)
    terrainFrames?: boolean[];
}
