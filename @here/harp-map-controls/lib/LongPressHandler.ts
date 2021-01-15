/*
 * Copyright (C) 2017-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Class that can be used to track long presses on an HTML Element. A long press is a press that
 * lasts a minimum duration (see the [[timeout]] member) while the mouse is not moved more than a
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
     * Button id that should be handled by this event.
     */
    buttonId: number = 0;

    private m_mouseDownEvent?: MouseEvent = undefined;
    private m_timerId?: number = undefined;
    private m_moveHandlerRegistered: boolean = false;
    private readonly m_boundMouseMoveHandler: any;
    private readonly m_boundMouseDownHandler: any;
    private readonly m_boundMouseUpHandler: any;

    /**
     * Default constructor.
     *
     * @param element - The HTML element to track.
     * @param onLongPress - The callback to call when a long press occurred.
     */
    constructor(readonly element: HTMLElement, public onLongPress: (event: MouseEvent) => void) {
        // workaround - need to bind 'this' for our dynamic mouse move handler
        this.m_boundMouseMoveHandler = this.onMouseMove.bind(this);
        this.m_boundMouseDownHandler = this.onMousedown.bind(this);
        this.m_boundMouseUpHandler = this.onMouseup.bind(this);

        this.element.addEventListener("mousedown", this.m_boundMouseDownHandler);
        this.element.addEventListener("mouseup", this.m_boundMouseUpHandler);
    }

    /**
     * Removes all events listeners. No more events will be sent.
     */
    dispose() {
        this.cancel();
        this.element.removeEventListener("mousedown", this.m_boundMouseDownHandler);
        this.element.removeEventListener("mouseup", this.m_boundMouseUpHandler);
    }

    private onMousedown(event: MouseEvent) {
        if (event.button !== this.buttonId) {
            return;
        }
        this.cancelTimer();

        this.m_mouseDownEvent = event;
        this.m_timerId = setTimeout(() => this.onTimeout(), this.timeout) as any;
        this.addMouseMoveHandler();
    }

    private onMouseup(event: MouseEvent) {
        if (event.button !== this.buttonId) {
            return;
        }
        this.cancel();
    }

    private onMouseMove(event: MouseEvent) {
        if (this.m_mouseDownEvent === undefined) {
            return; // Must not happen
        }

        const manhattanLength =
            Math.abs(event.clientX - this.m_mouseDownEvent.clientX) +
            Math.abs(event.clientY - this.m_mouseDownEvent.clientY);

        if (manhattanLength >= this.moveThreshold) {
            this.cancel();
        }
    }

    private cancel() {
        this.m_mouseDownEvent = undefined;
        this.cancelTimer();
        this.removeMouseMoveHandler();
    }

    private cancelTimer() {
        if (this.m_timerId === undefined) {
            return;
        }

        clearTimeout(this.m_timerId);
        this.m_timerId = undefined;
    }

    private addMouseMoveHandler() {
        if (this.m_moveHandlerRegistered) {
            return;
        }

        this.element.addEventListener("mousemove", this.m_boundMouseMoveHandler);
        this.m_moveHandlerRegistered = true;
    }

    private removeMouseMoveHandler() {
        if (!this.m_moveHandlerRegistered) {
            return;
        }

        this.element.removeEventListener("mousemove", this.m_boundMouseMoveHandler);
        this.m_moveHandlerRegistered = false;
    }

    private onTimeout() {
        const event = this.m_mouseDownEvent;

        this.m_timerId = undefined;
        this.cancel();

        if (event !== undefined) {
            this.onLongPress(event);
        }
    }
}
