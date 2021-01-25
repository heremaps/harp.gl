/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
import { MapEnv, ShaderTechnique, Technique } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { MapMeshStandardMaterial } from "@here/harp-materials";
import { assert, expect } from "chai";
import * as THREE from "three";

import { DisplacedMesh } from "../lib/geometry/DisplacedMesh";
import { buildObject, createMaterial, usesObject3D } from "./../lib/DecodedTileHelpers";
import { Tile } from "./../lib/Tile";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

describe("Tile Creation", function () {
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
        const rendererCapabilities: THREE.WebGLCapabilities = { isWebGL2: false } as any;
        const shaderMaterial = createMaterial(rendererCapabilities, { technique, env });
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
        { technique: { name: "standard", renderOrder: 0 }, elevation: false, object: THREE.Mesh },
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
        { technique: { name: "squares", renderOrder: 0 }, elevation: false, object: THREE.Points },
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
