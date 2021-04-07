/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Use `ColorCache` to reuse a color specified by name and save allocation as well as
 * setup time.
 *
 * Implemented as a singleton. Do not modify colors after getting them from the `ColorCache`.
 */
export class ColorCache {
    /**
     * Return instance of `ColorCache`.
     */
    static get instance() {
        return this.m_instance;
    }

    private static readonly m_instance: ColorCache = new ColorCache();
    private readonly m_map: Map<string, THREE.Color> = new Map();

    /**
     * Returns the color for the given `colorCode`. This function may reuse a previously generated
     * color, so you cannot modify the contents of the color.
     *
     * @param colorCode - ThreeJS color code or name. You must provide a valid color code or name,
     * as this function does not do any validation.
     */
    getColor(colorCode: string | number): THREE.Color {
        if (typeof colorCode === "number") {
            colorCode = "#" + colorCode.toString(16).padStart(6, "0");
        }

        let color = this.m_map.get(colorCode);
        if (color !== undefined) {
            return color;
        }
        color = new THREE.Color(colorCode);
        this.m_map.set(colorCode, color);
        return color;
    }

    /**
     * Returns the number of elements in the cache.
     */
    get size(): number {
        return this.m_map.size;
    }

    /**
     * Clears the cache. Only references to the THREE.Color are removed from the cache.
     * Consequently, clearing the cache does not cause any negative visual impact.
     */
    clear(): void {
        this.m_map.clear();
    }
}
