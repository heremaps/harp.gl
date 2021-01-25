/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert, expect } from "chai";
import * as THREE from "three";

import { ScreenProjector } from "../lib/ScreenProjector";

describe("ScreenProjector", () => {
    const screenSize: number = 10;
    const near: number = 1;
    const far: number = 10;
    const eps: number = 0.01;
    let camera: THREE.Camera;
    let sp: ScreenProjector;

    describe("project3", () => {
        let result: THREE.Vector3;

        before(() => {
            camera = new THREE.PerspectiveCamera(45, 1, near, far);
            sp = new ScreenProjector(camera);
            sp.update(camera, screenSize, screenSize);
        });

        beforeEach(() => {
            result = new THREE.Vector3();
        });

        it("returns undefined for coordinates behind the near plane", () => {
            assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, 0), result));
            expect(result).deep.equal(new THREE.Vector3());
        });

        it("returns undefined for coordinates on near plane", () => {
            assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, -near), result));
            expect(result).deep.equal(new THREE.Vector3());
        });

        it("returns projected vector for coordinates within frustum", () => {
            assert.exists(sp.project3(new THREE.Vector3(0, 0, -near - eps), result));
            expect(result).not.deep.equal(new THREE.Vector3());
            assert.exists(sp.project3(new THREE.Vector3(0, 0, -far + eps), result));
        });

        it("returns projected vector for coordinates within near/far planes but outside of\
        frustum", () => {
            assert.exists(
                sp.project3(new THREE.Vector3(screenSize, -screenSize, -near - eps), result)
            );
            expect(result).not.deep.equal(new THREE.Vector3());
            assert.exists(
                sp.project3(new THREE.Vector3(-screenSize, screenSize, -near - eps), result)
            );
        });

        it("returns undefined for coordinates on far plane", () => {
            assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, -far), result));
            assert.isUndefined(sp.project3(new THREE.Vector3(0, 0, -far - eps), result));
        });
    });

    describe("projectToScreen", () => {
        let result: THREE.Vector2;
        const halfScreenSize: number = screenSize / 2;

        before(() => {
            camera = new THREE.OrthographicCamera(
                -halfScreenSize,
                halfScreenSize,
                halfScreenSize,
                -halfScreenSize,
                near,
                far
            );
            sp = new ScreenProjector(camera);
            sp.update(camera, screenSize, screenSize);
        });

        beforeEach(() => {
            result = new THREE.Vector2();
        });

        it("returns projected vector for coordinates within frustum", () => {
            assert.exists(
                sp.projectToScreen(new THREE.Vector3(-halfScreenSize + eps, 0, -near - eps), result)
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectToScreen(new THREE.Vector3(halfScreenSize - eps, 0, -far + eps), result)
            );
        });

        it("returns projected vector for coordinates within near/far planes on other frustum\
        planes", () => {
            assert.exists(
                sp.projectToScreen(
                    new THREE.Vector3(-halfScreenSize, halfScreenSize, -near - eps),
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectToScreen(
                    new THREE.Vector3(halfScreenSize, -halfScreenSize, -far + eps),
                    result
                )
            );
        });

        it("returns projected vector for coordinates within near/far planes but outside of\
        frustum", () => {
            assert.exists(
                sp.projectToScreen(new THREE.Vector3(-halfScreenSize - eps, 0, -near - eps), result)
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectToScreen(new THREE.Vector3(halfScreenSize + eps, 0, -near - eps), result)
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectToScreen(new THREE.Vector3(0, -halfScreenSize - eps, -near - eps), result)
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectToScreen(new THREE.Vector3(0, halfScreenSize + eps, -near - eps), result)
            );
            expect(result).not.deep.equal(new THREE.Vector2());
        });
    });

    describe("projectAreaToScreen", () => {
        let result: THREE.Vector2;
        const halfScreenSize: number = screenSize / 2;

        before(() => {
            camera = new THREE.OrthographicCamera(
                -halfScreenSize,
                halfScreenSize,
                halfScreenSize,
                -halfScreenSize,
                near,
                far
            );
            sp = new ScreenProjector(camera);
            sp.update(camera, screenSize, screenSize);
        });

        beforeEach(() => {
            result = new THREE.Vector2();
        });

        it("returns projected vector for areas within frustum", () => {
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(-halfScreenSize + eps, 0, -near - eps),
                    0,
                    0,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(halfScreenSize - eps, 0, -far + eps),
                    0,
                    0,
                    result
                )
            );
        });

        it("returns projected vector for areas within near/far planes on other frustum\
            planes", () => {
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(-halfScreenSize, halfScreenSize, -near - eps),
                    0,
                    0,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(halfScreenSize, -halfScreenSize, -far + eps),
                    0,
                    0,
                    result
                )
            );
        });

        it("returns undefined for infinitesimal areas outside of frustum", () => {
            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(-halfScreenSize - eps, 0, -near - eps),
                    0,
                    0,
                    result
                )
            );

            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(halfScreenSize + eps, 0, -near - eps),
                    0,
                    0,
                    result
                )
            );

            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, -halfScreenSize - eps, -near - eps),
                    0,
                    0,
                    result
                )
            );

            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, halfScreenSize + eps, -near - eps),
                    0,
                    0,
                    result
                )
            );
        });

        it("returns projected vector for areas within near/far planes but outside of\
            frustum", () => {
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(-halfScreenSize - eps, 0, -near - eps),
                    eps,
                    eps,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(halfScreenSize + eps, 1, -near - eps),
                    eps,
                    eps,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, -halfScreenSize - eps, -near - eps),
                    eps,
                    eps,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, halfScreenSize + eps, -near - eps),
                    eps,
                    eps,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
        });

        it("returns projected vector for areas partially inside of the frustum", () => {
            const radius = 0.2;
            const radiusInScreenSize = radius * screenSize;
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(-halfScreenSize - radiusInScreenSize + eps, 0, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(halfScreenSize + radiusInScreenSize - eps, 1, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, -halfScreenSize - radiusInScreenSize + eps, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
            assert.exists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, halfScreenSize + radiusInScreenSize - eps, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            expect(result).not.deep.equal(new THREE.Vector2());
        });

        it("returns undefined for areas within near/far planes but completely outside of\
            frustum", () => {
            const radius = 0.2;
            const radiusInScreenSize = radius * screenSize;
            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(-halfScreenSize - radiusInScreenSize - eps, 0, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(halfScreenSize + radiusInScreenSize + eps, 1, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, -halfScreenSize - radiusInScreenSize - eps, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
            assert.notExists(
                sp.projectAreaToScreen(
                    new THREE.Vector3(0, halfScreenSize + radiusInScreenSize + eps, -near - eps),
                    radius,
                    radius,
                    result
                )
            );
        });
    });
});
