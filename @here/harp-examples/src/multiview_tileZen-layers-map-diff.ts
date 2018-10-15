import { GeoCoordinates } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView, MapViewUtils } from "@here/mapview";
import { TileFactory } from "@here/mapview-decoder";
import {
    APIFormat,
    OmvDataSource,
    OmvDebugLabelsTile,
    OmvFeatureFilterDescriptionBuilder,
    OmvFilterString
} from "@here/omv-datasource";

/**
 * An example showing side by side mapview with two different datasources and/or themes
 *
 * Creates 2 views with their own MapView and MapControl as WebTileDataSourceOptions:
 * ```typescript
 * [[include:vislib_multiview_mapDiffView_1.ts]]
 * ```
 *
 * Create 2 separate [[MapView]]s and datasources that will populate them.
 * ```typescript
 * [[include:vislib_multiview_mapDiffView_2.ts]]
 * ```
 * After adding the MapViews and their dedicated datasources (each one possibly with different
 * theme, added event handlers to sync between them [[MapView]]s:
 * ```typescript
 * [[include:vislib_multiview_mapDiffView_3.ts]]
 * ```
 */

export namespace TripleViewExample {
    // inject HTML code to page to show additional map canvases and position them side-by-side
    document.body.innerHTML += `

<style>

    .themeName {
        font-weight: bold;
        padding: 1em;
        position: absolute
        margin-bottom: 0.5em;
        margin: 0 auto;
        width: 50%;
    }

    .titleRow
    {
        display: table;
        table-layout: fixed;
        width: 100%;
    }

    #mapTheme1 {
        background-color: rgba(0, 128, 128, 0.8);
        color: rgba(255, 255, 255, 0.8);
        display: table-cell;
    }

    #mapTheme2 {
        background-color: rgba(64, 128, 128, 0.8);
        color: rgba(255, 250, 200, 0.8);
        display: table-cell;
        left: 50%;
    }

    #mapCanvas {
        border: 0px;
        height: 100%;
        left: 0;
        overflow: hidden;
        position: absolute;
        width: calc(100%/2);
        z-index: -1
    }

    #mapCanvas2 {
        border: 0px;
        height: 100%;
        left: 50%;
        overflow: hidden;
        position: absolute;
        width: calc(100%/2);
        z-index: -1
    }
</style>

<canvas id="mapCanvas2"></canvas>
<div class="titleRow">
    <div class="themeName" id="mapTheme1">
        Data:<em> TileZen</em><br/> Theme: <em>Day</em>
    </div>
    <div class="themeName" id="mapTheme2">
        Data:<em> TileZen</em><br/> Theme: <em>Day - roads layer only</em>
    </div>
</div>
`;

    const defaultTheme = "./resources/day.json";
    const numberOfSyncXViews = 2;
    // Adjust CSS to see more then 1 row in Y axis
    const numberOfSyncYViews = 1;
    const defaultZoomLevel = 14;

    /**
     * A pair of MapView and MapController.
     */
    export interface ViewControlPair {
        mapView: MapView;
        mapControls: MapControls;
    }

    export function setupSyncViewsGrid(mapView: MapView, gridPosX: number, gridPosY: number) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const chunkW = window.innerWidth / numberOfSyncXViews;
        const chunkH = window.innerHeight / numberOfSyncYViews;
        // force camera aspect
        mapView.forceCameraAspect = winW / winH;
        // resize the mapView to maximum
        mapView.resize(chunkW, chunkH);

        // let the camera float over the map, looking straight down
        mapView.camera.setViewOffset(
            winW,
            winH,
            gridPosX * chunkW,
            gridPosY * chunkH,
            chunkW,
            chunkH
        );
    }

    /**
     * Creates the pair of MapView and MapControllers required to sync the views.
     *
     * @param id ID of HTML canvas element
     * @param theme URL of theme to load
     * @param decoderUrl URL of decoder bundle
     */
    export function initMapView(
        id: string,
        gridPositionX: number,
        gridPositionY: number,
        theme?: string,
        decoderUrl?: string
    ): ViewControlPair {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: theme !== undefined ? theme : defaultTheme,
            decoderUrl
        });
        sampleMapView.camera.position.set(0, 0, 800);

        // instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(sampleMapView);

        //Set the cameras height according to the given zoom level.
        sampleMapView.camera.position.setZ(
            MapViewUtils.calculateDistanceToGroundFromZoomLevel(sampleMapView, defaultZoomLevel)
        );

        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        setupSyncViewsGrid(sampleMapView, gridPositionX, gridPositionY);
        // react on resize events
        window.addEventListener("resize", () => {
            setupSyncViewsGrid(sampleMapView, gridPositionX, gridPositionY);
        });

        return { mapView: sampleMapView, mapControls };
    }

    // create `${numberOfSyncXViews}` MapViews, each with their own theme file
    // snippet:vislib_multiview_mapDiffView_1.ts
    const mapViews = {
        view1: initMapView("mapCanvas", 0, 0, defaultTheme),
        view2: initMapView("mapCanvas2", 1, 0, defaultTheme)
    };
    // end:vislib_multiview_mapDiffView_1.ts

    // snippet:vislib_multiview_mapDiffView_2.ts
    const dataSources = {
        omvDataSource1: new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.MapzenV2,
            createTileInfo: true,
            styleSetName: "tilezen",
            gatherFeatureIds: true,
            showMissingTechniques: true,
            tileFactory: new TileFactory<OmvDebugLabelsTile>(OmvDebugLabelsTile),
            maxZoomLevel: 17
        }),

        omvDataSource2: new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.MapzenV2,
            createTileInfo: true,
            styleSetName: "tilezen",

            gatherFeatureIds: true,
            showMissingTechniques: true,
            tileFactory: new TileFactory<OmvDebugLabelsTile>(OmvDebugLabelsTile),
            maxZoomLevel: 17
        })
    };

    mapViews.view1.mapView.addDataSource(dataSources.omvDataSource1);
    mapViews.view2.mapView.addDataSource(dataSources.omvDataSource2);

    //filter all but one layer on one of the mapviews
    const filterBuilder = new OmvFeatureFilterDescriptionBuilder({
        processLayersDefault: true
    });

    filterBuilder.ignoreLayer("boundaries", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("water", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("landuse", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("earth", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("places", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("pois", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("buildings", OmvFilterString.StringMatch.Match);
    filterBuilder.ignoreLayer("transit", OmvFilterString.StringMatch.Match);
    //filterBuilder.ignoreLayer("roads", OmvFilterString.StringMatch.Match);

    const filterDescr = filterBuilder.createDescription();
    dataSources.omvDataSource2.setDataFilter(filterDescr);

    // end:vislib_multiview_mapDiffView_2.ts
    /**
     * A function that copies the position and orientation of one MapView/MapControl to the others
     * @param srcView Source with MapView with current location and MapControl with current camera
     *                  position and orientation
     * @param destView Destination MapView synced to current location; MapControl synced to current
     *                  position and orientation
     */
    // snippet:vislib_multiview_mapDiffView_3.ts
    export const syncMapViews = (srcView: ViewControlPair, destView: ViewControlPair) => {
        const ypr = srcView.mapControls.yawPitchRoll;
        destView.mapControls.setRotation(ypr.yaw, ypr.pitch);
        destView.mapView.worldCenter.copy(srcView.mapView.worldCenter);
        destView.mapControls.cameraHeight = srcView.mapControls.cameraHeight;
        destView.mapView.camera.updateProjectionMatrix();

        // force update on changed MapView
        destView.mapView.update();
    };

    const views = [mapViews.view1, mapViews.view2];

    // sync camera of each view to other views changes.
    views.forEach((v: ViewControlPair, index: number) => {
        const otherViews = views.slice();
        otherViews.splice(index, 1);
        // tslint:disable-next-line:no-unused-variable
        otherViews.forEach((otherView: ViewControlPair, indexTemp: number) => {
            v.mapControls.addEventListener(
                "update",
                (): void => {
                    syncMapViews(views[index], otherViews[indexTemp]);
                }
            );
        });
    });
    // end:vislib_multiview_mapDiffView_3.ts
}
