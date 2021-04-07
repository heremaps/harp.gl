/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import * as sinon from "sinon";

import { LongPressHandler } from "../lib/LongPressHandler";

describe("LongPressHandler", function () {
    const longPressTimeout = 10;
    const dummyMouseEvent = {
        button: 0,
        clientX: 0,
        clientY: 0
    } as MouseEvent;
    const dummyTouchEvent = ({
        changedTouches: [
            {
                clientX: 0,
                clientY: 0,
                identifier: 0
            }
        ]
    } as any) as TouchEvent;

    let element: HTMLElement;
    let eventMap: Map<string, EventListener>;
    let longPressSpy: sinon.SinonSpy;
    let tapSpy: sinon.SinonSpy;
    let longPressHandler: LongPressHandler;
    let mouseDownHandler: EventListener;
    let mouseUpHandler: EventListener;
    let touchStartHandler: EventListener;
    let touchEndHandler: EventListener;

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    beforeEach(function () {
        eventMap = new Map();
        element = ({
            addEventListener: (event: string, listener: EventListener) => {
                eventMap.set(event, listener);
            },
            removeEventListener: (event: string, _: EventListener) => {
                eventMap.delete(event);
            }
        } as any) as HTMLElement;
        longPressSpy = sinon.spy();
        tapSpy = sinon.spy();
        longPressHandler = new LongPressHandler(element, longPressSpy, tapSpy);
        longPressHandler.timeout = longPressTimeout;

        mouseDownHandler = eventMap.get("mousedown")!;
        expect(mouseDownHandler).is.not.undefined;
        mouseUpHandler = eventMap.get("mouseup")!;
        expect(mouseUpHandler).is.not.undefined;
        touchStartHandler = eventMap.get("touchstart")!;
        expect(touchStartHandler).is.not.undefined;
        touchEndHandler = eventMap.get("touchend")!;
        expect(touchEndHandler).is.not.undefined;
    });
    it("calls long press callback on long mouse press", function (done) {
        mouseDownHandler(dummyMouseEvent);

        sleep(longPressTimeout * 1.1).then(() => {
            expect(longPressSpy.called).to.be.true;
            expect(tapSpy.called).to.be.false;
            done();
        });
    });

    it("calls long press callback on long touch", function (done) {
        touchStartHandler(dummyTouchEvent);

        sleep(longPressTimeout * 1.1).then(() => {
            expect(longPressSpy.called).to.be.true;
            expect(tapSpy.called).to.be.false;
            done();
        });
    });

    it("calls tap callback on short mouse press", function (done) {
        mouseDownHandler(dummyMouseEvent);

        sleep(longPressTimeout * 0.1).then(() => {
            mouseUpHandler(dummyMouseEvent);
            expect(longPressSpy.called).to.be.false;
            expect(tapSpy.called).to.be.true;
            done();
        });
    });

    it("calls tap callback on short touch", function (done) {
        touchStartHandler(dummyTouchEvent);

        sleep(longPressTimeout * 0.1).then(() => {
            touchEndHandler(dummyTouchEvent);
            expect(longPressSpy.called).to.be.false;
            expect(tapSpy.called).to.be.true;
            done();
        });
    });

    it("does not call long press callback on long mouse press with movement", function (done) {
        mouseDownHandler(dummyMouseEvent);

        const mouseMoveHandler = eventMap.get("mousemove")!;
        expect(mouseMoveHandler).is.not.undefined;

        mouseMoveHandler({
            ...dummyMouseEvent,
            clientX: longPressHandler.moveThreshold + 1,
            clientY: 0
        } as MouseEvent);

        sleep(longPressTimeout * 1.1).then(() => {
            expect(longPressSpy.called).to.be.false;
            expect(tapSpy.called).to.be.false;
            done();
        });
    });

    it("does not call tap callback on short mouse press with movement", function (done) {
        mouseDownHandler(dummyMouseEvent);

        const mouseMoveHandler = eventMap.get("mousemove")!;
        expect(mouseMoveHandler).is.not.undefined;

        mouseMoveHandler({
            ...dummyMouseEvent,
            clientX: 0,
            clientY: longPressHandler.moveThreshold + 1
        } as MouseEvent);

        sleep(longPressTimeout * 0.1).then(() => {
            mouseUpHandler(dummyMouseEvent);
            expect(longPressSpy.called).to.be.false;
            expect(tapSpy.called).to.be.false;
            done();
        });
    });
});
