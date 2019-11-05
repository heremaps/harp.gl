/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { assert } from "chai";
import { OmvTomTomFeatureModifier } from "../lib/OmvTomTomFeatureModifier";
import { VectorTileFeatureFilterDescriptionBuilder } from "../lib/VectorTileDataFilter";
import { VectorTileFeatureFilterDescription } from "../lib/VectorTileDecoderDefs";

export class OmvTomTomModifierMock extends OmvTomTomFeatureModifier {
    private m_description: VectorTileFeatureFilterDescription;

    constructor(description: VectorTileFeatureFilterDescription) {
        super(description);
        this.m_description = description;
    }
    processFeature(layer: string, env: MapEnv): boolean {
        return super.doProcessFeature(
            this.m_description.linesToProcess,
            this.m_description.linesToIgnore,
            layer,
            env,
            true
        );
    }
}
/**
 * Add unit tests for OmvTomTomFeatureModifier
 */
describe("OmvTomTomFeatureModifier", function() {
    let tomTomFeatureModifier: OmvTomTomModifierMock;

    before(function() {
        const filterBuilder = new VectorTileFeatureFilterDescriptionBuilder();
        const filterDescription = filterBuilder.createDescription();
        tomTomFeatureModifier = new OmvTomTomModifierMock(filterDescription);
    });

    it("modify Landuse layers", function() {
        assert.isObject(tomTomFeatureModifier);

        let env = new MapEnv({});
        let layer = "Woodland";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "landuse");
        assert.equal(env.entries.class, "wood");

        env = new MapEnv({});
        layer = "Hospital";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "landuse");
        assert.equal(env.entries.class, "hospital");

        env = new MapEnv({});
        layer = "Industial area";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.isObject(env);
        assert.isObject(env.entries);
        assert.isUndefined(env.entries.$layer);

        env = new MapEnv({});
        layer = "Airport";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "landuse");
        assert.equal(env.entries.class, "industrial");
    });

    it("modify water layers", function() {
        assert.isObject(tomTomFeatureModifier);

        let env = new MapEnv({});
        let layer: string = "Other water";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "water");

        env = new MapEnv({});
        layer = "Ocean";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "water");
    });

    it("modify road layers", function() {
        assert.isObject(tomTomFeatureModifier);

        let env = new MapEnv({});
        let layer: string = "Pedestrian road";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "path");

        env = new MapEnv({});
        layer = "some path";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "path");

        env = new MapEnv({});
        layer = "Toll minor local road";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "street");

        env = new MapEnv({});
        layer = "Toll motorway";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "primary");

        env = new MapEnv({});
        layer = "Toll motorway tunnel";
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "primary");
        assert.equal(env.entries.structure, "tunnel");
    });
});
