/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { MapEnv } from "@here/datasource-protocol";
import { HRN } from "@here/hype/lib/HRN";
import {
    OmvDataSource,
    OmvFeatureFilter,
    OmvFeatureFilterDescriptionBuilder,
    OmvFeatureModifier,
    OmvFilterString,
    OmvGeometryType
} from "../index";
import { com } from "../lib/proto/vector_tile";

import { GeoBox, GeoCoordinates, TileKey, webMercatorProjection } from "@here/geoutils";
import { MapView, Statistics, Tile } from "@here/mapview";
import { TestSingleFileDataProvider } from "@here/mapview-decoder/lib/TestDataProviders";
import { loadTestResource } from "@here/test-utils";
import { assert } from "chai";
import { OmvTileDecoder } from "../lib/OmvDecoder";

/** @hidden */
export const hrn = HRN.fromString("hrn:here-dev:datastore:::verity-mvt-1");

/** @hidden */
export const appId = "inzUjEph5FuS6Uxefasa";

/** @hidden */
export const appCode = "r7BX5UxknW5LnOxVeG4nzg";

/**
 * Until we have some proper mock datasources, the OmvFeatureFilter/OmvFeatureModifier tests here
 * are more a collection of sample code. Also, the datasources cannot be instantiated here...
 *
 * FIXME: HARP-1152 Add unit tests for filter
 */

export class RoadFilter implements OmvFeatureFilter {
    wantsLayer(layer: com.mapbox.pb.Tile.ILayer): boolean {
        // return layer.name !== undefined && layer.name.startsWith("road");// roads and road labels
        return layer.name !== undefined && layer.name === "road"; // only road lines, no labels
    }

    wantsPointFeature(
        _layer: com.mapbox.pb.Tile.ILayer,
        _feature: com.mapbox.pb.Tile.IFeature
    ): boolean {
        return false;
    }

    wantsLineFeature(
        _layer: com.mapbox.pb.Tile.ILayer,
        _feature: com.mapbox.pb.Tile.IFeature
    ): boolean {
        return true;
    }

    wantsPolygonFeature(
        _layer: com.mapbox.pb.Tile.ILayer,
        _feature: com.mapbox.pb.Tile.IFeature
    ): boolean {
        return false;
    }
}

export class RoadFeatureFilter implements OmvFeatureModifier {
    doProcessPointFeature(_layer: com.mapbox.pb.Tile.ILayer, _env: MapEnv): boolean {
        return false;
    }

    doProcessLineFeature(_layer: com.mapbox.pb.Tile.ILayer, env: MapEnv): boolean {
        const roadClass = env.lookup("class");
        const isRoad = roadClass !== undefined && roadClass.toString().indexOf("rail") < 0;
        return isRoad;
    }

    doProcessPolygonFeature(_layer: com.mapbox.pb.Tile.ILayer, _env: MapEnv): boolean {
        return false;
    }
}

export class RoadsToRailroads implements OmvFeatureModifier {
    doProcessPointFeature(_layer: com.mapbox.pb.Tile.ILayer, _env: MapEnv): boolean {
        return false;
    }

    doProcessLineFeature(_layer: com.mapbox.pb.Tile.ILayer, env: MapEnv): boolean {
        // turn all roads into railroads
        env.entries.class = "major_rail";
        return true;
    }

    doProcessPolygonFeature(_layer: com.mapbox.pb.Tile.ILayer, _env: MapEnv): boolean {
        return false;
    }
}

function createMockMapView() {
    // tslint:disable-next-line:no-object-literal-type-assertion
    return {
        projection: webMercatorProjection,
        statistics: new Statistics(),
        markTilesDirty: () => {
            /* this is a stub */
        }
    } as MapView;
}

describe("OmvDataSource ", () => {
    it("create it with a feature filter", async () => {
        const mapView = createMockMapView();
        mapView.getDataSourceByName = () => undefined;
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder({
            processLayersDefault: true
        });

        const filterDescr = filterBuilder.createDescription();

        const omvTestDataSource = new OmvDataSource({
            hrn,
            appId,
            appCode,
            filterDescr,
            /**
             * Specify a decoder to be used, instead of using the default asynchronous decoder with
             * web workers.
             */
            decoder: new OmvTileDecoder(),
            dataProvider: new TestSingleFileDataProvider(
                "omv-datasource",
                "test/resources/371506849.bin"
            )
        });

        const theme = await loadTestResource("map-theme", "./resources/day.json", "json");

        omvTestDataSource.attach(mapView);
        omvTestDataSource.setStyleSet(theme.styles.omv);

        const tile: Tile = omvTestDataSource.getTile(TileKey.fromMortonCode(371506849))!;
        await tile.tileLoader!.waitSettled();
        // tslint:disable-next-line:no-unused-variable
        const geoBox = new GeoBox(
            new GeoCoordinates(52.52290594027806, 13.38134765625),
            new GeoCoordinates(52.53627304145947, 13.4033203125)
        );

        assert.isTrue(omvTestDataSource !== undefined);
        assert.isTrue(tile!.tileLoader!.decodedTile!.geometries.length > 0);
    });

    it.skip("create it with a feature filter that only allows roads", async () => {
        const mapView = createMockMapView();
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder({
            processLayersDefault: true
        });

        // filterBuilder.ignoreLayer("road");
        filterBuilder.ignoreLayer("poi_label", OmvFilterString.StringMatch.Match);
        filterBuilder.ignoreLayer("place_label", OmvFilterString.StringMatch.Match);
        filterBuilder.ignoreLayer("water", OmvFilterString.StringMatch.Contains);
        filterBuilder.ignoreLayer("building", OmvFilterString.StringMatch.Contains);
        filterBuilder.ignoreLayer("_label", OmvFilterString.StringMatch.Contains);
        filterBuilder.ignoreLayer("housenum_label", OmvFilterString.StringMatch.Match);

        const filterDescr = filterBuilder.createDescription();

        const omvTestDataSource = new OmvDataSource({
            hrn,
            appId,
            appCode,
            filterDescr,
            /**
             * Specify a decoder to be used, instead of using the default asynchronous decoder with
             * web workers.
             */
            decoder: new OmvTileDecoder(),
            dataProvider: new TestSingleFileDataProvider(
                "omv-datasource",
                "test/resources/371506849.bin"
            )
        });

        const theme = await loadTestResource("map-theme", "./resources/day.json", "json");

        omvTestDataSource.attach(mapView);
        omvTestDataSource.setStyleSet(theme.styles.omv);

        const tile: Tile = omvTestDataSource.getTile(TileKey.fromMortonCode(371506849))!;
        await tile.tileLoader!.waitSettled();

        assert.isTrue(omvTestDataSource !== undefined);
        assert.isTrue(tile!.tileLoader!.decodedTile!.geometries.length > 0);

        const techniques = tile!.tileLoader!.decodedTile!.techniques;

        const checkIfIsRoadTechniqueExists = techniques.some(technique => {
            return (technique as any).isRoad;
        });

        assert.isTrue(checkIfIsRoadTechniqueExists);
    });

    /**
     * These tests need a specific way to assess that a certain technique is used,
     * for example: the road technique.
     * Currently they are skipped, until such a way exists.
     */
    it.skip("create it with a feature filter that removes roads", async () => {
        const mapView = createMockMapView();
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder({
            processLayersDefault: true
        });

        filterBuilder.ignoreLayer("road");

        const filterDescr = filterBuilder.createDescription();

        const omvTestDataSource = new OmvDataSource({
            hrn,
            appId,
            appCode,
            filterDescr,
            /**
             * Specify a decoder to be used, instead of using the default asynchronous decoder with
             * web workers.
             */
            decoder: new OmvTileDecoder(),
            dataProvider: new TestSingleFileDataProvider(
                "omv-datasource",
                "test/resources/371506849.bin"
            )
        });

        const theme = await loadTestResource("map-theme", "./resources/day.json", "json");

        omvTestDataSource.attach(mapView);
        omvTestDataSource.setStyleSet(theme.styles.omv);

        const tile: Tile = omvTestDataSource.getTile(TileKey.fromMortonCode(371506849))!;
        await tile.tileLoader!.waitSettled();

        assert.isTrue(omvTestDataSource !== undefined);
        assert.isTrue(tile!.tileLoader!.decodedTile!.geometries.length > 0);

        const techniques = tile!.tileLoader!.decodedTile!.techniques;

        const checkIfIsRoadTechniqueExists = techniques.some(technique => {
            return (technique as any).isRoad;
        });

        assert.isFalse(checkIfIsRoadTechniqueExists);
    });
});

/**
 * FIXME: HARP-1152 Add unit tests for OmvFeatureFilterDescriptionBuilder
 */
describe("OmvFeatureFilterDescriptionBuilder", () => {
    it("setup", () => {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder();
        const filterDescr = filterBuilder.createDescription();

        assert.isObject(filterDescr);
    });

    it("addFilters", () => {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder();

        // load roads only on levels 0-13
        filterBuilder.ignoreLayer("road", OmvFilterString.StringMatch.Match, 0, 13);

        const filterDescr = filterBuilder.createDescription();

        assert.isObject(filterDescr);

        // * create mock datasource with this filterDescr as an option.
        // * request tile at level 13.
        // * assert that there is no road data
        // * request tile at level 14.
        // * assert that there *is* road data
    });

    it("addFilters2", () => {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder();

        filterBuilder.processLayer("road");
        filterBuilder.processLine(
            "road",
            OmvGeometryType.LINESTRING,
            "street",
            OmvFilterString.StringMatch.Match,
            OmvFilterString.StringMatch.Match
        );

        const filterDescr = filterBuilder.createDescription();

        assert.isObject(filterDescr);

        // * create mock datasource with this filterDescr as an option.
        // * request tile at level 14.
        // * assert that there is no road data of class "street"
    });
});
