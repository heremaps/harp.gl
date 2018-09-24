/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */
import {
    ExtendedTileInfo,
    ExtendedTileInfoVisitor,
    getAttributeValue,
    LineTechnique,
    Technique
} from "@here/datasource-protocol";
import { GeoCoordinates, TileKey, TilingScheme, webMercatorTilingScheme } from "@here/geoutils";
import { Lines } from "@here/lines";
import { MapControls } from "@here/map-controls";
import { DataSource, MapView, ThemeLoader, Tile } from "@here/mapview";
import { SolidLineMaterial } from "@here/materials";
import {
    APIFormat,
    OmvDataSource,
    OmvFeatureFilterDescription,
    OmvFeatureFilterDescriptionBuilder
} from "@here/omv-datasource";
import { OmvTileDecoder } from "@here/omv-datasource/lib/OmvDecoder";
import { assert } from "@here/utils";
import { WebTileDataSource } from "@here/webtile-datasource";
import * as THREE from "three";
import { bearerTokenProvider } from "./common";

import { appCode, appId } from "../config";

// Creates a new MapView for the HTMLCanvasElement of the given id
function initializeMapView(id: string): MapView {
    const canvas = document.getElementById(id) as HTMLCanvasElement;

    const sampleMapView = new MapView({
        canvas,
        theme: "./resources/day.json"
    });

    // Let the camera float over the map, looking straight down
    sampleMapView.camera.position.set(0, 0, 800);
    // Center the camera somewhere around Berlin geo locations
    sampleMapView.geoCenter = new GeoCoordinates(52.51622, 13.37036, 0);

    // Instantiate the default map controls, allowing the user to pan around freely.
    const controls = new MapControls(sampleMapView);
    controls.tiltEnabled = true;

    // Resize the mapView to maximum
    sampleMapView.resize(window.innerWidth, window.innerHeight);

    // React on resize events
    window.addEventListener("resize", () => {
        sampleMapView.resize(window.innerWidth, window.innerHeight);
    });

    return sampleMapView;
}

/**
 * A special example that shows the usage of the new [[ExtendedTileInfo]] API. It allows to request
 * the [[ExtendedTileInfo]] from an OmvDataSource. An [[ExtendedTileInfo]] contains the geometry,
 * the style ([[Technique]]) and other feature info of an [[ExtendedTileInfo]].
 *
 * Since this example is pretty elaborate, no code snippets are available here. Please have a look
 * at the source code for more information.
 */
export namespace RoadDataSourceExample {
    document.body.innerHTML += `
    <style>
        #road-options {
            display: inline-block;
            background-color: rgba(255,255,255,0.5);
            margin: 20px 0 0 20px;
            padding: 10px; cursor: pointer;
            user-select: none;
        }
    </style>

    <form name="roadOptions" id="road-options" onSubmit="return false;">
      <input type="checkbox" id="randomColors" name="randomColors" value="true" checked/>
      <label for="randomColors">Random Colors</label>
      <input type="radio" id="renderWebTile" name="dataSource" value="false"/>
      <label for="renderWebTile">WebTile DataSource</label>
      <input type="radio" id="renderOmv" name="dataSource" value="true" checked/>
      <label for="renderOmv">OMV Datasource</label>
      <input type="radio" id="renderNone" name="dataSource" value="true"/>
      <label for="renderNone">No Datasource</label>
    </form>
`;

    // Define the varables required in the GUI
    let roadDataSource: RoadDataSource;
    let webTileDataSource: DataSource;
    let omvDataSource: DataSource;
    let useRandomColors = true;

    interface HTMLCheckBox extends HTMLElement {
        checked?: boolean;
    }

    /**
     * Initialize the GUI to switch between the other datasources. Also the flag to enable random
     * colors instead of the styled road colors.
     *
     * @param theMapView MpView
     */
    function initGui(theMapView: MapView) {
        const randomColorsCheckBox = document.getElementById("randomColors") as HTMLCheckBox;
        if (!!randomColorsCheckBox) {
            randomColorsCheckBox.onchange = () => {
                useRandomColors = randomColorsCheckBox.checked === true;

                roadDataSource.clear();

                //force clearing cache as the enable/disable
                theMapView.clearTileCache("roadInfoDataSource");
                theMapView.update();
            };
        }

        const webtileCheckBox = document.getElementById("renderWebTile")! as HTMLCheckBox;
        const omvCheckBox = document.getElementById("renderOmv")! as HTMLCheckBox;
        const noneCheckBox = document.getElementById("renderNone")! as HTMLCheckBox;
        assert(!!webtileCheckBox);
        assert(!!omvCheckBox);
        assert(!!noneCheckBox);

        webtileCheckBox.onchange = () => {
            webTileDataSource.enabled = webtileCheckBox.checked === true;
            omvDataSource.enabled = !(webTileDataSource.enabled === true);
            omvCheckBox.checked = omvDataSource.enabled === true;
            noneCheckBox.checked = false;
            theMapView.update();
        };

        omvCheckBox.onchange = () => {
            omvDataSource.enabled = (omvCheckBox as any).checked;
            webTileDataSource.enabled = !omvDataSource.enabled;
            webtileCheckBox.checked = webTileDataSource.enabled === true;
            noneCheckBox.checked = false;
            theMapView.update();
        };

        noneCheckBox.onchange = () => {
            omvCheckBox.checked = false;
            webtileCheckBox.checked = false;
            omvDataSource.enabled = false;
            webTileDataSource.enabled = false;
            theMapView.update();
        };
    }

    /**
     * The [[RoadDataSource]] extracts its road geometry from a second OmvDataSource. It maintains
     * a catalog of used [[Technique]]s that reflect the styles that would normally be used to
     * generate the map geometry.
     *
     * To optimize performance, the same batching techniques used in normal decoding/geometry
     * creation are applied.
     */
    export class RoadDataSource extends DataSource {
        /**
         * All used [[LineTechnique]]s that have been encountered. Used by all tiles.
         */
        private roadTechniques = new Map<number, Technique>();

        /**
         * All [[THREE.MAterials]] used in the tiles are stored in [[roadMaterials]]. The road
         * widths and colors differ between levels, so they have their own Material.
         */
        private roadMaterials = new Map<number, Map<number, THREE.Material>>();

        /**
         * Create the [[RoadDataSource]] with the [OmvDataSource]] that provides the road data.
         *
         * @param roadInfoDataSource The [[OmvDataSource]] that is the source of the road data.
         */
        constructor(readonly roadInfoDataSource: OmvDataSource) {
            super("roadInfoDataSource");
            this.cacheable = true;
        }

        getTilingScheme(): TilingScheme {
            return webMercatorTilingScheme;
        }

        /**
         * Same rules as in the [OmvDataSource]]. This is not a requirement, but makes things easy,
         * since no clipping is required.
         *
         * @param zoomLevel [[ZoomLevel]].
         * @param tileKey [[TileKey]].
         */
        shouldRender(zoomLevel: number, tileKey: TileKey): boolean {
            if (tileKey.level > 14) {
                return false;
            }
            if (tileKey.level === 14 && zoomLevel >= 14) {
                return true;
            }
            return super.shouldRender(zoomLevel, tileKey);
        }

        /**
         * Requesting a tile from the [[RoadDataSource]] starts loading of a Tile from an
         * [[OmvDataSource]] asynchronously.
         *
         * @param tileKey [[TileKey]]
         */
        getTile(tileKey: TileKey): Tile | undefined {
            const tile = new Tile(this, tileKey);
            this.loadAndAddRoads(tile);
            return tile;
        }

        /**
         * Clear the catalog of techniques and materials to replace them with the next tile.
         */
        clear(): void {
            this.roadTechniques = new Map<number, Technique>();
            this.roadMaterials = new Map<number, Map<number, THREE.Material>>();
        }

        /**
         * Add a `Technique` to the datasources catalog of techniques
         *
         * @param technique `Technique` to register.
         */
        protected checkAddRoadTechnique(technique: Technique) {
            assert(technique._index !== undefined);
            const oldTechnique = this.roadTechniques.get(technique._index!);
            if (oldTechnique === undefined) {
                this.roadTechniques.set(technique._index!, technique);
            }
        }

        /**
         * Add a `Material` to the datasources catalog of materials. It is organized by zoomLevels,
         * since road width and color may change between levels.
         *
         * @param technique The `Technique` to add.
         * @param level The zoomLevel.
         */
        protected checkAddRoadMaterial(technique: Technique, level: number) {
            assert(level >= 0 && level <= 20);

            let roadMaterials = this.roadMaterials.get(level);

            if (roadMaterials === undefined) {
                roadMaterials = new Map<number, THREE.Material>();
                this.roadMaterials.set(level, roadMaterials);
            }

            // Check if there is a material defined for his technique and level.
            if (roadMaterials.get(technique._index!) !== undefined) {
                return;
            }

            // Not defined yet, so create a new material.
            const roadTechnique = technique as LineTechnique;

            // Get the values of the attributes which are changed depending on level.
            const lineWidth = getAttributeValue(roadTechnique.lineWidth, level);
            const color = getAttributeValue(roadTechnique.color, level);

            // Create road material for this technique.
            const material = new SolidLineMaterial({
                color,
                lineWidth,
                opacity: SolidLineMaterial.DEFAULT_OPACITY,
                depthTest: false
                // If the line should be raised/sorted with depthTest active, the polygonOffset
                // has to be defined, if raising the geometry in Z is not an option.
                // polygonOffset: true,
                // polygonOffsetFactor: -1.0,
                // polygonOffsetUnits: -1,
                // transparent: true
            });

            // Make the colors random, so they look differently on every level and also differently
            // from the original colors.
            if (useRandomColors) {
                material.color.setRGB(Math.random(), Math.random(), Math.random());
            }

            // store the material for next time.
            roadMaterials.set(technique._index!, material);
        }

        /**
         * Get technique from index and level, since the roadWidth may vary depending on level.
         *
         * @param techniqueIndex Index of technique.
         * @param level Level of tile to render.
         */
        protected getRoadMaterial(
            techniqueIndex: number,
            level: number
        ): THREE.Material | undefined {
            const roadLevelData = this.roadMaterials.get(level);
            assert(roadLevelData !== undefined);
            return roadLevelData!.get(techniqueIndex!);
        }

        /**
         * Load roads from the [[OmvDataSource]], and add the road lines to the geometry of this
         * datasources `Tile`.
         *
         * @param tile The `Tile` to fill with road data.
         */
        protected loadAndAddRoads(tile: Tile) {
            // tslint:disable-next-line:no-console
            console.log(
                `RoadDataSource#loadAndAddRoads TileKey: ${tile.tileKey.mortonCode()} level: ${
                    tile.tileKey.level
                }`
            );

            // Get the [[ExtendedTileInfo]] to extract road geometry and style.
            this.roadInfoDataSource.getTileInfo(tile.tileKey).then(tileInfo => {
                // If the call failed...
                if (tileInfo === undefined) {
                    return;
                }

                const extendedTileInfo = tileInfo as ExtendedTileInfo;

                // Needs an [[ExtendedTileInfo]]
                if (extendedTileInfo.textCatalog === undefined) {
                    return;
                }
                // Use a visitor to visit all returned features of the [[OmvTile]].
                const tileVisitor = new ExtendedTileInfoVisitor(extendedTileInfo);

                // Setup a set of [[Lines]] for every [[Technique]]. All lines that share the same
                // [[Technique]] are batched into a line geometry, which is actually a
                // [[THREE.Mesh]].
                const batchedRoadLines = new Map<number, Lines>();
                const techniques = extendedTileInfo.techniqueCatalog;

                // Add all [[Technique]]s to the catalog. The `extendedTileInfo.techniqueCatalog`
                // contains only techniques that are actually used in this tile.
                for (const technique of techniques) {
                    this.checkAddRoadTechnique(technique);
                }

                // tslint:disable-next-line:no-this-assignment
                const that = this;
                const level = tile.tileKey.level;

                // tslint:disable-next-line:no-console
                console.time("Creating road geometry");

                tileVisitor.visitAllLineFeatures({
                    // Only lines are needed here
                    acceptLine(
                        // tslint:disable-next-line:no-unused-variable
                        featureId: number | undefined,
                        techniqueIndex: number,
                        // tslint:disable-next-line:no-unused-variable
                        label: number,
                        // tslint:disable-next-line:no-unused-variable
                        layerName: number,
                        className: number,
                        // tslint:disable-next-line:no-unused-variable
                        typeName: number,
                        points: ArrayLike<number>,
                        pointsStart: number,
                        numPointValues: number
                    ): void {
                        assert(
                            extendedTileInfo.techniqueCatalog[techniqueIndex]._index !== undefined
                        );
                        assert(extendedTileInfo.techniqueCatalog[techniqueIndex]._index! >= 0);
                        techniqueIndex = extendedTileInfo.techniqueCatalog[techniqueIndex]._index!;
                        const technique = that.roadTechniques.get(techniqueIndex);
                        assert(technique !== undefined);
                        assert(technique!._index !== undefined);
                        const roadTechnique = technique!;

                        // Some custom attributes are defined in the theme file, to reduce the
                        // number of geometries that are created. The roads that have outlines
                        // would otherwise be added multiple times.
                        if (
                            (roadTechnique as any).isBackground ||
                            (roadTechnique as any).isTunnel ||
                            (roadTechnique as any).isBridge ||
                            (className !== undefined &&
                                extendedTileInfo.classCatalog &&
                                extendedTileInfo.classCatalog[className] !== undefined &&
                                extendedTileInfo.classCatalog[className].indexOf("rail") >= 0)
                        ) {
                            return;
                        }

                        // Add the [[Material]] if it has not already been added before.
                        that.checkAddRoadMaterial(roadTechnique, level);

                        assert(
                            (roadTechnique as LineTechnique).color ===
                                (that.roadTechniques.get(roadTechnique._index!)! as LineTechnique)
                                    .color
                        );

                        // Add the points from the line to the batched line geometry.
                        let roadLine = batchedRoadLines.get(roadTechnique._index!);
                        if (roadLine === undefined) {
                            roadLine = new Lines();
                            batchedRoadLines.set(roadTechnique._index!, roadLine);
                        }

                        // The copy of the point array is currently required, but may be optimized
                        // in the future.
                        const line = new Array<number>();

                        for (let i = 0; i < numPointValues; i += 2) {
                            const x = points[pointsStart + i];
                            const y = points[pointsStart + i + 1];
                            line.push(x, y);
                        }

                        roadLine.add(line);
                    }
                });

                // Create the geometries for all lines.
                for (const roadLine of batchedRoadLines) {
                    const lineDefMaterial = roadLine[0];
                    const lineDefLines = roadLine[1];
                    const material = this.getRoadMaterial(lineDefMaterial, level);

                    assert(!!material);
                    // Solid lines are meshes
                    const solidLine = new THREE.Mesh(new THREE.Geometry(), material);

                    // Create the geometry of all batched lines with the same material.
                    solidLine.geometry = lineDefLines.createGeometry();

                    assert(!!this.roadTechniques.get(roadLine[0]));
                    const renderOrder = this.roadTechniques.get(roadLine[0])!.renderOrder;

                    // Raise renderOrder so it always renders above other (OMV) roads
                    solidLine.renderOrder = 10 + (renderOrder || 1);

                    // Raise the line a bit. If this is not required, the `solidLine` object can
                    // be added directly to targetTile.objects. Otherwise, the line has to be added
                    // to the group first to make the position offset work.
                    solidLine.position.z = 20;
                    const group = new THREE.Object3D();
                    group.add(solidLine);
                    tile.objects.push(group);

                    // Add directly if no Z-offset is required.
                    // targetTile!.objects.push(solidLine);
                }

                // tslint:disable-next-line:no-console
                console.timeEnd("Creating road geometry");

                // Notify MapView that an update is required, since geometry has been added.
                this.mapView.update();
            });
        }
    }

    // Setup a filter to return only the required road data in the TileInfo.
    function createRoadDataFilter(): OmvFeatureFilterDescription {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder({
            // With this default value, only added layers are processed
            processLayersDefault: false
        });

        // Add layer to process.
        filterBuilder.processLayer("road");

        // Return filter description, which can be passed to decoders in WebWorkers.
        return filterBuilder.createDescription();
    }

    const mapView = initializeMapView("mapCanvas");

    initGui(mapView);

    // Create the datasources for the background. They will be enabled individually.
    const proxyDataUrl =
        "https://d6pfdnjmwpl99.cloudfront.net/acfc-shared-us-standard/data/kaihlani-mvt-weu/";

    webTileDataSource = new WebTileDataSource({
        appId,
        appCode
    });

    mapView.addDataSource(webTileDataSource);
    webTileDataSource.enabled = false;

    // The OmvDataSource instead of WebTiles for the background:
    omvDataSource = new OmvDataSource({
        name: "omv",
        baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
        apiFormat: APIFormat.HereV1,
        maxZoomLevel: 17,
        proxyDataUrl,
        authenticationCode: bearerTokenProvider
    });

    mapView.addDataSource(omvDataSource);
    omvDataSource.enabled = true;

    // If the WebTile datasource is used, the theme has to be loaded separately. Also required if
    // the theme should not be the same as being used in the normal OmvDataSource.
    ThemeLoader.loadAsync("./resources/day.json").then(theme => {
        const roadExtractionDataSource = new OmvDataSource({
            name: "omv-extract",
            proxyDataUrl,
            baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
            apiFormat: APIFormat.HereV1,
            maxZoomLevel: 17,
            filterDescr: createRoadDataFilter(),
            // Must have its own decoder... (!)
            decoder: new OmvTileDecoder(),
            authenticationCode: bearerTokenProvider
        });

        // Disable the datasource, otherwise it would also be used for rendering.
        roadExtractionDataSource.enabled = false;

        // The special theme for the roadExtractionDataSource may be overriden if set before all
        // datasources have been added.
        roadExtractionDataSource.connect().then(() => {
            roadDataSource = new RoadDataSource(roadExtractionDataSource);

            // The roadExtractionDataSource must be added to the MapView to work.
            mapView.addDataSource(roadExtractionDataSource).then(() => {
                mapView.addDataSource(roadDataSource).then(() => {
                    // `setStyleSet()` has to be called after `addDataSource`, otherwise it is being
                    // overriden by the theme set in [[MapView]].
                    if (theme.styles !== undefined) {
                        roadExtractionDataSource.setStyleSet(theme.styles.omv);
                    }
                });
            });
        });
    });
}
