/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as THREE from "three";

import { MapEnv, SolidLineTechnique } from "@here/harp-datasource-protocol";
import { SolidLineMaterial } from "@here/harp-materials";
import { applyBaseColorToMaterial, createMaterial } from "../lib/DecodedTileHelpers";

// tslint:disable:only-arrow-functions

describe("DecodedTileHelpers", function() {
    const env = new MapEnv({ $zoom: 10 });
    describe("#createMaterial", function() {
        it("supports #rgba in base material colors", function() {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7"
            };
            const material = createMaterial({ technique, env })! as SolidLineMaterial;
            assert.exists(material);

            assert.approximately(material.opacity, 7 / 15, 0.00001);
            assert.equal(material.blending, THREE.CustomBlending);
            assert.equal(material.color.getHex(), 0xff00ff);
            assert.equal(material.transparent, false);
        });
        it("ignores alpha when applying #rgba to secondary colors", function() {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f",
                secondaryColor: "#f0f7"
            };
            const material = createMaterial({ technique, env })! as SolidLineMaterial;
            assert.exists(material);

            assert.equal(material.opacity, 1);
            assert.equal(material.blending, THREE.CustomBlending);
            assert.equal(material.color.getHex(), 0xff00ff);
            assert.equal(material.transparent, false);
        });
    });
    it("#applyBaseColorToMaterial toggles opacity with material", function() {
        const material = new THREE.MeshBasicMaterial();
        assert.equal(material.blending, THREE.NormalBlending);
        const technique: SolidLineTechnique = {
            name: "solid-line",
            lineWidth: 10,
            renderOrder: 0,
            color: "#f0f7"
        };
        applyBaseColorToMaterial(material, material.color, technique, technique.color, env);

        assert.approximately(material.opacity, 7 / 15, 0.00001);
        assert.equal(material.blending, THREE.CustomBlending);
        assert.equal(material.color.getHex(), 0xff00ff);
        assert.equal(material.transparent, false);

        technique.color = "#f0f";
        applyBaseColorToMaterial(material, material.color, technique, technique.color, env);

        assert.equal(material.opacity, 1);
        assert.equal(material.blending, THREE.NormalBlending);
        assert.equal(material.color.getHex(), 0xff00ff);
        assert.equal(material.transparent, false);
    });
});
