/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    MapView,
    MSAASampling,
    RenderLoopController
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import * as THREE from "three";

export namespace HelloPostProcessingExample {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    // Create renderer, render target and custom render loop controller
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false;
    const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
    const renderLoop = new RenderLoopController();

    // Create MapView
    const mapView = new MapView({
        canvas,
        renderer,

        // WebGL 1.0 doesn't support antialiasing on render targets, so we antialias our output
        // using custom MapViews MSAA mechanism.
        customAntialiasSettings: {
            msaaEnabled: true,
            dynamicMsaaSamplingLevel: MSAASampling.Level_0,
            staticMsaaSamplingLevel: MSAASampling.Level_2
        },
        renderLoopController: renderLoop,
        theme: "resources/day.json"
    });

    mapView.camera.position.set(0, 0, 800);
    mapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

    MapControls.create(mapView);

    // Setup data source for MapView
    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });
    mapView.addDataSource(omvDataSource);

    // Copyright info handler
    CopyrightElementHandler.install("copyrightNotice")
        .attach(mapView)
        .setDefaults([
            {
                id: "openstreetmap.org",
                label: "OpenStreetMap contributors",
                link: "https://www.openstreetmap.org/copyright"
            }
        ]);

    // Shaders for post processing stage
    const postVertexShader = `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const postFragmentShader = `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform vec2  mousePos;
        uniform float flashLightRadius;
        uniform float aspect;

        void main() {
            vec3 color = texture2D( tDiffuse, vUv).rgb;
            float gray = (color.r + color.g + color.b) / 3.0 / 3.0;

            float dist = distance(vUv * vec2(aspect, 1.0), mousePos * vec2(aspect, 1.0));
            float highlight = abs(1.0 -
                smoothstep(flashLightRadius* 0.5, flashLightRadius* 1.2, dist)
            );

            gl_FragColor.r = mix(gray, color.r, highlight);
            gl_FragColor.g = mix(gray, color.g, highlight);
            gl_FragColor.b = mix(gray, color.b, highlight);
        }
    `;

    // Setup post-processing scene with our shaders
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMaterial = new THREE.ShaderMaterial({
        vertexShader: postVertexShader.trim(),
        fragmentShader: postFragmentShader.trim(),
        uniforms: {
            tDiffuse: { value: renderTarget.texture },
            mousePos: { value: new THREE.Vector2(0.5, 0.5) },
            flashLightRadius: { value: 0.2 },
            aspect: { value: 1.0 }
        }
    });
    const postPlane = new THREE.PlaneBufferGeometry(2, 2);
    const postQuad = new THREE.Mesh(postPlane, postMaterial);
    const postScene = new THREE.Scene();
    postScene.add(postQuad);

    // Setup size of renderer, canvas and frame buffer
    function adjustRendererSize() {
        const [width, height] = [window.innerWidth, window.innerHeight];
        mapView.resize(width, height);
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderTarget.setSize(width * window.devicePixelRatio, height * window.devicePixelRatio);
        postMaterial.uniforms.aspect.value = width / height;
    }
    adjustRendererSize();
    window.addEventListener("resize", adjustRendererSize);

    // Setup render loop handler
    renderLoop.renderFunction = time => {
        // Re-render MapView to framebuffer only if needed (i.e mapview is animating or the contents
        // were updated) ..
        mapView.renderIfNeeded(time, renderTarget);

        // ... and apply after-effect always to achieve fast-response for mouse-triggered updates of
        // post-process effect.
        renderer.render(postScene, postCamera);
    };

    // Follow mouse movement and update mouse position in shader
    canvas.addEventListener("mousemove", event => {
        const x = event.clientX / (canvas.clientWidth * window.devicePixelRatio);
        const y = event.clientY / (canvas.clientHeight * window.devicePixelRatio);

        postMaterial.uniforms.mousePos.value.set(x, 1 - y);
        renderLoop.update();
    });
}
