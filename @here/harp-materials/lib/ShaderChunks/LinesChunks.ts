/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
    extrude_line_vert_func: `
vec3 extrudeLine(
        in vec3 vertexPosition,
        in float linePosition,
        in float lineWidth,
        in vec4 bitangent,
        in vec3 tangent,
        inout vec2 uv
    ) {
    vec3 result = vertexPosition;
    // Retrieve the angle between this segment and the previous one (stored in the bitangent w
    // component).
    float angle = bitangent.w;
    // Extrude according to the angle between segments to properly render narrow joints...
    if (angle != 0.0) {
        result += uv.y * lineWidth * bitangent.xyz / cos(angle / 2.0);
        uv.x = linePosition + uv.x * lineWidth * uv.y * tan(angle / 2.0);
    }
    // ... or extrude in a simple manner for segments that keep the same direction.
    else {
        result += uv.y * lineWidth * bitangent.xyz + uv.x * lineWidth * tangent;
        uv.x = linePosition + uv.x * lineWidth;
    }
    uv.y *= lineWidth;
    return result;
}
`,
    round_edges_and_add_caps: `
float roundEdgesAndAddCaps(in vec4 coords, in vec3 range) {
    // Compute the line's width to length ratio.
    float widthRatio = range.y / range.x;

    // Compute the inner segment distance (same for all cap mode).
    float dist = abs(coords.y);
    float segmentBeginMask = clamp(ceil(coords.z - coords.x), 0.0, 1.0);
    float segmentEndMask = clamp(ceil(coords.x - coords.w), 0.0, 1.0);
    dist = max(dist, segmentBeginMask * length(vec2((coords.x - coords.z) / widthRatio, coords.y)));
    dist = max(dist, segmentEndMask * length(vec2((coords.x - coords.w) / widthRatio, coords.y)));

    #if !defined(CAPS_ROUND)
    // Compute the caps mask.
    float capRangeMask = clamp(1.0 - ceil(range.z - 1.0), 0.0, 1.0);
    float beginCapMask = clamp(ceil(0.0 - coords.x), 0.0, 1.0);
    float endCapMask = clamp(ceil(coords.x - 1.0), 0.0, 1.0);
    float capMask = capRangeMask * max(beginCapMask, endCapMask);

    // Compute the outer segment distance (specific for each cap mode).
    float capDist = max(coords.x - 1.0, -coords.x) / widthRatio;
    #if defined(CAPS_NONE)
    dist = mix(dist, max(abs(coords.y), (capDist + 0.1) / 0.1), capMask);
    #elif defined(CAPS_SQUARE)
    dist = mix(dist, max(abs(coords.y), capDist), capMask);
    #elif defined(CAPS_TRIANGLE_OUT)
    dist = mix(dist, abs(coords.y) + capDist, capMask);
    #elif defined(CAPS_TRIANGLE_IN)
    dist = mix(dist, max(abs(coords.y), (capDist - abs(coords.y)) + capDist), capMask);
    #endif
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
