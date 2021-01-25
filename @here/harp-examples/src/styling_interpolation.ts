/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
// import { GeoJsonDataProvider } from "@here/harp-vectortile-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { MapView } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

import { apikey, copyrightInfo } from "../config";

/**
 * This example showcases interpolated [[MapView]] techniques.
 */
export namespace TiledGeoJsonTechniquesExample {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
            #info{
                color: #fff;
                width: 80%;
                left: 50%;
                position: relative;
                margin: 10px 0 0 -40%;
                font-size: 15px;
            }
            @media screen and (max-width: 700px) {
                #info{
                    font-size:11px;
                }
            }
        </style>
        <p id=info>Zoom in and out to smoothly transition between styles.</p>
    `;

    const theme: Theme = {
        clearColor: "#234152",
        styles: {
            tilezen: [
                {
                    when: "$geometryType ^= 'polygon'",
                    technique: "line",
                    attr: {
                        lineWidth: 1,
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [3, 4],
                            values: ["#83ffff", "#000000"]
                        }
                    },
                    renderOrder: 5
                },
                {
                    description: "water",
                    when: "$layer == 'water' && $geometryType ^= 'polygon'",
                    technique: "fill",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [4, 5],
                            values: ["#13819d", "#022d38"]
                        }
                    },
                    renderOrder: 5
                },
                {
                    when: "$layer ^= 'landuse' && $geometryType ^= 'polygon' && kind ^= 'urban'",
                    technique: "fill",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [16, 17],
                            values: ["#163d47", "#294d7a"]
                        }
                    },
                    renderOrder: 0,
                    final: true
                },
                {
                    when:
                        "$layer ^= 'landuse' && (($geometryType ^= 'polygon') && kind in ['nature','forest','park','wood','natural_wood','grass','meadow','village_green','dog_park','garden','nature_reserve','protected_area'])",
                    technique: "fill",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [5, 6],
                            values: ["#006b6b", "#062520"]
                        }
                    },
                    renderOrder: 0.2,
                    final: true
                },
                {
                    description: "highway-link",
                    when: "$layer ^= 'roads' && ((kind == 'highway') && has(is_link))",
                    technique: "solid-line",
                    attr: {
                        color: "#D6C789",
                        secondaryColor: {
                            interpolation: "Linear",
                            zoomLevels: [12, 13, 14, 16, 18],
                            values: ["#163d47", "#1166aa", "#aa1166", "#00aa11", "#ff2288"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [12, 13, 14, 16, 18],
                            values: [0, 20, 12, 7, 6]
                        },
                        secondaryWidth: {
                            interpolation: "Linear",
                            zoomLevels: [12, 13, 14, 16, 18],
                            values: [0, 333, 200, 190, 22]
                        },
                        fadeNear: 0.8,
                        fadeFar: 0.9,
                        clipping: false
                    },
                    renderOrder: 15.5,
                    secondaryRenderOrder: 10.3,
                    final: true
                },
                {
                    when:
                        "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road'] && kind_detail in ['unclassified', 'residential', 'service']",
                    technique: "solid-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [13, 14, 15],
                            values: ["#337579", "#5c70d4", "#000000"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [13, 14, 15, 20],
                            values: [0, 8, 3, 1]
                        },
                        secondaryColor: {
                            interpolation: "Linear",
                            zoomLevels: [16, 18],
                            values: ["#0d1333", "#0e3a5f"]
                        },
                        secondaryWidth: {
                            interpolation: "Linear",
                            zoomLevels: [13, 14, 15, 16, 17, 20],
                            values: [0, 30, 8, 8, 4, 3]
                        }
                    },
                    secondaryRenderOrder: 10.4,
                    renderOrder: 11.4,
                    final: true
                },
                {
                    when:
                        "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road'] && kind_detail == 'tertiary'",
                    technique: "solid-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [11, 12, 13, 14, 15],
                            values: ["#337579", "#6e5cd4", "#5adeff", "#5adeff", "#000000"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [11, 12, 13, 14, 15, 20],
                            values: [0, 30, 16, 4, 3, 1]
                        },
                        secondaryColor: {
                            interpolation: "Linear",
                            zoomLevels: [16, 18],
                            values: ["#0d1333", "#0e3a5f"]
                        },
                        secondaryWidth: {
                            interpolation: "Linear",
                            zoomLevels: [11, 12, 14, 15, 16, 17, 20],
                            values: [0, 70, 30, 8, 8, 4, 3]
                        }
                    },
                    secondaryRenderOrder: 10.5,
                    renderOrder: 11.5,
                    final: true
                },
                {
                    when:
                        "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road'] && kind_detail == 'secondary'",
                    technique: "solid-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [10, 11, 12, 14, 15],
                            values: ["#337579", "#6e5cd4", "#5adeff", "#5adeff", "#000000"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [10, 11, 12, 13, 14, 15, 20],
                            values: [0, 100, 30, 16, 4, 3, 1]
                        },
                        secondaryColor: {
                            interpolation: "Linear",
                            zoomLevels: [16, 18],
                            values: ["#0d1333", "#0e3a5f"]
                        },
                        secondaryWidth: {
                            interpolation: "Linear",
                            zoomLevels: [10, 11, 14, 15, 16, 17, 20],
                            values: [0, 100, 30, 8, 8, 4, 3]
                        }
                    },
                    secondaryRenderOrder: 10.6,
                    renderOrder: 11.6,
                    final: true
                },
                {
                    when:
                        "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road'] && kind_detail == 'primary'",
                    technique: "solid-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [8, 9, 10, 14, 15],
                            values: ["#337579", "#6e5cd4", "#5adeff", "#5adeff", "#000000"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [8, 9, 10, 11, 12, 13, 14, 15, 20],
                            values: [0, 250, 160, 80, 30, 16, 4, 3, 1]
                        },
                        secondaryColor: {
                            interpolation: "Linear",
                            zoomLevels: [16, 18],
                            values: ["#0d1333", "#0e3a5f"]
                        },
                        secondaryWidth: {
                            interpolation: "Linear",
                            zoomLevels: [8, 11, 14, 15, 16, 17, 20],
                            values: [0, 100, 30, 8, 8, 4, 3]
                        }
                    },
                    secondaryRenderOrder: 10.7,
                    renderOrder: 11.7,
                    final: true
                },
                {
                    when: "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road']",
                    technique: "dashed-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [5, 6, 7, 8],
                            values: ["#337579", "#6e5cd4", "#5adeff", "#337579"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [5, 6, 7, 8],
                            values: [0, 2500, 1800, 0]
                        },
                        dashSize: {
                            interpolation: "Linear",
                            zoomLevels: [5, 7, 8],
                            values: [30000, 10000, 6000]
                        },
                        gapSize: {
                            interpolation: "Linear",
                            zoomLevels: [5, 7, 8],
                            values: [1800000, 40000, 0]
                        }
                    },
                    renderOrder: 11.9
                },
                {
                    when: "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road']",
                    technique: "dashed-line",
                    attr: {
                        opacity: 0.7,
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [5, 6, 7, 8],
                            values: ["#112233", "#111144", "#111155", "#111122"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [5, 6, 7, 8],
                            values: [0, 4500, 1400, 0]
                        },
                        dashSize: {
                            interpolation: "Linear",
                            zoomLevels: [5, 7, 8],
                            values: [27000, 9700, 5600]
                        },
                        gapSize: {
                            interpolation: "Linear",
                            zoomLevels: [5, 7, 8],
                            values: [1700000, 34000, 0]
                        }
                    },
                    renderOrder: 11.8
                },
                {
                    when: "$layer == 'roads' && kind in ['major_road', 'highway', 'minor_road']",
                    technique: "solid-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [7, 8, 14, 15],
                            values: ["#5adeff", "#5adeff", "#5adeff", "#000000"]
                        },
                        lineWidth: {
                            interpolation: "Linear",
                            zoomLevels: [7, 8, 9, 10, 11, 12, 13, 14, 15, 20],
                            values: [0, 500, 300, 200, 100, 50, 20, 6, 4, 1]
                        },

                        secondaryColor: {
                            interpolation: "Linear",
                            zoomLevels: [16, 18],
                            values: ["#0d1333", "#0e3a5f"]
                        },
                        secondaryWidth: {
                            interpolation: "Linear",
                            zoomLevels: [7, 8, 14, 15, 16, 20],
                            values: [0, 800, 30, 8, 8, 3]
                        }
                    },
                    secondaryRenderOrder: 10.99,
                    renderOrder: 11.99,
                    final: true
                },
                {
                    description: "building_geometry",
                    when: "$layer ^= 'buildings' && ($geometryType ^= 'polygon')",
                    technique: "line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [14, 15, 16, 17, 18, 19, 20],
                            values: [
                                "#163d47",
                                "#3fa6ff",
                                "#163d47",
                                "#163d47",
                                "#163d47",
                                "#163d47",
                                "#163d47"
                            ]
                        },
                        lineWidth: 2
                    },
                    renderOrder: 1999
                },
                {
                    description: "building_geometry",
                    when: "$layer ^= 'buildings' && ($geometryType ^= 'polygon')",
                    technique: "solid-line",
                    attr: {
                        color: {
                            interpolation: "Linear",
                            zoomLevels: [14, 15, 16, 18, 20],
                            values: [
                                "#163d47",
                                "#3fa6ff",
                                "hsl(180, 100%, 50%)",
                                "hsl(360, 100%, 50%)",
                                "#fff250"
                            ]
                        },
                        lineWidth: [
                            "interpolate",
                            ["linear"],
                            ["zoom"],
                            16.9,
                            ["world-ppi-scale", 10],
                            17,
                            4,
                            20,
                            1
                        ]
                    },
                    renderOrder: 1998
                },
                {
                    description: "building_geometry",
                    when: "$layer ^= 'buildings' && ($geometryType ^= 'polygon')",
                    technique: "extruded-polygon",
                    attr: {
                        color: "#000000",
                        opacity: 1,

                        emissiveIntensity: 1,
                        emissive: {
                            interpolation: "Linear",
                            zoomLevels: [14, 15, 16, 18, 20],
                            values: [
                                "#163d47",
                                "#1a3b58",
                                "hsl(180, 60%, 50%)",
                                "hsl(360, 60%, 50%)",
                                "#2d5b03"
                            ]
                        },

                        lineWidth: 1,
                        lineColorMix: 0,
                        lineColor: {
                            interpolation: "Linear",
                            zoomLevels: [14, 15, 16, 18, 20],
                            values: [
                                "#163d47",
                                "#3fa6ff",
                                "hsl(180, 100%, 50%)",
                                "hsl(360, 100%, 50%)",
                                "#fff250"
                            ]
                        },

                        maxSlope: 0.88,
                        defaultHeight: 50,
                        animateExtrusion: true
                    },
                    renderOrder: 2000
                }
            ]
        }
    };

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeBaseMap(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme
        });

        const target = new GeoCoordinates(28.595, 77.22, 0);
        mapView.lookAt({ target, zoomLevel: 15.2, tilt: 28 });

        const controls = new MapControls(mapView);

        // Add an UI.
        const ui = new MapControlsUI(controls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        window.addEventListener("keydown", (e: any) => {
            const i = [189, 187].indexOf(e.keyCode);
            if (i !== -1) {
                controls.setZoomLevel(mapView.zoomLevel + (i * 2 - 1) * (e.shiftKey ? 0.1 : 1));
            }
        });

        const baseMapDataSource = new VectorTileDataSource({
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

        mapView.addDataSource(baseMapDataSource).then(() => {
            baseMapDataSource.setTheme(theme);
        });

        mapView.update();

        return mapView;
    }

    const baseMap = initializeBaseMap("mapCanvas");

    baseMap.update();
}
