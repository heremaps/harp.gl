/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Expr,
    getPropertyValue,
    MapEnv,
    ShaderTechnique,
    SolidLineTechnique,
    StandardTechnique,
    Technique
} from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { MapMeshStandardMaterial, SolidLineMaterial } from "@here/harp-materials";
import { assertLogsSync } from "@here/harp-test-utils";
import { LoggerManager } from "@here/harp-utils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { WebGLRenderer } from "three";

import { DisplacedMesh } from "../lib/geometry/DisplacedMesh";
import {
    applyBaseColorToMaterial,
    buildObject,
    createMaterial,
    evaluateColorProperty,
    usesObject3D
} from "./../lib/DecodedTileHelpers";
import { Tile } from "./../lib/Tile";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

function assertLogsError(testCode: () => void, errorMessagePattern: string | RegExp) {
    return assertLogsSync(testCode, LoggerManager.instance.channel, "error", errorMessagePattern);
}

describe("DecodedTileHelpers", function () {
    const env = new MapEnv({ $zoom: 10, $pixelToMeters: 2 });
    let renderer: WebGLRenderer;
    let initTextureSpy: sinon.SinonSpy<any>;

    describe("createMaterial", function () {
        beforeEach(function () {
            initTextureSpy = sinon.spy();
            renderer = { capabilities: { isWebGL2: false }, initTexture: initTextureSpy } as any;
        });
        it("supports #rgba in base material colors", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7"
            };
            const material = createMaterial(renderer, {
                technique,
                env
            })! as SolidLineMaterial;
            assert.exists(material);

            assert.approximately(material.opacity, 7 / 15, 0.00001);
            assert.equal(material.blending, THREE.CustomBlending);
            assert.equal(material.color.getHex(), 0xff00ff);
            assert.equal(material.transparent, false);
        });
        it("ignores alpha when applying #rgba to secondary colors", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f",
                secondaryColor: "#f0f7"
            };
            const material = createMaterial(renderer, {
                technique,
                env
            })! as SolidLineMaterial;
            assert.exists(material);

            assert.equal(material.opacity, 1);
            assert.equal(material.blending, THREE.CustomBlending);
            assert.equal(material.color.getHex(), 0xff00ff);
            assert.equal(material.transparent, false);
        });
        it("ignores invalid colors", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "not-a-color"
            };
            assertLogsError(() => {
                const material = createMaterial(renderer, {
                    technique,
                    env
                })! as SolidLineMaterial;
                assert.exists(material);
            }, /Unsupported color format/);
        });

        it("disables depthTest for solid lines by default", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7"
            };
            const material = createMaterial(renderer, {
                technique,
                env
            })! as SolidLineMaterial;
            assert.exists(material);
            assert.isFalse(material.depthTest);
        });

        it("enables depthTest for solid lines if specified in the technique", function () {
            const technique: SolidLineTechnique = {
                name: "solid-line",
                lineWidth: 10,
                renderOrder: 0,
                color: "#f0f7",
                depthTest: true
            };
            const material = createMaterial(renderer, {
                technique,
                env
            })! as SolidLineMaterial;
            assert.exists(material);
            assert.isTrue(material.depthTest);
        });

        it("ShaderTechnique", function () {
            const tile = new Tile(new FakeOmvDataSource({ name: "omv" }), new TileKey(0, 0, 0));
            const technique: ShaderTechnique = {
                name: "shader",
                primitive: "line",
                params: {
                    clipping: true,
                    uniforms: {
                        lineColor: { value: new THREE.Color("#f00") }
                    },
                    vertexShader: "",
                    fragmentShader: ""
                },
                renderOrder: 0
            };
            const env = new MapEnv({ $zoom: 14 });
            const renderer: THREE.WebGLRenderer = { capabilities: { isWebGL2: false } } as any;
            const shaderMaterial = createMaterial(renderer, { technique, env });
            assert.isTrue(
                shaderMaterial instanceof THREE.ShaderMaterial,
                "expected a THREE.ShaderMaterial"
            );
            if (shaderMaterial instanceof THREE.ShaderMaterial) {
                assert.isObject(
                    shaderMaterial.uniforms.lineColor,
                    "expected a uniform named lineColor"
                );
                assert.isTrue(
                    shaderMaterial.uniforms.lineColor.value instanceof THREE.Color,
                    "expected a uniform of type THREE.Color"
                );
                assert.isString(shaderMaterial.vertexShader);
                assert.isString(shaderMaterial.fragmentShader);
                assert.isTrue(shaderMaterial.clipping);
            }
            assert.isTrue(usesObject3D(technique));
            const object = buildObject(
                technique,
                new THREE.BufferGeometry(),
                new THREE.Material(),
                tile,
                false
            );
            assert.isTrue(object instanceof THREE.Line, "expected a THREE.Line object");
        });

        it("initializes texture and adds it to tile", function () {
            const addOwnedTextureSpy = sinon.spy();
            const tile = ({ addOwnedTexture: addOwnedTextureSpy } as any) as Tile;
            const technique: StandardTechnique = {
                name: "standard",
                renderOrder: 0,
                map: {
                    buffer: new ArrayBuffer(1),
                    type: "image/raw",
                    dataTextureProperties: {
                        width: 1,
                        height: 1
                    }
                }
            };
            const material = createMaterial(
                renderer,
                {
                    technique,
                    env
                },
                tile
            ) as MapMeshStandardMaterial;
            assert.exists(material);
            assert.exists(material.map);
            assert.isTrue(initTextureSpy.called);
            assert.isTrue(addOwnedTextureSpy.called);
        });
    });
    it("applyBaseColorToMaterial toggles opacity with material", function () {
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
    describe("evaluateColorProperty", function () {
        it("leaves numbers untouched", function () {
            assert.strictEqual(evaluateColorProperty(0, env), 0);
            assert.strictEqual(evaluateColorProperty(0xff00ff, env), 0xff00ff);
            assert.strictEqual(evaluateColorProperty(0x7aff00ff, env), 0x7aff00ff);
        });
        it("converts invalid inputs to undefined", function () {
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
        it("evaluates string encoded numerals", function () {
            assert.strictEqual(evaluateColorProperty("#ff00ff", env), 0xff00ff);
            assert.strictEqual(evaluateColorProperty("rgb(255, 0, 0)", env), 0xff0000);
            assert.strictEqual(evaluateColorProperty("rgba(255, 0, 0, 0.5)", env), -2130771968);
        });
    });

    describe("getPropertyValue", function () {
        it("returns literals untouched", function () {
            assert.equal(getPropertyValue(0, env), 0);
            assert.equal(getPropertyValue("a", env), "a");
            assert.equal(getPropertyValue(true, env), true);
            assert.equal(getPropertyValue(false, env), false);
            assert.equal(getPropertyValue(null, env), null);
            assert.deepEqual(getPropertyValue({ foo: "bar" }, env), { foo: "bar" });
        });
        it("flattens null & undefiled to null", function () {
            assert.equal(getPropertyValue(undefined, env), null);
        });
        it("evaluates basic expressions", function () {
            assert.equal(getPropertyValue(Expr.fromJSON(null), env), null);
            assert.equal(getPropertyValue(Expr.fromJSON(["+", 2, 2]), env), 4);
            assert.equal(getPropertyValue(Expr.fromJSON(["get", "$zoom"]), env), 10);
        });
        it("evaluates errorneous expressions to null", function () {
            assertLogsError(() => {
                assert.equal(getPropertyValue(Expr.fromJSON(["-", 2, "not-a-number"]), env), null);
            }, /failed to evaluate expression/);
        });
        it("evaluates string encoded numerals", function () {
            assert.equal(getPropertyValue("2m", env), 2);
            assert.equal(getPropertyValue("2px", env), 4);
            assert.strictEqual(getPropertyValue("#ff00ff", env), 0xff00ff);
            assert.strictEqual(getPropertyValue("rgb(255, 0, 0)", env), 0xff0000);
            assert.strictEqual(getPropertyValue("rgba(255, 0, 0, 0.5)", env), -2130771968);
        });
    });

    describe("buildObject", function () {
        const tests: Array<{ technique: Technique; object: any; elevation: boolean }> = [
            {
                technique: {
                    name: "extruded-line",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Mesh
            },
            {
                technique: { name: "standard", renderOrder: 0 },
                elevation: false,
                object: THREE.Mesh
            },
            {
                technique: {
                    name: "extruded-polygon",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Mesh
            },
            { technique: { name: "fill", renderOrder: 0 }, elevation: false, object: THREE.Mesh },
            {
                technique: { name: "squares", renderOrder: 0 },
                elevation: false,
                object: THREE.Points
            },
            {
                technique: {
                    name: "line",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Line
            },
            {
                technique: {
                    name: "segments",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.LineSegments
            },
            {
                technique: {
                    name: "shader",
                    primitive: "point",
                    params: {},
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Points
            },
            {
                technique: {
                    name: "shader",
                    primitive: "line",
                    params: {},
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Line
            },
            {
                technique: {
                    name: "shader",
                    primitive: "mesh",
                    params: {},
                    renderOrder: 0
                },
                elevation: false,
                object: THREE.Mesh
            },
            { technique: { name: "text", renderOrder: 0 }, object: undefined, elevation: false },
            {
                technique: {
                    name: "extruded-polygon",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: true,
                object: DisplacedMesh
            },
            {
                technique: { name: "standard", renderOrder: 0 },
                elevation: true,
                object: DisplacedMesh
            },
            {
                technique: {
                    name: "extruded-line",
                    color: "#f00",
                    lineWidth: 1,
                    renderOrder: 0
                },
                elevation: true,
                object: DisplacedMesh
            },
            {
                technique: { name: "fill", renderOrder: 0 },
                elevation: true,
                object: DisplacedMesh
            }
        ];

        for (const test of tests) {
            const name =
                "primitive" in test.technique
                    ? `${test.technique.name}(${test.technique.primitive})`
                    : test.technique.name;
            const elevation = test.elevation ? "elevation" : "no elevation";
            const testName = `buildObject builds proper obj for ${name} technique with ${elevation}`;
            it(testName, function () {
                const tile = new Tile(new FakeOmvDataSource({ name: "omv" }), new TileKey(0, 0, 0));
                const geometry = new THREE.BufferGeometry();
                const material = new MapMeshStandardMaterial();

                const technique = test.technique;
                const objClass = test.object;
                if (objClass === undefined) {
                    assert.isFalse(usesObject3D(technique));
                } else {
                    assert.isTrue(usesObject3D(technique));
                    const obj = buildObject(technique, geometry, material, tile, test.elevation);
                    expect(obj).to.be.instanceOf(objClass);
                }
            });
        }
    });
});
