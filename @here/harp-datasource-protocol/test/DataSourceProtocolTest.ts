/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { createMaterial } from "../lib/DecodedTile";
import { getObjectConstructor, ShaderTechnique } from "../lib/Techniques";

import { assert } from "chai";
import * as THREE from "three";

describe("DataSourceProtocol", () => {
    it("ok", () => {
        assert.isTrue(true);
    });

    it("ShaderTechnique", () => {
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
            }
        };
        const shaderMaterial = createMaterial({ technique });
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

    it("ObjectConstructor", () => {
        const ExtrudedLineCtor = getObjectConstructor({
            name: "extruded-line",
            color: "#f00",
            lineWidth: 1
        });
        assert.isFunction(ExtrudedLineCtor);
        if (ExtrudedLineCtor !== undefined) {
            assert.isTrue(new ExtrudedLineCtor() instanceof THREE.Mesh);
        }

        const LandmarkCtor = getObjectConstructor({ name: "standard-textured" });
        assert.isFunction(LandmarkCtor);
        if (LandmarkCtor !== undefined) {
            assert.isTrue(new LandmarkCtor() instanceof THREE.Mesh);
        }

        const StandardCtor = getObjectConstructor({ name: "standard" });
        assert.isFunction(StandardCtor);
        if (StandardCtor !== undefined) {
            assert.isTrue(new StandardCtor() instanceof THREE.Mesh);
        }

        const ExtrudedPolygonCtor = getObjectConstructor({ name: "extruded-polygon" });
        assert.isFunction(ExtrudedPolygonCtor);
        if (ExtrudedPolygonCtor !== undefined) {
            assert.isTrue(new ExtrudedPolygonCtor() instanceof THREE.Mesh);
        }

        const FillCtor = getObjectConstructor({ name: "fill" });
        assert.isFunction(FillCtor);
        if (FillCtor !== undefined) {
            assert.isTrue(new FillCtor() instanceof THREE.Mesh);
        }

        const PointCtor = getObjectConstructor({ name: "squares" });
        assert.isFunction(PointCtor);
        if (PointCtor !== undefined) {
            assert.isTrue(new PointCtor() instanceof THREE.Points);
        }

        const LineCtor = getObjectConstructor({ name: "line", color: "#f00", lineWidth: 1 });
        assert.isFunction(LineCtor);
        if (LineCtor !== undefined) {
            assert.isTrue(new LineCtor() instanceof THREE.Line);
        }

        const SegmentsCtor = getObjectConstructor({
            name: "segments",
            color: "#f00",
            lineWidth: 1
        });
        assert.isFunction(SegmentsCtor);
        if (SegmentsCtor !== undefined) {
            assert.isTrue(new SegmentsCtor() instanceof THREE.LineSegments);
        }

        const ShaderPointCtor = getObjectConstructor({
            name: "shader",
            primitive: "point",
            params: {}
        });
        assert.isFunction(ShaderPointCtor);
        if (ShaderPointCtor !== undefined) {
            assert.isTrue(new ShaderPointCtor() instanceof THREE.Points);
        }

        const ShaderLineCtor = getObjectConstructor({
            name: "shader",
            primitive: "line",
            params: {}
        });
        assert.isFunction(ShaderLineCtor);
        if (ShaderLineCtor !== undefined) {
            assert.isTrue(new ShaderLineCtor() instanceof THREE.Line);
        }

        const ShaderLineSegmentsCtor = getObjectConstructor({
            name: "shader",
            primitive: "segments",
            params: {}
        });
        assert.isFunction(ShaderLineSegmentsCtor);
        if (ShaderLineSegmentsCtor !== undefined) {
            assert.isTrue(new ShaderLineSegmentsCtor() instanceof THREE.LineSegments);
        }

        const ShaderMeshCtor = getObjectConstructor({
            name: "shader",
            primitive: "mesh",
            params: {}
        });
        assert.isFunction(ShaderMeshCtor);
        if (ShaderMeshCtor !== undefined) {
            assert.isTrue(new ShaderMeshCtor() instanceof THREE.Mesh);
        }

        const TextCtor = getObjectConstructor({ name: "text" });
        assert.isUndefined(TextCtor); // text techniques don't create scene objects
    });
});
