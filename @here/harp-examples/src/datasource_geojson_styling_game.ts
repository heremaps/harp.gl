/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FillStyle, Style, StyleSet } from "@here/harp-datasource-protocol";
import { GeoJsonDataSource } from "@here/harp-geojson-datasource";
import { GeoCoordinates, TileKey } from "@here/harp-geoutils";
import { CopyrightElementHandler, CopyrightInfo, MapView } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";
import * as geojson from "../resources/italy.json";

/**
 * This example showcases how to use the styling of a [[GeoJsonDataSource]] with a dynamic
 * [[StyleSet]] to generate a quizz game. First we generate a [[MapView]], without [[MapControls]]
 * this time, and attach it a base map from an [[OmvDataSource]].
 * ```typescript
 * [[include:harp_gl_initmapview.ts]]
 * ```
 *
 * We then create the map of Italy via a custom [[GeoJsonDataSource]] that only serves one GeoJson.
 * This is performed via a custom class, `StaticGeoJsonDataSource`. See the `datasource / geojson`
 * example that focuses on this code. When the datasource is linked we then set its [[StyleSet]] and
 * add the click listener on the canvas to handle the quizz logic.
 * ```typescript
 * [[include:harp_gl_staticgeojson.ts]]
 * ```
 *
 * The quizz logic is performed when a region is picked. The name of the picked
 * region is compared to the expected name, and if they match, an update to the
 * [[GeoJsonDataSource]]'s [[StyleSet]] is performed.
 * ```typescript
 * [[include:harp_gl_gamelogic.ts]]
 * ```
 *
 * The custom styling of the map given a feature property, like `name` in this example, is achieved
 * in the `when` expression of a [[Style]].
 * ```typescript
 * [[include:harp_gl_gamestyleset.ts]]
 * ```
 */
export namespace GeoJsonStylingGame {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
            #prompter{
                margin: 10px;
                padding: 10px;
                display: inline-block;
                background-color: #37afaa
            }
            #asked-name{
                text-transform: uppercase
            }
        </style>
        <p id="prompter">Find the following region: <strong id="asked-name"></strong></p>
    `;

    const REGION_LIST: string[] = geojson.features
        .filter(feature => {
            return feature.properties !== undefined && feature.properties.name !== undefined;
        })
        .map(feature => feature.properties.name);
    let askedName: string = "";

    // This will dismiss the picking and the style changes when the correct region is clicked, so
    // that the user cannot miss it in case he clicked on another one immediately after.
    let discardPick: boolean = false;

    // snippet:harp_gl_initmapview.ts
    const mapView = new MapView({
        canvas: document.getElementById("mapCanvas") as HTMLCanvasElement,
        theme: "resources/berlin_tilezen_night_reduced.json"
    });
    CopyrightElementHandler.install("copyrightNotice", mapView);
    mapView.camera.position.set(1900000, 3350000, 2500000); // Europe.
    mapView.geoCenter = new GeoCoordinates(16, -4, 0);
    mapView.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => {
        mapView.resize(window.innerWidth, window.innerHeight);
    });
    const hereCopyrightInfo: CopyrightInfo = {
        id: "here.com",
        year: new Date().getFullYear(),
        label: "HERE",
        link: "https://legal.here.com/terms"
    };
    const copyrights: CopyrightInfo[] = [hereCopyrightInfo];
    const baseMap = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        maxZoomLevel: 17,
        authenticationCode: accessToken,
        copyrightInfo: copyrights
    });
    mapView.addDataSource(baseMap);
    // end:harp_gl_initmapview.ts

    // snippet:harp_gl_staticgeojson.ts
    class StaticGeoJsonDataSource extends GeoJsonDataSource {
        shouldRender(zoomLevel: number, tileKey: TileKey) {
            return tileKey.mortonCode() === 1;
        }

        getTile(tileKey: TileKey) {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return super.getTile(tileKey);
        }
    }

    class StaticDataProvider implements DataProvider {
        ready(): boolean {
            return true;
        }
        // tslint:disable-next-line:no-empty
        async connect(): Promise<void> {}

        async getTile(): Promise<{}> {
            return geojson;
        }
    }

    const staticDataProvider = new StaticDataProvider();

    const geoJsonDataSource = new StaticGeoJsonDataSource({
        dataProvider: staticDataProvider,
        name: "geojson"
    });

    mapView.addDataSource(geoJsonDataSource).then(() => {
        setStyleSet();
        askName();
        mapView.canvas.addEventListener("click", displayAnswer);
    });
    // end:harp_gl_staticgeojson.ts

    // snippet:harp_gl_gamelogic.ts
    function displayAnswer(e: MouseEvent) {
        if (discardPick) {
            return;
        }
        const intersectionResults = mapView.intersectMapObjects(e.pageX, e.pageY);
        const usableResults = intersectionResults.filter(result => result.userData !== undefined);
        if (usableResults.length > 0) {
            const name = usableResults[0].userData.name;
            const correct = name === askedName;
            setStyleSet({ name, correct });
            // Discard the picking when the StyleSet is changed so that the new tiles have the time
            // to be generated before changing them all over again.
            discardPick = true;
            setTimeout(
                () => {
                    if (correct) {
                        askName();
                    }
                    setStyleSet();
                    discardPick = false;
                },
                // If the answer is correct, wait a longer time so that the user has time to see the
                // correct result in case he was clicking fast and randomly.
                correct ? 1000 : 300
            );
        }
    }
    // end:harp_gl_gamelogic.ts

    interface IStatus {
        name: string;
        correct: boolean;
    }

    const outlineStyle: Style = {
        when: "type == 'polygon'",
        description: "GeoJson polygon outline",
        renderOrder: 1001,
        technique: "solid-line",
        attr: {
            color: "#267874",
            lineWidth: 3,
            metricUnit: "Pixel"
        }
    };
    const baseRegionsStyle: Style = {
        description: "GeoJson polygon",
        when: "type == 'polygon'",
        renderOrder: 1000,
        technique: "fill",
        attr: {
            color: "#37afaa"
        }
    };
    const activeRegionStyle: FillStyle = {
        description: "GeoJson polygon",
        when: "type == 'polygon'",
        renderOrder: 1001,
        technique: "fill",
        attr: {}
    };

    // snippet:harp_gl_gamestyleset.ts
    function setStyleSet(status?: IStatus) {
        const styleSet: StyleSet = [baseRegionsStyle, outlineStyle];
        if (status !== undefined) {
            activeRegionStyle.when = `type == 'polygon' && properties.name == '${status.name}'`;
            activeRegionStyle.attr!.color = status.correct ? "#009900" : "#ff4422";
            styleSet.push(activeRegionStyle);
        }
        geoJsonDataSource.setStyleSet(styleSet);
        mapView.update();
    }
    // end:harp_gl_gamestyleset.ts

    function askName() {
        const nameIndex = Math.floor(Math.random() * REGION_LIST.length);
        askedName = REGION_LIST[nameIndex];
        (document.getElementById("asked-name") as HTMLParagraphElement).innerHTML = askedName;
    }
}
