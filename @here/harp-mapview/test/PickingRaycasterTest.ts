/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
// tslint:disable:no-unused-expression
//    Chai uses properties instead of functions for some expect checks.

import { GeometryKind } from "@here/harp-datasource-protocol";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { PickingRaycaster } from "../lib/PickingRaycaster";

function createFakeObject<T extends THREE.Object3D>(type: new () => T): T {
    const object = new type();
    sinon.stub(object, "raycast").callsFake((_, intersects) => {
        intersects.push({ distance: 0, point: new THREE.Vector3(), object });
    });
    return object;
}
describe("PickingRaycaster", function() {
    let raycaster: PickingRaycaster;

    beforeEach(function() {
        raycaster = new PickingRaycaster(0, 0);
    });

    describe("intersectObject(s)", function() {
        it("skips invisible objects", function() {
            const object = createFakeObject(THREE.Object3D);
            object.visible = false;
            {
                const intersections = raycaster.intersectObject(object);
                expect(intersections).to.be.empty;
            }
            {
                const intersections = raycaster.intersectObjects([object, object]);
                expect(intersections).to.be.empty;
            }
        });

        it("skips fully transparent objects", function() {
            const mesh = createFakeObject(THREE.Mesh);
            mesh.material = new THREE.Material();
            mesh.material.opacity = 0;
            MapObjectAdapter.create(mesh, {});
            {
                const intersections = raycaster.intersectObject(mesh);
                expect(intersections).to.be.empty;
            }
            {
                const intersections = raycaster.intersectObjects([mesh, mesh]);
                expect(intersections).to.be.empty;
            }
        });

        it("skips background objects", function() {
            const object = createFakeObject(THREE.Object3D);
            object.userData.kind = [GeometryKind.Background];
            {
                const intersections = raycaster.intersectObject(object);
                expect(intersections).to.be.empty;
            }
            {
                const intersections = raycaster.intersectObjects([object, object]);
                expect(intersections).to.be.empty;
            }
        });

        it("skips depth prepass meshes", function() {
            const mesh = createFakeObject(THREE.Mesh);
            mesh.material = new THREE.Material();
            (mesh.material as any).isDepthPrepassMaterial = true;
            {
                const intersections = raycaster.intersectObject(mesh);
                expect(intersections).to.be.empty;
            }
            {
                const intersections = raycaster.intersectObjects([mesh, mesh]);
                expect(intersections).to.be.empty;
            }
        });

        it("tests pickable objects", function() {
            const object = createFakeObject(THREE.Object3D);
            {
                const intersections = raycaster.intersectObject(object);
                expect(intersections).to.have.length(1);
            }
            {
                const intersections = raycaster.intersectObjects([object, object]);
                expect(intersections).to.have.length(2);
            }
        });
    });
});
