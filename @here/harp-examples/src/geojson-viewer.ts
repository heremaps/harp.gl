/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet, Theme } from "@here/harp-datasource-protocol";
import { FeaturesDataSource } from "@here/harp-features-datasource";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { apikey } from "../config";

/**
 * In this example we avail ourselves of the [[FeaturesDataSource]] and its `setFromGeoJson` method
 * to read GeoJSON from a file or from a textarea in the page. A default style is applied for all
 * possible geometry types.
 */
export namespace GeoJsonExample {
    const editorWidth = "550px";
    const customTheme: Theme = {
        extends: "resources/berlin_tilezen_night_reduced.json",
        styles: {
            geojson: getStyleSet()
        }
    };

    const map = createBaseMap(customTheme);

    setUpFilePicker();
    setUpEditor();

    const featuresDataSource = new FeaturesDataSource({ styleSetName: "geojson" });
    map.addDataSource(featuresDataSource);

    function setUpEditor() {
        const editorInput = document.querySelector("#editor textarea") as HTMLTextAreaElement;
        editorInput.placeholder = `{
    type: "FeatureCollection",
    features:[

    ]
}`;
        const updateButton = document.querySelector("#editor button") as HTMLButtonElement;
        updateButton.addEventListener("click", () => {
            const geojson = JSON.parse(
                (document.querySelector("#editor textarea") as HTMLTextAreaElement).value
            );
            featuresDataSource.setFromGeojson(geojson);
        });
    }

    function getStyleSet(): StyleSet {
        return [
            {
                when: "$geometryType == 'polygon'",
                technique: "fill",
                renderOrder: 10000,
                attr: {
                    color: "#7cf",
                    transparent: true,
                    opacity: 0.8,
                    lineWidth: 1,
                    lineColor: "#003344"
                }
            },
            {
                when: "$geometryType == 'polygon'",
                technique: "solid-line",
                renderOrder: 10001,
                attr: {
                    color: "#8df",
                    metricUnit: "Pixel",
                    lineWidth: 5
                }
            },
            {
                when: "$geometryType == 'point'",
                technique: "circles",
                renderOrder: 10002,
                attr: {
                    size: 10,
                    color: "#5ad"
                }
            },
            {
                when: "$geometryType == 'line'",
                technique: "solid-line",
                renderOrder: 10000,
                attr: {
                    color: "#8df",
                    metricUnit: "Pixel",
                    lineWidth: 5
                }
            }
        ];
    }

    function processGeoJsonFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => {
            (document.querySelector(
                "#editor textarea"
            ) as HTMLTextAreaElement).value = reader.result as string;
            featuresDataSource.setFromGeojson(JSON.parse(reader.result as string));
            map.update();
        };
        if (file.type === "application/geo+json" || file.type === "application/json") {
            reader.readAsText(file);
        }
    }

    function setUpFilePicker() {
        const input = document.getElementById("input") as HTMLInputElement;
        input.addEventListener("change", e => {
            const file = input.files![0];
            processGeoJsonFile(file);
        });

        const overlay = document.getElementById("drag-overlay") as HTMLDivElement;
        window.addEventListener("dragover", e => {
            e.preventDefault();
            overlay.style.display = "block";
        });
        const removeOverlay = (e: any) => {
            e.preventDefault();
            overlay.style.display = "none";
        };
        overlay.addEventListener("dragleave", removeOverlay);
        overlay.addEventListener("dragend", removeOverlay);
        overlay.addEventListener("dragexit", removeOverlay);
        overlay.addEventListener(
            "drop",
            e => {
                removeOverlay(e);
                const file = e.dataTransfer!.files[0];
                processGeoJsonFile(file);
            },
            false
        );
    }

    function createBaseMap(theme: Theme): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme
        });
        mapView.renderLabels = false;

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls, { projectionSwitch: true });
        const width =
            innerWidth <= 450 ? 0 : Math.min(parseInt(editorWidth, undefined), innerWidth * 0.4);
        ui.domElement.style.right = width + 10 + "px";
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            const _width =
                innerWidth <= 450
                    ? 0
                    : Math.min(parseInt(editorWidth, undefined), innerWidth * 0.4);
            canvas.className = "full";
            ui.domElement.style.right = _width + 10 + "px";
            mapView.resize(innerWidth - _width, innerHeight);
        });

        const baseMap = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });
        mapView.addDataSource(baseMap);

        return mapView;
    }

    function getExampleHTML(): string {
        return `
            <link href="https://fonts.googleapis.com/css?family=Fira+Sans:400,500,600&amp;display=swap" rel="stylesheet">
            <style>
                :root{
                    --editor-width:${editorWidth};
                }
                #mapCanvas{
                    top:0;
                    width:calc(100% - var(--editor-width));
                    min-width: 60%;
                }
                #drag-overlay{
                    position:absolute;
                    width:calc(100% - var(--editor-width));
                    min-width: 60%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display:none
                }
                #drag-dashes{
                    --border-thickness: 9px;
                    --margin:70px;
                    position:absolute;
                    width:calc(100% - var(--margin) * 2 - var(--border-thickness) * 2);
                    height:calc(100% - var(--margin) * 2 - var(--border-thickness) * 2);
                    top:var(--margin);
                    left:var(--margin);
                    border: dashed var(--border-thickness) #fff;
                    border-radius: 25px;
                }
                #editor{
                    font-family: 'Fira Sans', sans-serif;
                    width:var(--editor-width);
                    max-width:40%;
                    right:0;
                    top:0;
                    position:absolute;
                    height:100%;
                    padding:5px;
                    background:hsla(215, 15%, 65%, 1);
                    box-sizing: border-box;
                }
                button{
                    font-family: 'Fira Sans', sans-serif;
                    background: hsla(215, 15%, 17%, 1);
                    height: 21px;
                    border: 0;
                    color: #d2d7de;
                    text-transform: uppercase;
                    cursor: pointer;
                }
                #browse{
                    display:block;
                    position:absolute;
                    right: 5px;
                    top: 5px;
                }
                #editor textarea{
                    font-family: 'Fira Sans', sans-serif;
                    position:absolute;
                    resize: none;
                    width:calc(100% - 10px);
                    height:calc(100% - 36px);
                    padding:0;
                    top:31px;
                    right:5px;
                    border:0
                }
                #info{
                    color: #fff;
                    min-width: 60%;
                    width: calc(100% - var(--editor-width));
                    text-align: center;
                    font-family: monospace;
                    left: 50%;
                    bottom: 10px;
                    font-size: 15px;
                    position: absolute;
                    margin-left: -50%;
                }
                #copyrightNotice{
                    left:0;
                    background:#888;
                    right:inherit;
                }
                @media all and (max-width: 450px) {
                    #editor{
                        display:none;
                    }
                    #mapCanvas, #info, #drag-overlay{
                        width: 100%;
                    }
                }
            </style>
            <div id=editor>
                <button style="left:5px;position:absolute;">Update</button>
                <textarea></textarea>
            </div>

            <input type="file" id="input" style="display: none;" />
            <button id=browse onclick="document.getElementById('input').click();">
                Browse a file
            </button>

            <div id="drag-overlay">
                <div id="drag-dashes"></div>
            </div>
            <p id=info>Drag and drop a GeoJSON or browse a local one.</p>
        `;
    }
}
