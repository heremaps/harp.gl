/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { expect } from "chai";
import * as THREE from "three";

import { PickObjectType, PickResult } from "../lib/PickHandler";
import { PickListener } from "../lib/PickListener";

function createIntersection(dataSource: string | undefined): THREE.Intersection {
    const object = new THREE.Object3D();
    object.userData = { dataSource };
    return { distance: 0, point: new THREE.Vector3(), object };
}
describe("PickListener", function () {
    const point = new THREE.Vector3();

    describe("addResult", function () {
        it("adds all results for new features", function () {
            const listener = new PickListener();
            const userData = {};
            const intersection = createIntersection("ds1");
            listener.addResult({
                type: PickObjectType.Point,
                point,
                distance: 1,
                featureId: 1,
                userData,
                intersection
            });

            // different type
            listener.addResult({
                type: PickObjectType.Area,
                point,
                distance: 1,
                featureId: 1,
                userData,
                intersection
            });

            // different data source.
            listener.addResult({
                type: PickObjectType.Point,
                point,
                distance: 1,
                featureId: 1,
                userData,
                intersection: createIntersection("ds2")
            });

            // different feature id
            listener.addResult({
                type: PickObjectType.Point,
                point,
                distance: 1,
                featureId: 2,
                userData,
                intersection
            });

            // no feature id and different user data.
            listener.addResult({
                type: PickObjectType.Point,
                point,
                distance: 1,
                userData: {},
                intersection
            });
            listener.finish();
            expect(listener.results).to.have.lengthOf(5);
        });

        it("ignores a result for the same feature of an older closer result", function () {
            const userData = {};
            const intersection = createIntersection("ds1");

            {
                // matching results by feature id.
                const listener = new PickListener();
                const firstResult: PickResult = {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    featureId: 1,
                    userData,
                    intersection
                };
                listener.addResult(firstResult);

                listener.addResult({
                    type: PickObjectType.Point,
                    point,
                    distance: 2,
                    featureId: 1,
                    intersection
                });
                listener.finish();

                expect(listener.results).to.have.lengthOf(1);
                expect(listener.results[0]).equals(firstResult);
            }
            {
                // matching results by user data.
                const listener = new PickListener();

                const firstResult: PickResult = {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    userData,
                    intersection
                };
                listener.addResult(firstResult);

                listener.addResult({
                    type: PickObjectType.Point,
                    point,
                    distance: 2,
                    userData,
                    intersection
                });
                listener.finish();

                expect(listener.results).to.have.lengthOf(1);
                expect(listener.results[0]).equals(firstResult);
            }
        });

        it("replaces an older result with a closer result for the same feature", function () {
            const listener = new PickListener();
            const userData = {};
            const intersection = createIntersection("ds1");
            listener.addResult({
                type: PickObjectType.Point,
                point,
                distance: 2,
                featureId: 1,
                userData,
                intersection
            });

            const closerResult: PickResult = {
                type: PickObjectType.Point,
                point,
                distance: 1,
                featureId: 1,
                intersection
            };
            listener.addResult(closerResult);
            listener.finish();

            expect(listener.results).to.have.lengthOf(1);
            expect(listener.results[0]).equals(closerResult);
        });
    });

    describe("finish", function () {
        it("orders the results", function () {
            const listener = new PickListener();
            const expectedResults: PickResult[] = [
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 0,
                    renderOrder: 1
                },
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    renderOrder: 3
                },
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    renderOrder: 2
                }
            ];
            listener.addResult(expectedResults[2]);
            listener.addResult(expectedResults[1]);
            listener.addResult(expectedResults[0]);
            listener.finish();

            expect(listener.results).to.have.ordered.members(expectedResults);
        });

        it("keeps only the closest maximum result count if specified", function () {
            const maxResultCount = 1;
            const listener = new PickListener({ maxResultCount });
            const results: PickResult[] = [
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 0,
                    renderOrder: 1
                },
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    renderOrder: 3
                }
            ];
            listener.addResult(results[1]);
            listener.addResult(results[0]);
            listener.finish();

            expect(listener.results).to.have.lengthOf(maxResultCount);
            expect(listener.results[0]).equals(results[0]);
        });
    });

    describe("closestResult", function () {
        it("returns undefined if there's no results", function () {
            const listener = new PickListener();
            expect(listener.closestResult).to.be.undefined;
        });

        it("returns closest result when there's some results", function () {
            const listener = new PickListener();
            const results: PickResult[] = [
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 0,
                    renderOrder: 1
                },
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    renderOrder: 3
                }
            ];
            listener.addResult(results[1]);
            listener.addResult(results[0]);
            listener.finish();

            expect(listener.closestResult).to.equal(results[0]);
        });
    });

    describe("furthestResult", function () {
        it("returns undefined if there's no results", function () {
            const listener = new PickListener();
            expect(listener.furthestResult).to.be.undefined;
        });

        it("returns furtherst result when there's some results", function () {
            const listener = new PickListener();
            const results: PickResult[] = [
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 0,
                    renderOrder: 1
                },
                {
                    type: PickObjectType.Point,
                    point,
                    distance: 1,
                    renderOrder: 3
                }
            ];
            listener.addResult(results[1]);
            listener.addResult(results[0]);
            listener.finish();

            expect(listener.furthestResult).to.equal(results[1]);
        });
    });
});
