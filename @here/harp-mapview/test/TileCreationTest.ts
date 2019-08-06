/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
import { ShaderTechnique } from "@here/harp-datasource-protocol";
import { assert } from "chai";
import * as THREE from "three";
import { createMaterial, getObjectConstructor } from "./../lib/DecodedTileHelpers";

describe("Tile Creation", function() {
    it("ShaderTechnique", function() {
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
        const shaderMaterial = createMaterial(technique);
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
        const Ctor = getObjectConstructor(technique);
        assert.isFunction(Ctor, "Expected a constructor");
        if (Ctor !== undefined) {
            const object = new Ctor();
            assert.isTrue(object instanceof THREE.Line, "expected a THREE.Line object");
        }
    });

    it("ObjectConstructor", function() {
        const ExtrudedLineCtor = getObjectConstructor({
            name: "extruded-line",
            color: "#f00",
            lineWidth: 1,
            renderOrder: 0
        });
        assert.isFunction(ExtrudedLineCtor);
        if (ExtrudedLineCtor !== undefined) {
            assert.isTrue(new ExtrudedLineCtor() instanceof THREE.Mesh);
        }

        const StandardCtor = getObjectConstructor({ name: "standard", renderOrder: 0 });
        assert.isFunction(StandardCtor);
        if (StandardCtor !== undefined) {
            assert.isTrue(new StandardCtor() instanceof THREE.Mesh);
        }

        const ExtrudedPolygonCtor = getObjectConstructor({
            name: "extruded-polygon",
            lineWidth: 1,
            renderOrder: 0
        });
        assert.isFunction(ExtrudedPolygonCtor);
        if (ExtrudedPolygonCtor !== undefined) {
            assert.isTrue(new ExtrudedPolygonCtor() instanceof THREE.Mesh);
        }

        const FillCtor = getObjectConstructor({ name: "fill", renderOrder: 0 });
        assert.isFunction(FillCtor);
        if (FillCtor !== undefined) {
            assert.isTrue(new FillCtor() instanceof THREE.Mesh);
        }

        const PointCtor = getObjectConstructor({ name: "squares", renderOrder: 0 });
        assert.isFunction(PointCtor);
        if (PointCtor !== undefined) {
            assert.isTrue(new PointCtor() instanceof THREE.Points);
        }

        const LineCtor = getObjectConstructor({
            name: "line",
            color: "#f00",
            lineWidth: 1,
            renderOrder: 0
        });
        assert.isFunction(LineCtor);
        if (LineCtor !== undefined) {
            assert.isTrue(new LineCtor() instanceof THREE.Line);
        }

        const SegmentsCtor = getObjectConstructor({
            name: "segments",
            color: "#f00",
            lineWidth: 1,
            renderOrder: 0
        });
        assert.isFunction(SegmentsCtor);
        if (SegmentsCtor !== undefined) {
            assert.isTrue(new SegmentsCtor() instanceof THREE.LineSegments);
        }

        const ShaderPointCtor = getObjectConstructor({
            name: "shader",
            primitive: "point",
            params: {},
            renderOrder: 0
        });
        assert.isFunction(ShaderPointCtor);
        if (ShaderPointCtor !== undefined) {
            assert.isTrue(new ShaderPointCtor() instanceof THREE.Points);
        }

        const ShaderLineCtor = getObjectConstructor({
            name: "shader",
            primitive: "line",
            params: {},
            renderOrder: 0
        });
        assert.isFunction(ShaderLineCtor);
        if (ShaderLineCtor !== undefined) {
            assert.isTrue(new ShaderLineCtor() instanceof THREE.Line);
        }

        const ShaderLineSegmentsCtor = getObjectConstructor({
            name: "shader",
            primitive: "segments",
            params: {},
            renderOrder: 0
        });
        assert.isFunction(ShaderLineSegmentsCtor);
        if (ShaderLineSegmentsCtor !== undefined) {
            assert.isTrue(new ShaderLineSegmentsCtor() instanceof THREE.LineSegments);
        }

        const ShaderMeshCtor = getObjectConstructor({
            name: "shader",
            primitive: "mesh",
            params: {},
            renderOrder: 0
        });
        assert.isFunction(ShaderMeshCtor);
        if (ShaderMeshCtor !== undefined) {
            assert.isTrue(new ShaderMeshCtor() instanceof THREE.Mesh);
        }

        const TextCtor = getObjectConstructor({ name: "text", renderOrder: 0 });
        assert.isUndefined(TextCtor); // text techniques don't create scene objects
    });
});
