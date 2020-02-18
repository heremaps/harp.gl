/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as THREE from "three";

import { Expr, GeometryType, MapEnv, SolidLineTechnique } from "@here/harp-datasource-protocol";
import { SolidLineMaterial } from "@here/harp-materials";
import { LoggerManager } from "@here/harp-utils";
import {
    applyBaseColorToMaterial,
    createMaterial,
    getColorPropertyValueSafe,
    getEnumPropertyValueSafe,
    getNumberPropertyValueSafe
} from "../lib/DecodedTileHelpers";
import { MapViewEventNames } from "../lib/MapView";

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
    describe("getXXPropertySafe", function() {
        before(function() {
            LoggerManager.instance.enable("DecodedTileHelpers", false);
            LoggerManager.instance.enable("InterpolatedProperty", false);
        });
        after(function() {
            LoggerManager.instance.enable("DecodedTileHelpers", true);
            LoggerManager.instance.enable("InterpolatedProperty", true);
        });

        const nullReturningExpr = Expr.fromJSON(["get", "fooBar"]);
        const throwingReturningExpr = Expr.fromJSON(["/", "fooBar", null]);

        describe("#getNumberPropertyValueSafe", function() {
            it("returns proper literal values as is", function() {
                assert.strictEqual(getNumberPropertyValueSafe(-1, 13, env), -1);
                assert.strictEqual(getNumberPropertyValueSafe(-0, 14, env), -0);
                assert.strictEqual(getNumberPropertyValueSafe(333, 14, env), 333);
            });
            it("falls back to default on non-numbers", function() {
                assert.strictEqual(getNumberPropertyValueSafe("aa", 13, env), 13);
                assert.strictEqual(getNumberPropertyValueSafe(null, 14, env), 14);
                assert.strictEqual(getNumberPropertyValueSafe(false, 15, env), 15);
                assert.strictEqual(getNumberPropertyValueSafe(undefined, 16, env), 16);
            });
            it("evaluates proper expressions", function() {
                assert.equal(getNumberPropertyValueSafe(Expr.fromJSON(["number", 22]), 0, env), 22);
                assert.equal(getNumberPropertyValueSafe(Expr.fromJSON(["+", 33, 44]), 0, env), 77);
            });
            it("supports expr-s evaluating to null or error", function() {
                assert.strictEqual(getNumberPropertyValueSafe(nullReturningExpr, 13, env), 13);
                assert.strictEqual(getNumberPropertyValueSafe(throwingReturningExpr, 13, env), 13);
            });
        });
        describe("#getColorPropertyValueSafe", function() {
            it("returns proper literal values as is", function() {
                assert.strictEqual(getColorPropertyValueSafe("#f0f7", undefined, env), -1996553985);
                assert.strictEqual(getColorPropertyValueSafe("#f0f", undefined, env), 0xff00ff);
                assert.strictEqual(getColorPropertyValueSafe(0, undefined, env), 0);
            });
            it("evaluates proper expressions", function() {
                assert.equal(
                    getColorPropertyValueSafe(Expr.fromJSON(["string", "#f0f"]), 0, env),
                    0xff00ff
                );
                assert.equal(
                    getColorPropertyValueSafe(Expr.fromJSON(["rgba", 255, 0, 255, 1]), 0, env),
                    0xff00ff
                );
            });
            it("falls back to default on non-numbers", function() {
                assert.strictEqual(getColorPropertyValueSafe("aa", 0, env), 0);
                assert.strictEqual(getColorPropertyValueSafe(null, 0xff00ff, env), 0xff00ff);
                assert.strictEqual(getColorPropertyValueSafe(false, undefined, env), undefined);
                assert.strictEqual(getColorPropertyValueSafe(undefined, "#f0f", env), "#f0f");
            });
            it("supports expr-s evaluating to null or error", function() {
                assert.strictEqual(getColorPropertyValueSafe(nullReturningExpr, 13, env), 13);
                assert.strictEqual(getColorPropertyValueSafe(throwingReturningExpr, 13, env), 13);
            });
        });
        describe("#getEnumPropertyValueSafe", function() {
            it("parses correct values into enum values", function() {
                assert.equal(
                    getEnumPropertyValueSafe("Point", GeometryType, undefined, env),
                    GeometryType.Point
                );
                assert.equal(
                    getEnumPropertyValueSafe("Unspecified", GeometryType, undefined, env),
                    GeometryType.Unspecified
                );
                assert.equal(
                    getEnumPropertyValueSafe("Other", GeometryType, undefined, env),
                    GeometryType.Other
                );

                assert.equal(
                    getEnumPropertyValueSafe("AfterRender", MapViewEventNames, undefined, env),
                    MapViewEventNames.AfterRender
                );
                assert.equal(
                    getEnumPropertyValueSafe(
                        Expr.fromJSON(["string", "Point"]),
                        GeometryType,
                        GeometryType.Unspecified,
                        env
                    ),
                    GeometryType.Point
                );
            });
            it("falls back to default for invalid values", function() {
                assert.equal(
                    getEnumPropertyValueSafe(
                        "PointXX",
                        GeometryType,
                        GeometryType.Unspecified,
                        env
                    ),
                    GeometryType.Unspecified
                );
                assert.equal(
                    getEnumPropertyValueSafe(
                        Expr.fromJSON(["string", "baz"]),
                        GeometryType,
                        GeometryType.Unspecified,
                        env
                    ),
                    GeometryType.Unspecified
                );
            });

            it("supports expr-s evaluating to null or error", function() {
                assert.strictEqual(
                    getEnumPropertyValueSafe(
                        nullReturningExpr,
                        GeometryType,
                        GeometryType.Point,
                        env
                    ),
                    GeometryType.Point
                );
                assert.strictEqual(
                    getEnumPropertyValueSafe(
                        nullReturningExpr,
                        GeometryType,
                        GeometryType.Object3D,
                        env
                    ),
                    GeometryType.Object3D
                );
            });
        });
    });
});
