/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structure that holds near, far planes distances and maximum visibility range.
 */
export interface ViewRanges {
    /**
     * Distance from camera to near clipping plane along camera eye vector.
     * @note This value is always positive and in camera space, should be bigger then zero.
     */
    near: number;
    /**
     * Far clipping plane distance in camera space, along its eye vector.
     * @note Should be always positive and bigger then [[near]] plane distance.
     */
    far: number;
    /**
     * Minimum distance that may be applied to near plane.
     *
     * Reflects minimum possible near plane distance regardless of camera orientation.
     *
     * @note Such constraint is always required because near plane can not be placed at zero
     * distance from camera (regardless of rendering Api used). Moreover this value may be
     * used as input for algorighms related to frustum planes, but rather based on visibility
     * ranges such as it does not change during tilt. Frustum planes may change dynamically with
     * camera orientation changes, while this value preserve constness for certain camera
     * position and may be used for effects like near geometry fading.
     */
    minimum: number;
    /**
     * Maximum possible distance for far plane placement.
     *
     * This accounts for maximum visibility range in camera space, regardless of camera
     * orientation. Far plane will never be placed beyond that distance, this value says
     * about viewing distance limit, thus it is constrained for performance reasons and
     * allows to compute effects applied at the end of viewing range such as fog or
     * geometry fading.
     *
     * @note Holds the maximum distance that may be applied for [[far]] plane at
     * certain camera position, it is const in between orientation changes. You may use this
     * value to calculate fog or other depth effects that are related to frustum planes,
     * but should not change as dynamically as current near/far planes distances.
     */
    maximum: number;
}
