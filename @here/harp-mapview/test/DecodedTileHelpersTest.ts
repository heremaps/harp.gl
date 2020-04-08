/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as THREE from "three";

import { Expr, getPropertyValue, MapEnv, SolidLineTechnique } from "@here/harp-datasource-protocol";
import { SolidLineMaterial } from "@here/harp-materials";
import { assertLogsSync } from "@here/harp-test-utils";
import { LoggerManager } from "@here/harp-utils";
import {
    applyBaseColorToMaterial,
    createMaterial,
    evaluateColorProperty
} from "../lib/DecodedTileHelpers";

// tslint:disable:only-arrow-functions

function assertLogsError(testCode: () => void, errorMessagePattern: string | RegExp) {
    return assertLogsSync(testCode, LoggerManager.instance.channel, "error", errorMessagePattern);
}

describe("DecodedTileHelpers", function() {
    const env = new MapEnv({ $zoom: 10, $pixelToMeters: 2 });
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
        it("ignores invalid colors", function() {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "not-a-color"
            };
            assertLogsError(() => {
                const material = createMaterial({ technique, env })! as SolidLineMaterial;
                assert.exists(material);
            }, /Unsupported color format/);
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
    describe("#evaluateColorProperty", function() {
        it("leaves numbers untouched", function() {
            assert.strictEqual(evaluateColorProperty(0, env), 0);
            assert.strictEqual(evaluateColorProperty(0xff00ff, env), 0xff00ff);
            assert.strictEqual(evaluateColorProperty(0x7aff00ff, env), 0x7aff00ff);
        });
        it("converts invalid inputs to undefined", function() {
            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty("aa", env), undefined);
            }, /Unsupported color format/);
            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty("#fffff", env), undefined);
            }, /Unsupported color format/);
            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty(false, env), undefined);
            }, /Unsupported color format/);

            assertLogsError(() => {
                assert.strictEqual(evaluateColorProperty(true, env), undefined);
            }, /Unsupported color format/);
        });
        it("evaluates string encoded numerals", function() {
            assert.strictEqual(evaluateColorProperty("#ff00ff", env), 0xff00ff);
            assert.strictEqual(evaluateColorProperty("rgb(255, 0, 0)", env), 0xff0000);
            assert.strictEqual(evaluateColorProperty("rgba(255, 0, 0, 0.5)", env), -2130771968);
        });
    });

    describe("#getPropertyValue", function() {
        it("returns literals untouched", function() {
            assert.equal(getPropertyValue(0, env), 0);
            assert.equal(getPropertyValue("a", env), "a");
            assert.equal(getPropertyValue(true, env), true);
            assert.equal(getPropertyValue(false, env), false);
            assert.equal(getPropertyValue(null, env), null);
            assert.deepEqual(getPropertyValue({ foo: "bar" }, env), { foo: "bar" });
        });
        it("flattens null & undefiled to null", function() {
            assert.equal(getPropertyValue(undefined, env), null);
        });
        it("evaluates basic expressions", function() {
            assert.equal(getPropertyValue(Expr.fromJSON(null), env), null);
            assert.equal(getPropertyValue(Expr.fromJSON(["+", 2, 2]), env), 4);
            assert.equal(getPropertyValue(Expr.fromJSON(["get", "$zoom"]), env), 10);
        });
        it("evaluates errorneous expressions to null", function() {
            assertLogsError(() => {
                assert.equal(getPropertyValue(Expr.fromJSON(["-", 2, "not-a-number"]), env), null);
            }, /failed to evaluate expression/);
        });
        it("evaluates string encoded numerals", function() {
            assert.equal(getPropertyValue("2m", env), 2);
            assert.equal(getPropertyValue("2px", env), 4);
            assert.strictEqual(getPropertyValue("#ff00ff", env), 0xff00ff);
            assert.strictEqual(getPropertyValue("rgb(255, 0, 0)", env), 0xff0000);
            assert.strictEqual(getPropertyValue("rgba(255, 0, 0, 0.5)", env), -2130771968);
        });
    });
});
