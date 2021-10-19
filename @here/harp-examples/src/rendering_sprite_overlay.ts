/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    MapView,
    MapViewEventNames,
    TextureLoader
} from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey } from "../config";

/**
 * Example showing how to render sprites using an orthographic camera on top of the mapview.
 */
export namespace RenderingSpriteOverlay {
    let makeAppleMouseHappy = true;
    function toggleAppleMouseFriendlyControls(controls: MapControls) {
        controls.zoomLevelDeltaOnMouseWheel *= makeAppleMouseHappy ? 0.1 : 10;
        controls.zoomInertiaDampingDuration = makeAppleMouseHappy ? 0.05 : 0.5;
        makeAppleMouseHappy = !makeAppleMouseHappy;
    }

    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const NY = new GeoCoordinates(40.707, -74.01);
    const mapView = new MapView({
        canvas,
        theme: "resources/berlin_tilezen_base.json",
        target: NY,
        tilt: 50,
        heading: -20,
        zoomLevel: 16.1
    });

    CopyrightElementHandler.install("copyrightNotice", mapView);

    // Instantiate the default map controls, allowing the user to pan around freely.
    const mapControls = new MapControls(mapView);
    mapControls.maxTiltAngle = 80;
    toggleAppleMouseFriendlyControls(mapControls);

    // Add an UI.
    const ui = new MapControlsUI(mapControls);
    canvas.parentElement!.appendChild(ui.domElement);

    // Resize the mapView to maximum.
    mapView.resize(window.innerWidth, window.innerHeight);

    // React on resize events.
    window.addEventListener("resize", () => {
        mapView.resize(window.innerWidth, window.innerHeight);
    });

    const omvDataSource = new VectorTileDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        authenticationCode: apikey
    });
    mapView.addDataSource(omvDataSource);

    const texture = new TextureLoader().load("resources/wests_textures/clover.png");
    texture.then(tex => {
        const spriteMaterial = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(spriteMaterial);
        const sceneOrtho = new THREE.Scene();
        sceneOrtho.add(sprite);
        const cameraOrtho = new THREE.OrthographicCamera(
            -window.innerWidth / 2,
            window.innerWidth / 2,
            window.innerHeight / 2,
            -window.innerHeight / 2,
            1,
            10
        );
        cameraOrtho.position.z = 10;
        cameraOrtho.updateProjectionMatrix();
        // The displacement map is currently 32x32px in size, so we blow it up a bit.
        sprite.scale.set(200, 200, 1);
        sprite.position.z = 1;
        sprite.position.x = -window.innerWidth / 2 + sprite.scale.x / 2;
        sprite.position.y = window.innerHeight / 2 - sprite.scale.y / 2;

        const renderSprite = () => {
            mapView.renderer.clearDepth();
            mapView.renderer.render(sceneOrtho, cameraOrtho);
        };
        mapView.addEventListener(MapViewEventNames.AfterRender, renderSprite);
    });
}
