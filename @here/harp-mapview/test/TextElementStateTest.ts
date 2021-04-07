/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { TextBufferObject } from "@here/harp-text-canvas";
import {
    HorizontalAlignment,
    HorizontalPlacement,
    VerticalAlignment,
    VerticalPlacement
} from "@here/harp-text-canvas/lib/rendering/TextStyle";
import { expect } from "chai";
import * as THREE from "three";

import { TextElementState } from "../lib/text/TextElementState";
import { TextElementType } from "../lib/text/TextElementType";

describe("TextElementState", function () {
    describe("initialized", function () {
        it("returns false for uninitialized state", function () {
            const textElementState = new TextElementState({} as any);
            expect(textElementState.initialized).to.be.false;
        });

        it("returns true for initialized state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel
            } as any);
            textElementState.update(0);
            expect(textElementState.initialized).to.be.true;
        });
    });

    describe("visible", function () {
        it("returns false for uninitialized state", function () {
            const textElementState = new TextElementState({} as any);
            expect(textElementState.visible).to.be.false;
        });

        it("returns false when text is initialized but invisible", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel
            } as any);
            textElementState.update(0);
            expect(textElementState.visible).to.be.false;
        });

        it("returns false when text and icon are initialized but invisible", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(0);
            expect(textElementState.visible).to.be.false;
        });

        it("returns true when text is initialized and visible", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel
            } as any);
            textElementState.update(0);
            textElementState.textRenderState!.startFadeIn(0);
            expect(textElementState.visible).to.be.false;
            textElementState.updateFading(1, true);
            expect(textElementState.visible).to.be.true;
        });

        it("returns true when icon is initialized and visible", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(0);
            textElementState.iconRenderState!.startFadeIn(0);
            expect(textElementState.visible).to.be.false;
            textElementState.updateFading(1, true);
            expect(textElementState.visible).to.be.true;
        });

        it("returns true when icons are initialized and visible", function () {
            const textElementState = new TextElementState({
                type: TextElementType.LineMarker,
                poiInfo: {
                    technique: {}
                },
                points: [
                    [0, 0],
                    [0, 1]
                ]
            } as any);
            textElementState.update(0);
            textElementState.iconRenderState!.startFadeIn(0);
            expect(textElementState.visible).to.be.false;
            textElementState.updateFading(1, true);
            expect(textElementState.visible).to.be.true;
        });
    });

    describe("reset", function () {
        it("resets uninitialized state", function () {
            const textElementState = new TextElementState({} as any);
            expect(() => textElementState.reset()).to.not.throw();
            expect(textElementState.viewDistance).to.be.undefined;
        });

        it("resets text render state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel
            } as any);
            textElementState.update(0);
            expect(() => textElementState.reset()).to.not.throw();

            expect(textElementState.textRenderState!.isUndefined()).to.be.true;
            expect(textElementState.viewDistance).to.be.undefined;
        });

        it("resets text layout state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {
                        placement: "LT, RB"
                    }
                },
                layoutStyle: {
                    horizontalAlignment: HorizontalAlignment.Right,
                    verticalAlignment: VerticalAlignment.Above
                }
            } as any);
            textElementState.element.bounds = new THREE.Box2();
            textElementState.update(0);
            // Override with alternative text placement
            textElementState.textPlacement = {
                h: HorizontalPlacement.Right,
                v: VerticalPlacement.Bottom
            };
            expect(() => textElementState.reset()).to.not.throw();

            const textPlacement = textElementState.textPlacement;
            expect(textPlacement.h).to.be.equal(HorizontalPlacement.Left);
            expect(textPlacement.v).to.be.equal(VerticalPlacement.Top);
            expect(textElementState.isBaseTextPlacement(textPlacement)).to.be.true;
            expect(textElementState.element.bounds).to.be.undefined;
        });

        it("resets text and icon state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(0);
            expect(() => textElementState.reset()).to.not.throw();

            expect(textElementState.textRenderState!.isUndefined()).to.be.true;
            expect(textElementState.iconRenderState!.isUndefined()).to.be.true;
            expect(textElementState.viewDistance).to.be.undefined;
        });

        it("resets text and icons state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.LineMarker,
                poiInfo: {
                    technique: {}
                },
                points: [
                    [0, 0],
                    [0, 1]
                ]
            } as any);
            textElementState.update(0);
            expect(() => textElementState.reset()).to.not.throw();

            expect(textElementState.iconRenderState!.isUndefined()).to.be.true;
            expect(textElementState.viewDistance).to.be.undefined;
        });
    });

    describe("replace", function () {
        it("replaces an existing text element", function () {
            const predecessorState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                },
                layoutStyle: {
                    horizontalAlignment: HorizontalAlignment.Left,
                    verticalAlignment: VerticalAlignment.Below
                }
            } as any);
            predecessorState.update(0);
            const predecessorText = predecessorState.textRenderState!;
            const predecessorIcon = predecessorState.iconRenderState!;
            // Need to access private member in via object's map, just for test.
            const predecessorLayout = predecessorState["m_textLayoutState"];

            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                },
                layoutStyle: {
                    horizontalAlignment: HorizontalAlignment.Center,
                    verticalAlignment: VerticalAlignment.Center
                }
            } as any);
            textElementState.update(0);

            textElementState.replace(predecessorState);
            expect(predecessorState.textRenderState).to.be.undefined;
            expect(predecessorState.iconRenderState).to.be.undefined;
            expect(predecessorState["m_textLayoutState"]).to.be.undefined;

            expect(textElementState.textRenderState).to.equal(predecessorText);
            expect(textElementState.iconRenderState).to.equal(predecessorIcon);
            expect(textElementState["m_textLayoutState"]).to.equal(predecessorLayout);
        });

        it("reuses text element glyphs", function () {
            const predecessorState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                },
                glyphs: {},
                bounds: {},
                glyphCaseArray: []
            } as any);
            predecessorState.update(0);
            const predecessorGlyphs = predecessorState.element.glyphs;
            const predecessorGlyphCaseArray = predecessorState.element.glyphCaseArray;

            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            predecessorState.update(0);

            textElementState.replace(predecessorState);
            expect(textElementState.element.glyphs).to.equal(predecessorGlyphs);
            expect(textElementState.element.glyphCaseArray).to.equal(predecessorGlyphCaseArray);
        });

        it("invalidates text element bounds", function () {
            const predecessorState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                },
                bounds: {},
                glyphCaseArray: []
            } as any);
            predecessorState.update(0);

            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                },
                bounds: {},
                glyphCaseArray: []
            } as any);
            textElementState.update(0);

            expect(textElementState.element.bounds).to.not.undefined;
            expect(predecessorState.element.bounds).to.not.undefined;

            textElementState.replace(predecessorState);
            expect(textElementState.element.bounds).to.undefined;
        });

        it("invalidates text buffer", function () {
            const predecessorState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            predecessorState.update(0);
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            predecessorState.update(0);
            // Fake text buffer creation.
            predecessorState.element.textBufferObject = new TextBufferObject(
                [],
                new Float32Array()
            );

            textElementState.replace(predecessorState);
            expect(textElementState.element.textBufferObject).to.be.undefined;
        });
    });

    describe("update", function () {
        it("does not initialize a text element state if view distance is undefined", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(undefined);

            expect(textElementState.textRenderState).to.be.undefined;
            expect(textElementState.iconRenderState).to.be.undefined;
            expect(textElementState.viewDistance).to.be.undefined;
        });

        it("initializes a text element state and sets view distance", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(100);

            expect(textElementState.textRenderState).to.not.be.undefined;
            expect(textElementState.iconRenderState).to.not.be.undefined;
            expect(textElementState.viewDistance).to.equal(100);
        });

        it("uses fading time from technique", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {
                        iconFadeTime: 0.1 // technique's iconFadeTime is in seconds.
                    }
                },
                textFadeTime: 100
            } as any);
            textElementState.update(100);

            expect(textElementState.textRenderState).to.not.be.undefined;
            expect(textElementState.textRenderState!.fadeTime).to.equal(100);
            expect(textElementState.iconRenderState).to.not.be.undefined;
            expect(textElementState.iconRenderState!.fadeTime).to.equal(100);
            expect(textElementState.viewDistance).to.equal(100);
        });

        it("uses fading time from technique for line marker", function () {
            const textElementState = new TextElementState({
                type: TextElementType.LineMarker,
                poiInfo: {
                    technique: {
                        iconFadeTime: 0.1 // technique's iconFadeTime is in seconds.
                    }
                },
                textFadeTime: 100,
                points: [
                    [0, 1],
                    [0, 2]
                ]
            } as any);
            textElementState.update(100);

            expect(textElementState.textRenderState).to.not.be.undefined;
            expect(textElementState.iconRenderState!).to.not.be.undefined;
            expect(textElementState.iconRenderState!.fadeTime).to.equal(100);
            expect(textElementState.viewDistance).to.equal(100);
        });

        it("updates a initialized text element state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(100);

            expect(textElementState.textRenderState).to.not.be.undefined;
            expect(textElementState.iconRenderState).to.not.be.undefined;
            expect(textElementState.viewDistance).to.equal(100);

            textElementState.update(200);
            expect(textElementState.viewDistance).to.equal(200);
        });
    });

    describe("renderDistance", function () {
        it("returns 0 if element is always on top", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                },
                alwaysOnTop: true
            } as any);
            textElementState.update(100);

            expect(textElementState.renderDistance).to.equal(0);
        });

        it("returns inversed view distance", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(100);

            expect(textElementState.renderDistance).to.equal(-100);
        });

        it("returns 0 if view distance ", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(undefined);

            expect(textElementState.renderDistance).to.equal(0);
        });
    });

    describe("updateFading", function () {
        it("ignores uninitialized states", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);

            textElementState.updateFading(100, false);
            expect(textElementState.textRenderState).to.be.undefined;
            expect(textElementState.iconRenderState).to.be.undefined;
        });

        it("updates text render state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel
            } as any);
            textElementState.update(100);
            textElementState.textRenderState!.startFadeIn(50);
            textElementState.updateFading(100, false);

            expect(textElementState.textRenderState).to.not.be.undefined;
            expect(textElementState.textRenderState!.isFadingIn()).to.be.true;
            expect(textElementState.textRenderState!.value).to.equal(0.0625);
            expect(textElementState.textRenderState!.opacity).to.equal(0.0022182464599609375);
        });

        it("updates icon render state", function () {
            const textElementState = new TextElementState({
                type: TextElementType.PoiLabel,
                poiInfo: {
                    technique: {}
                }
            } as any);
            textElementState.update(100);
            textElementState.textRenderState!.startFadeIn(50);
            textElementState.iconRenderState!.startFadeIn(50);
            textElementState.updateFading(100, false);

            expect(textElementState.textRenderState).to.not.be.undefined;
            expect(textElementState.textRenderState!.isFadingIn()).to.be.true;
            expect(textElementState.textRenderState!.value).to.equal(0.0625);
            expect(textElementState.textRenderState!.opacity).to.equal(0.0022182464599609375);

            expect(textElementState.iconRenderState).to.not.be.undefined;
            expect(textElementState.iconRenderState!.isFadingIn()).to.be.true;
            expect(textElementState.iconRenderState!.value).to.equal(0.0625);
            expect(textElementState.iconRenderState!.opacity).to.equal(0.0022182464599609375);
        });

        it("updates icon render states", function () {
            const textElementState = new TextElementState({
                type: TextElementType.LineMarker,
                poiInfo: {
                    technique: {}
                },
                points: [
                    [0, 1],
                    [0, 2]
                ]
            } as any);
            textElementState.update(100);
            textElementState.iconRenderState!.startFadeIn(50);
            textElementState.updateFading(100, false);

            expect(textElementState.iconRenderState).to.not.be.undefined;
            expect(textElementState.iconRenderState!.isFadingIn()).to.be.true;
            expect(textElementState.iconRenderState!.value).to.equal(0.0625);
            expect(textElementState.iconRenderState!.opacity).to.equal(0.0022182464599609375);
        });
    });
});
