/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { Pickability } from "@here/harp-datasource-protocol";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { PickingRaycaster } from "../lib/PickingRaycaster";

function createFakeObject<T extends THREE.Object3D>(type: new () => T): T {
    const object = new type();
    sinon.stub(object, "raycast").callsFake((_, intersects) => {
        (intersects as any).push({ distance: 0, point: new THREE.Vector3(), object });
    });
    return object;
}
describe("PickingRaycaster", function () {
    let raycaster: PickingRaycaster;

    beforeEach(function () {
        raycaster = new PickingRaycaster(new THREE.Vector2());
    });

    describe("intersectObject(s)", function () {
        it("skips invisible objects", function () {
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

        it("skips fully transparent objects", function () {
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

        it("skips non-pickable objects", function () {
            const object = createFakeObject(THREE.Object3D);
            MapObjectAdapter.create(object, { pickability: Pickability.transient });
            {
                const intersections = raycaster.intersectObject(object);
                expect(intersections).to.be.empty;
            }
            {
                const intersections = raycaster.intersectObjects([object, object]);
                expect(intersections).to.be.empty;
            }
        });

        it("picks invisible but force-pickable objects", function () {
            const object = createFakeObject(THREE.Mesh);
            object.material = new THREE.Material();
            object.material.opacity = 0;
            MapObjectAdapter.create(object, { pickability: Pickability.all });
            {
                const intersections = raycaster.intersectObject(object);
                expect(intersections).to.have.length(1);
            }
            {
                const intersections = raycaster.intersectObjects([object, object]);
                expect(intersections).to.have.length(2);
            }
        });

        it("tests pickable objects", function () {
            const object = createFakeObject(THREE.Object3D);
            const mesh = createFakeObject(THREE.Mesh);
            mesh.material = new THREE.Material();
            mesh.material.opacity = 1;
            MapObjectAdapter.create(mesh, { pickability: Pickability.onlyVisible });

            {
                const intersections = raycaster.intersectObject(object);
                expect(intersections).to.have.length(1);
            }
            {
                const intersections = raycaster.intersectObjects([object, mesh]);
                expect(intersections).to.have.length(2);
            }
        });

        it("tests object descendants if recursive is true", function () {
            const object = createFakeObject(THREE.Object3D);
            const child = createFakeObject(THREE.Object3D);
            const grandchild = createFakeObject(THREE.Object3D);
            child.children = [grandchild];
            object.children = [child];
            {
                const intersections = raycaster.intersectObject(object, true);
                expect(intersections).to.have.length(3);
            }
            {
                const intersections = raycaster.intersectObjects([object, object], true);
                expect(intersections).to.have.length(6);
            }
        });

        it("skips object descendants if recursive is false", function () {
            const object = createFakeObject(THREE.Object3D);
            const child = createFakeObject(THREE.Object3D);
            const grandchild = createFakeObject(THREE.Object3D);
            child.children = [grandchild];
            object.children = [child];
            {
                const intersections = raycaster.intersectObject(object, false);
                expect(intersections).to.have.length(1);
            }
            {
                const intersections = raycaster.intersectObjects([object, object], false);
                expect(intersections).to.have.length(2);
            }
        });
    });
});
