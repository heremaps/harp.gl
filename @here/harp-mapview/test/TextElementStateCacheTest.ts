/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { TileKey } from "@here/harp-geoutils";
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { expect } from "chai";
import * as THREE from "three";

import { TextElementGroup } from "../lib/text/TextElementGroup";
import { TextElementFilter } from "../lib/text/TextElementGroupState";
import { TextElementState } from "../lib/text/TextElementState";
import { TextElementStateCache } from "../lib/text/TextElementStateCache";
import { lineMarkerBuilder, pointTextBuilder, TextElementBuilder } from "./TextElementBuilder";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

const tileKey = new TileKey(1, 1, 1);
const filter: TextElementFilter = (textElementState: TextElementState): number | undefined => {
    return 1;
};

describe("TextElementStateCache", function () {
    describe("initialized", function () {
        it("empty size", function () {
            const cache = new TextElementStateCache();
            expect(cache.size).to.equal(0);
            expect(cache.cacheSize).to.equal(0);
        });

        it("add state", function () {
            const cache = new TextElementStateCache();
            const group = new TextElementGroup(10, [new TextElementBuilder().build()]);
            const [groupState, foundInCache] = cache.getOrSet(group, tileKey, filter);

            expect(foundInCache).to.be.false;
            expect(cache.size).to.equal(1);
            expect(groupState.group).to.be.equal(group);
        });

        it("get state found in cache", function () {
            const cache = new TextElementStateCache();
            const group0 = new TextElementGroup(10, [
                new TextElementBuilder().withFeatureId(1).build()
            ]);
            const group1 = new TextElementGroup(10, [
                new TextElementBuilder().withFeatureId(1).build()
            ]);

            const [, foundInCache0] = cache.getOrSet(group0, tileKey, filter);
            expect(foundInCache0).to.be.false;
            const [, foundInCache1] = cache.getOrSet(group1, tileKey, filter);
            expect(foundInCache1).to.be.false;

            const [groupState, foundInCache2] = cache.getOrSet(group1, tileKey, filter);
            expect(foundInCache2).to.be.true;
            expect(groupState.group).to.be.equal(group1);
        });

        it("get state not found in cache", function () {
            const cache = new TextElementStateCache();

            const group0 = new TextElementGroup(10, [
                new TextElementBuilder().withFeatureId(1).build()
            ]);
            const group1 = new TextElementGroup(10, [
                new TextElementBuilder().withFeatureId(1).build()
            ]);

            const [, foundInCache0] = cache.getOrSet(group0, tileKey, filter);
            expect(foundInCache0).to.be.false;
            const [, foundInCache1] = cache.getOrSet(group1, tileKey, filter);
            expect(foundInCache1).to.be.false;

            const newGroup = new TextElementGroup(10, [
                new TextElementBuilder().withFeatureId(1).build()
            ]);

            const [groupState, foundInCache2] = cache.getOrSet(newGroup, tileKey, filter);
            expect(groupState.group).not.to.be.equal(group0);
            expect(groupState.group).to.be.equal(newGroup);
            expect(foundInCache2).to.be.false;
        });

        it("deduplicateElement w/ duplicates", function () {
            const cache = new TextElementStateCache();

            const label0 = new TextElementBuilder().withFeatureId(1).withText("X").build();
            const label1 = new TextElementBuilder().withFeatureId(1).withText("X").build();
            const state0 = new TextElementState(label0);

            const elements = [label1, label0];
            const group = new TextElementGroup(10, elements);
            cache.getOrSet(group, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, state0);
            expect(noDuplicate).to.be.true;
            // Now we have an element in the cache
            expect(cache.cacheSize).to.equal(1);
        });

        it("deduplicateElement w/o duplicates", function () {
            const cache = new TextElementStateCache();

            const label0 = new TextElementBuilder().withFeatureId(1).withText("X").build();

            const elements = [label0];
            const group = new TextElementGroup(10, elements);
            cache.getOrSet(group, tileKey, filter);

            const label1 = new TextElementBuilder().withFeatureId(2).withText("Y").build();
            const state1 = new TextElementState(label1);

            const noDuplicate = cache.deduplicateElement(0, state1);
            expect(noDuplicate).to.be.true;
            // One element in the cache
            expect(cache.cacheSize).to.equal(1);
        });

        it("replaceElement", function () {
            const cache = new TextElementStateCache();

            const label0 = new TextElementBuilder().withFeatureId(1).withText("X").build();
            const state0 = new TextElementState(label0);

            const elements = [label0];

            const group = new TextElementGroup(10, elements);
            cache.getOrSet(group, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, state0);
            expect(noDuplicate).to.be.true;
            expect(cache.cacheSize).to.equal(1);

            const label0Compatible = new TextElementBuilder()
                .withFeatureId(1)
                .withText("X")
                .build();
            const textElementStateX2 = new TextElementState(label0Compatible);
            textElementStateX2.update(100);
            textElementStateX2.iconRenderState!.startFadeIn(0);
            expect(textElementStateX2.visible).to.be.false;
            expect(textElementStateX2.iconRenderState!.isFadingIn()).to.be.true;
            expect(textElementStateX2.iconRenderState!.isFadedIn()).to.be.false;

            textElementStateX2.updateFading(1, true);
            expect(textElementStateX2.visible).to.be.true;
            const didReplace = cache.replaceElement(0, textElementStateX2);
            expect(didReplace).to.be.true;
        });

        it("replaceElement (failed, not compatible)", function () {
            const cache = new TextElementStateCache();

            const label0 = new TextElementBuilder().withFeatureId(1).withText("X").build();
            const state0 = new TextElementState(label0);

            const elements = [label0];

            const group = new TextElementGroup(10, elements);
            cache.getOrSet(group, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, state0);
            expect(noDuplicate).to.be.true;
            expect(cache.cacheSize).to.equal(1);

            const label0Compatible = new TextElementBuilder()
                .withFeatureId(2)
                .withText("XY")
                .build();
            const textElementStateX2 = new TextElementState(label0Compatible);
            textElementStateX2.update(100);
            textElementStateX2.iconRenderState!.startFadeIn(0);
            expect(textElementStateX2.visible).to.be.false;
            textElementStateX2.updateFading(1, true);
            expect(textElementStateX2.visible).to.be.true;

            const didReplace = cache.replaceElement(0, textElementStateX2);
            expect(didReplace).to.be.false;
        });

        it("replaceElement POI", function () {
            const cache = new TextElementStateCache();

            const poiLabel0 = pointTextBuilder("poi0").withFeatureId(1).build();

            const poiState0 = new TextElementState(poiLabel0);
            expect(poiState0.visible).to.be.false;

            const elements = [poiLabel0];
            const poiGroup = new TextElementGroup(10, elements);
            cache.getOrSet(poiGroup, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, poiState0);
            expect(noDuplicate).to.be.true;
            expect(cache.cacheSize).to.equal(1);

            const poiLabel1 = pointTextBuilder("poi0").withFeatureId(1).build();
            const poiState1 = new TextElementState(poiLabel1);
            poiState1.update(100);
            poiState1.iconRenderState!.startFadeIn(0);
            expect(poiState1.visible).to.be.false;
            poiState1.updateFading(1, true);
            expect(poiState1.visible).to.be.true;

            const didReplace = cache.replaceElement(0, poiState1);
            expect(didReplace).to.be.true;
        });

        it("replaceElement POI failed (text mismatch)", function () {
            const cache = new TextElementStateCache();

            const poiLabel0 = pointTextBuilder("poi0").withFeatureId(1).build();

            const poiState0 = new TextElementState(poiLabel0);
            expect(poiState0.visible).to.be.false;

            const elements = [poiLabel0];
            const poiGroup = new TextElementGroup(10, elements);
            cache.getOrSet(poiGroup, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, poiState0);
            expect(noDuplicate).to.be.true;
            expect(cache.cacheSize).to.equal(1);

            const poiLabel1 = pointTextBuilder("poi1").withFeatureId(1).build();
            const poiState1 = new TextElementState(poiLabel1);
            poiState1.update(100);
            poiState1.iconRenderState!.startFadeIn(0);
            expect(poiState1.visible).to.be.false;
            poiState1.updateFading(1, true);
            expect(poiState1.visible).to.be.true;

            silenceLoggingAroundFunction("TextElementsStateCache", () => {
                const didReplace = cache.replaceElement(0, poiState1);
                expect(didReplace).to.be.false;
            });
        });

        it("replaceElement POI failed (feature ID mismatch)", function () {
            const cache = new TextElementStateCache();

            const poiLabel0 = pointTextBuilder("poi0").withFeatureId(1).build();

            const poiState0 = new TextElementState(poiLabel0);
            expect(poiState0.visible).to.be.false;

            const elements = [poiLabel0];
            const poiGroup = new TextElementGroup(10, elements);
            cache.getOrSet(poiGroup, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, poiState0);
            expect(noDuplicate).to.be.true;
            expect(cache.cacheSize).to.equal(1);

            const poiLabel1 = pointTextBuilder("poi0").withFeatureId(2).build();
            const poiState1 = new TextElementState(poiLabel1);
            poiState1.update(100);
            poiState1.iconRenderState!.startFadeIn(0);
            expect(poiState1.visible).to.be.false;
            poiState1.updateFading(1, true);
            expect(poiState1.visible).to.be.true;

            const didReplace = cache.replaceElement(0, poiState1);
            expect(didReplace).to.be.false;
        });

        it("replaceElement LineMarker", function () {
            const cache = new TextElementStateCache();

            const poiLabel0 = lineMarkerBuilder(1.0, "lineMarker0")
                .withFeatureId(1)
                .withPath([new THREE.Vector3(1, 1, 1)])
                .build();

            const poiState0 = new TextElementState(poiLabel0);
            // Must not be visible when cached
            expect(poiState0.visible).to.be.false;

            const elements = [poiLabel0];
            const poiGroup = new TextElementGroup(10, elements);
            cache.getOrSet(poiGroup, tileKey, filter);

            const noDuplicate = cache.deduplicateElement(0, poiState0);
            expect(noDuplicate).to.be.true;
            expect(cache.cacheSize).to.equal(1);

            // Same text, same featureID, same number of points
            const poiLabel1 = lineMarkerBuilder(1.0, "lineMarker0")
                .withFeatureId(1)
                .withPath([new THREE.Vector3(1, 1, 1)])
                .build();
            const poiState1 = new TextElementState(poiLabel1);
            poiState1.update(100);
            expect(poiState1.iconRenderState).to.exist;
            poiState1.iconRenderState!.startFadeIn(0);
            expect(poiState1.visible).to.be.false;
            poiState1.updateFading(1, true);
            expect(poiState1.visible).to.be.true;

            const didReplace = cache.replaceElement(0, poiState1);
            expect(didReplace).to.be.true;
        });
    });
});
