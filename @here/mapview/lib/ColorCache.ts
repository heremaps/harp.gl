/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

/**
 * Use `ColorCache` to reuse a color specified by name. Saves allocations and setup time.
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

    private static m_instance: ColorCache = new ColorCache();
    private m_map: Map<string, THREE.Color> = new Map();

    /**
     * Return the color for the given `colorCode`. May reuse a previously generated color, so the
     * contents of the color may not be modified!
     *
     * @param colorCode ThreeJS color code/name. Should be valid, no validation done here.
     */
    getColor(colorCode: string): THREE.Color {
        let color = this.m_map.get(colorCode);
        if (color !== undefined) {
            return color;
        }
        color = new THREE.Color(colorCode);
        this.m_map.set(colorCode, color);
        return color;
    }

    /**
     * Return the number of elements in cache.
     */
    get size(): number {
        return this.m_map.size;
    }

    /**
     * Clear the cache. Cannot do any harm.
     */
    clear(): void {
        this.m_map.clear();
    }
}
