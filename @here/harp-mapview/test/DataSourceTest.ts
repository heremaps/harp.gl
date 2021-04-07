/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import * as chai from "chai";
const { expect } = chai;
import * as chai_as_promised from "chai-as-promised";
chai.use(chai_as_promised);
import * as sinon from "sinon";

import { DataSource } from "../lib/DataSource";
import { MapView } from "../lib/MapView";
import { Tile } from "../lib/Tile";

class TestDataSource extends DataSource {
    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        return undefined;
    }

    /** @override */
    getTilingScheme() {
        return webMercatorTilingScheme;
    }
}

describe("DataSource", function () {
    describe("constructor", function () {
        it("creates datasource with default options", function () {
            const dataSource = new TestDataSource();

            expect(dataSource.name).to.not.be.empty;
            expect(dataSource.styleSetName).to.be.undefined;
            expect(dataSource.minDataLevel).to.equal(1);
            expect(dataSource.maxDataLevel).to.equal(20);
            expect(dataSource.minDisplayLevel).to.equal(1);
            expect(dataSource.maxDisplayLevel).to.equal(20);
            expect(dataSource.storageLevelOffset).to.equal(0);
        });

        it("creates datasource with empty options", function () {
            const dataSource = new TestDataSource({});

            expect(dataSource.name).to.not.be.empty;
            expect(dataSource.styleSetName).to.be.undefined;
            expect(dataSource.minDataLevel).to.equal(1);
            expect(dataSource.maxDataLevel).to.equal(20);
            expect(dataSource.minDisplayLevel).to.equal(1);
            expect(dataSource.maxDisplayLevel).to.equal(20);
            expect(dataSource.storageLevelOffset).to.equal(0);
        });

        it("creates datasource with partial options", function () {
            const dataSource = new TestDataSource({
                name: "TestDataSource",
                maxDataLevel: 14
            });

            expect(dataSource.name).to.equal("TestDataSource");
            expect(dataSource.styleSetName).to.be.undefined;
            expect(dataSource.minDataLevel).to.equal(1);
            expect(dataSource.maxDataLevel).to.equal(14);
            expect(dataSource.minDisplayLevel).to.equal(1);
            expect(dataSource.maxDisplayLevel).to.equal(20);
            expect(dataSource.storageLevelOffset).to.equal(0);
        });

        it("creates datasource with all options set", function () {
            const dataSource = new TestDataSource({
                name: "TestDataSource",
                styleSetName: "test",
                minDataLevel: 2,
                maxDataLevel: 14,
                minDisplayLevel: 10,
                maxDisplayLevel: 17,
                storageLevelOffset: -1,
                languages: []
            });

            expect(dataSource.name).to.equal("TestDataSource");
            expect(dataSource.styleSetName).to.be.equal("test");
            expect(dataSource.minDataLevel).to.equal(2);
            expect(dataSource.maxDataLevel).to.equal(14);
            expect(dataSource.minDisplayLevel).to.equal(10);
            expect(dataSource.maxDisplayLevel).to.equal(17);
            expect(dataSource.storageLevelOffset).to.equal(-1);
        });
    });

    context("with default data source", function () {
        let mapView: MapView;
        let dataSource: DataSource;
        beforeEach(function () {
            mapView = {
                theme: {},
                projection: {}
            } as any;
            dataSource = new TestDataSource();
        });

        describe("styleSetName", function () {
            it("changes style set name", function () {
                dataSource.styleSetName = "test";
                expect(dataSource.styleSetName).to.equal("test");
            });

            it("updates theme if datasource is added to mapview", function () {
                const setThemeSpy = sinon.spy(dataSource, "setTheme");
                dataSource.attach(mapView);
                dataSource.styleSetName = "test";
                expect(dataSource.styleSetName).to.equal("test");
                expect(setThemeSpy.calledOnce);
            });
        });

        describe("dispose", function () {
            it("has an empty default implementation", function () {
                expect(() => dataSource.dispose()).to.not.throw;
            });
        });

        describe("clearCache", function () {
            it("has an empty default implementation", function () {
                expect(() => dataSource.clearCache()).to.not.throw;
            });
        });

        describe("isFullyCovering", function () {
            it("is fully covering if datasource has a ground plane", function () {
                dataSource.addGroundPlane = true;
                expect(dataSource.isFullyCovering()).to.be.true;
                dataSource.addGroundPlane = false;
                expect(dataSource.isFullyCovering()).to.be.false;
            });
        });

        describe("ready", function () {
            it("returns true", function () {
                expect(dataSource.ready()).to.be.true;
            });
        });

        describe("mapView", function () {
            it("returns a mapview if attached", function () {
                dataSource.attach(mapView);
                expect(dataSource.mapView).to.equal(mapView);
                expect(dataSource.isDetached()).to.be.false;
            });

            it("throws an error if not attached", function () {
                expect(() => dataSource.mapView).to.throw;
            });
        });

        describe("projection", function () {
            it("returns mapview projection", function () {
                dataSource.attach(mapView);
                expect(dataSource.projection).to.equal(mapView.projection);
                expect(dataSource.isDetached()).to.be.false;
            });

            it("throws an error if not attached", function () {
                expect(() => dataSource.projection).to.throw;
            });
        });

        describe("connect", function () {
            it("has an empty default implementation", function () {
                return expect(dataSource.connect()).to.eventually.be.fulfilled;
            });
        });

        describe("attach", function () {
            it("sets mapview", function () {
                dataSource.attach(mapView);
                expect(dataSource.mapView).to.equal(mapView);
                expect(dataSource.isDetached()).to.be.false;
            });
        });

        describe("detach", function () {
            it("removes mapview", function () {
                dataSource.attach(mapView);
                dataSource.detach(mapView);
                expect(dataSource).to.have.property("m_mapView").that.is.undefined;
                expect(dataSource.isDetached()).to.be.true;
            });

            it("throws if different mapview is passed", function () {
                dataSource.attach(mapView);
                expect(() => dataSource.detach({} as any)).to.throw;
            });
        });

        describe("setTheme", function () {
            it("has an empty default implementation", function () {
                expect(() => dataSource.setTheme({} as any)).to.not.throw;
            });
        });

        describe("setLanguages", function () {
            it("has an empty default implementation", function () {
                expect(() => dataSource.setLanguages([])).to.not.throw;
            });
        });

        describe("updateTile", function () {
            it("has an empty default implementation", function () {
                expect(() => dataSource.updateTile({} as any)).to.not.throw;
            });
        });

        describe("shouldPreloadTile", function () {
            it("has a default implementation", function () {
                expect(dataSource.shouldPreloadTiles()).to.be.false;
            });
        });

        describe("maxGeometryHeight", function () {
            it("has getters and setters for max geometry height", function () {
                dataSource.maxGeometryHeight = 123.4;
                expect(dataSource.maxGeometryHeight).to.equal(123.4);
            });
        });

        describe("minGeometryHeight", function () {
            it("has getters and setters for min geometry height", function () {
                dataSource.minGeometryHeight = 223.4;
                expect(dataSource.minGeometryHeight).to.equal(223.4);
            });
        });

        describe("setEnableElevationOverlay", function () {
            it("has an empty default implementation", function () {
                expect(() => dataSource.setEnableElevationOverlay(true)).to.not.throw;
            });
        });

        describe("getDataZoomLevel", function () {
            it("limits display zoom level to data level", function () {
                dataSource.minDataLevel = 5;
                dataSource.maxDataLevel = 10;
                expect(dataSource.getDataZoomLevel(4)).to.equal(5);
                expect(dataSource.getDataZoomLevel(11)).to.equal(10);
                expect(dataSource.getDataZoomLevel(7)).to.equal(7);
            });

            it("takes storage level offset into account", function () {
                dataSource.storageLevelOffset = -1;
                expect(dataSource.getDataZoomLevel(1)).to.equal(1);
                expect(dataSource.getDataZoomLevel(4)).to.equal(3);
                expect(dataSource.getDataZoomLevel(11)).to.equal(10);
                expect(dataSource.getDataZoomLevel(7)).to.equal(6);

                dataSource.storageLevelOffset = 1;
                expect(dataSource.getDataZoomLevel(1)).to.equal(2);
                expect(dataSource.getDataZoomLevel(4)).to.equal(5);
                expect(dataSource.getDataZoomLevel(11)).to.equal(12);
                expect(dataSource.getDataZoomLevel(20)).to.equal(20);
            });
        });

        describe("isVisible", function () {
            it("is visible within display level range", function () {
                dataSource.minDisplayLevel = 5;
                dataSource.maxDisplayLevel = 15;
                for (let zoomLevel = 1; zoomLevel <= 4; zoomLevel++) {
                    expect(dataSource.isVisible(zoomLevel)).to.be.false;
                }
                for (let zoomLevel = 5; zoomLevel <= 15; zoomLevel++) {
                    expect(dataSource.isVisible(zoomLevel)).to.be.true;
                }
                for (let zoomLevel = 16; zoomLevel <= 20; zoomLevel++) {
                    expect(dataSource.isVisible(zoomLevel)).to.be.false;
                }
            });
        });

        describe("canGetTile", function () {
            it("has a default implementation", function () {
                expect(dataSource.canGetTile(5, { level: 5 } as any)).to.be.true;
                expect(dataSource.canGetTile(5, { level: 4 } as any)).to.be.true;
                expect(dataSource.canGetTile(4, { level: 4 } as any)).to.be.true;
                expect(dataSource.canGetTile(5, { level: 6 } as any)).to.be.false;
            });
        });

        describe("shouldSubdivide", function () {
            it("subdivides if tilekey is smaller than zoom level", function () {
                expect(dataSource.shouldSubdivide(5, { level: 1 } as any)).to.be.true;
                expect(dataSource.shouldSubdivide(5, { level: 5 } as any)).to.be.true;
                expect(dataSource.shouldSubdivide(5, { level: 6 } as any)).to.be.false;
            });
        });

        describe("shouldRenderText", function () {
            it("has a default implementation", function () {
                for (
                    let zoomLevel = dataSource.minDataLevel;
                    zoomLevel <= dataSource.maxDataLevel;
                    zoomLevel++
                ) {
                    expect(dataSource.shouldRenderText(zoomLevel, {} as any)).to.be.true;
                }
            });
        });

        describe("requestUpdate", function () {
            it("dispatches an update event", function () {
                const spy = sinon.spy((e: any) => {
                    /* noop */
                });
                dataSource.addEventListener("update", spy);
                dataSource.requestUpdate();

                expect(spy.calledOnce).to.be.true;
                const event = spy.getCalls()[0].args[0];
                expect(event.type).to.equal("update");
                expect(event.target).to.equal(dataSource);
            });
        });
    });
});
