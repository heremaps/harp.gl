/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
import { MapEnv, ShaderTechnique } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { MapMeshStandardMaterial } from "@here/harp-materials";
import { assert } from "chai";
import * as THREE from "three";
import { DisplacedMesh } from "../lib/geometry/DisplacedMesh";
import { createMaterial, getObjectConstructor } from "./../lib/DecodedTileHelpers";
import { Tile } from "./../lib/Tile";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

describe("Tile Creation", function() {
    it("ShaderTechnique", function() {
        const tile = new Tile(new FakeOmvDataSource(), new TileKey(0, 0, 0));
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
        const shaderMaterial = createMaterial({ technique, env });
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
        const Ctor = getObjectConstructor(technique, tile, false);
        assert.isFunction(Ctor, "Expected a constructor");
        if (Ctor !== undefined) {
            const object = new Ctor(new THREE.Geometry(), new THREE.Material());
            assert.isTrue(object instanceof THREE.Line, "expected a THREE.Line object");
        }
    });

    it("getObjectConstructor returns proper ctor. on elevation disabled", function() {
        const tile = new Tile(new FakeOmvDataSource(), new TileKey(0, 0, 0));
        const geometry = new THREE.Geometry();
        const material = new THREE.Material();
        const ExtrudedLineCtor = getObjectConstructor(
            {
                name: "extruded-line",
                color: "#f00",
                lineWidth: 1,
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(ExtrudedLineCtor);
        if (ExtrudedLineCtor !== undefined) {
            assert.isTrue(new ExtrudedLineCtor(geometry, material) instanceof THREE.Mesh);
        }

        const StandardCtor = getObjectConstructor(
            { name: "standard", renderOrder: 0 },
            tile,
            false
        );
        assert.isFunction(StandardCtor);
        if (StandardCtor !== undefined) {
            assert.isTrue(new StandardCtor(geometry, material) instanceof THREE.Mesh);
        }

        const ExtrudedPolygonCtor = getObjectConstructor(
            {
                name: "extruded-polygon",
                lineWidth: 1,
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(ExtrudedPolygonCtor);
        if (ExtrudedPolygonCtor !== undefined) {
            assert.isTrue(new ExtrudedPolygonCtor(geometry, material) instanceof THREE.Mesh);
        }

        const FillCtor = getObjectConstructor({ name: "fill", renderOrder: 0 }, tile, false);
        assert.isFunction(FillCtor);
        if (FillCtor !== undefined) {
            assert.isTrue(new FillCtor(geometry, material) instanceof THREE.Mesh);
        }

        const PointCtor = getObjectConstructor({ name: "squares", renderOrder: 0 }, tile, false);
        assert.isFunction(PointCtor);
        if (PointCtor !== undefined) {
            assert.isTrue(new PointCtor(geometry, material) instanceof THREE.Points);
        }

        const LineCtor = getObjectConstructor(
            {
                name: "line",
                color: "#f00",
                lineWidth: 1,
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(LineCtor);
        if (LineCtor !== undefined) {
            assert.isTrue(new LineCtor(geometry, material) instanceof THREE.Line);
        }

        const SegmentsCtor = getObjectConstructor(
            {
                name: "segments",
                color: "#f00",
                lineWidth: 1,
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(SegmentsCtor);
        if (SegmentsCtor !== undefined) {
            assert.isTrue(new SegmentsCtor(geometry, material) instanceof THREE.LineSegments);
        }

        const ShaderPointCtor = getObjectConstructor(
            {
                name: "shader",
                primitive: "point",
                params: {},
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(ShaderPointCtor);
        if (ShaderPointCtor !== undefined) {
            assert.isTrue(new ShaderPointCtor(geometry, material) instanceof THREE.Points);
        }

        const ShaderLineCtor = getObjectConstructor(
            {
                name: "shader",
                primitive: "line",
                params: {},
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(ShaderLineCtor);
        if (ShaderLineCtor !== undefined) {
            assert.isTrue(new ShaderLineCtor(geometry, material) instanceof THREE.Line);
        }

        const ShaderLineSegmentsCtor = getObjectConstructor(
            {
                name: "shader",
                primitive: "segments",
                params: {},
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(ShaderLineSegmentsCtor);
        if (ShaderLineSegmentsCtor !== undefined) {
            assert.isTrue(
                new ShaderLineSegmentsCtor(geometry, material) instanceof THREE.LineSegments
            );
        }

        const ShaderMeshCtor = getObjectConstructor(
            {
                name: "shader",
                primitive: "mesh",
                params: {},
                renderOrder: 0
            },
            tile,
            false
        );
        assert.isFunction(ShaderMeshCtor);
        if (ShaderMeshCtor !== undefined) {
            assert.isTrue(new ShaderMeshCtor(geometry, material) instanceof THREE.Mesh);
        }

        const TextCtor = getObjectConstructor({ name: "text", renderOrder: 0 }, tile, false);
        assert.isUndefined(TextCtor); // text techniques don't create scene objects
    });

    it("getObjectConstructor returns DisplacedMesh ctor. on elevation enabled", function() {
        const tile = new Tile(new FakeOmvDataSource(), new TileKey(0, 0, 0));
        const geometry = new THREE.BufferGeometry();
        const material = new MapMeshStandardMaterial();

        const ExtrPolygonCtor = getObjectConstructor(
            {
                name: "extruded-polygon",
                lineWidth: 1,
                renderOrder: 0
            },
            tile,
            true
        );
        assert.isFunction(ExtrPolygonCtor);
        if (ExtrPolygonCtor !== undefined) {
            assert.isTrue(new ExtrPolygonCtor(geometry, material) instanceof DisplacedMesh);
        }

        const StandardCtor = getObjectConstructor({ name: "standard", renderOrder: 0 }, tile, true);
        assert.isFunction(StandardCtor);
        if (StandardCtor !== undefined) {
            assert.isTrue(new StandardCtor(geometry, material) instanceof DisplacedMesh);
        }

        const ExtrLineCtor = getObjectConstructor(
            {
                name: "extruded-line",
                color: "#f00",
                lineWidth: 1,
                renderOrder: 0
            },
            tile,
            true
        );
        assert.isFunction(ExtrLineCtor);
        if (ExtrLineCtor !== undefined) {
            assert.isTrue(new ExtrLineCtor(geometry, material) instanceof DisplacedMesh);
        }

        const FillCtor = getObjectConstructor({ name: "fill", renderOrder: 0 }, tile, true);
        assert.isFunction(FillCtor);
        if (FillCtor !== undefined) {
            assert.isTrue(new FillCtor(geometry, material) instanceof DisplacedMesh);
        }
    });
});
