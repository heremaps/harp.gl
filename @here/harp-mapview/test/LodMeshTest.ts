/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
// tslint:disable:no-unused-expression
//    Chai uses properties instead of functions for some expect checks.

import * as THREE from "three";

import { expect } from "chai";
import { LodMesh } from "../lib/geometry/LodMesh";

describe("LodMesh", function() {
    describe("constructor()", function() {
        it("creates empty mesh", function() {
            const mesh = new LodMesh();
            expect(mesh.geometries).to.be.undefined;
            expect(mesh.geometry).to.not.be.undefined;
            expect(mesh.material).to.not.be.undefined;
        });

        it("creates mesh with geometries and material", function() {
            const material = new THREE.MeshStandardMaterial();
            const geometries = [
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry()
            ];
            const mesh = new LodMesh(geometries, material);
            expect(mesh.geometries).to.equal(geometries);
            expect(mesh.geometry).to.equal(geometries[0]);
            expect(mesh.material).to.equal(material);
        });
    });

    describe("set geometries", function() {
        let mesh: LodMesh;
        beforeEach(function() {
            const material = new THREE.MeshStandardMaterial();
            const geometries = [
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry()
            ];
            mesh = new LodMesh(geometries, material);
        });

        it("sets an empty array", function() {
            mesh.geometries = [];
            expect(mesh.geometries).to.be.empty;
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
        });

        it("sets undefined", function() {
            mesh.geometries = undefined;
            expect(mesh.geometries).to.be.undefined;
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
        });

        it("replaces geometry", function() {
            const geometries = [new THREE.BufferGeometry(), new THREE.BufferGeometry()];
            mesh.geometries = geometries;
            expect(mesh.geometries).to.equal(geometries);
            expect(mesh.geometry).to.equal(geometries[0]);
        });
    });

    describe("setLevelOfDetail()", function() {
        let mesh: LodMesh;
        let geometries: THREE.BufferGeometry[];
        beforeEach(function() {
            const material = new THREE.MeshStandardMaterial();
            geometries = [
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry()
            ];
            mesh = new LodMesh(geometries, material);
        });

        it("changes rendered level of detail of mesh", function() {
            mesh.setLevelOfDetail(1);
            expect(mesh.geometry).to.equal(geometries[1]);
            mesh.setLevelOfDetail(2);
            expect(mesh.geometry).to.equal(geometries[2]);
            mesh.setLevelOfDetail(0);
            expect(mesh.geometry).to.equal(geometries[0]);
        });

        it("clamps to available level of detail", function() {
            mesh.setLevelOfDetail(-1);
            expect(mesh.geometry).to.equal(geometries[0]);
            mesh.setLevelOfDetail(3);
            expect(mesh.geometry).to.equal(geometries[2]);
        });

        it("handles empty or missing geometry", function() {
            mesh.geometries = [];
            mesh.setLevelOfDetail(0);
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
            mesh.geometries = undefined;
            mesh.setLevelOfDetail(0);
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
        });
    });
});
