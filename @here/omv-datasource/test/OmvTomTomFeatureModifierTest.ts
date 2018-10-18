/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/datasource-protocol";
import { assert } from "chai";
import { OmvFeatureFilterDescriptionBuilder } from "../lib/OmvDataFilter";
import { OmvFeatureFilterDescription } from "../lib/OmvDecoderDefs";
import { OmvTomTomFeatureModifier } from "../lib/OmvTomTomFeatureModifier";
import { com } from "../lib/proto/vector_tile";

export class OmvTomTomModifierMock extends OmvTomTomFeatureModifier {
    private m_description: OmvFeatureFilterDescription;

    constructor(description: OmvFeatureFilterDescription) {
        super(description);
        this.m_description = description;
    }
    processFeature(layer: com.mapbox.pb.Tile.ILayer, env: MapEnv): boolean {
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
describe("OmvTomTomFeatureModifier", () => {
    const filterBuilder = new OmvFeatureFilterDescriptionBuilder();
    const filterDescription = filterBuilder.createDescription();
    const tomTomFeatureModifier = new OmvTomTomModifierMock(filterDescription);

    it("modify Landuse layers", () => {
        assert.isObject(tomTomFeatureModifier);

        let env = new MapEnv({});
        let layer: com.mapbox.pb.Tile.ILayer = { name: "Woodland", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "landuse");
        assert.equal(env.entries.class, "wood");

        env = new MapEnv({});
        layer = { name: "Hospital", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "landuse");
        assert.equal(env.entries.class, "hospital");

        env = new MapEnv({});
        layer = { name: "Industial area", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.isObject(env);
        assert.isObject(env.entries);
        assert.isUndefined(env.entries.$layer);

        env = new MapEnv({});
        layer = { name: "Airport", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "landuse");
        assert.equal(env.entries.class, "industrial");
    });

    it("modify water layers", () => {
        assert.isObject(tomTomFeatureModifier);

        let env = new MapEnv({});
        let layer: com.mapbox.pb.Tile.ILayer = { name: "Other water", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "water");

        env = new MapEnv({});
        layer = { name: "Ocean", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "water");
    });

    it("modify road layers", () => {
        assert.isObject(tomTomFeatureModifier);

        let env = new MapEnv({});
        let layer: com.mapbox.pb.Tile.ILayer = { name: "Pedestrian road", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "path");

        env = new MapEnv({});
        layer = { name: "some path", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "path");

        env = new MapEnv({});
        layer = { name: "Toll minor local road", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "street");

        env = new MapEnv({});
        layer = { name: "Toll motorway", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "primary");

        env = new MapEnv({});
        layer = { name: "Toll motorway tunnel", version: 1 };
        tomTomFeatureModifier.processFeature(layer, env);
        assert.equal(env.entries.$layer, "road");
        assert.equal(env.entries.class, "primary");
        assert.equal(env.entries.structure, "tunnel");
    });
});
