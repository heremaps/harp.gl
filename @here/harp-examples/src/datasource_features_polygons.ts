/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Style, StyleSet } from "@here/harp-datasource-protocol";
import {
    FeaturesDataSource,
    MapViewFeature,
    MapViewMultiPolygonFeature
} from "@here/harp-features-datasource";
import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey } from "../config";
import { COUNTRIES } from "../resources/countries";

/**
 * This example illustrates how to add user polygons in [[MapView]]. As custom features, they are
 * handled through a [[FeaturesDataSource]].
 *
 * First we create a base map. For more details, check the `hello` example.
 * ```typescript
 * [[include:harp_demo_features_polygons_0.ts]]
 * ```
 *
 * Then we generate a custom [[StyleSet]] for the countries, with a color gradient based on the
 * year that the country joined the EU. The [[Style]]s are all an [[ExtrudedPolygonStyle]] with only
 * a variation in the color.
 * ```typescript
 * [[include:harp_demo_features_polygons_1.ts]]
 * ```
 *
 * In order to have the extrusion animation for all the individual sets of countries joining, we
 * group them and handle them in separate datasources, so that the various datasources' tiles will
 * get animated independently and highlight new territories. The following snippet highlights the
 * core part of the application's logic: we create these individual [[FeaturesDataSource]] for each
 * set of countries, and create the [[MapViewMultiPolygonFeature]]s for the countries.
 * ```typescript
 * [[include:harp_demo_features_polygons_2.ts]]
 * ```
 *
 * The rest of the code is example-dependent logic to handle the countries sets, with the joining
 * and leaving mechanism, that adds and removes datasources.
 */
export namespace PolygonsFeaturesExample {
    const EU = getEuropeMemberStatesPerYear();
    const steps = Object.keys(EU.steps);
    const stepsNumber = steps.length;

    // snippet:harp_demo_features_polygons_1.ts
    const { styleSet, colorRamp } = generateStyleSet({
        property: "joiningDate",
        thresholds: steps.map(stringYear => Number(stringYear)),
        color: "#77ccff"
    });
    // end:harp_demo_features_polygons_1.ts

    // snippet:harp_demo_features_polygons_0.ts
    const map = createBaseMap();
    // end:harp_demo_features_polygons_0.ts

    const addPromises: Array<Promise<void>> = [];

    const dateButtons: HTMLButtonElement[] = [];
    const displayedDataSourceCache: FeaturesDataSource[] = [];
    let currentStep = 0;
    const featuresDataSources = generateDataSources();

    let intervalID: any;
    const dateDelay = 2500;
    Promise.all(addPromises).then(() => {
        intervalID = setInterval(setDate, dateDelay);
        featuresDataSources.forEach(ds => map.removeDataSource(ds));
    });
    setCaption();

    function getJoiningDate(j: number) {
        let joiningDate = steps.find(year => EU.steps[year].joining.includes(j))!;
        const actualDate = EU.steps[joiningDate].actualJoining;
        if (actualDate !== undefined) {
            joiningDate = actualDate;
        }
        return joiningDate;
    }

    function generateDataSources(): FeaturesDataSource[] {
        const datasources = [];
        for (let j = 0; j < EU.statesGroup.length; j++) {
            const stateGroup = EU.statesGroup[j];
            const features: MapViewFeature[] = [];
            let age = steps.length;
            let k = 0;
            while (!EU.steps[steps[k]].joining.includes(j)) {
                age--;
                k++;
            }
            if (stateGroup.includes("germany")) {
                age = steps.length;
            }

            // snippet:harp_demo_features_polygons_2.ts
            for (const country of stateGroup) {
                const feature = new MapViewMultiPolygonFeature(COUNTRIES[country], {
                    name: country,
                    joiningDate: getJoiningDate(j),
                    height: 25000 + age * 25000
                });
                features.push(feature);
            }
            const featuresDataSource = new FeaturesDataSource({
                name: `member-states-${j}`,
                styleSetName: "geojson",
                features,
                maxGeometryHeight: 300000
            });
            const addPromise = map.addDataSource(featuresDataSource);
            addPromises.push(addPromise);
            datasources.push(featuresDataSource);
            // end:harp_demo_features_polygons_2.ts
        }
        return datasources;
    }

    function setDate() {
        // Update the UI's CSS to show the active year.
        dateButtons.forEach(button => button.classList.remove("date-active"));
        dateButtons[currentStep].classList.add("date-active");

        const dataSourcesToShow: number[] = [];
        const dataSourcesToReShow: number[] = [];

        // If we are in the first step, empty the displayed datasource cache so all extruded
        // features have the extrusion animation.
        if (currentStep === 0) {
            while (displayedDataSourceCache.length) {
                map.removeDataSource(displayedDataSourceCache[0]);
                displayedDataSourceCache.shift();
            }
        }

        // List the datasources to show. We separate datasources referring to newly joining country
        // sets in `dataSourcesToShow`, and those already there in the previous steps, in
        // `dataSourcesToReShow`. The reason is that when jumping in a random year in the UI, we
        // may want to show the extrusion animation only for the newly joining countries, although
        // other datasources can show existing countries that were not displayed yet before the
        // click.
        for (const step of steps) {
            if (step !== steps[currentStep]) {
                dataSourcesToReShow.push(...EU.steps[step].joining);
                for (const leaving of EU.steps[step].leaving) {
                    if (dataSourcesToReShow.includes(leaving)) {
                        dataSourcesToReShow.splice(dataSourcesToReShow.indexOf(leaving), 1);
                    }
                }
            } else {
                dataSourcesToShow.push(...EU.steps[step].joining);
                for (const leaving of EU.steps[step].leaving) {
                    if (dataSourcesToReShow.includes(leaving)) {
                        dataSourcesToReShow.splice(dataSourcesToReShow.indexOf(leaving), 1);
                    }
                    if (dataSourcesToShow.includes(leaving)) {
                        dataSourcesToShow.splice(dataSourcesToShow.indexOf(leaving), 1);
                    }
                }
                break;
            }
        }
        dataSourcesToReShow.forEach(value => {
            const datasource = featuresDataSources[value];
            if (!displayedDataSourceCache.includes(datasource)) {
                map.addDataSource(datasource);
                displayedDataSourceCache.push(datasource);
            }
        });
        dataSourcesToShow.forEach(value => {
            const datasource = featuresDataSources[value];
            if (!displayedDataSourceCache.includes(datasource)) {
                map.addDataSource(datasource);
                displayedDataSourceCache.push(datasource);
            }
        });
        displayedDataSourceCache.forEach((datasource, i) => {
            let exists = false;
            dataSourcesToShow.forEach(value => {
                if (featuresDataSources[value] === datasource) {
                    exists = true;
                }
            });
            dataSourcesToReShow.forEach(value => {
                if (featuresDataSources[value] === datasource) {
                    exists = true;
                }
            });
            if (!exists) {
                displayedDataSourceCache.splice(i, 1);
                map.removeDataSource(datasource);
            }
        });
        currentStep = (currentStep + 1) % stepsNumber;
    }

    function setCaption() {
        const caption = document.getElementById("dates-container") as HTMLDivElement;
        let timeoutID: any;
        for (let j = 0; j < steps.length; j++) {
            const step = steps[j];
            const dateButton = document.createElement("button");
            dateButton.className = "date";
            dateButton.textContent = step;
            dateButton.style.backgroundColor = colorRamp[j];
            dateButtons.push(dateButton);
            dateButton.onclick = () => {
                for (let k = 0; k < steps.length; k++) {
                    if (steps[k] === dateButton.textContent) {
                        currentStep = k;
                        break;
                    }
                }
                clearInterval(intervalID);
                clearTimeout(timeoutID);
                setDate();
                timeoutID = setTimeout(() => {
                    intervalID = setInterval(setDate, dateDelay);
                }, dateDelay);
            };
            caption.appendChild(dateButton);
        }
    }

    function generateStyleSet(options: {
        thresholds: number[];
        color: string;
        property: string;
    }): { styleSet: StyleSet; colorRamp: string[] } {
        const styles: StyleSet = [];
        const colorStrings: string[] = [];
        const length = options.thresholds.length;
        for (let i = 0; i < length; i++) {
            const color = new THREE.Color(options.color);
            color.multiplyScalar((length - i) / 2.5 / length + 0.6);
            const colorString = "#" + color.getHexString();
            colorStrings.push(colorString);
            const max = options.thresholds[i];
            const min = i - 1 < 0 ? 0 : options.thresholds[i - 1];
            const propertyName = options.property;
            const style: Style = {
                description: "geoJson property-based style",
                technique: "extruded-polygon",
                when: [
                    "all",
                    ["==", ["geometry-type"], "Polygon"],
                    [">", ["to-number", ["get", propertyName]], min],
                    ["<=", ["to-number", ["get", propertyName]], max]
                ],
                attr: {
                    color: colorString,
                    transparent: true,
                    opacity: 0.8,
                    boundaryWalls: false,
                    constantHeight: true,
                    lineWidth: 1,
                    lineColor: "#003344",
                    emissive: colorString,
                    emissiveIntensity: 0.45
                },
                renderOrder: 1000
            };
            styles.push(style);
        }
        return { styleSet: styles, colorRamp: colorStrings };
    }

    function createBaseMap(): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            projection: sphereProjection,
            theme: {
                extends: "resources/berlin_tilezen_night_reduced.json",
                definitions: {
                    northPoleColor: {
                        type: "color",
                        value: "#3a3c3e"
                    },
                    southPoleColor: {
                        type: "color",
                        value: "#4a4d4e"
                    }
                },
                styles: {
                    geojson: styleSet,
                    polar: [
                        {
                            description: "North pole",
                            when: ["==", ["get", "kind"], "north_pole"],
                            technique: "fill",
                            attr: {
                                color: ["ref", "northPoleColor"]
                            },
                            renderOrder: 5
                        },
                        {
                            description: "South pole",
                            when: ["==", ["get", "kind"], "south_pole"],
                            technique: "fill",
                            attr: {
                                color: ["ref", "southPoleColor"]
                            },
                            renderOrder: 5
                        }
                    ]
                }
            },
            target: new GeoCoordinates(40, 15),
            zoomLevel: 3.2,
            enableMixedLod: true
        });
        mapView.renderLabels = false;

        const controls = new MapControls(mapView);
        controls.maxTiltAngle = 50;
        controls.maxZoomLevel = 6;

        const ui = new MapControlsUI(controls, { projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const baseMap = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });
        mapView.addDataSource(baseMap);

        return mapView;
    }

    function getEuropeMemberStatesPerYear(): {
        steps: { [key: string]: { joining: number[]; leaving: number[]; actualJoining?: string } };
        statesGroup: string[][];
    } {
        const statesGroup = [
            ["france", "belgium", "netherlands", "italy", "luxembourg"],
            ["algeria"],
            ["ireland", "denmark"],
            ["greenland"],
            ["greece"],
            ["spain", "portugal"],
            ["frg"],
            ["germany"],
            ["austria", "sweden", "finland"],
            [
                "estonia",
                "latvia",
                "lituania",
                "poland",
                "slovakia",
                "hungary",
                "czech",
                "slovenia",
                "cyprus",
                "malta"
            ],
            ["romania", "bulgaria"],
            ["croatia"],
            ["uk"]
        ];
        const UE = {
            "1957": {
                joining: [0, 1, 6],
                // Remove other country groups when looping.
                leaving: [2, 3, 4, 5, 7, 8, 9, 10, 11, 12]
            },
            "1962": { leaving: [1], joining: [] },
            "1973": {
                joining: [2, 3, 12],
                leaving: []
            },
            "1981": {
                joining: [4],
                leaving: []
            },
            "1985": { leaving: [3], joining: [] },
            "1986": { joining: [5], leaving: [] },
            "1990": { leaving: [6], joining: [7], actualJoining: "1957" },
            "1995": { joining: [8], leaving: [] },
            "2004": {
                joining: [9],
                leaving: []
            },
            "2007": { joining: [10], leaving: [] },
            "2013": { joining: [11], leaving: [] },
            "2020": { joining: [], leaving: [12] }
        };
        return { steps: UE, statesGroup };
    }

    function getExampleHTML() {
        return (
            `
            <style>
                #mapCanvas {
                    top: 0;
                }
                #caption{
                    width: 100%;
                    position: absolute;
                    bottom: 25px;
                    text-align:center;
                    font-family: Arial;
                    color:#222;
                }
                #dates-container{
                    padding:3px
                }
                h1{
                    font-size:15px;
                    text-transform: uppercase;
                }
                h1, .date{
                    padding: 5px 15px;
                    display: inline-block;
                }
                .date{
                    display: inline;
                    border:none;
                    outline:none;
                    transition: all 0.5s ease;
                    background: none;
                    cursor: pointer;
                    font-weight: bold;
                    color: #222;
                    border-bottom: solid 3px rgba(0,0,0,0);
                }
                .date-active{
                    border-bottom: solid 3px rgba(0,0,0,1);
                }
                #caption-bg{
                    display: inline-block;
                    background: rgba(255,255,255,0.8);
                    border-radius: 4px;
                    margin: 0 10px;
                    max-width:calc(100% - 150px);
                }
                #info{
                    color: #fff;
                    width: 80%;
                    text-align: center;
                    font-family: monospace;
                    left: 50%;
                    position: relative;
                    margin: 10px 0 0 -40%;
                    font-size: 15px;
                }
                @media screen and (max-width: 700px) {
                    .date{
                        padding:5px;
                    }
                    h1{
                        padding:0px;
                        margin:5px
                    }
                    #info{
                        font-size:11px;
                    }
                }
            </style>
            <p id=info>This example demonstrates user polygons, with ` +
            `property-based styling for their color. The height also ` +
            `directly comes from the feature's "height" property by default. Here both the color ` +
            `and the height represent the seniority of a state.</p>
            <div id=caption>
                <div id=caption-bg>
                    <h1>Member states of the European Union</h1>
                    <div id=dates-container></div>
                </div>
            </div>
        `
        );
    }
}
