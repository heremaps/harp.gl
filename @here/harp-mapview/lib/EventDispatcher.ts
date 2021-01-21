/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * JavaScript events for custom objects. Stores all listeners to allow removing all listeners for
 * housekeeping.
 *
 * Will be replaced by `THREE.EventDispatcher` once https://github.com/mrdoob/three.js/pull/19844
 * is released.
 */
export class EventDispatcher {
    private readonly m_listeners: Map<string, Array<(event: THREE.Event) => void>> = new Map();

    /**
     * Destroy this `EventDispatcher` instance.
     *
     * Unregister all event handlers used. This is method should be called when you stop
     * using `EventDispatcher`.
     */
    dispose() {
        this.removeAllEventListeners();
    }

    /**
     * Checks if listener is added to an event type.
     *
     * @param type - The type of event to listen to.
     * @param listener - The function that gets called when the event is fired.
     */
    hasEventListener(type: string, listener?: (event: THREE.Event) => void): boolean {
        const listeners = this.m_listeners.get(type);
        if (listeners === undefined) {
            return false;
        }
        return listener !== undefined ? listeners.includes(listener) : true;
    }

    /**
     * Add a new event listener to the event type.
     *
     * @param type - The type of event to listen to.
     * @param listener - The function that gets called when the event is fired.
     */
    addEventListener(type: string, listener: (event: THREE.Event) => void): void {
        let listeners = this.m_listeners.get(type);
        if (listeners === undefined) {
            listeners = [];
            this.m_listeners.set(type, listeners);
        }
        if (!listeners.includes(listener)) {
            listeners.push(listener);
        }
    }

    /**
     * Remove the listener from the event type.
     *
     * @param type - The type of event to listen to.
     * @param listener - The function that gets called when the event is fired. If the value is
     * `undefined`, all listeners will be removed.
     */
    removeEventListener(type: string, listener?: any): void {
        const listeners = this.m_listeners.get(type);
        if (listeners === undefined) {
            return;
        }
        if (listener === undefined) {
            this.m_listeners.delete(type);
        } else {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.m_listeners.delete(type);
                }
            }
        }
    }

    /**
     * Remove all event listeners for housekeeping.
     */
    removeAllEventListeners() {
        const events = Array.from(this.m_listeners.keys());
        for (const event of events) {
            this.removeEventListener(event);
        }
    }

    /**
     * Retrieve the registered event types.
     *
     * @returns Array of event types.
     */
    get eventTypes(): string[] {
        return Array.from(this.m_listeners.keys());
    }

    /**
     * Retrieve the registered listeners to the specified event.
     *
     * @param type - The type of event to listen to.
     * @returns Array of event listeners.
     */
    listeners(type: string): Array<(event: THREE.Event) => void> | undefined {
        return this.m_listeners.get(type);
    }

    /**
     * Dispatch the event to the registered listeners.
     *
     * @param event - The event to dispatch.
     */
    dispatchEvent(event: THREE.Event) {
        const listeners = this.m_listeners.get(event.type);
        if (listeners !== undefined) {
            event.target = this;

            // Make a copy, in case listeners are removed while iterating.
            const array = listeners.slice(0);

            for (let i = 0, l = array.length; i < l; i++) {
                array[i].call(this, event);
            }
        }
    }
}
