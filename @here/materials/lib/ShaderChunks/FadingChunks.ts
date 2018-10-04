/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/**
 * The shader chunks have their lines "#ifdef USE_FADING" commented out, because currently the
 * mesh materials use individually created shader strings based on the materials settings.
 * @see [[FadingMeshBasicMaterial]]
 **/

export default {
    fading_pars_vertex: `
varying float fadingDepth;
`,

    fading_vertex: `
fadingDepth = -mvPosition.z;
`,

    fading_pars_fragment: `
varying float fadingDepth;
uniform float fadeNear;
uniform float fadeFar;
`,

    fading_fragment: `

// lerp with "hard" edges
//float fadingFactor = 1.0 - clamp((fadingDepth - fadeNear) / (fadeFar - fadeNear), 0.0, 1.0);

// smooth transitions
float fadingFactor = smoothstep( fadeNear, fadeFar, fadingDepth );

gl_FragColor.a *= 1.0 - fadingFactor;

// debugging color:
// gl_FragColor = vec4(1., fadingFactor, fadingFactor, 1.0);
`
};
