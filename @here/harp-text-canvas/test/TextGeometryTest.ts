/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { Font, FontMetrics } from "../lib/rendering/FontCatalog";
import { GlyphData } from "../lib/rendering/GlyphData";
import { TextGeometry } from "../lib/rendering/TextGeometry";
import { TextRenderStyle } from "../lib/rendering/TextStyle";

describe("TextGeometry", () => {
    let style: TextRenderStyle;
    let textGeometry: TextGeometry;
    beforeEach(() => {
        style = new TextRenderStyle();
        textGeometry = new TextGeometry(
            new THREE.Scene(),
            new THREE.Material(),
            new THREE.Material(),
            10,
            10
        );
    });

    function createGlyph(): GlyphData {
        const metrics: FontMetrics = {
            size: 10,
            distanceRange: 0,
            base: 0,
            lineHeight: 5,
            lineGap: 0,
            capHeight: 10,
            xHeight: 5
        };
        const font: Font = { name: "", metrics, charset: "" };
        return new GlyphData(0, "", 5, 5, 0, 0, 0, 0, 0, 1, 1, new THREE.Texture(), font);
    }

    function addGlyph(
        corners = [
            new THREE.Vector3(0, 0),
            new THREE.Vector3(10, 0),
            new THREE.Vector3(0, 10),
            new THREE.Vector3(10, 10)
        ]
    ) {
        const glyphData = createGlyph();
        expect(textGeometry.add(glyphData, corners, 1, 1, false, style)).equals(true);
    }

    describe("pick", () => {
        it("pick within glyph boundaries returns glyph's pick data", () => {
            addGlyph();
            const pickData = {};
            expect(textGeometry.addPickingData(0, 1, pickData)).equals(true);

            const callbackSpy = sinon.spy();
            textGeometry.pick(new THREE.Vector2(5, 5), callbackSpy);
            expect(callbackSpy.calledWith(pickData)).equals(true);
        });

        it("pick out of glyph boundaries returns no data", () => {
            addGlyph();
            const pickData = {};
            expect(textGeometry.addPickingData(0, 1, pickData)).equals(true);

            const callbackSpy = sinon.spy();
            textGeometry.pick(new THREE.Vector2(11, 10), callbackSpy);
            expect(callbackSpy.called).equals(false);
        });

        it("pick after clear returns no data", () => {
            addGlyph();
            const pickData = {};
            expect(textGeometry.addPickingData(0, 1, pickData)).equals(true);
            textGeometry.clear();

            const callbackSpy = sinon.spy();
            textGeometry.pick(new THREE.Vector2(5, 5), callbackSpy);
            expect(callbackSpy.called).equals(false);
        });
    });
});
