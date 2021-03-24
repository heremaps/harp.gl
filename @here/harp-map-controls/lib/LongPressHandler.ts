/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Class that can be used to track long presses on an HTML Element. A long press is a press that
 * lasts a minimum duration (see the [[timeout]] member) while the pointer is not moved more than a
 * certain threshold (see the [[moveThreshold]] member).
 */
export class LongPressHandler {
    /**
     * How long to wait (in ms) until a press is considered a long press.
     */
    timeout: number = 500;

    /**
     * If the cursor moves more than the given number of pixels, it is not a long-press, but a pan.
     */
    moveThreshold: number = 5;

    /**
     * Mouse button id that should be handled by this event.
     */
    buttonId: number = 0;

    private m_pressEvent?: MouseEvent | Touch = undefined;
    private m_timerId?: number = undefined;
    private m_moveHandlerRegistered: boolean = false;
    private readonly m_boundPointerMoveHandler: any;
    private readonly m_boundMouseDownHandler: any;
    private readonly m_boundTouchStartHandler: any;
    private readonly m_boundMouseUpHandler: any;
    private readonly m_boundTouchEndHandler: any;

    /**
     * Default constructor.
     *
     * @param element - The HTML element to track.
     * @param onLongPress - The callback to call when a long press occurred.
     * @param onTap - Optional callback to call on a tap, i.e. when the press ends before the
     * specified timeout.
     */
    constructor(
        readonly element: HTMLElement,
        public onLongPress: (event: MouseEvent | Touch) => void,
        public onTap?: (event: MouseEvent | Touch) => void
    ) {
        this.m_boundPointerMoveHandler = this.onPointerMove.bind(this);
        this.m_boundMouseDownHandler = this.onMouseDown.bind(this);
        this.m_boundTouchStartHandler = this.onTouchStart.bind(this);
        this.m_boundMouseUpHandler = this.onMouseUp.bind(this);
        this.m_boundTouchEndHandler = this.onTouchEnd.bind(this);
        this.element.addEventListener("mousedown", this.m_boundMouseDownHandler);
        this.element.addEventListener("touchstart", this.m_boundTouchStartHandler);
        this.element.addEventListener("mouseup", this.m_boundMouseUpHandler);
        this.element.addEventListener("touchend", this.m_boundTouchEndHandler);
    }

    /**
     * Removes all events listeners. No more events will be sent.
     */
    dispose() {
        this.cancel();
        this.element.removeEventListener("mousedown", this.m_boundMouseDownHandler);
        this.element.removeEventListener("touchstart", this.m_boundTouchStartHandler);
        this.element.removeEventListener("mouseup", this.m_boundMouseUpHandler);
        this.element.removeEventListener("touchend", this.m_boundTouchEndHandler);
    }

    private startPress(event: MouseEvent | TouchEvent) {
        this.cancelTimer();

        this.m_pressEvent = (event as any).changedTouches?.[0] ?? event;
        this.m_timerId = setTimeout(() => this.onTimeout(), this.timeout) as any;
        this.addPointerMoveHandler();
    }

    private onMouseDown(event: MouseEvent) {
        if (event.button === this.buttonId) {
            this.startPress(event);
        }
    }

    private onTouchStart(event: TouchEvent) {
        if (this.m_pressEvent) {
            // Cancel long press if a second touch starts while holding the first one.
            this.cancel();
            return;
        }

        if (event.changedTouches.length === 1) {
            this.startPress(event);
        }
    }

    private onMouseUp(event: MouseEvent) {
        if (this.m_pressEvent && event.button === this.buttonId) {
            this.cancel();
            this.onTap?.(event);
        }
    }

    private onTouchEnd(event: TouchEvent) {
        if (
            event.changedTouches.length === 1 &&
            event.changedTouches[0].identifier === (this.m_pressEvent as any).identifier
        ) {
            this.cancel();
            this.onTap?.(event.changedTouches[0]);
        }
    }

    private onPointerMove(event: MouseEvent | TouchEvent) {
        if (this.m_pressEvent === undefined) {
            return; // Must not happen
        }
        const { clientX, clientY } = (event as any).changedTouches?.[0] ?? event;
        const manhattanLength =
            Math.abs(clientX - this.m_pressEvent.clientX) +
            Math.abs(clientY - this.m_pressEvent.clientY);

        if (manhattanLength > this.moveThreshold) {
            this.cancel();
        }
    }

    private cancel() {
        this.m_pressEvent = undefined;
        this.cancelTimer();
        this.removePointerMoveHandler();
    }

    private cancelTimer() {
        if (this.m_timerId === undefined) {
            return;
        }

        clearTimeout(this.m_timerId);
        this.m_timerId = undefined;
    }

    private addPointerMoveHandler() {
        if (this.m_moveHandlerRegistered) {
            return;
        }

        this.element.addEventListener("mousemove", this.m_boundPointerMoveHandler);
        this.element.addEventListener("touchmove", this.m_boundPointerMoveHandler);
        this.m_moveHandlerRegistered = true;
    }

    private removePointerMoveHandler() {
        if (!this.m_moveHandlerRegistered) {
            return;
        }

        this.element.removeEventListener("mousemove", this.m_boundPointerMoveHandler);
        this.element.removeEventListener("touchmove", this.m_boundPointerMoveHandler);
        this.m_moveHandlerRegistered = false;
    }

    private onTimeout() {
        const event = this.m_pressEvent;

        this.m_timerId = undefined;
        this.cancel();

        if (event !== undefined) {
            this.onLongPress(event);
        }
    }
}
