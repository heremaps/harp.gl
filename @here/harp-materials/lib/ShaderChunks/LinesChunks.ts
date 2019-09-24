/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
    extrude_line_vert_func: `
void extrudeLine(vec2 segment, vec4 bt, vec3 t, float lineWidth, inout vec3 pos, inout vec2 uv) {
    float uu = uv.x / 2.0 + 0.5;
    float ss = mix(segment.x, segment.y, uu);

    float angle = bt.w;
    vec3 dir = bt.xyz;
    if (angle != 0.0) {
        pos += uv.y * lineWidth * dir / cos(angle / 2.0);
        uv.x = ss + uv.x * lineWidth * uv.y * tan(angle / 2.0);
    }
    else {
        pos += uv.y * lineWidth * dir + uv.x * lineWidth * t;
        uv.x = ss + uv.x * lineWidth;
    }
}
`,
    join_dist_func: `
float joinDist(vec2 segment, vec2 texcoord) {
    float d = abs(texcoord.y);
    float dx = texcoord.x;
    if (dx < segment.x) {
        d = max(d, length(texcoord - vec2(segment.x, 0.0)));
    } else if (dx > segment.y) {
        d = max(d, length(texcoord - vec2(segment.y, 0.0)));
    }
    return d;
}
`,
    round_edges_and_add_caps: `
float roundEdgesAndAddCaps(
        in vec2 segment,
        in vec2 uv,
        in float lineEnds,
        in float vExtrusionStrength
    ) {

    float dist = 0.0;

    #if defined(CAPS_NONE)
        if (lineEnds > -0.1 && vExtrusionStrength < 1.0) {
            dist = max((lineEnds + 0.1) / 0.1, abs(uv.y));
        } else {
            dist = joinDist(segment, uv);
        }
    #elif defined(CAPS_SQUARE)
        if (lineEnds > 0.0 && vExtrusionStrength < 1.0) {
            dist = max(abs(uv.y), lineEnds);
        } else {
            dist = joinDist(segment, uv);
        }
    #elif defined(CAPS_TRIANGLE_OUT)
        if (lineEnds > 0.0 && vExtrusionStrength < 1.0) {
            dist = (abs(uv.y)) + lineEnds;
        } else {
            dist = joinDist(segment, uv);
        }
    #elif defined(CAPS_TRIANGLE_IN)
        if (lineEnds > 0.0 && vExtrusionStrength < 1.0) {
            float y = abs(uv.y);
            dist = max(y, (lineEnds-y) + lineEnds);
        } else {
            dist = joinDist(segment, uv);
        }
    #else
        dist = joinDist(segment, uv);
    #endif

    return dist;
}
`,
    tile_clip_func: `
void tileClip(vec2 tilePos, vec2 tileSize) {
    if (tileSize.x > 0.0 && (tilePos.x < -tileSize.x / 2.0 || tilePos.x > tileSize.x / 2.0))
        discard;
    if (tileSize.y > 0.0 && (tilePos.y < -tileSize.y / 2.0 || tilePos.y > tileSize.y / 2.0))
        discard;
}
`,
    high_precision_vert_func: `
vec3 subtractDblEyePos( const in vec3 pos ) {
    vec3 t1 = positionLow - u_eyepos_lowpart;
    vec3 e = t1 - positionLow;
    vec3 t2 = ((-u_eyepos_lowpart - e) + (positionLow - (t1 - e))) + pos - u_eyepos;
    vec3 high_delta = t1 + t2;
    vec3 low_delta = t2 - (high_delta - t1);
    return (high_delta + low_delta);
}
`
};
