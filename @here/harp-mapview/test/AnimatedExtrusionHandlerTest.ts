/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
// tslint:disable:no-unused-expression
//    Chai uses properties instead of functions for some expect checks.

import { MapEnv, Technique } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { ExtrusionFeature } from "@here/harp-materials";
import { expect } from "chai";
import * as sinon from "sinon";
import { AnimatedExtrusionHandler } from "../lib/AnimatedExtrusionHandler";
import { MapView } from "../lib/MapView";
import { Tile } from "../lib/Tile";

class FakeMapView {
    update() {
        // noop
    }
}

class FakeDataSource {
    getDataZoomLevel(zoomLevel: number) {
        return zoomLevel;
    }
}

class FakeTile {
    removeTileCallback?: (tile: Tile) => void;
    readonly dataSource = new FakeDataSource();

    constructor(readonly tileKey: TileKey) {}

    addDisposeCallback(callback: (tile: Tile) => void) {
        this.removeTileCallback = callback;
    }
}

describe("AnimatedExtrusionHandler", function() {
    const minZoomLevel = 17;
    let mapView: MapView;
    let handler: AnimatedExtrusionHandler;
    let technique: Technique;
    const env = new MapEnv({});
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        technique = { name: "extruded-polygon", minZoomLevel } as any;
        mapView = new FakeMapView() as any;
        handler = new AnimatedExtrusionHandler(mapView);
        clock = sinon.useFakeTimers();
    });

    afterEach(() => {
        clock.restore();
    });

    describe("constructor", function() {
        it("creates handler with default values", function() {
            expect(handler.forceEnabled).to.be.false;
            expect(handler.enabled).to.be.true;
            expect(handler.duration).to.be.greaterThan(0);
            expect(handler.isAnimating).to.be.false;
        });
    });

    describe("setAnimationProperties", function() {
        it("returns false for techniques other than extruded polygon", function() {
            handler.forceEnabled = true;
            const enabled = handler.setAnimationProperties({ name: "fill" }, env);
            expect(enabled).to.be.false;
        });

        it("gets minZoomLevel from technique", function() {
            handler.setAnimationProperties(technique, env);
            expect(handler.minZoomLevel).equals(minZoomLevel);
        });

        it("gets technique enable and duration if not forced", function() {
            handler.enabled = false;
            const animateExtrusionDuration = 3000;

            {
                const enabled = handler.setAnimationProperties(
                    {
                        name: "extruded-polygon",
                        animateExtrusion: true,
                        animateExtrusionDuration
                    } as any,
                    env
                );
                expect(enabled).to.be.true;
                expect(handler.duration).equals(animateExtrusionDuration);
            }
            {
                const enabled = handler.setAnimationProperties(
                    {
                        name: "extruded-polygon",
                        animateExtrusion: 1,
                        animateExtrusionDuration
                    } as any,
                    env
                );
                expect(enabled).to.be.true;
            }
        });

        it("ignores technique enable and duration if forced", function() {
            handler.enabled = false;
            const duration = handler.duration;
            handler.forceEnabled = true;
            const animateExtrusionDuration = 1;
            expect(animateExtrusionDuration).to.not.equal(duration);
            const enabled = handler.setAnimationProperties(
                {
                    name: "extruded-polygon",
                    animateExtrusion: true,
                    animateExtrusionDuration
                } as any,
                env
            );
            expect(enabled).to.be.false;
            expect(handler.duration).equals(duration);
        });
    });

    describe("update", function() {
        it("starts animation only if at least one tile and zoom level is greater or equal to \
         minimum", function() {
            const tile = new FakeTile(new TileKey(1, 2, minZoomLevel));

            handler.setAnimationProperties(technique, env);

            handler.update(minZoomLevel - 1);
            expect(handler.isAnimating).to.be.false;

            handler.update(minZoomLevel);
            expect(handler.isAnimating).to.be.false;

            handler.add(tile as any, [{ extrusionRatio: 0 }]);
            handler.update(minZoomLevel);
            expect(handler.isAnimating).to.be.true;
        });

        it("stops animation if zoom level is less than minimum", function() {
            const tile = new FakeTile(new TileKey(1, 2, minZoomLevel));

            handler.setAnimationProperties(technique, env);

            handler.add(tile as any, [{ extrusionRatio: 0 }]);
            handler.update(minZoomLevel);
            expect(handler.isAnimating).to.be.true;

            handler.update(minZoomLevel - 1);
            expect(handler.isAnimating).to.be.false;
        });

        it("updates mapview during animation", function() {
            const updateSpy = sinon.spy(mapView, "update");

            handler.setAnimationProperties(technique, env);

            handler.update(minZoomLevel);
            expect(updateSpy.calledOnce);
        });

        it("updates extrusion ratio", function() {
            const material: ExtrusionFeature = { extrusionRatio: 0 };
            const duration = handler.duration;
            const tile = new FakeTile(new TileKey(1, 2, minZoomLevel));

            handler.setAnimationProperties(technique, env);
            handler.add(tile as any, [material]);
            handler.update(minZoomLevel);

            clock.tick(duration / 2);
            handler.update(minZoomLevel);
            expect(material.extrusionRatio)
                .to.be.greaterThan(0)
                .and.lessThan(1);

            clock.tick(duration / 2);
            handler.update(minZoomLevel);
            expect(material.extrusionRatio).to.be.equal(1);
            expect(handler.isAnimating).to.be.false;
        });
    });

    describe("add", function() {
        it("adds dispose callback to tile", function() {
            const material: ExtrusionFeature = { extrusionRatio: 0 };
            const duration = handler.duration;
            const tile = new FakeTile(new TileKey(1, 2, minZoomLevel));

            handler.setAnimationProperties(technique, env);
            handler.add(tile as any, [material]);
            handler.update(minZoomLevel);
            expect(tile.removeTileCallback).to.not.be.undefined;
            tile.removeTileCallback!(tile as any);

            clock.tick(duration);
            handler.update(minZoomLevel);
            expect(material.extrusionRatio).to.equal(0);
        });

        it("sets extrusion ratio to 1 for tiles in already animated trees", function() {
            const duration = handler.duration;
            const material = { extrusionRatio: 0 };
            const firstTile = new FakeTile(new TileKey(1, 2, minZoomLevel));
            const secondTile = new FakeTile(firstTile.tileKey.changedLevelTo(minZoomLevel + 1));

            handler.setAnimationProperties(technique, env);
            handler.add(firstTile as any, [{ extrusionRatio: 0 }]);
            handler.update(minZoomLevel);
            clock.tick(duration);
            handler.update(minZoomLevel);

            handler.add(secondTile as any, [material]);
            expect(material.extrusionRatio).to.equal(1);
        });

        it("restarts animation if tile does not belong to an already animated tree", function() {
            const duration = handler.duration;
            const material = { extrusionRatio: 0 };
            const firstTile = new FakeTile(new TileKey(1, 2, minZoomLevel));
            const secondTile = new FakeTile(new TileKey(3, 4, minZoomLevel));

            handler.setAnimationProperties(technique, env);
            handler.add(firstTile as any, [{ extrusionRatio: 0 }]);
            handler.update(minZoomLevel);
            clock.tick(duration);
            handler.update(minZoomLevel);

            handler.add(secondTile as any, [material]);
            handler.update(minZoomLevel);
            expect(material.extrusionRatio).to.equal(0);

            clock.tick(duration);
            handler.update(minZoomLevel);
            expect(material.extrusionRatio).to.equal(1);
        });
    });
});
