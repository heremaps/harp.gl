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
    MapViewOptions,
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
    const renderTargetA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat
    });
    const renderTargetB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat
    });
    const renderLoop = new RenderLoopController();

    const commonMapViewOptions: MapViewOptions = {
        canvas,
        renderer,
        renderLoopController: renderLoop,
        // WebGL 1.0 doesn't support antialiasing on render targets, so we antialias our output
        // using custom MapViews MSAA mechanism.
        customAntialiasSettings: {
            msaaEnabled: true,
            dynamicMsaaSamplingLevel: MSAASampling.Level_0,
            staticMsaaSamplingLevel: MSAASampling.Level_2
        }
    };
    // Create MapViews
    const mapViewA = new MapView({ ...commonMapViewOptions, theme: "resources/day.json" });
    const mapViewB = new MapView({ ...commonMapViewOptions, theme: "resources/reducedNight.json" });

    mapViewA.camera.position.set(0, 0, 800);
    mapViewA.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

    mapViewB.camera.position.set(0, 0, 800);
    mapViewB.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

    MapControls.create(mapViewA);
    MapControls.create(mapViewB);

    // Setup data source for MapView
    const omvDataSourceA = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });
    mapViewA.addDataSource(omvDataSourceA);

    const omvDataSourceB = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });
    mapViewB.addDataSource(omvDataSourceB);

    // Copyright info handler
    CopyrightElementHandler.install("copyrightNotice")
        .attach(mapViewA)
        .attach(mapViewB)
        .setDefaults([
            {
                id: "openstreetmap.org",
                label: "OpenStreetMap contributors",
                link: "https://www.openstreetmap.org/copyright"
            }
        ]);

    // Setup size of renderer, canvas and frame buffer
    function adjustRendererSize() {
        const [width, height] = [window.innerWidth, window.innerHeight];
        mapViewA.resize(width, height);
        mapViewB.resize(width, height);
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderTargetA.setSize(width * window.devicePixelRatio, height * window.devicePixelRatio);
        renderTargetB.setSize(width * window.devicePixelRatio, height * window.devicePixelRatio);
    }

    adjustRendererSize();
    window.addEventListener("resize", adjustRendererSize);

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
        uniform float mouseX;
        uniform sampler2D mapViewA;
        uniform sampler2D mapViewB;
        uniform float time;

        void main() {
            vec3 colorA = texture2D(mapViewA, vUv).rgb;
            vec3 colorB = texture2D(mapViewB, vUv).rgb;

            float waveWidth = 0.04;
            float waveA = floor(1.0 - mouseX + vUv.x + sin(vUv.y*5.0 + time / 500.0) * waveWidth);
            float waveB = 1.0 -
                floor(1.0 - mouseX + vUv.x + sin(vUv.y*5.0 + time / 200.0) * waveWidth);

            gl_FragColor.rgb = (colorA * waveA + colorB * waveB) / (waveA + waveB);
            gl_FragColor.a = 1.0;
        }
    `;

    // Setup post-processing scene with our shaders
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMaterial = new THREE.ShaderMaterial({
        vertexShader: postVertexShader.trim(),
        fragmentShader: postFragmentShader.trim(),
        uniforms: {
            mapViewA: { value: renderTargetA.texture },
            mapViewB: { value: renderTargetB.texture },
            mouseX: { value: 0.5 },
            time: { value: 0 }
        }
    });
    const postPlane = new THREE.PlaneBufferGeometry(2, 2);
    const postQuad = new THREE.Mesh(postPlane, postMaterial);
    const postScene = new THREE.Scene();
    postScene.add(postQuad);

    // Setup render loop handler
    renderLoop.renderFunction = time => {
        // Re-render MapViews to framebuffer only if needed (i.e mapview is animating or the
        // contents were updated) ..
        mapViewA.renderIfNeeded(time, renderTargetA);
        mapViewB.renderIfNeeded(time, renderTargetB);

        postMaterial.uniforms.time.value = time;
        //postMaterial.needsUpdate = true;

        // ... and apply after-effect always to achieve fast-response for mouse-triggered updates of
        // post-process effect.
        renderer.render(postScene, postCamera);

        renderLoop.update();
    };

    // Follow mouse movement and update mouse position in shader
    canvas.addEventListener("mousemove", event => {
        const x = event.clientX / (canvas.clientWidth * window.devicePixelRatio);

        postMaterial.uniforms.mouseX.value = x;
        //postMaterial.needsUpdate = true;
        renderLoop.update();
    });
}
