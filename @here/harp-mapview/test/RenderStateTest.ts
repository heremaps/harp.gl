/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";

import { DEFAULT_FADE_TIME, FadingState, RenderState } from "../lib/text/RenderState";

describe("RenderState", function () {
    describe("constructor", function () {
        it("sets default fade time", function () {
            const renderState = new RenderState();
            expect(renderState.fadeTime).to.equal(DEFAULT_FADE_TIME);
        });

        it("sets default fade time when undefined is given as fade time", function () {
            const renderState = new RenderState(undefined);
            expect(renderState.fadeTime).to.equal(DEFAULT_FADE_TIME);
        });

        it("sets given fade time", function () {
            const renderState = new RenderState(123);
            expect(renderState.fadeTime).to.equal(123);
        });
    });

    describe("reset", function () {
        it("resets a new render state", function () {
            const renderState = new RenderState();
            renderState.reset();
            expect(renderState.isUndefined()).to.be.true;
            expect(renderState.value).to.equal(0.0);
            expect(renderState.startTime).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("resets a fading in render state", function () {
            const renderState = new RenderState();
            renderState.value = 1.0;
            renderState.startTime = 2.0;
            renderState.opacity = 0.5;
            (renderState as any).m_state = FadingState.FadingIn;
            renderState.reset();
            expect(renderState.isUndefined()).to.be.true;
            expect(renderState.value).to.equal(0.0);
            expect(renderState.startTime).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });
    });

    describe("isUndefined", function () {
        it("returns true for undefined render states", function () {
            const renderState = new RenderState();
            expect(renderState.isUndefined()).to.be.true;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isUndefined()).to.be.false;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isUndefined()).to.be.false;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isUndefined()).to.be.false;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isUndefined()).to.be.false;
        });
    });

    describe("isFading", function () {
        it("returns true for fading in and fading out render states", function () {
            const renderState = new RenderState();
            expect(renderState.isFading()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isFading()).to.be.true;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isFading()).to.be.false;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isFading()).to.be.true;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isFading()).to.be.false;
        });
    });

    describe("isFadingIn", function () {
        it("returns true for fading in out render states", function () {
            const renderState = new RenderState();
            expect(renderState.isFadingIn()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isFadingIn()).to.be.true;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isFadingIn()).to.be.false;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isFadingIn()).to.be.false;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isFadingIn()).to.be.false;
        });
    });

    describe("isFadingOut", function () {
        it("returns true for fading out render states", function () {
            const renderState = new RenderState();
            expect(renderState.isFadingOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isFadingOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isFadingOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isFadingOut()).to.be.true;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isFadingOut()).to.be.false;
        });
    });

    describe("isFadedIn", function () {
        it("returns true for faded in render states", function () {
            const renderState = new RenderState();
            expect(renderState.isFadedIn()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isFadedIn()).to.be.false;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isFadedIn()).to.be.true;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isFadedIn()).to.be.false;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isFadedIn()).to.be.false;
        });
    });

    describe("isFadedOut", function () {
        it("returns true for faded out render states", function () {
            const renderState = new RenderState();
            expect(renderState.isFadedOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isFadedOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isFadedOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isFadedOut()).to.be.false;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isFadedOut()).to.be.true;
        });
    });

    describe("isVisible", function () {
        it("returns true if render states are not undefined or faded out, and opacity > 0", function () {
            const renderState = new RenderState();
            renderState.opacity = 0.5;
            expect(renderState.isVisible()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isVisible()).to.be.true;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isVisible()).to.be.true;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isVisible()).to.be.true;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isVisible()).to.be.false;
        });

        it("returns false if render states are not undefined or faded out and opacity is 0", function () {
            const renderState = new RenderState();
            expect(renderState.isVisible()).to.be.false;
            (renderState as any).m_state = FadingState.FadingIn;
            expect(renderState.isVisible()).to.be.false;
            (renderState as any).m_state = FadingState.FadedIn;
            expect(renderState.isVisible()).to.be.false;
            (renderState as any).m_state = FadingState.FadingOut;
            expect(renderState.isVisible()).to.be.false;
            (renderState as any).m_state = FadingState.FadedOut;
            expect(renderState.isVisible()).to.be.false;
        });
    });

    describe("startFadeIn", function () {
        it("transitions an undefined state to fade in", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100);

            expect(renderState.isFadingIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("fade in transitions to final state if fading disabled", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100, true);

            expect(renderState.isFadedIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(1.0);
        });

        it("does not change an already fading in state", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100);
            renderState.startFadeIn(200);

            expect(renderState.isFadingIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("does not change an already faded in state", function () {
            const renderState = new RenderState();
            renderState.value = 1.0;
            renderState.startTime = 100;
            renderState.opacity = 1.0;
            (renderState as any).m_state = FadingState.FadedIn;
            renderState.startFadeIn(200);

            expect(renderState.isFadedIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(1.0);
        });

        it("sets a fading out state to fading in", function () {
            const renderState = new RenderState();
            renderState.value = 0.6;
            renderState.startTime = 100;
            renderState.opacity = 0.6;
            (renderState as any).m_state = FadingState.FadingOut;
            renderState.startFadeIn(200);

            expect(renderState.isFadingIn()).to.be.true;
            expect(renderState.startTime).to.equal(-120);
            expect(renderState.value).to.equal(0.4);
            expect(renderState.opacity).to.equal(0.6);
        });

        it("fades in a faded out state", function () {
            const renderState = new RenderState();
            renderState.value = 0.0;
            renderState.startTime = 100;
            renderState.opacity = 0.0;

            (renderState as any).m_state = FadingState.FadedOut;
            renderState.startFadeIn(200);

            expect(renderState.isFadingIn()).to.be.true;
            expect(renderState.startTime).to.equal(200);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });
    });

    describe("startFadeOut", function () {
        it("transitions an undefined state to fading out", function () {
            const renderState = new RenderState();
            renderState.startFadeOut(100);

            expect(renderState.isFadingOut()).to.be.false;
            expect(renderState.startTime).to.equal(0);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("does not change an already fading out state", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100, true);
            renderState.startFadeOut(100);
            renderState.startFadeOut(200);

            expect(renderState.isFadingOut()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(1.0);
        });

        it("does not change an already faded out state", function () {
            const renderState = new RenderState();
            renderState.value = 1.0;
            renderState.startTime = 100;
            renderState.opacity = 0.0;
            (renderState as any).m_state = FadingState.FadedOut;

            renderState.startFadeOut(200);

            expect(renderState.isFadedOut()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("sets a fading in state to fading out", function () {
            const renderState = new RenderState();
            renderState.value = 0.6;
            renderState.startTime = 100;
            renderState.opacity = 0.6;
            (renderState as any).m_state = FadingState.FadingIn;

            renderState.startFadeOut(200);

            expect(renderState.isFadingOut()).to.be.true;
            expect(renderState.startTime).to.equal(-280);
            expect(renderState.value).to.equal(0.4);
            expect(renderState.opacity).to.equal(0.6);
        });

        it("fades out a faded in state", function () {
            const renderState = new RenderState();
            renderState.value = 1.0;
            renderState.startTime = 100;
            renderState.opacity = 1.0;
            (renderState as any).m_state = FadingState.FadedIn;

            renderState.startFadeOut(200);

            expect(renderState.isFadingOut()).to.be.true;
            expect(renderState.startTime).to.equal(200);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(1.0);
        });
    });

    describe("updateFading", function () {
        it("does not update undefined states", function () {
            const renderState = new RenderState();
            renderState.updateFading(100, false);

            expect(renderState.isUndefined()).to.be.true;
            expect(renderState.startTime).to.equal(0);
            expect(renderState.value).to.equal(0.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("does not update faded in states", function () {
            const renderState = new RenderState();
            renderState.value = 1.0;
            renderState.startTime = 0;
            renderState.opacity = 1.0;
            (renderState as any).m_state = FadingState.FadedIn;

            renderState.updateFading(100, false);

            expect(renderState.isFadedIn()).to.be.true;
            expect(renderState.startTime).to.equal(0);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(1.0);
        });

        it("does not update faded out states", function () {
            const renderState = new RenderState();
            renderState.value = 1.0;
            renderState.startTime = 0;
            renderState.opacity = 0.0;
            (renderState as any).m_state = FadingState.FadedOut;

            renderState.updateFading(100, false);

            expect(renderState.isFadedOut()).to.be.true;
            expect(renderState.startTime).to.equal(0);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("updates fading in states", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100);
            renderState.updateFading(200, false);

            expect(renderState.isFadingIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(0.125);
            expect(renderState.opacity).to.equal(0.01605224609375);
        });

        it("switches to faded in after fading time passed", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100);
            renderState.updateFading(100 + DEFAULT_FADE_TIME, false);

            expect(renderState.isFadedIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(1.0);
        });

        it("skips fading in when fading is disabled", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100);
            renderState.updateFading(200, true);

            expect(renderState.isFadedIn()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(1.0);
        });

        it("updates fading out states", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100, false);
            renderState.startFadeOut(100);
            renderState.updateFading(200, false);

            expect(renderState.isFadingOut()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(0.125);
            expect(renderState.opacity).to.equal(0.98394775390625);
        });

        it("switches to faded out after fading time passed", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100, false);
            renderState.startFadeOut(100);
            renderState.updateFading(100 + DEFAULT_FADE_TIME, false);

            expect(renderState.isFadedOut()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(0.0);
        });

        it("skips fading out when fading is disabled", function () {
            const renderState = new RenderState();
            renderState.startFadeIn(100, false);
            renderState.startFadeOut(100);
            renderState.updateFading(200, true);

            expect(renderState.isFadedOut()).to.be.true;
            expect(renderState.startTime).to.equal(100);
            expect(renderState.value).to.equal(1.0);
            expect(renderState.opacity).to.equal(0.0);
        });
    });
});
