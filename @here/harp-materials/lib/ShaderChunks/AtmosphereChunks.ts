/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
    atmosphere_vertex_utils: `

    const float RayleighScaleDepth = 0.25;

    struct AtmosphereColor
    {
        vec3 mie;
        vec3 rayleigh;
    };

    float scale(float cosAngle)
    {
        float x = 1.0 - cosAngle;
        return RayleighScaleDepth  * exp(-0.00287 + x*(0.459 + x*(3.83 + x*(-6.80 + x*5.25))));
    }

    float getNearSphereIntersect(vec3 v3Pos, vec3 v3Ray, float fCameraHeight2, float fOuterRadius2) {
        // Solve simple square equation for the x0 (first point of intersection).
#if defined(IMPROVE_INTERSECT_PRECISION)
        // To improve precision instead of simple projection: b = 2.0 * dot(vPos, v3Ray),
        // we change the equation that gives better results especially around the poles.
        float fB = 2.0 * length(v3Pos) * dot(normalize(v3Pos), v3Ray);
#else
        float fB = 2.0 * dot(v3Pos, v3Ray);
#endif
        float fC = fCameraHeight2 - fOuterRadius2;
        // det = b^2 - 4*a*c, where a = 1
        float fDet = max(0.0, fB * fB - 4.0 * fC);
        // Intersection points distances are defined as follows:
        // x0 = (-b - sqrt(det)) / 2*a ^ x1 = (-b + sqrt(det)) / 2*a
        // we search for x0:
        return 0.5 * (-fB - sqrt(fDet));
    }

    float getFarSphereIntersect(vec3 v3Pos, vec3 v3Ray, float fCameraHeight2, float fOuterRadius2) {
        // Solve simple square equation for the x1 (second point of intersection).
#if defined(IMPROVE_INTERSECT_PRECISION)
        float fB = 2.0 * length(v3Pos) * dot(normalize(v3Pos), v3Ray);
#else
        float fB = 2.0 * dot(v3Pos, v3Ray);
#endif
        float fC = fCameraHeight2 - fOuterRadius2;
        // det = b^2 - 4*a*c, where a = 1
        float fDet = max(0.0, fB * fB - 4.0 * fC);
        // Compute second intersection distance:
        // x1 = (-b + sqrt(det)) / 2*a
        return 0.5 * (-fB + sqrt(fDet));
    }
    `,
    atmosphere_fragment_utils: `

    // Branch free RGB to HSV conversion.
    // Based on article:
    // http://lolengine.net/blog/2013/01/13/fast-rgb-to-hsv
    // and optimized OpenGL SL algorithm
    // http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl
    vec3 rgb2Hsv(vec3 c)
    {
        const vec4 RGB_HSV_CONV = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        // Ternary operator may be used explicitly if compiler can use fast conditional move.
        // vec4 p = c.g < c.b ? vec4(c.bg, RGB_HSV_CONV.wz) : vec4(c.gb, RGB_HSV_CONV.xy);
        vec4 p = mix(vec4(c.bg, RGB_HSV_CONV.wz), vec4(c.gb, RGB_HSV_CONV.xy), step(c.b, c.g));
        // vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    // Branch free HSV to RGB conversion
    vec3 hsv2Rgb(vec3 c)
    {
        const vec4 HSV_RGB_CONV = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + HSV_RGB_CONV.xyz) * 6.0 - HSV_RGB_CONV.www);
        return c.z * mix(HSV_RGB_CONV.xxx, clamp(p - HSV_RGB_CONV.xxx, 0.0, 1.0), c.y);
    }

    vec3 correctExposure(vec3 rgb, float exposure)
    {
        const vec3 fullColor = vec3(1.0);
        return fullColor - exp(-exposure * rgb);
    }

    vec3 correctColor(vec3 rgb, vec3 hsvShift)
    {
        const float e = 0.0000001;
        // Convert rgb color to hsv
        vec3 hsv = rgb2Hsv(rgb);
        // Shift hue value with angle wrapping
        hsv.x = mod(hsv.x + hsvShift.x, 1.0);
        // Shift and clamp saturation
        hsv.y = clamp(hsv.y + hsvShift.y, 0.0, 1.0);
        // Change value if it is significant (greater then epsilon)
        hsv.z = hsv.z > e ? clamp(hsv.z + hsvShift.z, 0.0, 1.0) : 0.0;
        // Convert shifted hsv back to rgb
        return hsv2Rgb(hsv);
    }
    `
};
