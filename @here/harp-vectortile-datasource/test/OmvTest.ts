/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { MapEnv, Value } from "@here/harp-datasource-protocol/index-decoder";
import { assert } from "chai";

import {
    OmvFeatureFilter,
    OmvFeatureFilterDescriptionBuilder,
    OmvFeatureModifier,
    OmvFilterDescription,
    OmvFilterString,
    OmvGenericFeatureModifier,
    OmvGeometryType
} from "../index";

/**
 * Until we have some proper mock datasources, the OmvFeatureFilter/OmvFeatureModifier tests here
 * are more a collection of sample code. Also, the datasources cannot be instantiated here...
 *
 * FIXME: HARP-1152 Add unit tests for filter
 */

export class RoadFilter implements OmvFeatureFilter {
    hasKindFilter: boolean = true;

    wantsKind(kind: string | string[]): boolean {
        return (
            kind === undefined ||
            (typeof kind === "string" && kind.includes("road")) ||
            (Array.isArray(kind) && (kind as string[]).filter(s => s.includes("road")).length > 0)
        );
    }

    wantsLayer(layer: string): boolean {
        // return layer !== undefined && layer.startsWith("road");// roads and road labels
        return layer !== undefined && layer === "road"; // only road lines, no labels
    }

    wantsPointFeature(_layer: string, _geometryType: OmvGeometryType): boolean {
        return false;
    }

    wantsLineFeature(_layer: string, _geometryType: OmvGeometryType): boolean {
        return true;
    }

    wantsPolygonFeature(_layer: string, _geometryType: OmvGeometryType): boolean {
        return false;
    }
}

export class RoadFeatureFilter implements OmvFeatureModifier {
    doProcessPointFeature(_layer: string, _env: MapEnv): boolean {
        return false;
    }

    doProcessLineFeature(_layer: string, env: MapEnv): boolean {
        const roadClass = env.lookup("class");
        const isRoad =
            roadClass !== undefined && roadClass !== null && !roadClass.toString().includes("rail");
        return isRoad;
    }

    doProcessPolygonFeature(_layer: string, _env: MapEnv): boolean {
        return false;
    }
}

export class RoadsToRailroads implements OmvFeatureModifier {
    doProcessPointFeature(_layer: string, _env: MapEnv): boolean {
        return false;
    }

    doProcessLineFeature(_layer: string, env: MapEnv): boolean {
        // turn all roads into railroads
        env.entries.class = "major_rail";
        return true;
    }

    doProcessPolygonFeature(_layer: string, _env: MapEnv): boolean {
        return false;
    }
}

/**
 * FIXME: HARP-1152 Add unit tests for OmvFeatureFilterDescriptionBuilder
 */
describe("OmvFeatureFilterDescriptionBuilder", function () {
    it("setup", function () {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder();
        const filterDescr = filterBuilder.createDescription();

        assert.isObject(filterDescr);
    });

    it("addFilters", function () {
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

    it("addFilters2", function () {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder();

        filterBuilder.processLayer("road");
        filterBuilder.processLine({
            layer: "road",
            geomType: OmvGeometryType.LINESTRING,
            featureClass: "street"
        });

        const filterDescr = filterBuilder.createDescription();

        assert.isObject(filterDescr);

        // * create mock datasource with this filterDescr as an option.
        // * request tile at level 14.
        // * assert that there is no road data of class "street"
    });

    it("addKindFilters", function () {
        const filterBuilder = new OmvFeatureFilterDescriptionBuilder();

        filterBuilder.ignoreKinds(["area"]);
        filterBuilder.processKinds(["water"]);

        const filterDescr = filterBuilder.createDescription();

        assert.isObject(filterDescr);

        // * create mock datasource with this filterDescr as an option.
        // * assert that there is no area that is not water. Will only work if theme file sets
        // * proper kinds (kind tags)
    });

    it("addAttributeFilters", function () {
        const createItems = (layer: string, key: string, value: Value): OmvFilterDescription[] => {
            const filterBuilder = new OmvFeatureFilterDescriptionBuilder();
            filterBuilder.processPolygons({ layer, featureAttribute: { key, value } });

            const filterDescr = filterBuilder.createDescription();
            assert.isObject(filterDescr);

            const items = filterDescr.polygonsToProcess;
            assert(items.length === 1);
            return items;
        };

        const itemsTrue = createItems("buildings", "has_landmark", true);
        const itemsFalse = createItems("buildings", "has_landmark", false);

        const env = new MapEnv({ has_landmark: true });
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("buildings", env, itemsTrue),
            true
        );
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("buildings", env, itemsFalse),
            false
        );
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("roads", env, itemsTrue),
            false
        );
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("roads", env, itemsFalse),
            false
        );

        const envBadValue = new MapEnv({ has_landmark: "not_a_boolean" });
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("buildings", envBadValue, itemsTrue),
            false
        );
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("buildings", envBadValue, itemsFalse),
            false
        );

        const envBadKey = new MapEnv({ foo: true });
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("buildings", envBadKey, itemsTrue),
            false
        );
        assert.strictEqual(
            OmvGenericFeatureModifier.matchAttribute("buildings", envBadKey, itemsFalse),
            false
        );
    });
});
