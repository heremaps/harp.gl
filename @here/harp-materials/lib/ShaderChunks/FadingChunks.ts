/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
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
