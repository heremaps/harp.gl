export default {
    project_line_vert_func: `
void projectVertex(vec2 segment, vec2 t0, vec2 t1, float lineWidth, inout vec2 pos, inout vec2 uv) {
        float uu = uv.x / 2.0 + 0.5;
        float ss = mix(segment.x, segment.y, uu);

        if (t0 != t1) {
            float angle = atan(t0.x * t1.y - t0.y * t1.x, t0.x * t1.x + t0.y * t1.y);
            vec2 t = normalize(t0 + t1);
            vec2 n = vec2(t.y, -t.x);
            pos += uv.y * lineWidth * n / cos(angle / 2.0);
            uv.x = ss + uv.x * lineWidth * uv.y * tan(angle / 2.0);
        }
        else {
            vec2 n = vec2(t0.y, -t0.x);
            pos += uv.y * lineWidth * n + uv.x * lineWidth * mix(t0, t1, uu);
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
    tile_clip_func: `
void tileClip(vec2 tilePos, vec2 tileSize) {
    if (tileSize.x > 0.0 && (tilePos.x < -tileSize.x / 2.0 || tilePos.x > tileSize.x / 2.0))
        discard;
    if (tileSize.y > 0.0 && (tilePos.y < -tileSize.y / 2.0 || tilePos.y > tileSize.y / 2.0))
        discard;
}
`,
    high_precision_vert2D_func: `
vec2 subtractDblEyePos( const in vec2 pos ) {
    vec2 t1 = positionLow - u_eyepos_lowpart.xy;
    vec2 e = t1 - positionLow.xy;
    vec2 t2 = ((-u_eyepos_lowpart.xy - e) + (positionLow.xy - (t1 - e))) + pos - u_eyepos.xy;
    vec2 high_delta = t1 + t2;
    vec2 low_delta = t2 - (high_delta - t1);
    return (high_delta + low_delta);
}
`,
    high_precision_vert3D_func: `
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
