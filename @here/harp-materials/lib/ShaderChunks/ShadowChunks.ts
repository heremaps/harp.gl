/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This shader chunk replaces the default lighting in the standard material, the problem with this
 * is that the final pixel color is the addition of the material color and the light, this means
 * that the final map's rendered color is vastly different from that configured by the designers.
 * This chunk removes the extra highlight by providing just two colors, the material color when not
 * in shadow and a reduced color value when in shadow (currently 50% of the material's color).
 */
export const simpleLightingShadowChunk = `
    struct PhysicalMaterial {
        vec3	diffuseColor;
        float	specularRoughness;
        vec3	specularColor;
    };

    #define DEFAULT_SPECULAR_COEFFICIENT 0.04

    void RE_Direct_Physical( const in IncidentLight directLight,
        const in GeometricContext geometry,
        const in PhysicalMaterial material,
        inout ReflectedLight reflectedLight ) {
        // directLight.color is the light color * shadow, internally three.js uses a step function, so
        // this value is either the light color or black. in order to lighten up the shadows, we
        // take add 50% of the color to grey (to give us either pure white or grey) and multiply this to
        // the material's diffuse color.
        #if defined(USE_SHADOWMAP)
            reflectedLight.directDiffuse = (0.5 * directLight.color +
                vec3(0.5,0.5,0.5)) * material.diffuseColor;
        #else
            reflectedLight.directDiffuse = material.diffuseColor;
        #endif
    }

    void RE_IndirectDiffuse_Physical( const in vec3 irradiance,
        const in GeometricContext geometry,
        const in PhysicalMaterial material,
        inout ReflectedLight reflectedLight ) {
            // Disable influence of indirect light (it is handled in the RE_Direct_Physical function)
    }

    void RE_IndirectSpecular_Physical( const in vec3 radiance,
        const in vec3 irradiance,
        const in vec3 clearcoatRadiance,
        const in GeometricContext geometry,
        const in PhysicalMaterial material,
        inout ReflectedLight reflectedLight) {
            // Disable specular reflection of light.
    }

    #define RE_Direct               RE_Direct_Physical
    #define RE_IndirectDiffuse      RE_IndirectDiffuse_Physical
    #define RE_IndirectSpecular     RE_IndirectSpecular_Physical
`;
