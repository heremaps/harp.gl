import {
    DecodedTile,
    Geometry,
    GeometryType,
    InterleavedBufferAttribute,
    Technique
} from "@here/datasource-protocol";
import { GeoCoordinates, hereTilingScheme, TileKey, TilingScheme } from "@here/geoutils";
import { LINE_VERTEX_ATTRIBUTE_DESCRIPTORS, Lines } from "@here/lines";
import { MapControls } from "@here/map-controls";
import { DataSource, MapView, Tile } from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";

import * as THREE from "three";

/**
 * This example shows the lines rendered with different ways
 */
export namespace LineExample {
    class GeoLineDataSource extends DataSource {
        private tile: Tile | undefined;
        // tslint:disable-next-line:no-unused-variable
        private coordinates?: Array<[number, number]>;
        // tslint:disable-next-line:no-unused-variable
        private technique?: Technique;
        // tslint:disable-next-line:no-unused-variable
        private decodedTile?: DecodedTile;
        private shouldRecreateGeometry = false;

        constructor(name = "line") {
            super(name);
        }

        // tslint:disable-next-line:no-unused-variable
        shouldRender(zoomLevel: number, tileKey: TileKey) {
            return tileKey.mortonCode() === 1;
        }

        getTilingScheme(): TilingScheme {
            return hereTilingScheme;
        }

        getTile(tileKey: TileKey): Tile | undefined {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return this.getRootTile();
        }

        disposeGeometry() {
            if (this.tile === undefined) {
                return;
            }
            this.tile.dispose();
        }

        createGeometry(tile: Tile) {
            if (!this.coordinates || !this.technique) {
                return;
            }
            const lines = new Lines();
            const positions = new Array<number>();

            this.coordinates.forEach(coordinate => {
                const point = new GeoCoordinates(coordinate[1], coordinate[0], 0);
                const vertex = this.projection.projectPoint(point, new THREE.Vector3());
                vertex.sub(tile.center);
                positions.push(vertex.x, vertex.y);
            });

            lines.add(positions);

            const { vertices, indices } = lines;
            const buffer = new Float32Array(vertices).buffer as ArrayBuffer;
            const index = new Uint32Array(indices).buffer as ArrayBuffer;
            const attr: InterleavedBufferAttribute = {
                type: "float",
                stride: 12,
                buffer,
                attributes: LINE_VERTEX_ATTRIBUTE_DESCRIPTORS
            };

            const geometry: Geometry = {
                type: GeometryType.SolidLine,
                index: {
                    buffer: index,
                    itemCount: 1,
                    type: "uint32",
                    name: "index"
                },
                interleavedVertexAttributes: [attr],
                vertexAttributes: [
                    {
                        name: "points",
                        buffer: new Float32Array(positions).buffer as ArrayBuffer,
                        itemCount: 2,
                        type: "float"
                    }
                ],
                groups: [
                    {
                        start: 0,
                        count: 0,
                        technique: this.technique._index as number
                    }
                ]
            };

            this.decodedTile = {
                geometries: [geometry],
                techniques: [this.technique]
            };
        }

        setLine(coordinates: Array<[number, number]>, technique: Technique) {
            this.shouldRecreateGeometry = true;

            this.coordinates = coordinates;
            this.technique = technique;
        }

        private getRootTile(): Tile {
            if (this.tile === undefined) {
                this.tile = new Tile(this, TileKey.fromRowColumnLevel(0, 0, 0));
            }

            if (this.shouldRecreateGeometry) {
                this.disposeGeometry();
                this.createGeometry(this.tile);
                if (this.decodedTile) {
                    this.tile.createGeometries(this.decodedTile);
                }
                this.shouldRecreateGeometry = false;
            }

            return this.tile;
        }
    }

    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/theme.json"
        });

        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 800);
        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.517611, 13.385111, 0);

        // instantiate the default map controls, allowing the user to pan around freely.
        // tslint:disable-next-line:no-unused-expression
        new MapControls(sampleMapView);

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        return sampleMapView;
    }

    window.onload = () => {
        const normalLine = new GeoLineDataSource();
        normalLine.setLine(
            [
                [13.386878371238707, 52.51704508287093],
                [13.385784029960632, 52.51697573760404],
                [13.38584303855896, 52.51671082631435],
                [13.388852477073668, 52.516900277030864],
                [13.388621807098389, 52.5180359398777],
                [13.387881517410278, 52.517990572031565]
            ],
            {
                name: "solid-line",
                color: "#FF1EE0",
                lineWidth: 1,
                renderOrder: 1000,
                _index: 0
            }
        );

        const closedLineInPixels = new GeoLineDataSource();
        closedLineInPixels.setLine(
            [
                [13.380859960479736, 52.516371648258724],
                [13.385816216468811, 52.51670788396363],
                [13.385483622550963, 52.51852550221084],
                [13.383632898330687, 52.51842104530085],
                [13.380424976348875, 52.51818891554064],
                [13.380650748176575, 52.516921191916425],
                [13.380859960479736, 52.516371648258724]
            ],
            {
                name: "solid-line",
                transparent: true,
                color: "#1EE0FF",
                lineWidth: 5,
                opacity: 0.4,
                renderOrder: 1001,
                _index: 0
            }
        );

        const mapView = initializeMapView("mapCanvas");

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.MapzenV2,
            styleSetName: "tilezen",
            maxZoomLevel: 17
        });

        mapView.addDataSource(omvDataSource);
        mapView.addDataSource(normalLine);
        mapView.addDataSource(closedLineInPixels);
    };
}
