/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PostEffects {
    bloom?: IBloomEffect;
    outline?: IOutlineEffect;
    vignette?: IVignetteEffect;
    sepia?: ISepiaEffect;
}

export interface IOutlineEffect {
    enabled: boolean;
    /**
     * Make the extruded polygon disappear.
     */
    ghostExtrudedPolygons: boolean;
    thickness: number;
    color: string;
}

export interface IBloomEffect {
    strength: number;
    /**
     * Pixel's brightness threshold between 0 and 1, from which the bloom should apply.
     */
    threshold: number;
    radius: number;
    enabled: boolean;
}

export interface IVignetteEffect {
    enabled: boolean;
    offset: number;
    darkness: number;
}

export interface ISepiaEffect {
    enabled: boolean;
    amount: number;
}
