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
 * This example demonstrates how to use XYZ's REST API with the [[MapView]] map rendering SDK. As
 * for every case it is hereafter assumed that a [[MapView]] instance has been first created, and
 * then linked to a tile data source so a base map can be displayed.
 *
 * Then we add the [[XYZDataProvider]] and link it to a new [[GeoJSONDataSource]]. The latter is
 * added to the [[MapView]] instance:
 * ```typescript
 * [[include:xyz_1.ts]]
 * ```
 *
 * Then the link to XYZ's API is handled via an input field where the user can paste the URL of
 * the desired space. To then update the data source, a small function is needed to parse the URL:
 * ```typescript
 * [[include:xyz_2.ts]]
 * ```
 *
 * Alternatively the XYZ Url can be passed via a query parameter passed to the page url:
 * Usage:
 * `<the application url>?url=<the xyz url>`
 *
 * Then the url Query Parameter will be parsed so it can be used to update the MapView:
 * ```typescript
 * [[include:xyz_3.ts]]
 * ```
 *
 * Finally, the engine instance is updated when a new URL is pasted and the [[TileChache]] is
 * cleansed:
 * ```typescript
 * [[include:xyz_3.ts]]
 * ```
 */
import { GeoJsonDataSource } from "@here/geojson-datasource/lib/GeoJsonDataSource";
import { XYZDataProvider } from "@here/geojson-datasource/lib/XYZDataProvider";
import { GeoCoordinates } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";
import { LoggerManager } from "@here/utils";
import { bearerTokenProvider } from "./common";

const logger = LoggerManager.instance.create("xyz-space");

export namespace XYZExample {
    document.body.innerHTML += `
        <style>
            #xyz-input-box{
                bottom: 0;
                position: relative;
                opacity: 0.8;
                box-sizing: border-box;
            }
            #xyz-input, #theme-input{
                font-family: Arial, sans-serif;
                font-size: 0.9em;
                padding: 9px 12px;
                outline: none;
                margin: 5px;
                margin-bottom: 0;
                height: 34px;
                background-color: #e7e8e9;
                border: 0;
                border-right: 1px solid #c7c7c7;
                box-sizing: border-box;
                width: calc(100% - 225px);
                display: inline-block;
                vertical-align: middle;
            }
            #xyz-button, #theme-open, #theme-pasted, #theme-close{
                background: #37afaa;
                display: inline-block;
                height: 34px;
                color: white;
                border: none;
                width: 100px;
                vertical-align: bottom;
                cursor: pointer;
            }
            #theme-input{
                display: block;
                width: 500px;
                height: 300px;
                resize: vertical;
                max-height: 80%;
                margin-bottom: 10px;
            }
            #mouse-picked-result{
                position:absolute;
                bottom:5px;
                border-radius: 5px;
                margin-left:10px;
                padding: 9px 12px;
                background: #37afaa;
                display: inline-block;
                visibility: hidden;
            }
            #theme-box{
                background: rgba(0,0,0,0.5);
                position: absolute;
                top: 0;
                width: 100%;
                height: 100%;
                text-align: center;
            }
            #theme-box.hidden{
                display: none;
            }
            #theme-box.visible{
                display: block;
            }
            #theme-container, .valign{
                display: inline-block;
                vertical-align: middle;
            }
        </style>

        <pre id="mouse-picked-result"></pre>

        <div id="xyz-input-box">

            <input
                type="text"
                id="xyz-input"
                placeholder="Paste a full XYZ URL here."
            />

            <button id="xyz-button">Go</button>

            <button id="theme-open">Change theme</button>

        </div>

        <div id="theme-box" class="hidden">

            <div id="theme-container">
                <textarea
                    id="theme-input"
                    name="Gimme a json theme !"
                    placeholder="Paste a theme for the GeoJson data source here."
                ></textarea>

                <button id="theme-pasted">Ok</button>

                <button id="theme-close">Close</button>
            </div>

            <span class=valign style="height: 100%;"></span>

        </div>
    `;

    // tslint:disable:max-line-length
    const defaultTheme = `
    {
        "styles": {
            "geojson": [
                {
                    "description": "xyz geoJson Points.",
                    "when": "type == 'point'",
                    "renderOrder": 1000,
                    "technique": "shader",
                    "attr": {
                        "id": "pointMarker",
                        "primitive": "point",
                        "params": {
                            "transparent": true,
                            "depthTest": true,
                            "vertexShader":
                                "uniform float uSize; void main(){ vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 ); gl_PointSize = uSize * 0.2; gl_Position = projectionMatrix * mvPosition; gl_Position.z = 1.0; }",
                            "fragmentShader":
                                "uniform sampler2D uTexture; void main() { vec2 texCoord = gl_PointCoord; vec4 color = texture2D( uTexture, texCoord ); if(color.b < 0.01)discard;gl_FragColor = color;}",
                            "uniforms": {
                                "uTexture": { "type": "t", "value": null },
                                "uSize": { "type": "f", "value": 128 }
                            }
                        }
                    }
                },
                {
                    "description": "xyz geoJson lines.",
                    "when": "type == 'line'",
                    "renderOrder": 1000,
                    "technique": "solid-line",
                    "attr": {
                        "color": "#37afaa",
                        "transparent": true,
                        "opacity": 0.5,
                        "lineWidth": [
                            {
                                "maxLevel": 3,
                                "value": 3000
                            },
                            {
                                "maxLevel": 4,
                                "value": 1600
                            },
                            {
                                "maxLevel": 5,
                                "value": 560
                            },
                            {
                                "maxLevel": 6,
                                "value": 300
                            },
                            {
                                "maxLevel": 7,
                                "value": 180
                            },
                            {
                                "maxLevel": 8,
                                "value": 100
                            },
                            {
                                "maxLevel": 9,
                                "value": 40
                            },
                            {
                                "maxLevel": 10,
                                "value": 30
                            },
                            {
                                "maxLevel": 11,
                                "value": 20
                            },
                            {
                                "maxLevel": 12,
                                "value": 1
                            },
                            {
                                "value": 1
                            }
                        ]
                    }
                },
                {
                    "description": "xyz geoJson polygon",
                    "when": "type == 'polygon'",
                    "renderOrder": 1000,
                    "technique": "fill",
                    "attr": {
                        "color": "#ffff00",
                        "transparent": true,
                        "opacity": 0.5
                    }
                }
            ]
        }
    }`;
    // tslint:enable:max-line-length

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
        apiFormat: APIFormat.HereV1,
        authenticationCode: bearerTokenProvider
    });

    mapView.addDataSource(omvDataSource);

    initTextForm();

    const xyzUrlString = getXYZUrlFromWindowLocation(window.location.href);

    if (xyzUrlString) {
        updateMapView(xyzUrlString);
    }

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const sampleMapView = new MapView({
            canvas,
            theme: "resources/theme.json"
        });

        sampleMapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        sampleMapView.geoCenter = new GeoCoordinates(22, 0, 0);

        MapControls.create(sampleMapView);
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        canvas.addEventListener("mousedown", event => {
            handlePick(sampleMapView, event.pageX, event.pageY);
        });

        return sampleMapView;
    }

    function addGeoJsonDataSource(baseUrl: string, spaceId: string, token: string) {
        // snippet:xyz_1.ts
        const xyzDataProvider = new XYZDataProvider({ baseUrl, spaceId, token });
        const geoJsonDataSource = new GeoJsonDataSource({
            dataProvider: xyzDataProvider
        });
        mapView.addDataSource(geoJsonDataSource).then(() => {
            updateGeoJsonTheme(defaultTheme);
        });
        // end:xyz_1.ts
    }

    // snippet:xyz_2.ts
    function parseXYZSpaceUrl(urlString: string) {
        let spaceId = "";
        let token = "";
        let baseUrl = "";
        const url = new URL(urlString);
        baseUrl = url.origin + "/hub/spaces";
        const match = url.pathname.match(/.*\/hub\/spaces\/([^\/]*)\/.*/);
        if (match && match.length >= 2) {
            spaceId = match[1];
        }
        if (url.searchParams.has("access_token")) {
            token = url.searchParams.get("access_token") as string;
        }

        return {
            baseUrl,
            spaceId,
            token
        };
    }
    // end:xyz_2.ts

    function handlePick(mapViewUsed: MapView, x: number, y: number) {
        const intersectionResults = mapViewUsed.intersectMapObjects(x, y);
        if (intersectionResults.length > 0) {
            const element = document.getElementById("mouse-picked-result");
            if (element !== null) {
                const intersection = intersectionResults[0].intersection;
                if (intersection !== undefined && intersection.object !== undefined) {
                    const objInfo = intersection.object.userData.objInfo;
                    if (objInfo !== undefined) {
                        element.style.visibility = "visible";
                        element.innerHTML = JSON.stringify(objInfo, undefined, 2);
                    }
                }
            }
            logger.log(intersectionResults);
        }
    }

    function initTextForm() {
        const xyzField = document.getElementById("xyz-input");
        const xyzButton = document.getElementById("xyz-button");
        const themeOpen = document.getElementById("theme-open");
        const themeClose = document.getElementById("theme-close");
        const themePasted = document.getElementById("theme-pasted");
        const themeField = document.getElementById("theme-input");
        const themeBox = document.getElementById("theme-box");
        if (xyzField !== undefined) {
            (xyzField as HTMLInputElement).addEventListener("keyup", e => {
                e.preventDefault();
                // Number 13 is the "Enter" key on the keyboard
                if (e.keyCode === 13) {
                    const xyzUrl = (xyzField as HTMLInputElement).value;
                    updateMapView(xyzUrl);
                }
            });
        }
        if (xyzButton !== undefined) {
            (xyzButton as HTMLButtonElement).addEventListener("click", e => {
                if (xyzField !== undefined) {
                    const xyzUrl = (xyzField as HTMLInputElement).value;
                    updateMapView(xyzUrl);
                }
            });
        }
        if (themeField !== undefined) {
            (themeField as HTMLTextAreaElement).addEventListener("keyup", e => {
                e.preventDefault();
                // Number 13 is the "Enter" key on the keyboard
                if (e.keyCode === 13) {
                    const jsonTheme = (themeField as HTMLTextAreaElement).value;
                    updateGeoJsonTheme(jsonTheme);
                }
            });
            /* tslint:disable:max-line-length */
            (themeField as HTMLTextAreaElement).value = defaultTheme;
        }
        /* tslint:enable:max-line-length */
        if (themeOpen !== undefined) {
            (themeOpen as HTMLButtonElement).addEventListener("click", e => {
                if (themeBox !== undefined) {
                    (themeBox as HTMLDivElement).classList.replace("hidden", "visible");
                }
            });
        }
        if (themeClose !== undefined) {
            (themeClose as HTMLButtonElement).addEventListener("click", e => {
                if (themeBox !== undefined) {
                    (themeBox as HTMLDivElement).classList.replace("visible", "hidden");
                }
            });
        }
        if (themePasted !== undefined) {
            (themePasted as HTMLButtonElement).addEventListener("click", e => {
                if (themeField !== undefined) {
                    const jsonTheme = (themeField as HTMLTextAreaElement).value;
                    updateGeoJsonTheme(jsonTheme);
                }
                if (themeBox !== undefined) {
                    (themeBox as HTMLDivElement).classList.replace("visible", "hidden");
                }
            });
        }
    }

    // snippet:xyz_3.ts
    function updateMapView(xyzUrl: string) {
        const { baseUrl, spaceId, token } = parseXYZSpaceUrl(xyzUrl);
        const dataSource = mapView.getDataSourcesByStyleSetName("geojson")[0];
        if (dataSource === undefined) {
            addGeoJsonDataSource(baseUrl, spaceId, token);
        } else {
            // tslint:disable-next-line:max-line-length
            const xyzDataProvider = (dataSource as GeoJsonDataSource).dataProvider() as XYZDataProvider;
            xyzDataProvider.setParameters(baseUrl, spaceId, token);
        }
        window.top.location.hash = `#dist/verity_xyz_show_space?url=${xyzUrl}`;
        mapView.clearTileCache("geojson");
        mapView.update();
    }
    // end:xyz_3.ts

    // snippet:xyz_4.ts
    function getXYZUrlFromWindowLocation(windowLocation: string): string {
        const url = new URL(windowLocation);
        if (url.search.indexOf("?url=") === 0) {
            return url.search.slice(5);
        }
        return "";
    }
    // end:xyz_4.ts

    function updateGeoJsonTheme(theme: string) {
        const geoJsonDataSource = mapView.getDataSourcesByStyleSetName("geojson")[0];
        if (geoJsonDataSource !== undefined) {
            const geoJsonTheme = JSON.parse(theme);
            geoJsonDataSource.setStyleSet(geoJsonTheme.styles.geojson);
        }
    }
}
