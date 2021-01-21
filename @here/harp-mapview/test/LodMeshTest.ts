/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { LodMesh } from "../lib/geometry/LodMesh";

describe("LodMesh", function () {
    describe("constructor()", function () {
        it("creates empty mesh", function () {
            const mesh = new LodMesh();
            expect(mesh.geometries).to.be.undefined;
            expect(mesh.geometry).to.not.be.undefined;
            expect(mesh.material).to.not.be.undefined;
        });

        it("creates mesh with geometries and material", function () {
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

    describe("set geometries", function () {
        let mesh: LodMesh;
        let disposalSpies: Array<sinon.SinonSpy<[], void>>;

        beforeEach(function () {
            const material = new THREE.MeshStandardMaterial();
            const geometries = [
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry()
            ];
            disposalSpies = geometries.map(geometry => sinon.spy(geometry, "dispose"));

            mesh = new LodMesh(geometries, material);
        });

        it("sets an empty array", function () {
            mesh.geometries = [];
            expect(mesh.geometries).to.be.empty;
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
            expect(disposalSpies[0].called).to.be.true;
            expect(disposalSpies[1].called).to.be.true;
            expect(disposalSpies[2].called).to.be.true;
        });

        it("sets undefined", function () {
            mesh.geometries = undefined;
            expect(mesh.geometries).to.be.undefined;
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
            expect(disposalSpies[0].called).to.be.true;
            expect(disposalSpies[1].called).to.be.true;
            expect(disposalSpies[2].called).to.be.true;
        });

        it("replaces geometry", function () {
            const geometries = [new THREE.BufferGeometry(), new THREE.BufferGeometry()];
            mesh.geometries = geometries;
            expect(mesh.geometries).to.equal(geometries);
            expect(mesh.geometry).to.equal(geometries[0]);
            expect(disposalSpies[0].called).to.be.true;
            expect(disposalSpies[1].called).to.be.true;
            expect(disposalSpies[2].called).to.be.true;
        });
    });

    describe("setLevelOfDetail()", function () {
        let mesh: LodMesh;
        let geometries: THREE.BufferGeometry[];
        beforeEach(function () {
            const material = new THREE.MeshStandardMaterial();
            geometries = [
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry(),
                new THREE.BufferGeometry()
            ];
            mesh = new LodMesh(geometries, material);
        });

        it("changes rendered level of detail of mesh", function () {
            mesh.setLevelOfDetail(1);
            expect(mesh.geometry).to.equal(geometries[1]);
            mesh.setLevelOfDetail(2);
            expect(mesh.geometry).to.equal(geometries[2]);
            mesh.setLevelOfDetail(0);
            expect(mesh.geometry).to.equal(geometries[0]);
        });

        it("clamps to available level of detail", function () {
            mesh.setLevelOfDetail(-1);
            expect(mesh.geometry).to.equal(geometries[0]);
            mesh.setLevelOfDetail(3);
            expect(mesh.geometry).to.equal(geometries[2]);
        });

        it("handles empty or missing geometry", function () {
            mesh.geometries = [];
            mesh.setLevelOfDetail(0);
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
            mesh.geometries = undefined;
            mesh.setLevelOfDetail(0);
            expect(mesh.geometry).to.be.instanceOf(THREE.BufferGeometry);
        });
    });
});
