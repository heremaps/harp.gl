/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import * as THREE from "three";

import { Object3DUtils } from "../lib/geometry/Object3DUtils";

describe("Object3DUtils", function () {
    it("estimate size of world with one cube", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(2064);
        expect(objSize.gpuSize).to.be.equal(840);
    });

    it("estimate size of world with two cubes that share the geometry", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube0 = new THREE.Mesh(geometry, material);
        scene.add(cube0);
        const cube1 = new THREE.Mesh(geometry, material);
        scene.add(cube1);

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(3064); // see previous test: 2064 + 1000 = 3808
        expect(objSize.gpuSize).to.be.equal(840); // see previous test
    });

    it("estimate size of world with 1000 cubes", async function (this: Mocha.Context) {
        this.timeout(4000);
        const scene: THREE.Scene = new THREE.Scene();
        for (let i = 0; i < 1000; i++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
        }

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(2064000); // see previous test: 2064 * 1000
        expect(objSize.gpuSize).to.be.equal(840000); // see previous test: 1584 * 1000
    });

    it("estimate size of world with single point", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [new THREE.Vector3(0, 1, 0)];
        const geometry = new THREE.BufferGeometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(1068); // 1*vector3 + object3d overhead
        expect(objSize.gpuSize).to.be.equal(12);
    });

    it("estimate size of world with 6 points", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray = new Array<THREE.Vector3>(6).fill(new THREE.Vector3());
        const bufferGeometry = new THREE.BufferGeometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(bufferGeometry, material);
        scene.add(points);

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(1128); // see previous test
        expect(objSize.gpuSize).to.be.equal(72); // 6*3*4 bytes - buffered data
    });

    it("estimate size of world with 6 points making circle", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.CircleGeometry(1, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(1516); // 7*vector3 + 6*face + object3d overhead
        expect(objSize.gpuSize).to.be.equal(292);
    });

    it("estimate size of world with line between 2 points", async function () {
        const scene: THREE.Scene = new THREE.Scene();
        const vertexArray: THREE.Vector3[] = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 5, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(vertexArray);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);

        const objSize = Object3DUtils.estimateSize(scene);
        expect(objSize.heapSize).to.be.equal(1080);
        expect(objSize.gpuSize).to.be.equal(24);
    });
});
