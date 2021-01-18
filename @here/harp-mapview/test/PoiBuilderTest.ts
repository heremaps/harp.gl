/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, IndexedTechniqueParams, PoiTechnique } from "@here/harp-datasource-protocol";
import { expect } from "chai";

import { PoiBuilder } from "../lib/poi/PoiBuilder";
import { TextElement } from "../lib/text/TextElement";

describe("PoiBuilder", function () {
    const env = new Env();

    function buildPoiTechnique(properties: {}): PoiTechnique & IndexedTechniqueParams {
        return { name: "labeled-icon", _index: 0, _styleSetIndex: 0, ...properties };
    }

    it("uses technique min/maxZoomLevel if icon/text's min/maxZoomLevel undefined", () => {
        const poiTechnique = buildPoiTechnique({ minZoomLevel: 1, maxZoomLevel: 10 });
        const poiInfo = new PoiBuilder(env)
            .withTechnique(poiTechnique)
            .withIcon("")
            .build({} as TextElement);

        expect(poiInfo?.iconMinZoomLevel).equals(poiTechnique.minZoomLevel);
        expect(poiInfo?.iconMaxZoomLevel).equals(poiTechnique.maxZoomLevel);
        expect(poiInfo?.textMinZoomLevel).equals(poiTechnique.minZoomLevel);
        expect(poiInfo?.textMaxZoomLevel).equals(poiTechnique.maxZoomLevel);
    });

    it("reuses same technique between calls to withTechnique", () => {
        const poiTechnique = buildPoiTechnique({});
        const builder = new PoiBuilder(env);
        const poiInfo1 = builder
            .withTechnique(poiTechnique)
            .withIcon("")
            .build({} as TextElement);
        const poiInfo2 = builder.withIcon("").build({} as TextElement);

        expect(poiInfo1?.technique).equals(poiInfo2?.technique).and.equals(poiTechnique);
    });

    it("reuses same imageTextureName and shield group index between calls to withIcon", () => {
        const poiTechnique = buildPoiTechnique({});
        const builder = new PoiBuilder(env);
        const iconName = "dummy";
        const shieldGroupIndex = 42;
        const poiInfo1 = builder
            .withTechnique(poiTechnique)
            .withIcon(iconName, shieldGroupIndex)
            .build({} as TextElement);
        const poiInfo2 = builder.build({} as TextElement);

        expect(poiInfo1?.imageTextureName).equals(poiInfo2?.imageTextureName).and.equals(iconName);
        expect(poiInfo1?.shieldGroupIndex)
            .equals(poiInfo2?.shieldGroupIndex)
            .and.equals(shieldGroupIndex);
    });

    it("uses imageTextureName as poiName if poiName is undefined", () => {
        const poiTechnique = buildPoiTechnique({ poiTable: "table1" });
        const iconName = "dummy";
        const poiInfo = new PoiBuilder(env)
            .withTechnique(poiTechnique)
            .withIcon(iconName)
            .build({} as TextElement);
        expect(poiInfo?.poiName).equals(iconName);
    });

    it("does not create PoiInfo if no imageTextureName or poiName set", () => {
        const poiTechnique = buildPoiTechnique({});
        const poiInfo = new PoiBuilder(env)
            .withTechnique(poiTechnique)
            .withIcon(undefined)
            .build({} as TextElement);
        expect(poiInfo).undefined;
    });

    it("text and icon are not optional by default", () => {
        const poiTechnique = buildPoiTechnique({});
        const poiInfo = new PoiBuilder(env)
            .withTechnique(poiTechnique)
            .withIcon("dummy")
            .build({} as TextElement);
        expect(poiInfo?.textIsOptional).to.be.false;
        expect(poiInfo?.iconIsOptional).to.be.false;
    });
});
