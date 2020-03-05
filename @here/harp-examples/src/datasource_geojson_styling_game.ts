/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Feature,
    FillStyle,
    StyleDeclaration,
    StyleSelector,
    StyleSet
} from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { apikey, copyrightInfo } from "../config";
import * as geojson from "../resources/italy.json";

/**
 * In this example showcases how to use the styling of a [[OmvDataSource]] that using a
 * [[GeoJsonDataProvider]] with a dynamic [[StyleSet]] to generate a quiz game. First, we generate a
 * [[MapView]], without [[MapControls]] this time, and then we also attach an additional base map
 * from an [[OmvDataSource]].
 * ```typescript
 * [[include:harp_gl_initmapview.ts]]
 * ```
 *
 * We then create the map of Italy via a [[OmvDataSource]] that only serves one GeoJson.
 * This is performed via a custom class, `GeoJsonDataProvider`. When the datasource is linked we
 * then set its [[StyleSet]] and add the click listener on the canvas to handle the quiz logic.
 * ```typescript
 * [[include:harp_gl_staticgeojson.ts]]
 * ```
 *
 * The quiz logic is performed when a region is picked. The name of the picked
 * region is compared to the expected name, and if they match, an update to the
 * [[OmvDataSource]]'s [[StyleSet]] is performed.
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
                background: #252c36;
                color:#d2d7df;
                position: absolute;
                right: 0;
            }
            #asked-name{
                text-transform: uppercase
            }
        </style>
        <p id="prompter">Find the following region: <strong id="asked-name"></strong></p>
    `;

    const REGION_LIST = (geojson.features as Feature[])
        .filter(feature => {
            return feature.properties !== undefined && feature.properties.name !== undefined;
        })
        .map(feature => feature.properties.name as string);
    let askedName: string = "";

    // This will dismiss the picking and the style changes when the correct region is clicked, so
    // that the user cannot miss it in case he clicked on another one immediately after.
    let discardPick: boolean = false;

    // snippet:harp_gl_initmapview.ts
    const mapView = new MapView({
        canvas: document.getElementById("mapCanvas") as HTMLCanvasElement,
        theme: "resources/berlin_tilezen_night_reduced.json",
        target: new GeoCoordinates(42.2, 12.5),
        zoomLevel: 5.9
    });
    CopyrightElementHandler.install("copyrightNotice", mapView);
    mapView.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => {
        mapView.resize(window.innerWidth, window.innerHeight);
    });
    mapView.canvas.addEventListener("contextmenu", e => e.preventDefault());
    const baseMap = new OmvDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        },
        copyrightInfo
    });
    mapView.addDataSource(baseMap);
    // end:harp_gl_initmapview.ts

    // snippet:harp_gl_staticgeojson.ts
    const geoJsonDataProvider = new GeoJsonDataProvider(
        "italy",
        new URL("resources/italy.json", window.location.href)
    );

    const geoJsonDataSource = new OmvDataSource({
        dataProvider: geoJsonDataProvider,
        name: "geojson",
        styleSetName: "geojson",
        gatherFeatureAttributes: true
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

        if (usableResults.length === 0) {
            return;
        }

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
    // end:harp_gl_gamelogic.ts

    interface IStatus {
        name: string;
        correct: boolean;
    }

    const outlineStyle: StyleDeclaration = {
        when: "$geometryType == 'polygon'",
        description: "GeoJson polygon outline",
        renderOrder: 1001,
        technique: "solid-line",
        attr: {
            color: "#267874",
            lineWidth: 1,
            metricUnit: "Pixel"
        }
    };
    const baseRegionsStyle: StyleDeclaration = {
        description: "GeoJson polygon",
        when: "$geometryType == 'polygon'",
        renderOrder: 1000,
        technique: "fill",
        attr: {
            color: "#37afaa"
        }
    };
    const activeRegionStyle: FillStyle & StyleSelector = {
        description: "GeoJson polygon",
        when: "$geometryType == 'polygon'",
        renderOrder: 1010,
        technique: "fill",
        attr: {}
    };

    // snippet:harp_gl_gamestyleset.ts
    function setStyleSet(status?: IStatus) {
        const styleSet: StyleSet = [baseRegionsStyle, outlineStyle];
        if (status !== undefined) {
            activeRegionStyle.when = `$geometryType == "polygon" && name == "${status.name}"`;
            activeRegionStyle.attr!.color = status.correct ? "#009900" : "#ff4422";
            styleSet.push(activeRegionStyle);
        }
        geoJsonDataSource.setStyleSet(styleSet);
    }
    // end:harp_gl_gamestyleset.ts

    function askName() {
        const nameIndex = Math.floor(Math.random() * REGION_LIST.length);
        askedName = REGION_LIST[nameIndex];
        (document.getElementById("asked-name") as HTMLParagraphElement).innerHTML = askedName;
    }
}
