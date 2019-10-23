/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, ProjectionType } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import * as THREE from "three";

import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import "../../../node_modules/three/examples/js/loaders/SVGLoader";
import { accessToken } from "../config";

export namespace ThreeJSMorphing {
    const map = createBaseMap();

    const target = new GeoCoordinates(46.42, 6.89);
    map.lookAt(target, 40000, 40, 45);

    loadMorphingSVGOnMap({
        url: "resources/morph.svg",
        location: new GeoCoordinates(46.54, 6.605),
        mapView: map
    });

    map.beginAnimation();

    function loadMorphingSVGOnMap(options: {
        url: string;
        location: GeoCoordinates;
        mapView: MapView;
    }) {
        if (options.mapView.projection.type !== ProjectionType.Planar) {
            throw new Error("Morphing SVG only works for a flat map.");
        }
        new (THREE as any).SVGLoader().load(options.url, (data: any) => {
            const positionArrays: any[] = [];
            let faces;
            data.paths.forEach((path: any) => {
                const shapes = path.toShapes(true);
                shapes.forEach((shape: any) => {
                    const shapeBufferGeometry = new THREE.ShapeBufferGeometry(shape);
                    const shapeGeometry = new THREE.Geometry().fromBufferGeometry(
                        shapeBufferGeometry
                    );
                    positionArrays.push(shapeGeometry.vertices);
                    faces = shapeGeometry.faces;
                });
            });

            const geometry = new THREE.Geometry();
            geometry.vertices = positionArrays[0];
            geometry.faces = (faces as any) as THREE.Face3[];
            geometry.morphTargets.push({
                name: "target0",
                vertices: positionArrays[0]
            });
            geometry.morphTargets.push({
                name: "target1",
                vertices: positionArrays[1]
            });
            const g = new THREE.BufferGeometry().fromGeometry(geometry);
            const material = new THREE.MeshPhongMaterial({
                color: 0x335599,
                opacity: 0.5,
                transparent: true,
                depthTest: false,
                morphTargets: true,
                side: THREE.DoubleSide
            });
            const morphMesh = new THREE.Mesh(g, material);
            morphMesh.rotation.x = Math.PI;
            morphMesh.morphTargetInfluences = [1, 0];
            morphMesh.renderOrder = 1000;

            // Put mesh in map.
            (morphMesh as any).geoPosition = options.location;
            morphMesh.scale.set(50, 50, 50);
            options.mapView.mapAnchors.add(morphMesh);

            const slider = document.getElementById("slider") as HTMLInputElement;
            const updateSlider = () => {
                morphMesh.morphTargetInfluences![0] = 1 - Number(slider.value);
                morphMesh.morphTargetInfluences![1] = Number(slider.value);
                (morphMesh.material as THREE.MeshPhongMaterial).color
                    .setHex(0x335599)
                    .multiplyScalar(((Number(slider.value) / 6) * 10) / 2 + 0.5);
            };
            updateSlider();
            slider.addEventListener("input", updateSlider);
        });
    }

    function createBaseMap(): MapView {
        document.body.innerHTML += getExampleHTML();
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_effects_streets.json"
        });
        mapView.loadPostEffects("resources/effects_streets.json");

        const mapControls = new MapControls(mapView);
        mapControls.maxTiltAngle = 50;

        const center = new GeoCoordinates(0, 10);
        mapView.setCameraGeolocationAndZoom(center, 3);

        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken
        });

        mapView.addDataSource(omvDataSource);
        return mapView;
    }

    function getExampleHTML() {
        return (
            `<input id="slider" type="range" min=0.4 max=1 step=0.01 value=0.4 style="pos` +
            `ition: absolute; bottom: 10px; width: 200px; margin - left: -100px; left: 50 %; "/>`
        );
    }
}
