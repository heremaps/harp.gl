/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/datasource-protocol";
import {
    OmvFeatureFilter,
    OmvFeatureFilterDescriptionBuilder,
    OmvFeatureModifier,
    OmvFilterString,
    OmvGeometryType
} from "../index";
import { com } from "../lib/proto/vector_tile";

import { assert } from "chai";

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
