/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";
import * as sinon from "sinon";

import { GeoBox, GeoCoordinates } from "@here/harp-geoutils";
import { TransferManager } from "@here/harp-transfer-manager";
import { CopyrightInfo } from "../lib/copyrights/CopyrightInfo";
import { UrlCopyrightProvider } from "../lib/copyrights/UrlCopyrightProvider";

describe("CopyrightProviders", function() {
    describe("#UrlCopyrightProvider", function() {
        async function getCopyrights(geoBox: GeoBox, level: number): Promise<CopyrightInfo[]> {
            const provider = new UrlCopyrightProvider("", "normal");
            return provider.getCopyrights(geoBox, level);
        }

        describe("#init", function() {
            it("Should return default copyrights if failed to load data", async function() {
                const fakeJson = sinon.fake.rejects(new Error("error"));

                sinon.replace(TransferManager.prototype, "downloadJson", fakeJson);
                const copyrights = await getCopyrights(
                    new GeoBox(new GeoCoordinates(2, 2), new GeoCoordinates(3, 3)),
                    10
                );
                sinon.restore();

                expect(copyrights).to.deep.equal([]);
            });

            it("Should return different copyrights for different inputs", async function() {
                const fakeJson = sinon.fake.rejects(new Error("error"));
                sinon.replace(TransferManager.prototype, "downloadJson", fakeJson);

                const provider = new UrlCopyrightProvider("", "normal");
                const geoBox = new GeoBox(new GeoCoordinates(2, 2), new GeoCoordinates(3, 3));
                const firstResult = await provider.getCopyrights(geoBox, 10);
                const secondResult = await provider.getCopyrights(geoBox, 5);

                expect(firstResult).not.to.equal(secondResult);

                sinon.restore();
            });
        });

        describe("#intersections", function() {
            beforeEach(function() {
                const fakeJson = sinon.fake.resolves({
                    normal: [
                        {
                            minLevel: 10,
                            maxLevel: 20,
                            label: "label 1",
                            alt: "alt 1",
                            boxes: [
                                [0, 0, 10, 10],
                                [10, 10, 20, 20]
                            ]
                        },
                        {
                            minLevel: 10,
                            maxLevel: 20,
                            label: "label 2",
                            alt: "alt 2",
                            boxes: [
                                [-10, -10, 0, 0],
                                [-20, -20, -10, -10]
                            ]
                        },
                        {
                            minLevel: 1,
                            maxLevel: 2,
                            label: "label 3",
                            alt: "alt 3"
                        }
                    ]
                });
                sinon.replace(TransferManager.prototype, "downloadJson", fakeJson);
            });

            afterEach(function() {
                sinon.restore();
            });

            it("Should not return copyrights for bounding box outside coverage", async function() {
                const copyrights = await getCopyrights(
                    new GeoBox(new GeoCoordinates(30, 30), new GeoCoordinates(33, 33)),
                    10
                );

                expect(copyrights).to.deep.equal([]);
            });

            it("Should return copyrights for bounding box inside coverage", async function() {
                const copyrights = await getCopyrights(
                    new GeoBox(new GeoCoordinates(2, 2), new GeoCoordinates(3, 3)),
                    10
                );

                expect(copyrights).to.have.deep.members([{ id: "label 1" }]);
            });

            it("Should return copyrights coverage inside bounding box", async function() {
                const copyrights = await getCopyrights(
                    new GeoBox(new GeoCoordinates(-30, -30), new GeoCoordinates(30, 30)),
                    10
                );

                expect(copyrights).to.have.deep.members([{ id: "label 1" }, { id: "label 2" }]);
            });

            it("Should not return copyrights inside coverage with wrong level", async function() {
                const copyrights = await getCopyrights(
                    new GeoBox(new GeoCoordinates(2, 2), new GeoCoordinates(3, 3)),
                    3
                );

                expect(copyrights).to.deep.equal([]);
            });

            it("Should return copyrights without bounding box", async function() {
                const copyrights = await getCopyrights(
                    new GeoBox(new GeoCoordinates(2, 2), new GeoCoordinates(3, 3)),
                    1
                );

                expect(copyrights).to.have.deep.members([{ id: "label 3" }]);
            });
        });
    });
});
